(function () {
  'use strict';

  const MEDIA_CACHE_NAME = 'dictafan-media';

  let _currentAudio = null; // текущий проигрываемый Audio элемент
  let _currentPlayingUrl = null; // URL который сейчас играет
  let _progressInterval = null;

  /**
   * Получить все записи из CacheStorage 'dictafan-media'
   */
  async function getCachedAudioEntries() {
    try {
      const cache = await caches.open(MEDIA_CACHE_NAME);
      const requests = await cache.keys();
      const entries = [];

      for (const request of requests) {
        const url = request.url;
        // Пропускаем запросы не связанные с аудио (например, настройки)
        if (!url.includes('/api/dictations/')) continue;

        try {
          const response = await cache.match(request);
          if (!response) continue;

          const contentLength = response.headers.get('content-length');
          const contentType = response.headers.get('content-type') || 'audio/mpeg';
          const sizeBytes = contentLength ? parseInt(contentLength, 10) : 0;

          // Парсим URL для получения информации
          const urlObj = new URL(url);
          const pathParts = urlObj.pathname.split('/').filter(Boolean);
          // /api/dictations/{dictationId}/{lang}/{filename}
          let dictationId = '';
          let lang = '';
          let filename = '';
          if (pathParts.length >= 4 && pathParts[0] === 'api' && pathParts[1] === 'dictations') {
            dictationId = pathParts[2];
            lang = pathParts[3];
            filename = pathParts.slice(4).join('/');
          } else {
            // Если не удалось распарсить, используем последний сегмент как имя
            filename = pathParts[pathParts.length - 1] || urlObj.pathname;
          }

          entries.push({
            url: url,
            dictationId: dictationId,
            lang: lang,
            filename: filename,
            sizeBytes: sizeBytes,
            contentType: contentType,
            response: response,
          });
        } catch (e) {
          // Пропускаем записи которые не удалось прочитать
          console.warn('[audioCache] error reading cache entry:', url, e);
        }
      }

      // Сортируем по dictationId + filename
      entries.sort((a, b) => {
        const aKey = `${a.dictationId}/${a.filename}`;
        const bKey = `${b.dictationId}/${b.filename}`;
        return aKey.localeCompare(bKey);
      });

      return entries;
    } catch (e) {
      console.error('[audioCache] error reading cache:', e);
      return [];
    }
  }

  /**
   * Форматировать размер в человекочитаемый вид
   */
  function formatSize(bytes) {
    if (bytes === 0) return '?';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  /**
   * Форматировать длительность (если есть)
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

    // Сбросить состояние кнопок
    document.querySelectorAll('.audio-cache-item-play-btn.playing').forEach(function (btn) {
      btn.classList.remove('playing');
      const icon = btn.querySelector('i');
      if (icon) {
        icon.setAttribute('data-lucide', 'play');
        icon.setAttribute('data-lucide-type', 'play');
      }
    });

    // Скрыть прогресс-бар
    const progressEl = document.getElementById('audioCacheProgress');
    if (progressEl) progressEl.style.display = 'none';

    // Обновить иконки lucide
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
   * Воспроизвести аудио по URL
   */
  async function playAudio(entry) {
    // Если это же аудио уже играет — останавливаем
    if (_currentPlayingUrl === entry.url) {
      stopCurrentPlayback();
      return;
    }

    stopCurrentPlayback();

    try {
      // Создаём blob URL из response
      const blob = await entry.response.clone().blob();
      const blobUrl = URL.createObjectURL(blob);

      const audio = new Audio();
      audio.src = blobUrl;

      // Показываем прогресс-бар
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

      // Помечаем кнопку как играющую
      const playBtn = document.querySelector('.audio-cache-item-play-btn[data-url="' + CSS.escape(entry.url) + '"]');
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
      _currentPlayingUrl = entry.url;

      // Запускаем интервал обновления прогресса
      _progressInterval = setInterval(updateProgress, 200);

      await audio.play();
    } catch (e) {
      console.warn('[audioCache] playback error:', e);
      stopCurrentPlayback();
    }
  }

  /**
   * Рендер списка аудио
   */
  async function renderAudioCacheList() {
    const listEl = document.getElementById('audioCacheList');
    const countEl = document.getElementById('audioCacheCount');
    if (!listEl) return;

    listEl.innerHTML = '<div class="audio-cache-loading">Загрузка списка аудио из кэша...</div>';

    const entries = await getCachedAudioEntries();

    if (entries.length === 0) {
      listEl.innerHTML = '<div class="audio-cache-empty">Аудио в кэше не найдено</div>';
      if (countEl) countEl.textContent = '0 аудио';
      return;
    }

    // Считаем общий размер
    let totalSize = 0;
    for (const e of entries) {
      totalSize += e.sizeBytes;
    }

    if (countEl) {
      countEl.textContent = entries.length + ' аудио · ' + formatSize(totalSize);
    }

    let html = '';
    for (const entry of entries) {
      const sizeLabel = formatSize(entry.sizeBytes);
      const langLabel = entry.lang || '';
      const idLabel = entry.dictationId ? '#' + escapeHtml(entry.dictationId) : '';
      const filenameLabel = entry.filename || entry.url.split('/').pop() || '?';

      html += '<div class="audio-cache-item">';
      html += '<div class="audio-cache-item-icon"><i data-lucide="music"></i></div>';
      html += '<div class="audio-cache-item-info">';
      html += '<div class="audio-cache-item-url" title="' + escapeHtml(entry.url) + '">' + escapeHtml(filenameLabel) + '</div>';
      html += '<div class="audio-cache-item-meta">';
      if (idLabel) html += '<span>' + escapeHtml(idLabel) + '</span>';
      if (langLabel) html += '<span>' + escapeHtml(langLabel) + '</span>';
      html += '<span>' + escapeHtml(sizeLabel) + '</span>';
      html += '</div>';
      html += '</div>';
      html += '<button type="button" class="audio-cache-item-play-btn" data-url="' + escapeHtml(entry.url) + '" title="Воспроизвести">';
      html += '<i data-lucide="play"></i>';
      html += '</button>';
      html += '</div>';
    }

    listEl.innerHTML = html;

    // Навешиваем обработчики на кнопки play
    listEl.querySelectorAll('.audio-cache-item-play-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        const url = btn.getAttribute('data-url');
        if (!url) return;
        const entry = entries.find(function (e) { return e.url === url; });
        if (entry) {
          playAudio(entry);
        }
      });
    });

    // Обновляем иконки lucide
    try {
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ root: document.getElementById('audioCacheModal') });
      }
    } catch (e) {}
  }

  /**
   * Экранирование HTML
   */
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

    // Рендерим список
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

    // Закрытие по крестику
    const closeBtn = document.getElementById('audioCacheModalClose');
    if (closeBtn) {
      closeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        closeModal();
      });
    }

    // Закрытие по клику на оверлей
    modal.addEventListener('click', function (e) {
      if (e && e.target === modal) closeModal();
    });

    // Закрытие по Escape
    document.addEventListener('keydown', function (e) {
      if (e && e.key === 'Escape') {
        if (modal.style.display === 'flex') closeModal();
      }
    });

    // Кнопка обновления
    const refreshBtn = document.getElementById('audioCacheRefreshBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function (e) {
        e.preventDefault();
        stopCurrentPlayback();
        renderAudioCacheList();
      });
    }
  }

  // Инициализация при загрузке DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Экспортируем API
  window.AudioCacheModal = {
    open: openModal,
    close: closeModal,
    refresh: renderAudioCacheList,
  };
})();
