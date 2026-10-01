/**
 * YouTube Downloader Pro - Client Application Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const urlForm = document.getElementById('urlForm');
  const videoUrlInput = document.getElementById('videoUrlInput');
  const btnClearInput = document.getElementById('btnClearInput');
  const btnPasteClipboard = document.getElementById('btnPasteClipboard');
  const btnAnalyzeVideo = document.getElementById('btnAnalyzeVideo');
  const analyzeSpinner = document.getElementById('analyzeSpinner');
  const btnContent = btnAnalyzeVideo.querySelector('.btn-content');
  const urlErrorMsg = document.getElementById('urlErrorMsg');
  const btnOpenDownloadsFolder = document.getElementById('btnOpenDownloadsFolder');

  // Preview Card Elements
  const previewCard = document.getElementById('previewCard');
  const videoThumbnail = document.getElementById('videoThumbnail');
  const videoDurationBadge = document.getElementById('videoDurationBadge');
  const videoTitle = document.getElementById('videoTitle');
  const videoChannel = document.getElementById('videoChannel');
  const videoViewsCount = document.getElementById('videoViewsCount');
  const videoUploadDate = document.getElementById('videoUploadDate');
  const tabVideo = document.getElementById('tabVideo');
  const tabAudio = document.getElementById('tabAudio');
  const videoOptionsPanel = document.getElementById('videoOptionsPanel');
  const audioOptionsPanel = document.getElementById('audioOptionsPanel');
  const videoQualityGrid = document.getElementById('videoQualityGrid');
  const btnStartDownload = document.getElementById('btnStartDownload');

  // Progress Card Elements
  const progressCard = document.getElementById('progressCard');
  const progressTitle = document.getElementById('progressTitle');
  const progressSubtitle = document.getElementById('progressSubtitle');
  const progressBarFill = document.getElementById('progressBarFill');
  const metricPercent = document.getElementById('metricPercent');
  const metricSpeed = document.getElementById('metricSpeed');
  const metricTotal = document.getElementById('metricTotal');
  const metricEta = document.getElementById('metricEta');
  const btnCancelDownload = document.getElementById('btnCancelDownload');

  // Completed Card Elements
  const completedCard = document.getElementById('completedCard');
  const completedFileName = document.getElementById('completedFileName');
  const btnSaveBrowserFile = document.getElementById('btnSaveBrowserFile');
  const btnOpenFolderAfter = document.getElementById('btnOpenFolderAfter');
  const btnNewDownload = document.getElementById('btnNewDownload');

  // History Elements
  const historyList = document.getElementById('historyList');
  const historyCountBadge = document.getElementById('historyCountBadge');
  const btnRefreshHistory = document.getElementById('btnRefreshHistory');
  const toastContainer = document.getElementById('toastContainer');

  // State
  let currentVideoData = null;
  let activeEventSource = null;
  let activeJobId = null;
  let selectedType = 'video'; // 'video' | 'audio'
  let selectedQuality = '1080';

  // Check health and engine status on load
  checkEngineHealth();
  loadHistory();

  // Input Clear Button toggle
  videoUrlInput.addEventListener('input', () => {
    btnClearInput.style.display = videoUrlInput.value.trim() ? 'flex' : 'none';
    hideError();
  });

  btnClearInput.addEventListener('click', () => {
    videoUrlInput.value = '';
    btnClearInput.style.display = 'none';
    videoUrlInput.focus();
    hideError();
  });

  // Paste from clipboard
  btnPasteClipboard.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        videoUrlInput.value = text.trim();
        btnClearInput.style.display = 'flex';
        hideError();
        showToast('Link colado da área de transferência!', 'success');
        analyzeVideo();
      } else {
        showToast('Área de transferência vazia.', 'error');
      }
    } catch (err) {
      console.warn('Clipboard read failed:', err);
      videoUrlInput.focus();
      showToast('Permissão de colar negada. Cole com Ctrl+V.', 'error');
    }
  });

  // Submit analyze
  urlForm.addEventListener('submit', (e) => {
    e.preventDefault();
    analyzeVideo();
  });

  // Tab switching (Video / Audio)
  tabVideo.addEventListener('click', () => {
    selectedType = 'video';
    tabVideo.classList.add('active');
    tabVideo.setAttribute('aria-selected', 'true');
    tabAudio.classList.remove('active');
    tabAudio.setAttribute('aria-selected', 'false');
    videoOptionsPanel.style.display = 'block';
    audioOptionsPanel.style.display = 'none';
    updateActiveQualityFromRadio();
  });

  tabAudio.addEventListener('click', () => {
    selectedType = 'audio';
    tabAudio.classList.add('active');
    tabAudio.setAttribute('aria-selected', 'true');
    tabVideo.classList.remove('active');
    tabVideo.setAttribute('aria-selected', 'false');
    audioOptionsPanel.style.display = 'block';
    videoOptionsPanel.style.display = 'none';
    updateActiveQualityFromRadio();
  });

  // Quality grid selection delegation
  videoQualityGrid.addEventListener('change', (e) => {
    if (e.target.name === 'videoQuality') {
      selectedQuality = e.target.value;
      updateQualityCardsVisual(videoQualityGrid);
    }
  });

  audioOptionsPanel.addEventListener('change', (e) => {
    if (e.target.name === 'audioQuality') {
      selectedQuality = e.target.value;
      updateQualityCardsVisual(audioOptionsPanel);
    }
  });

  function updateQualityCardsVisual(container) {
    const cards = container.querySelectorAll('.quality-card');
    cards.forEach(card => {
      const radio = card.querySelector('input[type="radio"]');
      if (radio && radio.checked) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    });
  }

  function updateActiveQualityFromRadio() {
    if (selectedType === 'video') {
      const checked = videoQualityGrid.querySelector('input[name="videoQuality"]:checked');
      selectedQuality = checked ? checked.value : '1080';
    } else {
      const checked = audioOptionsPanel.querySelector('input[name="audioQuality"]:checked');
      selectedQuality = checked ? checked.value : '320';
    }
  }

  // Analyze video function
  async function analyzeVideo() {
    const url = videoUrlInput.value.trim();
    if (!url) {
      showError('Por favor, cole o link do YouTube primeiro.');
      return;
    }

    hideError();
    setAnalyzingState(true);
    previewCard.style.display = 'none';
    progressCard.style.display = 'none';
    completedCard.style.display = 'none';

    try {
      const response = await fetch('/api/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao analisar o vídeo.');
      }

      currentVideoData = data;
      renderPreview(data);
      showToast('Vídeo encontrado com sucesso!', 'success');
    } catch (err) {
      console.error('Analyze error:', err);
      showError(err.message || 'Falha ao buscar dados do vídeo.');
    } finally {
      setAnalyzingState(false);
    }
  }

  function setAnalyzingState(loading) {
    btnAnalyzeVideo.disabled = loading;
    if (loading) {
      btnContent.style.display = 'none';
      analyzeSpinner.style.display = 'inline-block';
    } else {
      btnContent.style.display = 'inline-flex';
      analyzeSpinner.style.display = 'none';
    }
  }

  function renderPreview(data) {
    videoThumbnail.src = data.thumbnail || '';
    videoThumbnail.alt = data.title;
    videoDurationBadge.textContent = data.durationFormatted || '0:00';
    videoTitle.textContent = data.title;
    videoChannel.textContent = data.uploader || 'Canal Desconhecido';
    videoViewsCount.textContent = data.viewCountFormatted ? `${data.viewCountFormatted} visualizações` : 'Visualizações disponíveis';
    videoUploadDate.textContent = data.uploadDate ? `Enviado em ${data.uploadDate}` : '';

    // Render video qualities
    videoQualityGrid.innerHTML = '';
    const qualities = data.availableQualities && data.availableQualities.length > 0
      ? data.availableQualities
      : [1080, 720, 480, 360];

    // Build quality options
    qualities.forEach((q, index) => {
      let label = `${q}p`;
      let desc = 'Qualidade Padrão';
      let badge = '';

      if (q >= 2160) {
        label = '4K Ultra HD';
        desc = 'Resolução 2160p';
        badge = '<span class="quality-badge">4K</span>';
      } else if (q >= 1440) {
        label = '2K Quad HD';
        desc = 'Resolução 1440p';
        badge = '<span class="quality-badge">2K</span>';
      } else if (q >= 1080) {
        label = '1080p Full HD';
        desc = 'Alta Definição Recomendada';
        badge = '<span class="quality-badge">FHD</span>';
      } else if (q >= 720) {
        label = '720p HD';
        desc = 'Rápido e Leve';
        badge = '<span class="quality-badge fast">HD</span>';
      } else {
        label = `${q}p SD`;
        desc = 'Download Ultra Rápido';
      }

      const isDefault = index === 0;
      const card = document.createElement('label');
      card.className = `quality-card ${isDefault ? 'active' : ''}`;
      card.innerHTML = `
        <input type="radio" name="videoQuality" value="${q}" ${isDefault ? 'checked' : ''}>
        <div class="quality-content">
          <span class="quality-label">${label}</span>
          <span class="quality-desc">${desc}</span>
        </div>
        ${badge}
      `;
      videoQualityGrid.appendChild(card);
    });

    selectedQuality = qualities[0].toString();
    selectedType = 'video';
    tabVideo.click();

    previewCard.style.display = 'block';
    previewCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Start Download Action
  btnStartDownload.addEventListener('click', async () => {
    if (!currentVideoData) return;

    updateActiveQualityFromRadio();

    btnStartDownload.disabled = true;
    showToast(`Iniciando download em ${selectedType === 'audio' ? 'Áudio' : 'Vídeo ' + selectedQuality + 'p'}...`, 'success');

    try {
      const response = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: currentVideoData.webpageUrl || videoUrlInput.value.trim(),
          type: selectedType,
          quality: selectedQuality,
          title: currentVideoData.title
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao iniciar o download.');
      }

      activeJobId = data.jobId;
      setupDownloadProgress(data.jobId);
    } catch (err) {
      console.error('Download start error:', err);
      showToast(err.message || 'Erro ao iniciar download.', 'error');
      btnStartDownload.disabled = false;
    }
  });

  // Setup SSE for real-time progress
  function setupDownloadProgress(jobId) {
    if (activeEventSource) {
      activeEventSource.close();
    }

    // Reset progress UI
    progressBarFill.style.width = '0%';
    metricPercent.textContent = '0%';
    metricSpeed.textContent = '-- MB/s';
    metricTotal.textContent = '-- MB';
    metricEta.textContent = '--:--';
    progressTitle.textContent = selectedType === 'audio' ? 'Baixando e extraindo áudio...' : 'Baixando vídeo do YouTube...';
    progressSubtitle.textContent = currentVideoData ? currentVideoData.title : 'Conectando ao stream...';

    previewCard.style.display = 'none';
    completedCard.style.display = 'none';
    progressCard.style.display = 'block';
    progressCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    activeEventSource = new EventSource(`/api/progress/${jobId}`);

    activeEventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Update progress bar & percentage
        const progress = Math.max(0, Math.min(100, Math.round(data.progress || 0)));
        progressBarFill.style.width = `${progress}%`;
        metricPercent.textContent = `${progress}%`;

        // Update stats
        if (data.speed && data.speed !== '--') metricSpeed.textContent = data.speed;
        if (data.totalSize && data.totalSize !== '--') metricTotal.textContent = data.totalSize;
        if (data.eta && data.eta !== '--') metricEta.textContent = data.eta;
        if (data.statusText) progressTitle.textContent = data.statusText;

        // Check if finished
        if (data.completed) {
          activeEventSource.close();
          activeEventSource = null;
          handleDownloadSuccess(data);
        } else if (data.status === 'erro') {
          activeEventSource.close();
          activeEventSource = null;
          handleDownloadError(data.error || 'Falha no download.');
        }
      } catch (err) {
        console.error('SSE parse error:', err);
      }
    };

    activeEventSource.onerror = (err) => {
      console.warn('SSE connection warning:', err);
    };
  }

  function handleDownloadSuccess(data) {
    progressCard.style.display = 'none';
    completedFileName.textContent = data.filename || 'Vídeo Concluído';
    btnSaveBrowserFile.href = `/api/file?name=${encodeURIComponent(data.filename)}`;
    btnSaveBrowserFile.setAttribute('download', data.filename);

    completedCard.style.display = 'block';
    completedCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    showToast('Download concluído com sucesso!', 'success');
    btnStartDownload.disabled = false;
    loadHistory();
  }

  function handleDownloadError(msg) {
    progressCard.style.display = 'none';
    previewCard.style.display = 'block';
    btnStartDownload.disabled = false;
    showToast(msg, 'error');
  }

  // Cancel Download
  btnCancelDownload.addEventListener('click', async () => {
    if (!activeJobId) return;

    try {
      await fetch(`/api/cancel/${activeJobId}`, { method: 'POST' });
      if (activeEventSource) {
        activeEventSource.close();
        activeEventSource = null;
      }
      progressCard.style.display = 'none';
      previewCard.style.display = 'block';
      btnStartDownload.disabled = false;
      showToast('Download cancelado.', 'error');
    } catch (e) {
      console.error('Cancel error:', e);
    }
  });

  // Open Downloads Folder in Windows
  btnOpenDownloadsFolder.addEventListener('click', openDownloadsFolder);
  btnOpenFolderAfter.addEventListener('click', openDownloadsFolder);

  async function openDownloadsFolder() {
    try {
      const res = await fetch('/api/open-folder', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        showToast('Pasta de downloads aberta no Windows Explorer!', 'success');
      } else {
        showToast(data.error || 'Não foi possível abrir a pasta.', 'error');
      }
    } catch (e) {
      console.error(e);
      showToast('Erro ao abrir pasta.', 'error');
    }
  }

  // New Download Button
  btnNewDownload.addEventListener('click', () => {
    completedCard.style.display = 'none';
    videoUrlInput.value = '';
    btnClearInput.style.display = 'none';
    videoUrlInput.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Load and render history
  btnRefreshHistory.addEventListener('click', () => {
    btnRefreshHistory.style.transform = 'rotate(180deg)';
    setTimeout(() => { btnRefreshHistory.style.transform = ''; }, 300);
    loadHistory();
  });

  async function loadHistory() {
    try {
      const res = await fetch('/api/history');
      const files = await res.json();

      historyCountBadge.textContent = `${files.length} arquivo${files.length === 1 ? '' : 's'}`;

      if (files.length === 0) {
        historyList.innerHTML = `
          <div class="empty-history">
            Nenhum arquivo baixado ainda nesta sessão. Seus downloads aparecerão aqui.
          </div>
        `;
        return;
      }

      historyList.innerHTML = files.map(file => {
        const isAudio = file.name.endsWith('.mp3') || file.name.endsWith('.m4a');
        const iconSvg = isAudio ? `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon-sm">
            <path d="M9 18V5l12-2v13"></path>
            <circle cx="6" cy="18" r="3"></circle>
            <circle cx="18" cy="16" r="3"></circle>
          </svg>
        ` : `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon-sm">
            <polygon points="23 7 16 12 23 17 23 7"></polygon>
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
          </svg>
        `;

        const fileDate = new Date(file.date).toLocaleDateString('pt-BR', {
          day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
        });

        return `
          <div class="history-item">
            <div class="history-item-left">
              <div class="history-file-icon ${isAudio ? 'audio' : ''}">
                ${iconSvg}
              </div>
              <div class="history-file-info">
                <span class="history-file-name" title="${file.name}">${file.name}</span>
                <span class="history-file-meta">${file.sizeFormatted} • ${fileDate}</span>
              </div>
            </div>
            <div class="history-actions">
              <a href="/api/file?name=${encodeURIComponent(file.name)}" download class="btn btn-secondary btn-sm" title="Baixar no navegador">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon-xs">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
                <span>Baixar</span>
              </a>
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {
      console.error('History load error:', e);
    }
  }

  // Check backend engine health
  async function checkEngineHealth() {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      const engineBadge = document.getElementById('engineStatusBadge');
      if (data.ytdlp && data.ffmpeg) {
        engineBadge.innerHTML = `
          <span class="status-dot"></span>
          <span class="status-label">yt-dlp & FFmpeg Prontos</span>
        `;
      }
    } catch (e) {
      console.warn('Backend not yet reachable:', e);
    }
  }

  // Toast Notification System
  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const iconSvg = type === 'success' ? `
      <svg viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" class="icon-sm">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    ` : `
      <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" class="icon-sm">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
    `;

    toast.innerHTML = `
      ${iconSvg}
      <span>${message}</span>
    `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 250);
    }, 4000);
  }

  function showError(msg) {
    urlErrorMsg.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="icon-sm">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
      <span>${msg}</span>
    `;
    urlErrorMsg.style.display = 'flex';
  }

  function hideError() {
    urlErrorMsg.style.display = 'none';
  }
});
