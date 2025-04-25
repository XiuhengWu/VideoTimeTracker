/**
 * Usage Time Tracker
 * Tracks time spent on the page when it's focused
 */
document.addEventListener('DOMContentLoaded', function() {
    // Initialize variables
    let startTime = Date.now();
    let elapsedTime = 0;
    // Verwende sessionStorage, um den Status zwischen Seitenwechseln zu behalten
    let isTracking = sessionStorage.getItem('isTracking') === 'false' ? false : true;
    let isPageFocused = true;
    let intervalId = null;

    // Elements
    const trackingIndicator = document.getElementById('tracking-indicator');
    const todayCounter = document.getElementById('today-counter');
    const toggleTrackingBtn = document.getElementById('toggle-tracking');

    // Format time as HH:MM:SS
    function formatTime(milliseconds) {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    // Update tracking indicator status
    function updateTrackingStatus() {
        if (!trackingIndicator) return;

        if (isTracking && isPageFocused) {
            trackingIndicator.innerHTML = '<span class="badge bg-success"><span class="tracking-active"></span>Tracking aktiv</span>';
        } else if (isTracking && !isPageFocused) {
            trackingIndicator.innerHTML = '<span class="badge bg-warning"><span class="tracking-paused"></span>Seite inaktiv</span>';
        } else {
            trackingIndicator.innerHTML = '<span class="badge bg-danger"><span class="tracking-paused"></span>Tracking pausiert</span>';
        }
    }

    // Update today's counter
    function updateTodayCounter() {
        if (!todayCounter) return;

        const currentTime = isTracking ? (continueTrackingOnBlur || isPageFocused ? Date.now() - startTime + elapsedTime : elapsedTime) : elapsedTime;
        todayCounter.textContent = formatTime(currentTime);
    }

    // Start tracking interval
    function startTracking() {
        if (intervalId) return;

        intervalId = setInterval(() => {
            if (isTracking && isPageFocused) {
                updateTodayCounter();
            }
        }, 1000);
    }

    // Stop tracking and record data
    function stopTracking() {
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }

        // Calculate total time spent
        const endTime = Date.now();
        const sessionTime = Math.floor((endTime - startTime) / 1000);

        if (sessionTime > 0 && isTracking) {
            // Record usage data
            const today = new Date().toISOString().split('T')[0];

            fetch('/api/update_usage', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    usage_time: sessionTime,
                    date: today
                })
            })
            .then(response => response.json())
            .catch(error => console.error('Error updating usage data:', error));

            // Update elapsed time
            elapsedTime += (endTime - startTime);
            startTime = endTime;
        }
    }

    // Load today's usage time
    function loadTodayUsage() {
        const today = new Date().toISOString().split('T')[0];

        fetch('/api/get_usage_data')
            .then(response => response.json())
            .then(data => {
                const todayTime = data[today] || 0;
                elapsedTime = todayTime * 1000; // Convert seconds to milliseconds
                updateTodayCounter();
            })
            .catch(error => console.error('Error loading usage data:', error));
    }

    // Toggle tracking state
    function toggleTracking() {
        if (isTracking) {
            stopTracking();
            isTracking = false;
        } else {
            isTracking = true;
            startTime = Date.now();
            startTracking();
        }

        // Speichere den Status in der Session
        sessionStorage.setItem('isTracking', isTracking);

        updateTrackingStatus();

        if (toggleTrackingBtn) {
            toggleTrackingBtn.textContent = isTracking ? 'Tracking pausieren' : 'Tracking fortsetzen';
            toggleTrackingBtn.className = isTracking ? 'btn btn-warning btn-sm mt-2' : 'btn btn-success btn-sm mt-2';
        }
    }

    // Manual tracking control
    let continueTrackingOnBlur = false;

    // Add checkbox to control tracking behavior
    const trackingControls = document.createElement('div');
    trackingControls.className = 'form-check mt-2';
    trackingControls.innerHTML = `
        <input class="form-check-input" type="checkbox" id="continue-tracking">
        <label class="form-check-label" for="continue-tracking">
            Tracking bei inaktiver Seite fortsetzen
        </label>
    `;
    
    if (toggleTrackingBtn) {
        toggleTrackingBtn.parentNode.appendChild(trackingControls);
    }

    // Load saved preference
    continueTrackingOnBlur = localStorage.getItem('continueTrackingOnBlur') === 'true';
    document.getElementById('continue-tracking').checked = continueTrackingOnBlur;

    // Save preference when changed
    document.getElementById('continue-tracking').addEventListener('change', function() {
        continueTrackingOnBlur = this.checked;
        localStorage.setItem('continueTrackingOnBlur', continueTrackingOnBlur);
    });

    // Event listener for page visibility changes
    document.addEventListener('visibilitychange', function() {
        isPageFocused = !document.hidden;

        if (!isPageFocused && !continueTrackingOnBlur) {
            stopTracking();
        } else if (isTracking) {
            startTime = Date.now();
            startTracking();
        }

        updateTrackingStatus();
    });

    // Event listener for window focus/blur
    window.addEventListener('blur', function() {
        isPageFocused = false;
        if (!continueTrackingOnBlur) {
            stopTracking();
        }
        updateTrackingStatus();
    });

    window.addEventListener('focus', function() {
        isPageFocused = true;
        if (isTracking) {
            startTime = Date.now();
            startTracking();
        }
        updateTrackingStatus();
    });

    // Set up toggle tracking button
    if (toggleTrackingBtn) {
        toggleTrackingBtn.addEventListener('click', toggleTracking);
    }

    // Event listener for page unload
    window.addEventListener('beforeunload', function() {
        stopTracking();
    });

    // Initialize
    loadTodayUsage();
    updateTrackingStatus();
    startTracking();
});
