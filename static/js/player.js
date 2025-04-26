/**
 * Player module for handling video playback, subtitle navigation and timestamp marking
 */
function applyMarkdownFormat(editor, format) {
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
    const selectedText = range.toString();

    if (!selectedText) return;

    let wrapper;
    switch (format) {
        case 'bold':
            wrapper = document.createElement('strong');
            break;
        case 'italic':
            wrapper = document.createElement('em');
            break;
        case 'highlight':
            wrapper = document.createElement('mark');
            break;
        case 'code':
            wrapper = document.createElement('code');
            break;
    }

    range.surroundContents(wrapper);
    selection.removeAllRanges();
    return wrapper;
}

document.addEventListener('DOMContentLoaded', function() {
    // Add formatting button handlers
    document.querySelectorAll('.formatting-buttons button').forEach(button => {
        button.addEventListener('click', function() {
            const format = this.dataset.format;
            const editor = this.closest('.form-group').querySelector('.markdown-editor');

            if (editor) {
                if (editor.tagName === 'TEXTAREA') {
                    // Handle textarea formatting
                    const start = editor.selectionStart;
                    const end = editor.selectionEnd;
                    const text = editor.value;
                    const selectedText = text.substring(start, end);

                    if (!selectedText) return;

                    // Check if text is already formatted
                    let isFormatted = false;
                    let newText = selectedText;
                    switch (format) {
                        case 'bold':
                            isFormatted = selectedText.startsWith('**') && selectedText.endsWith('**');
                            newText = isFormatted ? selectedText.slice(2, -2) : `**${selectedText}**`;
                            break;
                        case 'italic':
                            isFormatted = selectedText.startsWith('*') && selectedText.endsWith('*');
                            newText = isFormatted ? selectedText.slice(1, -1) : `*${selectedText}*`;
                            break;
                        case 'highlight':
                            isFormatted = selectedText.startsWith('==') && selectedText.endsWith('==');
                            newText = isFormatted ? selectedText.slice(2, -2) : `==${selectedText}==`;
                            break;
                        case 'code':
                            isFormatted = selectedText.startsWith('`') && selectedText.endsWith('`');
                            newText = isFormatted ? selectedText.slice(1, -1) : `\`${selectedText}\``;
                            break;
                    }

                    editor.value = text.substring(0, start) + newText + text.substring(end);
                    editor.focus();
                } else {
                    // Handle contenteditable formatting
                    const selection = window.getSelection();
                    const range = selection.getRangeAt(0);
                    const selectedNode = range.commonAncestorContainer;

                    // Check if already formatted
                    const formattedParent = selectedNode.nodeType === 3 ? 
                        selectedNode.parentElement : selectedNode;

                    if (formattedParent && formattedParent !== editor) {
                        const tag = formattedParent.tagName.toLowerCase();
                        const isMatchingFormat = 
                            (format === 'bold' && tag === 'strong') ||
                            (format === 'italic' && tag === 'em') ||
                            (format === 'highlight' && tag === 'mark') ||
                            (format === 'code' && tag === 'code');

                        if (isMatchingFormat) {
                            // Remove formatting
                            const text = formattedParent.textContent;
                            const textNode = document.createTextNode(text);
                            formattedParent.parentNode.replaceChild(textNode, formattedParent);

                            // Restore selection
                            const range = new Range();
                            range.selectNode(textNode);
                            const selection = window.getSelection();
                            selection.removeAllRanges();
                            selection.addRange(range);
                            return;
                        }
                    }

                    // Apply new formatting
                    const wrapper = applyMarkdownFormat(editor, format);

                    // Restore selection if wrapper was created
                    if (wrapper) {
                        const range = new Range();
                        range.selectNodeContents(wrapper);
                        const selection = window.getSelection();
                        selection.removeAllRanges();
                        selection.addRange(range);
                    }
                }
            }
        });
    });
    // Audio recording controls
    const toggleRecordingBtn = document.getElementById('toggle-recording');
    const pauseRecordingBtn = document.getElementById('pause-recording');
    const copyPromptBtn = document.getElementById('copy-prompt');
    const promptText = document.getElementById('prompt-text');
    const transcriptionText = document.getElementById('transcription-text');
    const videoElement = document.getElementById('player');
    const videoName = videoElement ? videoElement.dataset.basename : '';

    // Set initial prompt text
    const defaultPrompt = `Um mein Deutsch zu üben, versuche ich, einen Teil des Videos "${videoName}" nachzuerzählen. Der folgende Text ist meine Nacherzählung. Da er mithilfe eines TTS-Tools transkribiert wurde, können einige Fehler enthalten sein. Du sollst nun versuchen, meine Nacherzählung zu verstehen und sie in eine schöne, natürliche und flüssige Sprache umzuwandeln. Achte bitte darauf, dass der Text auf dem Sprachniveau B2 (höchstens C1) bleibt, nicht zu schriftlich klingt und – wenn es passt – ein paar gängige Redewendungen oder idiomatische Ausdrücke verwendet werden. Gib mir anschließend den verbesserten Text und einen zusätzlichen Hinweis in einem Codeblock aus. Das Format muss wie folgt aussehen:

\`\`\`
{{verbesserter Text}}

------

{{zusätzlicher Hinweis}}
\`\`\`

Außer diesen beiden Teilen sollst du nichts weiter sagen. Wenn es keinen zusätzlichen Hinweis gibt, dann schreibe im zweiten Teil \`(kein zusätzlicher Hinweis)\`.  Der folgende Text ist meine Nacherzählung:`;

    if (promptText) {
        promptText.value = defaultPrompt;
    }

    // Copy functionality
    // Function to compare texts and highlight differences using diff-match-patch
    function highlightDifferences(original, improved) {
        const dmp = new diff_match_patch();
        const diffs = dmp.diff_main(original, improved);
        dmp.diff_cleanupSemantic(diffs);

        let result = '';
        for (let diff of diffs) {
            const [type, text] = diff;
            const escapedText = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');

            if (type === 0) { // No change
                result += escapedText;
            } else if (type === 1) { // Addition
                result += `<span class="text-success">${escapedText}</span>`;
            } else if (type === -1) { // Deletion
                result += `<span class="text-danger text-decoration-line-through">${escapedText}</span>`;
            }
        }
        return result;
    }

    const pasteBtn = document.createElement('button');
    pasteBtn.className = 'btn btn-outline-secondary ms-0';
    pasteBtn.innerHTML = '<i class="material-icons align-middle">content_paste</i> Einfügen';
    copyPromptBtn.insertAdjacentElement('afterend', pasteBtn);
    copyPromptBtn.classList.add('me-0');

    // Font size control for recording section
    const recordingFontSizeSelect = document.getElementById('recording-font-size');
    if (recordingFontSizeSelect) {
        const textElements = [
            document.getElementById('transcription-text'),
            document.getElementById('improved-text'),
            document.getElementById('additional-hint')
        ];

        recordingFontSizeSelect.addEventListener('change', function() {
            const fontSize = this.value + 'px';
            textElements.forEach(element => {
                if (element) element.style.fontSize = fontSize;
            });
            localStorage.setItem('recording-font-size', this.value);
        });

        // Load saved font size
        const savedFontSize = localStorage.getItem('recording-font-size');
        if (savedFontSize) {
            recordingFontSizeSelect.value = savedFontSize;
            const fontSize = savedFontSize + 'px';
            textElements.forEach(element => {
                if (element) element.style.fontSize = fontSize;
            });
        }
    }

    const archiveBtn = document.getElementById('archive-transcription');
    if (archiveBtn) {
        archiveBtn.addEventListener('click', function() {
            const videoName = document.getElementById('player').dataset.basename;
            const transcriptionText = document.getElementById('transcription-text');
            const improvedText = document.getElementById('improved-text');
            const hintText = document.getElementById('additional-hint');

            fetch('/api/archive', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    'video_name': videoName,
                    'transcription': transcriptionText.innerText,
                    'improved': improvedText.innerText,
                    'hint': hintText.innerText,
                    'transcription_html': transcriptionText.innerHTML,
                    'improved_html': improvedText.innerHTML,
                    'hint_html': hintText.innerHTML
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Visual feedback
                    const originalText = this.innerHTML;
                    this.innerHTML = '<i class="material-icons align-middle">check</i> Archiviert';
                    setTimeout(() => {
                        this.innerHTML = originalText;
                    }, 2000);
                }
            });
        });
    }

    if (copyPromptBtn) {
        copyPromptBtn.addEventListener('click', function() {
            const combinedText = promptText.value + '\n\n' + transcriptionText.innerText;
            navigator.clipboard.writeText(combinedText).then(() => {
                // Visual feedback
                const originalText = this.innerHTML;
                this.innerHTML = '<i class="material-icons align-middle">check</i> Kopiert';
                setTimeout(() => {
                    this.innerHTML = originalText;
                }, 2000);
            });
        });
    }

    const compareButton = document.getElementById('compare-texts');
    if (compareButton) {
        let isComparing = false;
        let originalContent = '';

        compareButton.addEventListener('click', function() {
            const improvedTextElement = document.getElementById('improved-text');
            const original = transcriptionText.textContent || transcriptionText.innerText || '';
            const improved = improvedTextElement.textContent || '';

            if (!isComparing) {
                // Start comparison
                originalContent = improvedTextElement.innerHTML;
                improvedTextElement.innerHTML = highlightDifferences(original, improved);
                this.innerHTML = '<i class="material-icons align-middle">compare_arrows</i> Vergleich beenden';
                isComparing = true;
            } else {
                // End comparison
                improvedTextElement.innerHTML = originalContent;
                this.innerHTML = '<i class="material-icons align-middle">compare_arrows</i> Texte vergleichen';
                isComparing = false;
            }
        });
    }

    if (pasteBtn) {
        pasteBtn.addEventListener('click', function() {
            navigator.clipboard.readText().then(text => {
                // Extrahiere Text zwischen der Markierung "------"
                const parts = text.split(/\n*------\n*/);
                if (parts.length !== 2) {
                    // Bei ungültigem Format den gesamten Text als Hinweis anzeigen
                    document.getElementById('improved-text').innerHTML = '';
                    document.getElementById('additional-hint').textContent = text;

                    // Feedback anzeigen
                    alert('Ungültiges Format: Text muss durch "------" getrennt sein');
                    return;
                }
                const improvedText = parts[0].replace(/```/g, '').trim();
                const additionalHint = parts[1].replace(/```/g, '').trim();

                // Konvertiere Zeilenumbrüche in <br> Tags
                const formattedImprovedText = improvedText.replace(/\n/g, '<br>');
                document.getElementById('improved-text').innerHTML = formattedImprovedText;
                document.getElementById('additional-hint').innerHTML = additionalHint.replace(/\n/g, '<br>');

                // Visual feedback
                const originalText = this.innerHTML;
                this.innerHTML = '<i class="material-icons align-middle">check</i> Eingefügt';
                setTimeout(() => {
                    this.innerHTML = originalText;
                }, 2000);
            });
        });
    }
    let isRecording = false;
    let isPaused = false;

    if (toggleRecordingBtn && pauseRecordingBtn) {
        toggleRecordingBtn.addEventListener('click', function() {
            if (!isRecording) {
                // Start recording
                toggleRecordingBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> Starte...';
                toggleRecordingBtn.disabled = true;

                fetch('/api/audio/start', { method: 'POST' })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            isRecording = true;
                            isPaused = false;
                            transcriptionText.innerText = ''; // Clear previous transcription
                            toggleRecordingBtn.innerHTML = '<i class="material-icons align-middle">stop</i> Aufnahme beenden';
                            toggleRecordingBtn.className = 'btn btn-danger';
                            pauseRecordingBtn.disabled = false;
                        }
                    })
                    .finally(() => {
                        toggleRecordingBtn.disabled = false;
                    });
            } else {
                // Stop recording and get transcription
                toggleRecordingBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> Beende...';
                toggleRecordingBtn.disabled = true;
                pauseRecordingBtn.disabled = true;

                fetch('/api/audio/stop', { method: 'POST' })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success && data.transcription) {
                            transcriptionText.innerText = data.transcription;
                        }
                        isRecording = false;
                        isPaused = false;
                        toggleRecordingBtn.innerHTML = '<i class="material-icons align-middle">mic</i> Aufnahme starten';
                        toggleRecordingBtn.className = 'btn btn-primary';
                        pauseRecordingBtn.disabled = true;
                        pauseRecordingBtn.innerHTML = '<i class="material-icons align-middle">pause</i> Pause';
                    })
                    .finally(() => {
                        toggleRecordingBtn.disabled = false;
                    });
            }
        });

        pauseRecordingBtn.addEventListener('click', function() {
            pauseRecordingBtn.disabled = true;
            const loadingHtml = '<span class="spinner-border spinner-border-sm" role="status"></span> ';

            if (!isPaused) {
                // Pause recording
                pauseRecordingBtn.innerHTML = loadingHtml + 'Pausiere...';
                fetch('/api/audio/pause', { method: 'POST' })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            isPaused = true;
                            pauseRecordingBtn.innerHTML = '<i class="material-icons align-middle">play_arrow</i> Fortsetzen';
                        }
                    })
                    .finally(() => {
                        pauseRecordingBtn.disabled = false;
                    });
            } else {
                // Resume recording
                pauseRecordingBtn.innerHTML = loadingHtml + 'Setze fort...';
                fetch('/api/audio/resume', { method: 'POST' })
                    .then(response => response.json())
                    .then(data => {
                        if (data.success) {
                            isPaused = false;
                            pauseRecordingBtn.innerHTML = '<i class="material-icons align-middle">pause</i> Pause';
                        }
                    })
                    .finally(() => {
                        pauseRecordingBtn.disabled = false;
                    });
            }
        });
    }
    // Subtitle blocker functionality
    const blockers = new Map();
    let blockerId = 0;

    function createBlocker() {
        const playerContainer = document.querySelector('.plyr-container');
        const videoElement = document.querySelector('video');
        const rect = videoElement.getBoundingClientRect();

        // Load last saved blocker settings
        const savedSettings = JSON.parse(localStorage.getItem('lastBlockerSettings') || '{}');

        // Create blocker element
        const blocker = document.createElement('div');
        const id = blockerId++;
        blocker.id = `blocker-${id}`;
        blocker.className = 'subtitle-blocker';

        // Use saved settings or defaults
        const defaultSettings = {
            relativeWidth: 30,
            relativeHeight: 10,
            relativeLeft: 50,
            relativeTop: 80
        };

        const settings = {...defaultSettings, ...savedSettings};

        // Add resize handles
        const positions = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
        positions.forEach(pos => {
            const handle = document.createElement('div');
            handle.className = `resize-handle ${pos}`;
            blocker.appendChild(handle);
        });

        playerContainer.appendChild(blocker);

        // Store relative positions as percentages
        let relativeLeft = settings.relativeLeft;
        let relativeTop = settings.relativeTop;
        let relativeWidth = settings.relativeWidth;
        let relativeHeight = settings.relativeHeight;

        // Function to update blocker position and size based on player dimensions
        function updateBlockerPosition() {
            const playerRect = videoElement.getBoundingClientRect();
            const playerWidth = playerRect.width;
            const playerHeight = playerRect.height;

            blocker.style.width = `${relativeWidth}%`;
            blocker.style.height = `${relativeHeight}%`;
            blocker.style.left = `${relativeLeft}%`;
            blocker.style.top = `${relativeTop}%`;
        }

        // Initial position
        updateBlockerPosition();

        // Make draggable
        let isDragging = false;
        let currentX;
        let currentY;

        blocker.addEventListener('mousedown', function(e) {
            if (!e.target.classList.contains('resize-handle')) {
                isDragging = true;
                const rect = blocker.getBoundingClientRect();
                currentX = e.clientX - rect.left;
                currentY = e.clientY - rect.top;
            }
        });

        document.addEventListener('mousemove', function(e) {
            if (isDragging) {
                const playerRect = videoElement.getBoundingClientRect();
                const newLeft = e.clientX - currentX - playerRect.left;
                const newTop = e.clientY - currentY - playerRect.top;

                // Convert to percentages
                relativeLeft = (newLeft / playerRect.width) * 100;
                relativeTop = (newTop / playerRect.height) * 100;

                // Limit to player boundaries
                relativeLeft = Math.max(0, Math.min(relativeLeft, 100 - relativeWidth));
                relativeTop = Math.max(0, Math.min(relativeTop, 100 - relativeHeight));

                updateBlockerPosition();
            }
        });

        document.addEventListener('mouseup', function() {
            isDragging = false;
            // Save current settings
            localStorage.setItem('lastBlockerSettings', JSON.stringify({
                relativeWidth,
                relativeHeight,
                relativeLeft,
                relativeTop
            }));
        });

        // Make resizable
        let isResizing = false;
        let currentHandle = null;

        blocker.querySelectorAll('.resize-handle').forEach(handle => {
            handle.addEventListener('mousedown', function(e) {
                isResizing = true;
                currentHandle = handle;
                e.stopPropagation();
            });
        });

        let initialRect = null;
        let initialMouseX = 0;
        let initialMouseY = 0;

        blocker.querySelectorAll('.resize-handle').forEach(handle => {
            handle.addEventListener('mousedown', function(e) {
                isResizing = true;
                currentHandle = handle;
                initialRect = blocker.getBoundingClientRect();
                initialMouseX = e.clientX;
                initialMouseY = e.clientY;
                e.stopPropagation();
            });
        });

        document.addEventListener('mousemove', function(e) {
            if (isResizing && currentHandle && initialRect) {
                const deltaX = e.clientX - initialMouseX;
                const deltaY = e.clientY - initialMouseY;

                const isTop = currentHandle.classList.contains('top-left') || 
                            currentHandle.classList.contains('top-right');
                const isLeft = currentHandle.classList.contains('top-left') || 
                             currentHandle.classList.contains('bottom-left');

                const playerContainer = document.querySelector('.plyr-container');
                const containerRect = playerContainer.getBoundingClientRect();

                let newWidth = initialRect.width;
                let newHeight = initialRect.height;
                let newLeft = initialRect.left - containerRect.left;
                let newTop = initialRect.top - containerRect.top;

                // Calculate changes in percentage
                const playerRect = videoElement.getBoundingClientRect();

                // Horizontale Anpassung
                if (isLeft) {
                    const widthDelta = (deltaX / playerRect.width) * 100;
                    relativeWidth = Math.max(5, initialRect.width / playerRect.width * 100 - widthDelta);
                    relativeLeft = (initialRect.right - playerRect.left) / playerRect.width * 100 - relativeWidth;
                } else {
                    const widthDelta = (deltaX / playerRect.width) * 100;
                    relativeWidth = Math.max(5, initialRect.width / playerRect.width * 100 + widthDelta);
                }

                // Vertikale Anpassung
                if (isTop) {
                    const heightDelta = (deltaY / playerRect.height) * 100;
                    relativeHeight = Math.max(2, initialRect.height / playerRect.height * 100 - heightDelta);
                    relativeTop = (initialRect.bottom - playerRect.top) / playerRect.height * 100 - relativeHeight;
                } else {
                    const heightDelta = (deltaY / playerRect.height) * 100;
                    relativeHeight = Math.max(2, initialRect.height / playerRect.height * 100 + heightDelta);
                }

                // Begrenze die relative Position und Größe
                relativeLeft = Math.max(0, Math.min(relativeLeft, 100 - relativeWidth));
                relativeTop = Math.max(0, Math.min(relativeTop, 100 - relativeHeight));

                // Aktualisiere die Position und Größe sofort
                updateBlockerPosition();
            }
        });

        document.addEventListener('mouseup', function() {
            isResizing = false;
            currentHandle = null;
            // Save current settings
            localStorage.setItem('lastBlockerSettings', JSON.stringify({
                relativeWidth,
                relativeHeight,
                relativeLeft,
                relativeTop
            }));
        });

        // Add to blockers map and list
        blockers.set(id, blocker);
        updateBlockerList();

        return id;
    }

    function updateBlockerList() {
        const list = document.getElementById('blocker-list');
        if (blockers.size === 0) {
            list.innerHTML = `
                <div class="text-center py-3 text-muted">
                    Keine Blöcke vorhanden
                </div>
            `;
            return;
        }

        list.innerHTML = Array.from(blockers.entries()).map(([id, blocker]) => `
            <div class="blocker-list-item">
                <span>Block #${id + 1}</span>
                <div class="blocker-controls">
                    <button class="btn btn-sm btn-outline-danger" onclick="removeBlocker(${id})">
                        <i class="material-icons">delete</i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    // Add global function to remove blockers
    window.removeBlocker = function(id) {
        const blocker = blockers.get(id);
        if (blocker) {
            blocker.remove();
            blockers.delete(id);
            updateBlockerList();
        }
    };

    // Add blocker button click handler
    const addBlockerBtn = document.getElementById('add-blocker');
    if (addBlockerBtn) {
        addBlockerBtn.addEventListener('click', createBlocker);
    }

    // Initialize player
    // videoElement = document.getElementById('player');

    if (!videoElement) return;

    // Get video information from data attributes
    const videoBasename = videoElement.dataset.basename;
    const hasSubtitles = videoElement.dataset.subtitles === 'true';
    const hasThumbnails = videoElement.dataset.thumbnails === 'true';

    // Initialize Plyr without fullscreen controls
    const player = new Plyr('#player', {
        captions: { active: true, language: 'auto', update: true },
        seekTime: 5,
        previewThumbnails: hasThumbnails ? { enabled: true, src: `/videos/${videoBasename}-thumbnails.vtt` } : { enabled: false },
        controls: ['play-large', 'play', 'progress', 'current-time', 'mute', 'volume', 'captions', 'settings', 'pip']
    });

    // Update blockers on player resize
    const resizeObserver = new ResizeObserver(() => {
        document.querySelectorAll('.subtitle-blocker').forEach(blocker => {
            if (typeof blocker.updateBlockerPosition === 'function') {
                blocker.updateBlockerPosition();
            }
        });
    });

    resizeObserver.observe(videoElement);

    // Custom fullscreen handling
    const fullscreenContainer = document.getElementById('fullscreen-container');
    const customFullscreenBtn = document.getElementById('custom-fullscreen');

    if (customFullscreenBtn) {
        customFullscreenBtn.addEventListener('click', function() {
            if (!document.fullscreenElement) {
                fullscreenContainer.requestFullscreen();
                customFullscreenBtn.innerHTML = '<i class="material-icons align-middle">fullscreen_exit</i> Normal';
            } else {
                document.exitFullscreen();
                customFullscreenBtn.innerHTML = '<i class="material-icons align-middle">fullscreen</i> Vollbild';
            }
        });
    }

    document.addEventListener('fullscreenchange', function() {
        if (!document.fullscreenElement && customFullscreenBtn) {
            customFullscreenBtn.innerHTML = '<i class="material-icons align-middle">fullscreen</i> Vollbild';
        }
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
                if (e.ctrlKey && e.shiftKey && (e.key === 'a' || e.key === 'A')) {
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
                else if (e.ctrlKey && e.shiftKey && (e.key === 'd' || e.key === 'D')) {
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
            // Apply font size immediately to video player subtitles
            const playerSubtitles = document.querySelector('.plyr__captions');
            if (playerSubtitles) {
                playerSubtitles.style.fontSize = `${savedFontSize}px`;
            }
        } else {
            // Set default font size
            const playerSubtitles = document.querySelector('.plyr__captions');
            if (playerSubtitles) {
                playerSubtitles.style.fontSize = '16px';
            }
        }

        // Change font size when select changes
        subtitleFontSizeSelect.addEventListener('change', function() {
            const fontSize = this.value;
            const playerSubtitles = document.querySelector('.plyr__captions');
            if (playerSubtitles) {
                playerSubtitles.style.fontSize = `${fontSize}px`;
            }
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
    // document.addEventListener('keydown', function(e) {
    //     // Only process if player exists and is loaded
    //     if (!player || !player.ready) return;

    //     // Get subtitle tracks
    //     const track = videoElement.textTracks && videoElement.textTracks.length > 0 ? 
    //                  videoElement.textTracks[0] : null;

    //     if (track) {
    //         // A key - previous subtitle or restart current
    //         if (e.key === 'a' || e.key === 'A') {
    //             e.preventDefault();

    //             // Get active cue
    //             let activeCue = null;
    //             let previousCue = null;

    //             // Find active and previous cues
    //             for (let i = 0; i < track.cues.length; i++) {
    //                 const cue = track.cues[i];
    //                 if (player.currentTime >= cue.startTime && player.currentTime <= cue.endTime) {
    //                     activeCue = cue;
    //                     previousCue = i > 0 ? track.cues[i - 1] : null;
    //                     break;
    //                 } else if (player.currentTime < cue.startTime) {
    //                     // If we're past all previous cues
    //                     if (i > 0) {
    //                         previousCue = track.cues[i - 1];
    //                     }
    //                     break;
    //                 }

    //                 // If this is the last cue and we're past it
    //                 if (i === track.cues.length - 1) {
    //                     previousCue = cue;
    //                 }
    //             }

    //             // Logic for jumping
    //             if (activeCue && player.currentTime >= activeCue.startTime + 1) {
    //                 // If more than 1 second into current cue, jump to start of current cue
    //                 player.currentTime = activeCue.startTime;
    //             } else if (previousCue) {
    //                 // Jump to previous cue
    //                 player.currentTime = previousCue.startTime;
    //             }
    //         } 
    //         // Q key - next subtitle
    //         else if (e.key === 'd' || e.key === 'D') {
    //             e.preventDefault();

    //             // Find next cue
    //             for (let i = 0; i < track.cues.length; i++) {
    //                 if (player.currentTime < track.cues[i].startTime) {
    //                     player.currentTime = track.cues[i].startTime;
    //                     break;
    //                 }
    //             }
    //         }
    //     }
    // });

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

                // Get wordexplanation
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

    // Auto-correct button functionality
    const autoCorrectBtn = document.getElementById('auto-correct');
    if (autoCorrectBtn) {
        autoCorrectBtn.addEventListener('click', async function() {
            const transcription = transcriptionText.innerText;
            try {
                const response = await fetch('/api/auto-correct', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ transcription })
                });
                const data = await response.json();
                if (data.success) {
                    const correctedText = data.corrected_text;
                    // Simulate paste action
                    navigator.clipboard.writeText(`\`\`\`\n${correctedText}\n------\n(kein zusätzlicher Hinweis)\n\`\`\``);
                    pasteBtn.click(); // Trigger the paste event
                } else {
                    alert('Autokorrektur fehlgeschlagen: ' + data.error);
                }
            } catch (error) {
                alert('Autokorrektur fehlgeschlagen: ' + error);
            }
        });
    }
});