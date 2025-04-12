/**
 * Statistics module for displaying usage data
 */
document.addEventListener('DOMContentLoaded', function() {
    // Get chart container element
    const chartContainer = document.getElementById('usage-chart');
    if (!chartContainer) return;
    
    // Get calendar related elements
    const calendarContainer = document.getElementById('calendar-view');
    const prevMonthBtn = document.getElementById('prev-month');
    const nextMonthBtn = document.getElementById('next-month');
    const currentMonthDisplay = document.getElementById('current-month-display');
    
    // Initialize date variables
    const now = new Date();
    let currentMonth = now.getMonth();
    let currentYear = now.getFullYear();
    let usageData = {};
    
    // Month names for display
    const monthNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 
                      'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
    
    // Event listeners for month navigation
    if (prevMonthBtn) {
        prevMonthBtn.addEventListener('click', () => {
            currentMonth--;
            if (currentMonth < 0) {
                currentMonth = 11;
                currentYear--;
            }
            updateCalendarView();
        });
    }
    
    if (nextMonthBtn) {
        nextMonthBtn.addEventListener('click', () => {
            currentMonth++;
            if (currentMonth > 11) {
                currentMonth = 0;
                currentYear++;
            }
            updateCalendarView();
        });
    }
    
    // Load usage data
    fetch('/api/get_usage_data')
        .then(response => response.json())
        .then(data => {
            usageData = data;
            updateCalendarView();
            renderChart(data);
        })
        .catch(error => console.error('Error loading usage data:', error));
    
    // Update month display and regenerate calendar
    function updateCalendarView() {
        if (currentMonthDisplay) {
            currentMonthDisplay.textContent = `${monthNames[currentMonth]} ${currentYear}`;
        }
        renderCalendar();
    }
    
    // Render calendar view
    function renderCalendar() {
        if (!calendarContainer) return;
        
        // Clear the container
        calendarContainer.innerHTML = '';
        
        // Create calendar grid
        const calendarGrid = document.createElement('div');
        calendarGrid.className = 'calendar-grid';
        
        // Add day headers
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        dayNames.forEach(day => {
            const dayHeader = document.createElement('div');
            dayHeader.className = 'day-header';
            dayHeader.textContent = day;
            calendarGrid.appendChild(dayHeader);
        });
        
        // Get first day of month and total days
        const firstDay = new Date(currentYear, currentMonth, 1).getDay();
        const lastDate = new Date(currentYear, currentMonth + 1, 0).getDate();
        
        // Add empty cells for days before the 1st of month
        for (let i = 0; i < firstDay; i++) {
            const emptyDay = document.createElement('div');
            emptyDay.className = 'day empty';
            calendarGrid.appendChild(emptyDay);
        }
        
        // Add days with usage data
        for (let i = 1; i <= lastDate; i++) {
            const day = document.createElement('div');
            day.className = 'day';
            
            const dateStr = `${currentYear}-${(currentMonth + 1).toString().padStart(2, '0')}-${i.toString().padStart(2, '0')}`;
            const usageSeconds = usageData[dateStr] || 0;
            
            // Add date number
            const dateNum = document.createElement('div');
            dateNum.className = 'date-number';
            dateNum.textContent = i;
            day.appendChild(dateNum);
            
            // Add usage indicator if there's data
            if (usageSeconds > 0) {
                const hours = Math.floor(usageSeconds / 3600);
                const minutes = Math.floor((usageSeconds % 3600) / 60);
                
                const usageText = document.createElement('div');
                usageText.className = 'usage-text';
                usageText.textContent = `${hours}h ${minutes}m`;
                
                // Color coding based on usage time
                let colorClass = 'bg-success';
                if (usageSeconds > 7200) { // > 2 hours
                    colorClass = 'bg-danger';
                } else if (usageSeconds > 3600) { // > 1 hour
                    colorClass = 'bg-warning';
                }
                
                const usageIndicator = document.createElement('div');
                usageIndicator.className = `usage-indicator ${colorClass}`;
                
                day.appendChild(usageIndicator);
                day.appendChild(usageText);
                day.setAttribute('data-bs-toggle', 'tooltip');
                day.setAttribute('title', `${hours}h ${minutes}m ${usageSeconds % 60}s`);
            }
            
            // Highlight today
            if (i === now.getDate()) {
                day.classList.add('today');
            }
            
            calendarGrid.appendChild(day);
        }
        
        calendarContainer.appendChild(calendarGrid);
        
        // Initialize tooltips
        const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
        tooltipTriggerList.map(function(tooltipTriggerEl) {
            return new bootstrap.Tooltip(tooltipTriggerEl);
        });
    }
    
    // Render chart view
    function renderChart(data) {
        // Prepare chart data
        const dates = Object.keys(data).sort();
        const usageData = dates.map(date => {
            const seconds = data[date];
            return seconds / 3600; // Convert to hours
        });
        
        // Format dates for display
        const displayDates = dates.map(date => {
            const parts = date.split('-');
            return `${parts[1]}/${parts[2]}`;
        });
        
        // Get max value for y-axis (rounded up to nearest hour)
        const maxHours = Math.ceil(Math.max(...usageData, 1));
        
        // Create chart
        const ctx = chartContainer.getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: displayDates,
                datasets: [{
                    label: 'Hours',
                    data: usageData,
                    backgroundColor: 'rgba(75, 192, 192, 0.6)',
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: maxHours, // Set fixed max value to avoid height changes 
                        title: {
                            display: true,
                            text: 'Hours'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Date'
                        }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'Daily Usage Time',
                        font: {
                            size: 16
                        }
                    }
                }
            }
        });
    }
});
