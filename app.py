import os
import json
import logging
import re
import wave
import whisper
import pyaudio
import numpy as np
import threading
from io import BytesIO
from datetime import datetime
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


@app.before_request
def load_last_directory():
    global VIDEO_DIRECTORY
    last_directory = request.cookies.get('last_directory')
    if last_directory and os.path.isdir(last_directory):
        VIDEO_DIRECTORY = last_directory


# Audio recording configuration
CHUNK = 2048
FORMAT = pyaudio.paInt16
CHANNELS = 1
RATE = 44100


class AudioRecorder:

    def __init__(self):
        self.audio = pyaudio.PyAudio()
        self.stream = None
        self.frames = []
        self.is_recording = False
        self.is_paused = False
        self.whisper_model = whisper.load_model("turbo", device="cpu")
        self.lock = threading.Lock()
        self.recording_thread = None

    def start_recording(self):
        if not self.is_recording:
            self.stream = self.audio.open(format=FORMAT,
                                          channels=CHANNELS,
                                          rate=RATE,
                                          input=True,
                                          frames_per_buffer=CHUNK)
            self.frames = []
            self.is_recording = True
            self.is_paused = False
            self.recording_thread = threading.Thread(target=self._record)
            self.recording_thread.start()
            return True
        return False

    def _record(self):
        while self.is_recording:
            if not self.is_paused:
                try:
                    data = self.stream.read(CHUNK, exception_on_overflow=False)
                    with self.lock:
                        self.frames.append(data)
                except Exception as e:
                    logger.error(f"Error recording audio: {e}")
                    break

    def pause_recording(self):
        self.is_paused = True
        return True

    def resume_recording(self):
        self.is_paused = False
        return True

    def stop_recording(self):
        if self.is_recording:
            self.is_recording = False
            self.is_paused = False
            if self.stream:
                self.stream.stop_stream()
                self.stream.close()
            if self.recording_thread:
                self.recording_thread.join()

            # Save audio to temporary file
            temp_path = "static/temp_audio.wav"
            with wave.open(temp_path, 'wb') as wf:
                wf.setnchannels(CHANNELS)
                wf.setsampwidth(self.audio.get_sample_size(FORMAT))
                wf.setframerate(RATE)
                wf.writeframes(b''.join(self.frames))

            # Return audio path immediately
            self.frames = []  # Clear frames after saving
            
            # Start transcription in background
            def transcribe_later():
                transcription = self.transcribe_audio()
                return transcription
            
            return {"audio_path": "/static/temp_audio.wav"}
        return {"transcription": "", "audio_path": ""}

    def transcribe_audio(self):
        if not os.path.exists("static/temp_audio.wav"):
            return ""

        with self.lock:
            try:
                # Read the saved WAV file
                result = self.whisper_model.transcribe("static/temp_audio.wav",
                                                     language="de",
                                                     verbose=False)
                print(result)
                return result["text"].strip()
            except Exception as e:
                logger.error(f"Error transcribing audio: {e}")
                return ""


# Initialize global audio recorder
audio_recorder = AudioRecorder()

# Configuration
VIDEO_DIRECTORY = os.environ.get("VIDEO_DIRECTORY", r"./videos")
UPLOAD_FOLDER = os.environ.get("UPLOAD_FOLDER", "./uploads")
ALLOWED_EXTENSIONS = {'vtt'}
USAGE_DATA_FILE = "usage_data.json"
ARCHIVE_FILE = "transcription_archive.json"

# Ensure directories exist
os.makedirs(VIDEO_DIRECTORY, exist_ok=True)
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def load_archive():
    """Load archive data from file"""
    try:
        if os.path.exists(ARCHIVE_FILE):
            with open(ARCHIVE_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        logger.error(f"Error loading archive data: {e}")
    return []

def save_archive(data):
    """Save archive data to file"""
    try:
        with open(ARCHIVE_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"Error saving archive data: {e}")

@app.route('/archive')
def archive():
    """Archive page showing saved transcriptions"""
    archive_data = load_archive()
    return render_template('archive.html', entries=archive_data)

@app.route('/api/archive', methods=['POST'])
def save_to_archive():
    """API to save transcription to archive"""
    try:
        data = request.get_json()
        archive_data = load_archive()
        
        new_entry = {
            'id': len(archive_data),
            'date': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'video_name': data.get('video_name', ''),
            'transcription_html': data.get('transcription_html', ''),
            'improved_html': data.get('improved_html', ''),
            'hint_html': data.get('hint_html', '')
        }
        
        archive_data.append(new_entry)
        save_archive(archive_data)
        return jsonify({'success': True})
    except Exception as e:
        logger.error(f"Error saving to archive: {e}")
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/archive/update', methods=['POST'])
def update_archive():
    """API to update archive entry"""
    try:
        data = request.get_json()
        archive_data = load_archive()
        
        for entry in archive_data:
            if str(entry['id']) == str(data['id']):
                entry['transcription_html'] = data['transcription_html']
                entry['improved_html'] = data['improved_html']
                entry['hint_html'] = data['hint_html']
                break
                
        save_archive(archive_data)
        return jsonify({'success': True})
    except Exception as e:
        logger.error(f"Error updating archive: {e}")
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/archive/delete', methods=['POST'])
def delete_archive():
    """API to delete archive entry"""
    try:
        data = request.get_json()
        archive_data = load_archive()
        
        archive_data = [entry for entry in archive_data if str(entry['id']) != str(data['id'])]
        
        save_archive(archive_data)
        return jsonify({'success': True})
    except Exception as e:
        logger.error(f"Error deleting from archive: {e}")
        return jsonify({'success': False, 'error': str(e)})

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER


def allowed_file(filename):
    return '.' in filename and filename.rsplit(
        '.', 1)[1].lower() in ALLOWED_EXTENSIONS


def get_video_files(current_dir=None, search_query=None):
    """Scan directory for video files and folders"""
    videos = []
    folders = []
    valid_extensions = ['.mp4', '.webm', '.ogg', '.mov', '.mkv']

    scan_dir = current_dir if current_dir else VIDEO_DIRECTORY
    rel_path = os.path.relpath(scan_dir,
                               VIDEO_DIRECTORY) if current_dir else ''

    try:
        for item in os.listdir(scan_dir):
            filepath = os.path.join(scan_dir, item)
            if os.path.isdir(filepath):
                # Normalize path separators to forward slashes
                clean_path = os.path.join(rel_path, item).replace('\\', '/')
                # Remove leading ./ if present
                if clean_path.startswith('./'):
                    clean_path = clean_path[2:]
                folders.append({'name': item, 'path': clean_path})
            elif os.path.isfile(filepath):
                ext = os.path.splitext(item)[1].lower()
                if ext in valid_extensions and (not search_query or search_query.lower() in item.lower()):
                    basename = os.path.splitext(item)[0]

                    # Check for subtitle and thumbnail files
                    subtitle_path = os.path.join(scan_dir,
                                                 f"{basename}-subtitles.vtt")
                    thumbnail_path = os.path.join(
                        scan_dir, f"{basename}-thumbnails.vtt")

                    # Check for cover image
                    cover_path = f"{basename}.jpg"
                    has_cover = os.path.isfile(
                        os.path.join(scan_dir, cover_path))

                    videos.append({
                        'name':
                        item,
                        'path':
                        os.path.join(rel_path, item),
                        'has_subtitles':
                        os.path.isfile(subtitle_path),
                        'has_thumbnails':
                        os.path.isfile(thumbnail_path),
                        'basename':
                        basename,
                        'has_cover':
                        has_cover,
                        'cover_path':
                        os.path.join(rel_path, cover_path)
                        if has_cover else None
                    })

    except Exception as e:
        logger.error(f"Error scanning directory: {e}")
        return {'videos': [], 'folders': []}

    return {'videos': videos, 'folders': folders}


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
@app.route('/folder/<path:folder_path>')
def index(folder_path=None):
    """Home page with video and folder listing"""
    current_dir = os.path.join(VIDEO_DIRECTORY,
                               folder_path) if folder_path else VIDEO_DIRECTORY
    if not os.path.exists(current_dir):
        flash("Ordner nicht gefunden", "error")
        return redirect(url_for('index'))

    search_query = request.args.get('search', '')
    result = get_video_files(current_dir, search_query)
    return render_template('index.html',
                           videos=result['videos'],
                           folders=result['folders'],
                           current_path=folder_path if folder_path else '',
                           video_directory=VIDEO_DIRECTORY)


@app.route('/player/<path:video_name>')
def player(video_name):
    """Video player page"""
    # Get the full path and directory
    video_rel_path = video_name
    video_dir = os.path.dirname(os.path.join(VIDEO_DIRECTORY, video_rel_path))

    result = get_video_files(video_dir)
    video = next((v for v in result['videos'] if v['path'] == video_rel_path),
                 None)

    if not video:
        return redirect(url_for('index'))

    # Update video path and basename, removing leading ./ if present
    video['name'] = video_rel_path.lstrip('.\\').lstrip('.')
    video['basename'] = os.path.splitext(video_rel_path)[0].lstrip(
        '.\\').lstrip('.')

    return render_template('player.html', video=video, videos=result['videos'])


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


@app.route('/api/audio/start', methods=['POST'])
def start_audio():
    """Start audio recording"""
    try:
        audio_recorder.start_recording()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/api/audio/pause', methods=['POST'])
def pause_audio():
    """Pause audio recording and get transcription"""
    try:
        transcription = audio_recorder.pause_recording()
        return jsonify({'success': True, 'transcription': transcription})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/api/audio/resume', methods=['POST'])
def resume_audio():
    """Resume audio recording"""
    try:
        audio_recorder.resume_recording()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


@app.route('/api/audio/transcribe', methods=['POST'])
def transcribe_audio():
    """Transcribe the recorded audio"""
    try:
        transcription = audio_recorder.transcribe_audio()
        return jsonify({
            'success': True,
            'transcription': transcription
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})

@app.route('/api/audio/stop', methods=['POST'])
def stop_audio():
    """Stop audio recording and get final transcription"""
    try:
        result = audio_recorder.stop_recording()
        return jsonify({
            'success': True, 
            'audio_path': result.get('audio_path', '')
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)})


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
    last_directory = request.cookies.get('last_directory')

    if new_directory and os.path.isdir(new_directory):
        VIDEO_DIRECTORY = new_directory
        response = redirect(url_for('index'))
        response.set_cookie('last_directory', new_directory)
        return response
    else:
        try:
            # Try to create the directory if it doesn't exist
            os.makedirs(new_directory, exist_ok=True)
            VIDEO_DIRECTORY = new_directory
            response = redirect(url_for('index'))
            response.set_cookie('last_directory', new_directory)
            return response
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


@app.route('/api/auto-correct', methods=['POST'])
def auto_correct():
    """Auto-correct the given text using OpenAI API"""
    try:
        import openai
        
        data = request.get_json()
        transcription = data.get('transcription', '')
        
        # Get OpenAI API key from environment
        openai.api_key = os.getenv('OPENAI_API_KEY')
        if not openai.api_key:
            return jsonify({'success': False, 'error': 'OpenAI API key not found'})

        # Create system prompt
        system_prompt = """Du bist ein Assistent für Deutschlerner. Deine Aufgabe ist es, mündliche Nacherzählungen zu korrigieren und zu verbessern. 
        Die Verbesserung soll natürlich und flüssig klingen, aber auf dem Sprachniveau B2 (höchstens C1) bleiben.
        Wenn es passt, verwende gängige Redewendungen oder idiomatische Ausdrücke.
        Gib nur den verbesserten Text und einen zusätzlichen Hinweis aus."""

        # Create user prompt from transcription
        user_prompt = f"""Verbessere den folgenden Text stilistisch und grammatikalisch:

{transcription}

Formatiere die Ausgabe wie folgt:
{{verbesserter Text}}

------

{{zusätzlicher Hinweis}}

Außer diesen beiden Teilen gib nichts weiter aus."""

        # Send to ChatGPT
        response = openai.ChatCompletion.create(
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.7
        )

        # Get response
        corrected_text = response.choices[0].message.content.strip()
        
        return jsonify({
            'success': True,
            'corrected_text': corrected_text
        })
    except Exception as e:
        logger.error(f"Auto-correction error: {e}")
        return jsonify({'success': False, 'error': str(e)})


if __name__ == '__main__':
    app.run(host="127.0.0.1", port=5000, debug=False)
