/**
 * SpeechRecognitionModeSelector — общий радио-блок выбора режима распознавания речи.
 *
 * Используется и в профиле пользователя, и в настройках диктанта.
 * Данные режима хранятся ТОЛЬКО в localStorage (кеш устройства), не на сервере.
 *
 * Режимы:
 *   - route          → Google/WebSpeech (интернет)
 *   - server         → Whisper Tiny на сервере (интернет)
 *   - route-off|tiny → Whisper Tiny на устройстве (локальная модель ~75 МБ)
 *
 * Устройственный режим:
 *   - модель загружена на устройство → строка доступна;
 *   - идёт загрузка модели             → строка доступна + показывается спиннер;
 *   - модель НЕ загружена              → строка недоступна (серая/disabled).
 */
(function () {
  'use strict';

  var LS_KEY = 'dictafan_speech_rec_mode';
  var DEVICE_MODEL_KEY = 'whisper:Xenova/whisper-tiny';
  var DEVICE_MODE_VALUE = 'route-off|tiny';
  var DOWNLOAD_CHANGE_EVENT = 'dictafan:whisper-download-change';

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"')
      .replace(/'/g, '\u0027');
  }

  function SpeechRecognitionModeSelector(options) {
    options = options || {};
    this.container = options.container || null;
    this.radioName = options.radioName || 'speechRecMode';
    this.onChange = typeof options.onChange === 'function' ? options.onChange : null;
    // При false класс не пишет в localStorage при клике (диктант пишет при сохранении).
    this.autoPersist = options.autoPersist !== false;
    this._bound = false;

    if (!this.container) return;
    this._render();
    this._bind();
    this.refresh();
  }

  SpeechRecognitionModeSelector.prototype._t = function (key, fallback) {
    try {
      if (window.I18n && typeof window.I18n.t === 'function') {
        var v = window.I18n.t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback;
  };

  SpeechRecognitionModeSelector.prototype.readMode = function () {
    try {
      var v = localStorage.getItem(LS_KEY);
      if (v) return String(v);
    } catch (e) {}
    return 'route';
  };

  SpeechRecognitionModeSelector.prototype.writeMode = function (mode) {
    try {
      localStorage.setItem(LS_KEY, String(mode || 'route'));
    } catch (e) {}
  };

  SpeechRecognitionModeSelector.prototype._isOnline = function () {
    try {
      return !(typeof navigator !== 'undefined' && navigator && navigator.onLine === false);
    } catch (e) {}
    return true;
  };

  SpeechRecognitionModeSelector.prototype._isWhisperDownloaded = function () {
    // 1) Модель в памяти (window.WhisperModels)
    try {
      if (window.WhisperModels && window.WhisperModels.get) {
        var inMem = window.WhisperModels.get('whisper_model_tiny');
        if (inMem && (inMem.isReady || inMem.recognizer)) return true;
      }
    } catch (e) {}
    // 2) Маркер статуса в localStorage (whisper-model-manager.js)
    try {
      var status = localStorage.getItem('whisper_model_tiny');
      if (status === 'downloaded' || status === 'ready') return true;
    } catch (e) {}
    // 3) Model-centric список downloaded_models_v2 (LanguageSelector)
    try {
      var raw = localStorage.getItem('downloaded_models_v2');
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          for (var key in parsed) {
            if (Object.prototype.hasOwnProperty.call(parsed, key) && String(key).indexOf('whisper-') !== -1) return true;
          }
        }
      }
    } catch (e) {}
    return false;
  };

  SpeechRecognitionModeSelector.prototype._isDownloading = function () {
    try {
      if (window.__dictafanWhisperDownloadsInFlight && window.__dictafanWhisperDownloadsInFlight.size) {
        return true;
      }
    } catch (e) {}
    // Fallback: загрузка в конкретном экземпляре LanguageSelector
    try {
      var ls = window.languageModelsSelector;
      if (ls && ls._modelsCentricDownloadsInFlight && ls._modelsCentricDownloadsInFlight.size) {
        return true;
      }
    } catch (e) {}
    return false;
  };

  SpeechRecognitionModeSelector.prototype._deviceLabel = function () {
    var name = this._t('profile.models.method_device_whisper_tiny', 'Whisper Tiny');
    return name + ' · 75 MB';
  };

  SpeechRecognitionModeSelector.prototype._render = function () {
    this.container.classList.add('speech-rec-mode-selector');

    var routeLabel = this._t('profile.models.method_google', 'Google services');
    var serverLabel = this._t('profile.models.method_server_whisper_tiny', 'Whisper Tiny on server');
    var deviceLabel = this._deviceLabel();
    var name = escapeHtml(this.radioName);

    var html =
      '<label class="speech-rec-mode-option" data-mode="route">' +
        '<input type="radio" name="' + name + '" value="route" />' +
        '<span class="speech-rec-mode-inline"><i data-lucide="route"></i><span>' + escapeHtml(routeLabel) + '</span></span>' +
      '</label>' +
      '<label class="speech-rec-mode-option" data-mode="server">' +
        '<input type="radio" name="' + name + '" value="server" />' +
        '<span class="speech-rec-mode-inline"><i data-lucide="server"></i><span>' + escapeHtml(serverLabel) + '</span></span>' +
      '</label>' +
      '<label class="speech-rec-mode-option speech-rec-mode-option-device" data-mode="route-off">' +
        '<input type="radio" name="' + name + '" value="' + DEVICE_MODE_VALUE + '" />' +
        '<span class="speech-rec-mode-inline"><i data-lucide="house-heart"></i><span>' + escapeHtml(deviceLabel) + '</span></span>' +
        '<span class="speech-rec-mode-spinner" data-role="spinner" aria-hidden="true"></span>' +
      '</label>';

    this.container.innerHTML = html;
    try {
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ root: this.container });
      }
    } catch (e) {}
  };

  SpeechRecognitionModeSelector.prototype.refresh = function () {
    if (!this.container) return;
    var online = this._isOnline();
    var downloaded = this._isWhisperDownloaded();
    var downloading = this._isDownloading();

    var downloadingLabel = this._t('profile.models.download_modal.downloading', 'Downloading…');
    var notDownloadedLabel = this._t('profile.audio.speech_recognition.local_model_not_downloaded', 'Local model is not downloaded');

    var serverEl = this.container.querySelector('[data-mode="server"]');
    var serverInput = serverEl ? serverEl.querySelector('input') : null;
    var deviceEl = this.container.querySelector('[data-mode="route-off"]');
    var deviceInput = deviceEl ? deviceEl.querySelector('input') : null;
    var spinner = this.container.querySelector('[data-role="spinner"]');

    // server доступен только при наличии интернета
    if (serverInput) {
      var serverDisabled = !online;
      serverInput.disabled = serverDisabled;
      if (serverEl) serverEl.classList.toggle('is-unavailable', serverDisabled);
    }

    // device-режим: доступен если модель загружена ИЛИ идёт загрузка
    if (deviceInput) {
      var deviceAvailable = downloaded || downloading;
      deviceInput.disabled = !deviceAvailable;
      if (deviceEl) {
        deviceEl.classList.toggle('is-unavailable', !deviceAvailable);
        if (!deviceAvailable) {
          deviceEl.title = notDownloadedLabel;
        } else if (downloading) {
          deviceEl.title = downloadingLabel;
        } else {
          deviceEl.title = '';
        }
      }
      if (spinner) {
        spinner.style.display = downloading ? 'inline-flex' : 'none';
      }
    }

    // Устанавливаем выбранный режим из localStorage
    var mode = this.readMode();
    var radios = this.container.querySelectorAll('input[name="' + this.radioName + '"]');
    var found = false;
    for (var i = 0; i < radios.length; i++) {
      var r = radios[i];
      if (String(r.value) === mode && !r.disabled) {
        r.checked = true;
        found = true;
      } else if (String(r.value) === mode && r.disabled) {
        r.checked = false;
      }
    }
    if (!found) {
      var first = this.container.querySelector('input[name="' + this.radioName + '"][value="route"]');
      if (first && !first.disabled) first.checked = true;
      // В диктанте (autoPersist=false) не пишем в кеш без нажатия «Сохранить».
      if (this.autoPersist) this.writeMode('route');
    }
  };

  SpeechRecognitionModeSelector.prototype.getValue = function () {
    try {
      var checked = this.container.querySelector('input[name="' + this.radioName + '"]:checked');
      return checked ? String(checked.value || 'route') : this.readMode();
    } catch (e) {}
    return 'route';
  };

  SpeechRecognitionModeSelector.prototype._bind = function () {
    if (this._bound) return;
    this._bound = true;

    var self = this;
    try {
      this.container.addEventListener('change', function (e) {
        var t = e && e.target;
        if (!t || !t.matches || !t.matches('input[type="radio"]')) return;
        var value = String(t.value || 'route');
        if (self.autoPersist) {
          self.writeMode(value);
        }
        if (self.onChange) {
          try { self.onChange(value); } catch (e0) {}
        }
      });
    } catch (e) {}

    try {
      window.addEventListener(DOWNLOAD_CHANGE_EVENT, function () {
        self.refresh();
      });
    } catch (e) {}
  };

  window.SpeechRecognitionModeSelector = SpeechRecognitionModeSelector;
  window.DICTATION_SPEECH_REC_MODE_KEY = LS_KEY;
})();
