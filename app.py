import os
import json
import logging
import re
import time
import wave
import threading
import numpy as np
import sounddevice as sd
import whisper
from datetime import datetime
from queue import Queue
from flask import Flask, render_template, request, redirect, url_for, jsonify, session, send_from_directory, flash
from werkzeug.utils import secure_filename
from googletrans import Translator
from duden import get

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET",
                                "devkey-replace-in-production")

class AudioRecorder:
    def __init__(self):
        self.recording = False
        self.paused = False
        self.audio_queue = Queue()
        self.audio_data = []
        self.last_silence = 0
        self.silence_threshold = 0.01
        self.sample_rate = 16000
        self.channels = 1
        self.model = whisper.load_model("tiny")
        self.recording_thread = None

    def audio_callback(self, indata, frames, time, status):
        if status:
            logger.warning(f"Audio callback status: {status}")
        if self.recording and not self.paused:
            audio_chunk = indata.copy()
            self.audio_queue.put(audio_chunk)
            
            # Check for silence
            volume_norm = np.linalg.norm(audio_chunk) / frames
            if volume_norm < self.silence_threshold:
                current_time = time.time()
                if current_time - self.last_silence > 1.0 and self.audio_data:
                    self.transcribe_current_segment()
                self.last_silence = current_time

    def start_recording(self):
        self.recording = True
        self.paused = False
        self.audio_data = []
        self.last_silence = time.time()
        
        def record_thread():
            with sd.InputStream(callback=self.audio_callback,
                              channels=self.channels,
                              samplerate=self.sample_rate):
                while self.recording:
                    if not self.audio_queue.empty():
                        audio_chunk = self.audio_queue.get()
                        self.audio_data.append(audio_chunk)
                    time.sleep(0.1)

        self.recording_thread = threading.Thread(target=record_thread)
        self.recording_thread.start()

    def pause_recording(self):
        self.paused = True
        if self.audio_data:
            return self.transcribe_current_segment()
        return ""

    def resume_recording(self):
        self.paused = False
        self.last_silence = time.time()

    def stop_recording(self):
        self.recording = False
        if self.recording_thread:
            self.recording_thread.join()
        if self.audio_data:
            return self.transcribe_current_segment()
        return ""

    def transcribe_current_segment(self):
        if not self.audio_data:
            return ""
            
        # Convert audio data to numpy array
        audio = np.concatenate(self.audio_data)
        
        # Transcribe using Whisper
        result = self.model.transcribe(audio)
        transcription = result["text"].strip()
        
        # Clear the current segment
        self.audio_data = []
        
        return transcription

# Initialize the audio recorder
audio_recorder = AudioRecorder()

# Configuration
VIDEO_DIRECTORY = os.environ.get("VIDEO_DIRECTORY", r"./videos")
UPLOAD_FOLDER = os.environ.get("UPLOAD_FOLDER", "./uploads")
ALLOWED_EXTENSIONS = {'vtt'}
USAGE_DATA_FILE = "usage_data.json"

# Ensure directories exist
os.makedirs(VIDEO_DIRECTORY, exist_ok=True)
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER


def allowed_file(filename):
    return '.' in filename and filename.rsplit(
        '.', 1)[1].lower() in ALLOWED_EXTENSIONS


def get_video_files():
    """Scan directory for video files"""
    videos = []
    valid_extensions = ['.mp4', '.webm', '.ogg', '.mov', '.mkv']

    try:
        for filename in os.listdir(VIDEO_DIRECTORY):
            filepath = os.path.join(VIDEO_DIRECTORY, filename)
            if os.path.isfile(filepath):
                ext = os.path.splitext(filename)[1].lower()
                if ext in valid_extensions:
                    basename = os.path.splitext(filename)[0]

                    # Check for subtitle and thumbnail files
                    subtitle_path = os.path.join(VIDEO_DIRECTORY,
                                                 f"{basename}-subtitles.vtt")
                    thumbnail_path = os.path.join(
                        VIDEO_DIRECTORY, f"{basename}-thumbnails.vtt")

                    # Check for cover image (same basename with .jpg extension)
                    cover_path = f"{basename}.jpg"
                    has_cover = os.path.isfile(
                        os.path.join(VIDEO_DIRECTORY, cover_path))

                    videos.append({
                        'name':
                        filename,
                        'path':
                        filepath,
                        'has_subtitles':
                        os.path.isfile(subtitle_path),
                        'has_thumbnails':
                        os.path.isfile(thumbnail_path),
                        'basename':
                        basename,
                        'has_cover':
                        has_cover,
                        'cover_path':
                        cover_path if has_cover else None
                    })
    except Exception as e:
        logger.error(f"Error scanning video directory: {e}")

    return videos


def load_usage_data():
    """Load usage data from file"""
    try:
        if os.path.exists(USAGE_DATA_FILE):
            with open(USAGE_DATA_FILE, 'r') as f:
                return json.load(f)
    except Exception as e:
        logger.error(f"Error loading usage data: {e}")

    return {}


def save_usage_data(data):
    """Save usage data to file"""
    try:
        with open(USAGE_DATA_FILE, 'w') as f:
            json.dump(data, f)
    except Exception as e:
        logger.error(f"Error saving usage data: {e}")


@app.route('/')
def index():
    """Home page with video listing"""
    videos = get_video_files()
    # Pass the video directory path to the template
    return render_template('index.html',
                           videos=videos,
                           video_directory=VIDEO_DIRECTORY)


@app.route('/player/<path:video_name>')
def player(video_name):
    """Video player page"""
    video_name = os.path.basename(video_name)
    videos = get_video_files()
    video = next((v for v in videos if v['name'] == video_name), None)

    if not video:
        return redirect(url_for('index'))

    return render_template('player.html', video=video, videos=videos)


@app.route('/videos/<path:filename>')
def serve_video(filename):
    """Serve video files"""
    return send_from_directory(VIDEO_DIRECTORY, filename)


@app.route('/upload/<video_basename>/<file_type>', methods=['POST'])
def upload_file(video_basename, file_type):
    """Upload subtitle or thumbnail file"""
    if 'file' not in request.files:
        return jsonify({'success': False, 'error': 'No file part'})

    file = request.files['file']
    if file.filename == '':
        return jsonify({'success': False, 'error': 'No file selected'})

    if file and allowed_file(file.filename):
        filename = f"{video_basename}-{file_type}.vtt"
        filepath = os.path.join(VIDEO_DIRECTORY, filename)

        try:
            file.save(filepath)
            return jsonify({
                'success':
                True,
                'message':
                f'{file_type.capitalize()} file uploaded successfully'
            })
        except Exception as e:
            logger.error(f"Error saving uploaded file: {e}")
            return jsonify({'success': False, 'error': str(e)})

    return jsonify({'success': False, 'error': 'File type not allowed'})


@app.route('/statistics')
def statistics():
    """Statistics page"""
    usage_data = load_usage_data()
    return render_template('statistics.html', data=usage_data)


@app.route('/api/update_usage', methods=['POST'])
def update_usage():
    """API to update usage time data"""
    try:
        data = request.get_json()
        usage_time = data.get('usage_time', 0)
        date = data.get('date', datetime.today().strftime('%Y-%m-%d'))

        usage_data = load_usage_data()

        if date not in usage_data:
            usage_data[date] = 0

        usage_data[date] += usage_time

        save_usage_data(usage_data)
        return jsonify({'success': True})
    except Exception as e:
        logger.error(f"Error updating usage data: {e}")
        return jsonify({'success': False, 'error': str(e)})


@app.route('/api/get_usage_data')
def get_usage_data():
    """API to get usage time data"""
    usage_data = load_usage_data()
    return jsonify(usage_data)


@app.route('/toggle_theme')
def toggle_theme():
    """Toggle between light and dark theme"""
    current_theme = session.get('theme', 'dark')
    session['theme'] = 'light' if current_theme == 'dark' else 'dark'
    # Redirect back to the previous page if available, otherwise to index
    return redirect(request.referrer or url_for('index'))


@app.route('/set_directory', methods=['POST'])
def set_directory():
    """Change the video directory"""
    global VIDEO_DIRECTORY
    new_directory = request.form.get('directory')

    if new_directory and os.path.isdir(new_directory):
        VIDEO_DIRECTORY = new_directory
    else:
        try:
            # Try to create the directory if it doesn't exist
            os.makedirs(new_directory, exist_ok=True)
            VIDEO_DIRECTORY = new_directory
        except Exception as e:
            logger.error(f"Error creating directory: {e}")
            flash(f"Fehler beim Erstellen des Verzeichnisses: {e}", "error")

    return redirect(url_for('index'))


@app.route('/api/get_subtitles/<video_basename>')
def get_subtitles(video_basename):
    """Get subtitle data from VTT file"""
    subtitle_path = os.path.join(VIDEO_DIRECTORY,
                                 f"{video_basename}-subtitles.vtt")

    if not os.path.exists(subtitle_path):
        return jsonify({'success': False, 'error': 'Subtitle file not found'})

    try:
        subtitles = []
        with open(subtitle_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()

            i = 0
            while i < len(lines):
                line = lines[i].strip()

                # Look for timestamp lines (00:00:00.000 --> 00:00:00.000)
                if '-->' in line:
                    # Get timestamp
                    timestamp = line
                    start_time = timestamp.split('-->')[0].strip()
                    end_time = timestamp.split('-->')[1].strip()

                    # Get subtitle text (can be multiple lines)
                    text_lines = []
                    i += 1
                    while i < len(lines) and lines[i].strip() != '':
                        text_lines.append(lines[i].strip())
                        i += 1

                    text = ' '.join(text_lines)
                    if text:  # Only add if there's actual text
                        subtitles.append({
                            'start': start_time,
                            'end': end_time,
                            'text': text
                        })
                i += 1

        return jsonify({'success': True, 'subtitles': subtitles})

    except Exception as e:
        logger.error(f"Error reading subtitle file: {e}")
        return jsonify({'success': False, 'error': str(e)})


@app.route('/api/translate', methods=['POST'])
def translate_text():
    """Translate text using Google Translate"""
    try:
        data = request.get_json()
        text = data.get('text', '')
        target_language = data.get('target_language', 'de')
        remember_lang = data.get('remember_lang', False)

        if not text:
            return jsonify({'success': False, 'error': 'No text provided'})

        # Save target language preference if requested
        if remember_lang:
            session['target_language'] = target_language
            logger.debug(
                f"Saved target language preference: {target_language}")

        translator = Translator()
        result = translator.translate(text, dest=target_language)

        return jsonify({
            'success': True,
            'translated_text': result.text,
            'source_language': result.src,
            'target_language': result.dest
        })

    except Exception as e:
        logger.error(f"Translation error: {e}")
        return jsonify({'success': False, 'error': str(e)})


@app.route('/api/start_recording', methods=['POST'])
def start_recording():
    try:
        audio_recorder.start_recording()
        return jsonify({'success': True})
    except Exception as e:
        logger.error(f"Error starting recording: {e}")
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/pause_recording', methods=['POST'])
def pause_recording():
    try:
        transcription = audio_recorder.pause_recording()
        return jsonify({'success': True, 'transcription': transcription})
    except Exception as e:
        logger.error(f"Error pausing recording: {e}")
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/resume_recording', methods=['POST'])
def resume_recording():
    try:
        audio_recorder.resume_recording()
        return jsonify({'success': True})
    except Exception as e:
        logger.error(f"Error resuming recording: {e}")
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/stop_recording', methods=['POST'])
def stop_recording():
    try:
        transcription = audio_recorder.stop_recording()
        return jsonify({'success': True, 'transcription': transcription})
    except Exception as e:
        logger.error(f"Error stopping recording: {e}")
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/explain_word', methods=['GET'])
def explain_word():
    """Get word explanation from Duden"""
    word = request.args.get('word', '')

    if not word:
        return jsonify({'success': False, 'error': 'No word provided'})

    try:
        # Get word from Duden
        word_obj = get(word)

        if not word_obj:
            return jsonify({'success': False, 'error': 'Word not found'})

        # Get explanation
        explanation = {
            'word':
            word,
            'meaning':
            word_obj.meaning
            if hasattr(word_obj, 'meaning') else 'Keine Bedeutung gefunden',
        }

        # Add grammar if available (using inflection instead of grammar_raw)
        if hasattr(word_obj, 'inflection'):
            explanation['grammar'] = word_obj.inflection

        # Add article if available
        if hasattr(word_obj, 'article'):
            explanation['article'] = word_obj.article

        # Add synonyms if available
        if hasattr(word_obj, 'synonyms') and word_obj.synonyms:
            explanation['synonyms'] = word_obj.synonyms

        return jsonify({'success': True, 'explanation': explanation})

    except Exception as e:
        if "Connection" in str(e):
            logger.error(f"Duden connection error: {e}")
            return jsonify({
                'success':
                False,
                'error':
                'Konnte keine Verbindung zu Duden herstellen'
            })
        else:
            logger.error(f"Duden error: {e}")
            return jsonify({'success': False, 'error': str(e)})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
