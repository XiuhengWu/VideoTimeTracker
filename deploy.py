import os
import shutil

# Define paths
source_dir = r"D:\Applications\Portable\VideoTimeTracker"
backup_dir = r"D:\Backups\Documents\VideoTimeTracker"

# Files and folders to exclude
exclude_files = {"transcription_archive.json", "usage_data.json", "deploy.py", "temp_audio.wav"}
exclude_dirs = {".git"}

# Step 1: Copy specific files to the backup directory
os.makedirs(backup_dir, exist_ok=True)
print(f"Sicherungsverzeichnis erstellt oder existiert bereits: {backup_dir}")

for file_name in exclude_files:
    source_file = os.path.join(source_dir, file_name)
    if os.path.exists(source_file):
        shutil.copy2(source_file, backup_dir)
        print(f"{source_file} wurde nach {backup_dir} kopiert")
    else:
        print(f"Datei nicht gefunden, übersprungen: {source_file}")

# Schritt 2: Alle Dateien und Ordner außer den ausgeschlossenen im Quellverzeichnis löschen
for file_name in os.listdir(source_dir):
    file_path = os.path.join(source_dir, file_name)
    if file_name in exclude_files or file_name in exclude_dirs:
        print(f"Ausgeschlossene Datei oder Ordner übersprungen: {file_name}")
        continue
    if os.path.isfile(file_path):
        os.remove(file_path)
        print(f"Datei gelöscht: {file_path}")
    elif os.path.isdir(file_path):
        shutil.rmtree(file_path)
        print(f"Ordner gelöscht: {file_path}")

# Schritt 3: Alle Dateien aus dem Verzeichnis des Skripts ins Quellverzeichnis kopieren, außer den ausgeschlossenen
script_dir = os.path.dirname(os.path.abspath(__file__))
print(f"Skriptverzeichnis: {script_dir}")

for file_name in os.listdir(script_dir):
    if (file_name not in exclude_files) and (file_name not in exclude_dirs):
        source_file = os.path.join(script_dir, file_name)
        destination_file = os.path.join(source_dir, file_name)
        if os.path.isfile(source_file):
            shutil.copy2(source_file, destination_file)
            print(f"Datei {source_file} wurde nach {destination_file} kopiert")
        elif os.path.isdir(source_file):
            shutil.copytree(source_file, destination_file, dirs_exist_ok=True)
            print(f"Ordner {source_file} wurde nach {destination_file} kopiert")

print("Operation erfolgreich abgeschlossen.")