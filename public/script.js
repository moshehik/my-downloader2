document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('downloadForm');
    const urlInput = document.getElementById('urlInput');
    const submitBtn = document.getElementById('submitBtn');
    const btnText = submitBtn.querySelector('.btn-text');
    const loader = submitBtn.querySelector('.loader');
    const resultArea = document.getElementById('resultArea');
    const successMessage = document.querySelector('.success-message');
    const errorMessage = document.querySelector('.error-message');
    const errorText = document.getElementById('errorText');
    const downloadLink = document.getElementById('downloadLink');
    const historyList = document.getElementById('historyList');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    const thumbnailPreview = document.getElementById('thumbnailPreview');
    const thumbnailImg = document.getElementById('thumbnailImg');
    const driveOption = document.getElementById('driveOption');
    const emailContainer = document.getElementById('emailContainer');
    const emailInput = document.getElementById('emailInput');

    driveOption.addEventListener('change', () => {
        emailContainer.style.display = driveOption.checked ? 'block' : 'none';
    });

    // Load history on startup
    loadHistory();

    function extractVideoId(url) {
        const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
        const match = url.match(regex);
        return match ? match[1] : null;
    }

    urlInput.addEventListener('input', () => {
        const url = urlInput.value.trim();
        const videoId = extractVideoId(url);
        if (videoId) {
            thumbnailImg.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
            thumbnailPreview.style.display = 'block';
        } else {
            thumbnailPreview.style.display = 'none';
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const url = urlInput.value.trim();
        const format = document.querySelector('input[name="format"]:checked').value;
        const zipOption = document.getElementById('zipOption').checked;
        const driveOption = document.getElementById('driveOption').checked;
        const emailVal = document.getElementById('emailInput').value.trim();
        const videoId = extractVideoId(url);

        if (!videoId) {
            showError('קישור ליוטיוב לא תקין');
            return;
        }

        // Set loading state
        submitBtn.classList.add('loading');
        submitBtn.disabled = true;
        btnText.style.display = 'none';
        loader.style.display = 'inline-block';
        
        // Hide previous results
        resultArea.classList.add('hidden');
        successMessage.style.display = 'none';
        errorMessage.style.display = 'none';

        try {
            let reqUrl = `/download?id=${encodeURIComponent(videoId)}&type=${encodeURIComponent(format)}`;
            if (zipOption) reqUrl += '&zip=true';
            if (driveOption) reqUrl += '&drive=true';
            if (driveOption && emailVal) reqUrl += `&email=${encodeURIComponent(emailVal)}`;
            
            const response = await fetch(reqUrl);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();

            if (data.jobId) {
                pollJob(data.jobId, url, format);
            } else if (data.success && data.url) {
                // Fallback for immediate response
                showSuccess(data.url, format);
                saveToHistory(url, data.url, format);
                resetLoadingState();
            } else {
                showError(data.error || 'נכשל בניסיון לייצר קישור להורדה');
                resetLoadingState();
            }
        } catch (error) {
            showError('שגיאת רשת, או שהשרת לא זמין.');
            console.error('Download error:', error);
            resetLoadingState();
        }
    });

    async function pollJob(jobId, originalUrl, format) {
        try {
            const res = await fetch(`/api/job-state?jobId=${jobId}&_=${Date.now()}`);
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            const data = await res.json();
            
            if (data.logs && data.logs.length > 0) {
                btnText.textContent = data.logs[data.logs.length - 1];
                btnText.style.display = 'inline-block';
            }
            
            if (data.status === 'processing') {
                setTimeout(() => pollJob(jobId, originalUrl, format), 3000); // Check every 3 seconds
            } else if (data.status === 'done' && data.success) {
                showSuccess(data.url, format);
                saveToHistory(originalUrl, data.url, format);
                resetLoadingState();
            } else if (data.status === 'error') {
                showError(data.error || 'שגיאה בעיבוד הבקשה');
                resetLoadingState();
            } else {
                showError('סטטוס לא ברור מהשרת');
                resetLoadingState();
            }
        } catch (error) {
            showError('שגיאה בבדיקת סטטוס.');
            console.error('Polling error:', error);
            resetLoadingState();
        }
    }

    function resetLoadingState() {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
        btnText.textContent = 'הורד סרטון';
        btnText.style.display = 'inline-block';
        loader.style.display = 'none';
    }

    function showSuccess(url, type) {
        resultArea.classList.remove('hidden');
        successMessage.style.display = 'flex';
        downloadLink.href = url;
    }

    function showError(msg) {
        resultArea.classList.remove('hidden');
        errorMessage.style.display = 'flex';
        errorText.textContent = msg;
    }

    function saveToHistory(originalUrl, downloadUrl, format) {
        const history = JSON.parse(localStorage.getItem('ytHistory') || '[]');
        const newItem = {
            id: Date.now(),
            url: originalUrl,
            downloadUrl: downloadUrl,
            format: format,
            date: new Date().toLocaleString()
        };
        
        history.unshift(newItem);
        
        // Keep only last 10
        if (history.length > 10) history.pop();
        
        localStorage.setItem('ytHistory', JSON.stringify(history));
        loadHistory();
    }

    function loadHistory() {
        const history = JSON.parse(localStorage.getItem('ytHistory') || '[]');
        historyList.innerHTML = '';
        
        if (history.length === 0) {
            historyList.innerHTML = '<li style="text-align:center; color: var(--text-muted); font-size: 0.9rem;">אין הורדות אחרונות</li>';
            return;
        }

        history.forEach(item => {
            const li = document.createElement('li');
            li.className = 'history-item';
            
            const iconClass = item.format === 'video' ? 'fa-video' : 'fa-music';
            
            li.innerHTML = `
                <div class="history-info">
                    <div class="history-icon">
                        <i class="fa-solid ${iconClass}"></i>
                    </div>
                    <div class="history-details">
                        <span class="history-url" title="${item.url}">${item.url}</span>
                        <span class="history-date">${item.date}</span>
                    </div>
                </div>
                <div class="history-action">
                    <a href="${item.downloadUrl}" title="הורד שוב" download><i class="fa-solid fa-download"></i></a>
                </div>
            `;
            historyList.appendChild(li);
        });
    }

    clearHistoryBtn.addEventListener('click', () => {
        localStorage.removeItem('ytHistory');
        loadHistory();
    });
});
