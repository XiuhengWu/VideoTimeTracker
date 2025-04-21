import os
import json
import logging
import re
from datetime import datetime
from flask import Flask, render_template, request, redirect, url_for, jsonify, session, send_from_directory, flash
from werkzeug.utils import secure_filename
from googletrans import Translator
from duden import get
import whisper
import numpy as np
import soundfile as sf
from io import BytesIO
import base64
import subprocess
import io

# Initialize Whisper model
whisper_model = whisper.load_model("tiny")

# Configure logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET",
                                "devkey-replace-in-production")

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


@app.route('/api/explain_word', methods=['GET'])
def explain_word():
    """Get word explanation from Duden"""


@app.route('/api/transcribe', methods=['POST'])
def transcribe_audio():
    """Transcribe audio data"""
    try:
        # Get audio data from request
        data = request.get_json()
        audio_data = data.get('audio')
        if not audio_data:
            return jsonify({
                'success': False,
                'error': 'No audio data provided'
            })

        # Decode base64 audio data
        audio_bytes = base64.b64decode(audio_data.split(',')[1])
        audio_io = BytesIO(audio_bytes)

        # Convert audio to numpy array
        import subprocess
        import io

        # Use ffmpeg to convert webm to wav
        process = subprocess.Popen(['ffmpeg', '-i', 'pipe:0', '-ar', '16000', '-ac', '1', '-f', 'wav', 'pipe:1'],
                                 stdin=subprocess.PIPE,
                                 stdout=subprocess.PIPE,
                                 stderr=subprocess.PIPE)

        output, err = process.communicate(input=audio_bytes)

        # Read the converted wav data
        wav_io = io.BytesIO(output)
        audio_array, sample_rate = sf.read(wav_io)
        # Convert to float32 for whisper
        audio_array = audio_array.astype(np.float32)
        # Transcribe using Whisper
        result = whisper_model.transcribe(audio_array)

        return jsonify({'success': True, 'text': result['text']})
    except Exception as e:
        logger.error(f"Transcription error: {e}")
        return jsonify({'success': False, 'error': str(e)})


@app.route('/api/check_silence', methods=['POST'])
def check_silence():
    """Check if audio contains silence"""
    try:
        data = request.get_json()
        audio_data = data.get('audio')
        if not audio_data:
            return jsonify({
                'success': False,
                'error': 'No audio data provided'
            })

        # Decode base64 audio data
        audio_bytes = base64.b64decode(audio_data.split(',')[1])
        audio_io = BytesIO(audio_bytes)

        # Convert audio to numpy array
        import subprocess
        import io

        # Use ffmpeg to convert webm to wav with specific format
        process = subprocess.Popen(['ffmpeg', '-i', 'pipe:0', '-ar', '16000', '-ac', '1', '-f', 'wav', 'pipe:1'],
                                 stdin=subprocess.PIPE,
                                 stdout=subprocess.PIPE,
                                 stderr=subprocess.PIPE)

        output, err = process.communicate(input=audio_bytes)

        # Read the converted wav data
        wav_io = io.BytesIO(output)
        audio_array, sample_rate = sf.read(wav_io, dtype='float32')

        # Calculate RMS amplitude
        frame_length = int(sample_rate * 0.025)  # 25ms frames
        threshold = 0.01  # Silence threshold

        # Calculate frame energies
        frame_energies = []
        for i in range(0, len(audio_array), frame_length):
            frame = audio_array[i:i + frame_length]
            energy = np.sqrt(np.mean(frame**2))
            frame_energies.append(energy)

        # Detect silence (1 second)
        silence_frames = int(1.0 / 0.025)  # Number of frames in 1 second
        is_silence = False

        if len(frame_energies) >= silence_frames:
            recent_frames = frame_energies[-silence_frames:]
            if all(energy < threshold for energy in recent_frames):
                is_silence = True

        return jsonify({'success': True, 'is_silence': is_silence})
    except Exception as e:
        logger.error(f"Silence detection error: {e}")
        return jsonify({'success': False, 'error': str(e)})
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