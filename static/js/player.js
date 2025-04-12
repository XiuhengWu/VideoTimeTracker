/**
 * Player module for handling video playback, subtitle navigation and timestamp marking
 */
document.addEventListener('DOMContentLoaded', function() {
    // Initialize player
    const videoElement = document.getElementById('player');
    
    if (!videoElement) return;
    
    // Get video information from data attributes
    const videoBasename = videoElement.dataset.basename;
    const hasSubtitles = videoElement.dataset.subtitles === 'true';
    const hasThumbnails = videoElement.dataset.thumbnails === 'true';
    
    // Initialize Plyr
    const player = new Plyr('#player', {
        captions: { active: true, language: 'auto', update: true },
        seekTime: 5,
        previewThumbnails: hasThumbnails ? { enabled: true, src: `/videos/${videoBasename}-thumbnails.vtt` } : { enabled: false }
    });

    // Wait for player to be ready before setting up keyboard navigation
    player.on('ready', () => {
        // Keyboard navigation
        document.addEventListener('keydown', function(e) {
            if (!player || !player.ready) return;
            
            const track = videoElement.textTracks && videoElement.textTracks.length > 0 ? 
                         videoElement.textTracks[0] : null;
                         
            if (track) {
                // A key - previous subtitle or restart current
                if (e.key === 'a' || e.key === 'A') {
                    e.preventDefault();
                    let activeCue = null;
                    let previousCue = null;
                    
                    for (let i = 0; i < track.cues.length; i++) {
                        const cue = track.cues[i];
                        if (player.currentTime >= cue.startTime && player.currentTime <= cue.endTime) {
                            activeCue = cue;
                            previousCue = i > 0 ? track.cues[i - 1] : null;
                            break;
                        }
                    }
                    
                    if (activeCue && player.currentTime >= activeCue.startTime + 1) {
                        player.currentTime = activeCue.startTime;
                    } else if (previousCue) {
                        player.currentTime = previousCue.startTime;
                    }
                } 
                // D key - next subtitle
                else if (e.key === 'd' || e.key === 'D') {
                    e.preventDefault();
                    for (let i = 0; i < track.cues.length; i++) {
                        if (player.currentTime < track.cues[i].startTime) {
                            player.currentTime = track.cues[i].startTime;
                            break;
                        }
                    }
                }
            }
        });
    });
    
    // Widescreen mode implementation
    const toggleWidescreenBtn = document.getElementById('toggle-widescreen');
    const playerContainer = document.querySelector('.plyr-container');
    let isWidescreenMode = false;
    
    if (toggleWidescreenBtn && playerContainer) {
        toggleWidescreenBtn.addEventListener('click', function() {
            isWidescreenMode = !isWidescreenMode;
            
            if (isWidescreenMode) {
                // Enter widescreen mode
                playerContainer.classList.add('widescreen-mode');
                toggleWidescreenBtn.innerHTML = '<i class="material-icons align-middle">fullscreen_exit</i> Normalmodus';
                toggleWidescreenBtn.classList.add('btn-danger', 'fullscreen-exit');
                toggleWidescreenBtn.classList.remove('btn-outline-primary');
                
                // Refit the player to new container
                player.fullscreen.enter();
                setTimeout(() => player.fullscreen.exit(), 50);
            } else {
                // Exit widescreen mode
                playerContainer.classList.remove('widescreen-mode');
                toggleWidescreenBtn.innerHTML = '<i class="material-icons align-middle">aspect_ratio</i> Breitbildmodus';
                toggleWidescreenBtn.classList.remove('btn-danger', 'fullscreen-exit');
                toggleWidescreenBtn.classList.add('btn-outline-primary');
                
                // Refit the player to original container
                setTimeout(() => player.reenter(), 50);
            }
        });
        
        // Also handle ESC key to exit widescreen mode
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && isWidescreenMode) {
                toggleWidescreenBtn.click();
            }
        });
    }
    
    // Initialize subtitle tracks if available
    if (hasSubtitles) {
        // Track is added via HTML
        const track = document.querySelector('track');
        if (track) {
            // Enable subtitles by default
            track.mode = 'showing';
        }
    }
    
    // Subtitle Font Size Control
    const subtitleFontSizeSelect = document.getElementById('subtitle-font-size');
    if (subtitleFontSizeSelect) {
        // Load saved font size preference
        const savedFontSize = localStorage.getItem('subtitle-font-size');
        if (savedFontSize) {
            subtitleFontSizeSelect.value = savedFontSize;
            // Apply font size immediately
            document.documentElement.style.setProperty('--subtitle-font-size', `${savedFontSize}px`);
        } else {
            // Set default font size
            document.documentElement.style.setProperty('--subtitle-font-size', '16px');
        }
        
        // Change font size when select changes
        subtitleFontSizeSelect.addEventListener('change', function() {
            const fontSize = this.value;
            document.documentElement.style.setProperty('--subtitle-font-size', `${fontSize}px`);
            localStorage.setItem('subtitle-font-size', fontSize);
        });
    }

    // Timemarks functionality
    let markedTime = null;
    const timestampDisplay = document.getElementById('timestamp-display');
    const markButton = document.getElementById('mark-timestamp');
    const clearTimemarksBtn = document.getElementById('clear-timemarks');
    const timemarksList = document.getElementById('timemarks-list');
    let timemarks = JSON.parse(localStorage.getItem(`timemarks-${videoBasename}`) || '[]');
    
    // Initialize timemarks list
    if (timemarksList) {
        renderTimemarks();
    }
    
    if (markButton) {
        markButton.addEventListener('click', function() {
            markedTime = player.currentTime;
            updateTimestampDisplay();
            
            // Add timemark with default name
            const defaultName = `Zeitmarke ${timemarks.length + 1}`;
            addTimemark(player.currentTime, defaultName);
        });
    }
    
    if (clearTimemarksBtn) {
        clearTimemarksBtn.addEventListener('click', function() {
            if (confirm('Möchten Sie alle Zeitmarken für dieses Video löschen?')) {
                timemarks = [];
                localStorage.setItem(`timemarks-${videoBasename}`, JSON.stringify(timemarks));
                renderTimemarks();
            }
        });
    }
    
    // Add timemark to the list
    function addTimemark(time, description = '') {
        const timemark = {
            time: time,
            description: description || `Zeitmarke ${timemarks.length + 1}`,
            createdAt: new Date().toISOString()
        };
        
        timemarks.push(timemark);
        
        // Sort timemarks by time
        timemarks.sort((a, b) => a.time - b.time);
        
        // Save to localStorage
        localStorage.setItem(`timemarks-${videoBasename}`, JSON.stringify(timemarks));
        
        // Update UI
        renderTimemarks();
    }
    
    // Render timemarks list
    function renderTimemarks() {
        if (!timemarksList) return;
        
        if (timemarks.length === 0) {
            timemarksList.innerHTML = '<div class="text-center py-3 text-muted">Keine Zeitmarken gesetzt</div>';
            return;
        }
        
        let html = '';
        
        timemarks.forEach((timemark, index) => {
            // Format time as MM:SS
            const minutes = Math.floor(timemark.time / 60);
            const seconds = Math.floor(timemark.time % 60);
            const formattedTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            html += `
                <div class="timemark-item" data-index="${index}">
                    <div class="timemark-time">${formattedTime}</div>
                    <div class="timemark-description">${timemark.description}</div>
                    <div class="timemark-actions">
                        <button class="edit-timemark" title="Bearbeiten"><i class="material-icons">edit</i></button>
                        <button class="delete-timemark" title="Löschen"><i class="material-icons">delete</i></button>
                    </div>
                </div>
            `;
        });
        
        timemarksList.innerHTML = html;
        
        // Add click event to jump to timemark
        const items = timemarksList.querySelectorAll('.timemark-item');
        items.forEach(item => {
            item.addEventListener('click', function(e) {
                if (e.target.closest('.edit-timemark') || e.target.closest('.delete-timemark')) {
                    return; // Let the edit/delete button handle their own events
                }
                
                const index = parseInt(this.dataset.index);
                if (index >= 0 && index < timemarks.length) {
                    player.currentTime = timemarks[index].time;
                }
            });
            
            // Edit timemark
            const editBtn = item.querySelector('.edit-timemark');
            if (editBtn) {
                editBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const index = parseInt(item.dataset.index);
                    if (index >= 0 && index < timemarks.length) {
                        const newDesc = prompt('Beschreibung bearbeiten:', timemarks[index].description);
                        if (newDesc !== null) {
                            timemarks[index].description = newDesc;
                            localStorage.setItem(`timemarks-${videoBasename}`, JSON.stringify(timemarks));
                            renderTimemarks();
                        }
                    }
                });
            }
            
            // Delete timemark
            const deleteBtn = item.querySelector('.delete-timemark');
            if (deleteBtn) {
                deleteBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const index = parseInt(item.dataset.index);
                    if (index >= 0 && index < timemarks.length) {
                            timemarks.splice(index, 1);
                            localStorage.setItem(`timemarks-${videoBasename}`, JSON.stringify(timemarks));
                            renderTimemarks();
                    }
                });
            }
        });
    }
    
    // Update timestamp display with difference
    function updateTimestampDisplay() {
        if (markedTime !== null && timestampDisplay) {
            const currentTime = player.currentTime;
            const difference = Math.abs(currentTime - markedTime);
            
            const minutes = Math.floor(difference / 60);
            const seconds = Math.floor(difference % 60);
            
            timestampDisplay.textContent = `Zeitdifferenz: ${minutes}:${seconds.toString().padStart(2, '0')}`;
            timestampDisplay.classList.remove('d-none');
        }
    }
    
    // Handle keyboard navigation for subtitles
    document.addEventListener('keydown', function(e) {
        // Only process if player exists and is loaded
        if (!player || !player.ready) return;
        
        // Get subtitle tracks
        const track = videoElement.textTracks && videoElement.textTracks.length > 0 ? 
                     videoElement.textTracks[0] : null;
                     
        if (track) {
            // A key - previous subtitle or restart current
            if (e.key === 'a' || e.key === 'A') {
                e.preventDefault();
                
                // Get active cue
                let activeCue = null;
                let previousCue = null;
                
                // Find active and previous cues
                for (let i = 0; i < track.cues.length; i++) {
                    const cue = track.cues[i];
                    if (player.currentTime >= cue.startTime && player.currentTime <= cue.endTime) {
                        activeCue = cue;
                        previousCue = i > 0 ? track.cues[i - 1] : null;
                        break;
                    } else if (player.currentTime < cue.startTime) {
                        // If we're past all previous cues
                        if (i > 0) {
                            previousCue = track.cues[i - 1];
                        }
                        break;
                    }
                    
                    // If this is the last cue and we're past it
                    if (i === track.cues.length - 1) {
                        previousCue = cue;
                    }
                }
                
                // Logic for jumping
                if (activeCue && player.currentTime >= activeCue.startTime + 1) {
                    // If more than 1 second into current cue, jump to start of current cue
                    player.currentTime = activeCue.startTime;
                } else if (previousCue) {
                    // Jump to previous cue
                    player.currentTime = previousCue.startTime;
                }
            } 
            // Q key - next subtitle
            else if (e.key === 'd' || e.key === 'D') {
                e.preventDefault();
                
                // Find next cue
                for (let i = 0; i < track.cues.length; i++) {
                    if (player.currentTime < track.cues[i].startTime) {
                        player.currentTime = track.cues[i].startTime;
                        break;
                    }
                }
            }
        }
    });
    
    // Update timestamp display when playing
    player.on('timeupdate', function() {
        if (markedTime !== null) {
            updateTimestampDisplay();
        }
    });
    
    // Subtitle list functionality
    const toggleSubtitlesBtn = document.getElementById('toggle-subtitles-list');
    const closeSubtitlesBtn = document.getElementById('close-subtitles');
    const subtitlesContainer = document.getElementById('subtitles-container');
    const subtitleList = document.getElementById('subtitle-list');
    const translateCurrentBtn = document.getElementById('translate-current');
    const revertTranslationBtn = document.getElementById('revert-translation');
    const subtitleLanguageControls = document.querySelector('.subtitle-language-controls');
    const subtitleLanguageSelect = document.getElementById('subtitle-language');
    let subtitles = [];
    let currentSubtitleIndex = -1;
    let translatedSubtitles = null;
    let originalSubtitleText = null;
    
    // Load saved target language preference
    if (subtitleLanguageSelect) {
        const savedLanguage = localStorage.getItem('translation-target-language');
        if (savedLanguage) {
            subtitleLanguageSelect.value = savedLanguage;
        }
        
        // Save language preference when changed
        subtitleLanguageSelect.addEventListener('change', function() {
            localStorage.setItem('translation-target-language', this.value);
        });
    }
    
    if (toggleSubtitlesBtn && subtitlesContainer && hasSubtitles) {
        // Load subtitles when button is clicked
        toggleSubtitlesBtn.addEventListener('click', function() {
            subtitlesContainer.classList.remove('d-none');
            
            // Load subtitles if not already loaded
            if (subtitles.length === 0) {
                loadSubtitles();
            }
        });
        
        // Close subtitle list
        if (closeSubtitlesBtn) {
            closeSubtitlesBtn.addEventListener('click', function() {
                subtitlesContainer.classList.add('d-none');
            });
        }
        
        // Show translation controls and translate current subtitle
        if (translateCurrentBtn && subtitleLanguageControls) {
            translateCurrentBtn.addEventListener('click', function() {
                if (subtitleLanguageControls.style.display === 'none') {
                    subtitleLanguageControls.style.display = 'block';
                } else {
                    // Perform translation on current subtitle only
                    translateCurrentSubtitle();
                }
            });
        }
        
        // Revert to original
        if (revertTranslationBtn) {
            revertTranslationBtn.addEventListener('click', function() {
                revertToOriginal();
            });
        }
    }
    
    // Load subtitles from server
    function loadSubtitles() {
        fetch(`/api/get_subtitles/${videoBasename}`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    subtitles = data.subtitles;
                    renderSubtitleList(subtitles);
                    
                    // Listen for timeupdate to highlight current subtitle
                    player.on('timeupdate', highlightCurrentSubtitle);
                } else {
                    subtitleList.innerHTML = `<div class="alert alert-danger">${data.error}</div>`;
                }
            })
            .catch(error => {
                subtitleList.innerHTML = `<div class="alert alert-danger">Fehler beim Laden der Untertitel: ${error}</div>`;
            });
    }
    
    // Convert VTT time format to seconds
    function timeToSeconds(time) {
        const parts = time.split(':');
        let seconds = 0;
        
        if (parts.length === 3) {
            // Hours:Minutes:Seconds.Milliseconds
            seconds = parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
        } else if (parts.length === 2) {
            // Minutes:Seconds.Milliseconds
            seconds = parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
        }
        
        return seconds;
    }
    
    // Highlight the current subtitle in the list
    function highlightCurrentSubtitle() {
        if (!subtitles.length) return;
        
        const currentTime = player.currentTime;
        let foundIndex = -1;
        
        // Find the current subtitle
        for (let i = 0; i < subtitles.length; i++) {
            const startTime = timeToSeconds(subtitles[i].start);
            const endTime = timeToSeconds(subtitles[i].end);
            
            if (currentTime >= startTime && currentTime <= endTime) {
                foundIndex = i;
                break;
            }
        }
        
        // Update highlight only if changed
        if (foundIndex !== currentSubtitleIndex) {
            // Remove active class from previous subtitle
            const items = document.querySelectorAll('.subtitle-item');
            items.forEach(item => item.classList.remove('active'));
            
            // Add active class to current subtitle
            if (foundIndex >= 0) {
                const activeItem = document.getElementById(`subtitle-${foundIndex}`);
                if (activeItem) {
                    activeItem.classList.add('active');
                    
                    // Scroll into view if needed
                    const container = activeItem.parentElement;
                    const containerRect = container.getBoundingClientRect();
                    const itemRect = activeItem.getBoundingClientRect();
                    
                    if (itemRect.bottom > containerRect.bottom || itemRect.top < containerRect.top) {
                        activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }
            }
            
            currentSubtitleIndex = foundIndex;
        }
    }
    
    // Render subtitle list
    function renderSubtitleList(subtitleData) {
        if (!subtitleList) return;
        
        if (subtitleData.length === 0) {
            subtitleList.innerHTML = '<div class="text-center py-3">Keine Untertitel gefunden</div>';
            return;
        }
        
        let html = '';
        
        subtitleData.forEach((subtitle, index) => {
            html += `
                <div id="subtitle-${index}" class="subtitle-item" data-index="${index}">
                    <div class="subtitle-time">${subtitle.start.split('.')[0]}</div>
                    <div class="subtitle-text">${processText(subtitle.text)}</div>
                </div>
            `;
        });
        
        subtitleList.innerHTML = html;
        
        // Add click event to jump to subtitle
        const items = document.querySelectorAll('.subtitle-item');
        items.forEach(item => {
            item.addEventListener('click', function() {
                const index = parseInt(this.dataset.index);
                if (index >= 0 && index < subtitles.length) {
                    const startTime = timeToSeconds(subtitles[index].start);
                    player.currentTime = startTime;
                    player.play();
                }
            });
        });
        
        // Add click events for explanation tooltips
        addWordExplanationEvents();
    }
    
    // Process text to add word explanation functionality
    function processText(text) {
        // Only process German text for word explanations
        if (!text || translatedSubtitles) return text;
        
        // Split text into words, preserve punctuation
        return text.replace(/(\b[A-Za-zÄäÖöÜüß]+\b)/g, function(match) {
            // Only process German nouns (capitalized) and other words over 3 letters
            if ((match[0] === match[0].toUpperCase() && match.length > 2) || match.length > 3) {
                return `<span class="explainable" data-word="${match}">${match}</span>`;
            }
            return match;
        });
    }
    
    // Add click events for word explanations
    function addWordExplanationEvents() {
        const explainableWords = document.querySelectorAll('.explainable');
        
        explainableWords.forEach(word => {
            word.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                
                const wordText = this.dataset.word;
                if (!wordText) return;
                
                // Check if tooltip already exists
                if (this.querySelector('.word-tooltip')) {
                    return;
                }
                
                // Create tooltip
                const tooltip = document.createElement('div');
                tooltip.className = 'word-tooltip';
                tooltip.innerHTML = '<div class="text-center"><div class="spinner-border spinner-border-sm text-primary" role="status"></div> Lade...</div>';
                
                this.appendChild(tooltip);
                
                // Get word explanation
                fetchWordExplanation(wordText, tooltip);
            });
        });
    }
    
    // Fetch word explanation from Duden
    function fetchWordExplanation(word, tooltipElement) {
        fetch(`/api/explain_word?word=${encodeURIComponent(word)}`)
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    const explanation = data.explanation;
                    let html = `<h6>${explanation.word}</h6>`;
                    
                    if (explanation.article) {
                        html += `<p><strong>Artikel:</strong> ${explanation.article}</p>`;
                    }
                    
                    if (explanation.grammar) {
                        html += `<p><strong>Grammatik:</strong> ${explanation.grammar}</p>`;
                    }
                    
                    html += `<p>${explanation.meaning}</p>`;
                    
                    if (explanation.synonyms && explanation.synonyms.length) {
                        html += `<p><strong>Synonyme:</strong> ${explanation.synonyms.join(', ')}</p>`;
                    }
                    
                    tooltipElement.innerHTML = html;
                } else {
                    tooltipElement.innerHTML = `<div class="text-danger">${data.error || 'Wort nicht gefunden'}</div>`;
                }
            })
            .catch(error => {
                tooltipElement.innerHTML = `<div class="text-danger">Fehler: ${error}</div>`;
            });
    }
    
    // Translate current subtitle only
    function translateCurrentSubtitle() {
        if (!subtitles.length || currentSubtitleIndex === -1) return;
        
        const targetLang = subtitleLanguageSelect.value;
        if (!targetLang) return;
        
        // Get current subtitle element
        const currentSubtitleElement = document.getElementById(`subtitle-${currentSubtitleIndex}`);
        if (!currentSubtitleElement) return;
        
        const subtitleTextElement = currentSubtitleElement.querySelector('.subtitle-text');
        if (!subtitleTextElement) return;
        
        // Store original text if not already stored
        if (!originalSubtitleText) {
            originalSubtitleText = subtitles[currentSubtitleIndex].text;
        }
        
        // Show loading spinner in subtitle
        subtitleTextElement.innerHTML = `
            <div class="text-center">
                <div class="spinner-border spinner-border-sm text-primary" role="status"></div>
                <span class="ms-2">Übersetze...</span>
            </div>
        `;
        
        // Translate the current subtitle
        fetch('/api/translate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: subtitles[currentSubtitleIndex].text,
                target_language: targetLang
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Update UI with translated text
                subtitleTextElement.textContent = data.translated_text;
                
                // Show revert button
                revertTranslationBtn.classList.remove('d-none');
            } else {
                subtitleTextElement.innerHTML = `<div class="text-danger">Übersetzungsfehler: ${data.error}</div>`;
            }
        })
        .catch(error => {
            subtitleTextElement.innerHTML = `<div class="text-danger">Übersetzungsfehler: ${error}</div>`;
        });
    }
    
    // Revert to original subtitle text
    function revertToOriginal() {
        if (currentSubtitleIndex === -1 || !originalSubtitleText) return;
        
        const currentSubtitleElement = document.getElementById(`subtitle-${currentSubtitleIndex}`);
        if (!currentSubtitleElement) return;
        
        const subtitleTextElement = currentSubtitleElement.querySelector('.subtitle-text');
        if (!subtitleTextElement) return;
        
        // Restore original text with explanation functionality
        subtitleTextElement.innerHTML = processText(originalSubtitleText);
        
        // Re-add word explanation events
        addWordExplanationEvents();
        
        // Hide revert button
        revertTranslationBtn.classList.add('d-none');
        
        // Clear stored original
        originalSubtitleText = null;
    }
    
    // Legacy function for translating all subtitles (kept for compatibility)
    function translateSubtitles() {
        if (!subtitles.length) return;
        
        const targetLang = subtitleLanguageSelect.value;
        if (!targetLang) return;
        
        // Show loading
        subtitleList.innerHTML = `
            <div class="text-center py-3">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Übersetze...</span>
                </div>
                <p class="mt-2">Übersetze in ${subtitleLanguageSelect.options[subtitleLanguageSelect.selectedIndex].text}...</p>
            </div>
        `;
        
        // Collect all subtitle texts
        const textsToTranslate = subtitles.map(sub => sub.text);
        
        // Translate in chunks to avoid API limits
        const chunkSize = 10;
        const translatedChunks = [];
        
        const translateChunk = async (chunkIndex) => {
            const start = chunkIndex * chunkSize;
            const end = Math.min(start + chunkSize, textsToTranslate.length);
            const chunk = textsToTranslate.slice(start, end);
            
            if (chunk.length === 0) {
                // All chunks translated, update UI
                translatedSubtitles = [...subtitles];
                
                for (let i = 0; i < translatedSubtitles.length; i++) {
                    translatedSubtitles[i] = {
                        ...translatedSubtitles[i],
                        text: translatedChunks[i]
                    };
                }
                
                renderSubtitleList(translatedSubtitles);
                return;
            }
            
            try {
                // Translate this chunk
                const promises = chunk.map(text => 
                    fetch('/api/translate', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            text: text,
                            target_language: targetLang
                        })
                    })
                    .then(response => response.json())
                    .then(data => data.success ? data.translated_text : text)
                );
                
                const results = await Promise.all(promises);
                translatedChunks.push(...results);
                
                // Translate next chunk
                translateChunk(chunkIndex + 1);
                
            } catch (error) {
                subtitleList.innerHTML = `<div class="alert alert-danger">Übersetzungsfehler: ${error}</div>`;
            }
        };
        
        // Start translation
        translateChunk(0);
    }
    
    // Handle file upload for subtitles/thumbnails
    const subtitleUpload = document.getElementById('subtitle-upload');
    const thumbnailUpload = document.getElementById('thumbnail-upload');
    const fileUploadStatus = document.getElementById('file-upload-status');
    
    function uploadFile(fileInput, fileType) {
        const file = fileInput.files[0];
        if (!file) return;
        
        const formData = new FormData();
        formData.append('file', file);
        
        fetch(`/upload/${videoBasename}/${fileType}`, {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                fileUploadStatus.innerHTML = `<div class="alert alert-success">${data.message}</div>`;
                // Reload page to refresh player with new files
                setTimeout(() => window.location.reload(), 1500);
            } else {
                fileUploadStatus.innerHTML = `<div class="alert alert-danger">Error: ${data.error}</div>`;
            }
        })
        .catch(error => {
            fileUploadStatus.innerHTML = `<div class="alert alert-danger">Upload failed: ${error}</div>`;
        });
    }
    
    if (subtitleUpload) {
        subtitleUpload.addEventListener('change', function() {
            uploadFile(this, 'subtitles');
        });
    }
    
    if (thumbnailUpload) {
        thumbnailUpload.addEventListener('change', function() {
            uploadFile(this, 'thumbnails');
        });
    }
});
