(function () {
  'use strict';

  let _currentAudio = null;
  let _currentPlayingUrl = null;
  let _progressInterval = null;

  /**
   * Получить все blob URL'ы из AudioManager
   */
  function getBlobEntries() {
    try {
      if (window.AudioManager && typeof window.AudioManager.getBlobEntries === 'function') {
        return window.AudioManager.getBlobEntries();
      }
    } catch (e) {
    }
    return [];
  }

  /**
   * Форматировать размер
   */
  function formatSize(bytes) {
    if (bytes === 0) return '?';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  /**
   * Форматировать длительность
   */
  function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /**
   * Остановить текущее воспроизведение
   */
  function stopCurrentPlayback() {
    if (_progressInterval) {
      clearInterval(_progressInterval);
      _progressInterval = null;
    }
    if (_currentAudio) {
      _currentAudio.pause();
      _currentAudio.src = '';
      _currentAudio = null;
    }
    _currentPlayingUrl = null;

    document.querySelectorAll('.audio-cache-item-play-btn.playing').forEach(function (btn) {
      btn.classList.remove('playing');
      const icon = btn.querySelector('i');
      if (icon) {
        icon.setAttribute('data-lucide', 'play');
      }
    });

    const progressEl = document.getElementById('audioCacheProgress');
    if (progressEl) progressEl.style.display = 'none';

    try {
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ root: document.getElementById('audioCacheModal') });
      }
    } catch (e) {}
  }

  /**
   * Обновить прогресс-бар
   */
  function updateProgress() {
    const progressFill = document.getElementById('audioCacheProgressFill');
    const progressTime = document.getElementById('audioCacheProgressTime');
    if (!progressFill || !_currentAudio) return;

    if (_currentAudio.duration && _currentAudio.duration > 0) {
      const pct = (_currentAudio.currentTime / _currentAudio.duration) * 100;
      progressFill.style.width = Math.min(pct, 100) + '%';
      if (progressTime) {
        progressTime.textContent = formatDuration(_currentAudio.currentTime) + ' / ' + formatDuration(_currentAudio.duration);
      }
    }
  }

  /**
   * Воспроизвести аудио по blob URL
   */
  async function playAudio(entry) {
    if (_currentPlayingUrl === entry.blobUrl) {
      stopCurrentPlayback();
      return;
    }

    stopCurrentPlayback();

    try {
      const audio = new Audio(entry.blobUrl);

      const progressEl = document.getElementById('audioCacheProgress');
      const progressLabel = document.getElementById('audioCacheProgressLabel');
      const progressFill = document.getElementById('audioCacheProgressFill');
      const progressTime = document.getElementById('audioCacheProgressTime');
      if (progressEl) progressEl.style.display = 'block';
      if (progressLabel) progressLabel.textContent = entry.filename || entry.dictationId || 'Аудио';
      if (progressFill) progressFill.style.width = '0%';
      if (progressTime) progressTime.textContent = '0:00 / 0:00';

      audio.addEventListener('loadedmetadata', function () {
        updateProgress();
      });

      audio.addEventListener('timeupdate', function () {
        updateProgress();
      });

      audio.addEventListener('ended', function () {
        stopCurrentPlayback();
      });

      audio.addEventListener('error', function (e) {
        console.warn('[audioCache] playback error:', e);
        stopCurrentPlayback();
      });

      const playBtn = document.querySelector('.audio-cache-item-play-btn[data-url="' + CSS.escape(entry.blobUrl) + '"]');
      if (playBtn) {
        playBtn.classList.add('playing');
        const icon = playBtn.querySelector('i');
        if (icon) {
          icon.setAttribute('data-lucide', 'stop');
        }
        try {
          if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons({ root: playBtn });
          }
        } catch (e) {}
      }

      _currentAudio = audio;
      _currentPlayingUrl = entry.blobUrl;

      _progressInterval = setInterval(updateProgress, 200);

      await audio.play();
    } catch (e) {
      console.warn('[audioCache] playback error:', e);
      stopCurrentPlayback();
    }
  }

  /**
   * Рендер списка blob URL'ов
   */
  async function renderAudioCacheList() {
    const listEl = document.getElementById('audioCacheList');
    const countEl = document.getElementById('audioCacheCount');
    if (!listEl) return;

    listEl.innerHTML = '<div class="audio-cache-loading">Загрузка списка аудио из AudioManager...</div>';

    const entries = getBlobEntries();

    if (entries.length === 0) {
      listEl.innerHTML = '<div class="audio-cache-empty">Аудио в памяти (blob URL) не найдено.<br>Откройте диктант чтобы аудио загрузились в AudioManager.</div>';
      if (countEl) countEl.textContent = '0 аудио в памяти';
      return;
    }

    if (countEl) {
      countEl.textContent = entries.length + ' аудио в памяти (blob URL)';
    }

    let html = '';
    for (const entry of entries) {
      const idLabel = entry.dictationId ? '#' + escapeHtml(entry.dictationId) : '';
      const langLabel = entry.lang || '';
      const filenameLabel = entry.filename || entry.cacheKey.split('/').pop() || '?';

      html += '<div class="audio-cache-item">';
      html += '<div class="audio-cache-item-icon"><i data-lucide="music"></i></div>';
      html += '<div class="audio-cache-item-info">';
      html += '<div class="audio-cache-item-url" title="' + escapeHtml(entry.cacheKey) + '">';
      if (idLabel) {
        html += '<span class="audio-cache-item-id-badge">' + escapeHtml(idLabel) + '</span> ';
      }
      html += escapeHtml(filenameLabel) + '</div>';
      html += '<div class="audio-cache-item-meta">';
      if (langLabel) html += '<span>' + escapeHtml(langLabel) + '</span>';
      html += '<span>blob URL</span>';
      html += '</div>';
      html += '</div>';
      html += '<button type="button" class="audio-cache-item-play-btn" data-url="' + escapeHtml(entry.blobUrl) + '" title="Воспроизвести">';
      html += '<i data-lucide="play"></i>';
      html += '</button>';
      html += '</div>';
    }

    listEl.innerHTML = html;

    listEl.querySelectorAll('.audio-cache-item-play-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        const url = btn.getAttribute('data-url');
        if (!url) return;
        const entry = entries.find(function (e) { return e.blobUrl === url; });
        if (entry) {
          playAudio(entry);
        }
      });
    });

    try {
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ root: document.getElementById('audioCacheModal') });
      }
    } catch (e) {}
  }

  function escapeHtml(str) {
    if (typeof str !== 'string') return String(str || '');
    return str
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"')
      .replace(/'/g, '&#039;');
  }

  function openModal() {
    const modal = document.getElementById('audioCacheModal');
    if (!modal) return;

    modal.style.display = 'flex';
    renderAudioCacheList();

    try {
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ root: modal });
      }
    } catch (e) {}
  }

  function closeModal() {
    stopCurrentPlayback();
    const modal = document.getElementById('audioCacheModal');
    if (!modal) return;
    modal.style.display = 'none';
  }

  function init() {
    const modal = document.getElementById('audioCacheModal');
    if (!modal) return;

    const closeBtn = document.getElementById('audioCacheModalClose');
    if (closeBtn) {
      closeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        closeModal();
      });
    }

    modal.addEventListener('click', function (e) {
      if (e && e.target === modal) closeModal();
    });

    document.addEventListener('keydown', function (e) {
      if (e && e.key === 'Escape') {
        if (modal.style.display === 'flex') closeModal();
      }
    });

    const refreshBtn = document.getElementById('audioCacheRefreshBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function (e) {
        e.preventDefault();
        stopCurrentPlayback();
        renderAudioCacheList();
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.AudioCacheModal = {
    open: openModal,
    close: closeModal,
    refresh: renderAudioCacheList,
  };
})();
