/**
 * dictation_editor_modal.js — Редактор диктанта в модальном окне
 * IIFE-паттерн, как dictation_modal.js
 *
 * Содержит:
 * - Полный механизм audio playback (play/pause/hammer, audioManager)
 * - Save system с dirty flags (db/audio/cover) и цветными звёздами
 * - Таблицу предложений с управлением колонками
 */
(function () {
  'use strict';

  const MODAL_ID = 'dictationEditorModal';
  const BODY_ID = 'dictationEditorModalBody';
  const TABLE_ID = 'editorModalSentencesTable';

  const state = {
    isOpen: false,
    config: null,
    headerLangPairSelector: null,
    /** @type {DictationContent|null} */
    content: null,
    currentTabName: 'general',
    currentDictation: null,
    audioManager: null,
    /** @type {{ db: boolean, audio: boolean, cover: boolean }} */
    dirtyFlags: { db: false, audio: false, cover: false },
    /** Имя общего аудиофайла (shared audio), который загружен через "..." */
    _sharedAudioFilename: null,
    /** Длительность общего аудиофайла в секундах */
    _sharedAudioDuration: null,
    /** File объект общего аудиофайла */
    _sharedAudioFile: null,
    /** blob URL для waveform */
    _sharedAudioUrl: null,
  };

  /* ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===== */

  function _normalizeLangCode(code) {
    if (!code) return '';
    return String(code).toLowerCase().trim();
  }

  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  function getDraftUserIdForKey() {
    try {
      if (window.UserManager && typeof window.UserManager.getUserId === 'function') {
        return 'draft_' + window.UserManager.getUserId();
      }
    } catch (e) {}
    return 'draft_unknown';
  }

  /* ===== AUDIO MANAGER ===== */

  function _ensureAudioManager() {
    if (state.audioManager) return state.audioManager;
    if (window.audioManager) {
      state.audioManager = window.audioManager;
      return state.audioManager;
    }
    if (typeof AudioManagerClass !== 'undefined') {
      state.audioManager = new AudioManagerClass();
      window.audioManager = state.audioManager;
      return state.audioManager;
    }
    return null;
  }

  /* ===== DIRTY FLAGS / SAVE SYSTEM ===== */

  function _getDirtyFlags() {
    return state.dirtyFlags || { db: false, audio: false, cover: false };
  }

  function _setDirtyFlags(next) {
    if (!state.dirtyFlags) state.dirtyFlags = { db: false, audio: false, cover: false };
    if (next.db === true) state.dirtyFlags.db = true;
    if (next.db === false) state.dirtyFlags.db = false;
    if (next.audio === true) state.dirtyFlags.audio = true;
    if (next.audio === false) state.dirtyFlags.audio = false;
    if (next.cover === true) state.dirtyFlags.cover = true;
    if (next.cover === false) state.dirtyFlags.cover = false;
    _updateUnsavedStar();
  }

  function _hasUnsavedChanges() {
    var f = _getDirtyFlags();
    return !!(f.db || f.audio || f.cover);
  }

  function _updateUnsavedStar() {
    var flags = _getDirtyFlags();

    var dbStar = document.getElementById('dictationEditorModalUnsavedStarDb');
    if (dbStar) {
      dbStar.style.display = flags.db ? 'inline-flex' : 'none';
      dbStar.style.color = 'var(--color-button-text-lightgreen, #2ecc71)';
      dbStar.title = 'Изменения в тексте/БД';
    }

    var audioStar = document.getElementById('dictationEditorModalUnsavedStarAudio');
    if (audioStar) {
      audioStar.style.display = flags.audio ? 'inline-flex' : 'none';
      audioStar.style.color = 'var(--color-button-purple, #9b59b6)';
      audioStar.title = 'Изменения в аудио';
    }

    var coverStar = document.getElementById('dictationEditorModalUnsavedStarCover');
    if (coverStar) {
      coverStar.style.display = flags.cover ? 'inline-flex' : 'none';
      coverStar.style.color = 'var(--color-button-text-yellow, #f1c40f)';
      coverStar.title = 'Изменения в обложке';
    }
  }

  /* ===== SET BUTTON STATE (AUDIO PLAYBACK) ===== */

  function _setButtonState(button, stateStr) {
    if (!button) return;
    if (stateStr) {
      button.dataset.state = stateStr;
    }
    var s = button.dataset.state || 'ready';
    var newIcon = '';
    switch (s) {
      case 'ready':
      case 'ready-shared':
        newIcon = 'play';
        break;
      case 'playing':
      case 'playing-shared':
        newIcon = 'pause';
        break;
      case 'creating':
        newIcon = 'hammer';
        break;
      case 'creating_mic':
        newIcon = 'mic';
        break;
      default:
        newIcon = 'play';
    }
    button.innerHTML = '<i data-lucide="' + newIcon + '"></i>';
    button.dataset.state = s;
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  /* ===== РАБОТА С ТАБЛИЦЕЙ ===== */

  function _toggleColumnGroup(group) {
    var table = document.getElementById(TABLE_ID);
    if (!table) return;
    table.classList.remove('state-original-translation', 'state-original-editing');
    if (group === 'original') {
      table.classList.add('state-original-editing');
    } else if (group === 'translation') {
      table.classList.add('state-original-translation');
    }
  }

  function _toggleCheckboxColumn(show) {
    var header = document.querySelector('#' + TABLE_ID + ' th.col-checkbox-create-audio');
    var cells = document.querySelectorAll('#' + TABLE_ID + ' td.col-checkbox-create-audio');
    if (header) {
      header.style.display = show ? 'table-cell' : 'none';
    }
    cells.forEach(function (cell) {
      cell.style.display = show ? 'table-cell' : 'none';
      if (show) {
        var btn = cell.querySelector('.checkbox-btn');
        if (btn) {
          var key = btn.dataset.key;
          if (key && state.content) {
            var sentence = state.content.getSentence(key);
            var isChecked = sentence ? sentence.checked === true : false;
            var icon = btn.querySelector('.checkbox-icon');
            if (icon) {
              icon.setAttribute('data-lucide', isChecked ? 'circle-check' : 'circle');
            }
          }
        }
      }
    });
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }

  function _toggleCreateAudioColumns(show) {
    var table = document.getElementById(TABLE_ID);
    if (!table) return;

    var setDisplay = function (el, value) {
      if (value === null) {
        el.style.display = '';
      } else {
        el.style.display = value;
      }
    };

    var headers = table.querySelectorAll('th.panel-create-audio');
    var cells = table.querySelectorAll('td.panel-create-audio');

    headers.forEach(function (th) {
      setDisplay(th, show ? 'table-cell' : null);
    });
    cells.forEach(function (td) {
      setDisplay(td, show ? 'table-cell' : null);
    });

    var translationHeaders = table.querySelectorAll('th.panel-translation');
    var translationCells = table.querySelectorAll('td.panel-translation');

    translationHeaders.forEach(function (th) {
      var isCreateAudioColumn = th.classList.contains('panel-create-audio') || th.classList.contains('col-translation');
      if (show && isCreateAudioColumn) {
        setDisplay(th, 'table-cell');
      } else if (!show) {
        setDisplay(th, null);
      }
    });

    translationCells.forEach(function (td) {
      var isCreateAudioColumn = td.classList.contains('panel-create-audio') || td.classList.contains('col-translation');
      if (show && isCreateAudioColumn) {
        setDisplay(td, 'table-cell');
      } else if (!show) {
        setDisplay(td, null);
      }
    });

    var editingColumns = table.querySelectorAll('.panel-editing-avto, .panel-editing-user, .panel-editing-mic');
    editingColumns.forEach(function (col) {
      if (show) {
        if (!col.classList.contains('panel-create-audio')) {
          col.dataset.prevDisplay = col.style.display || '';
          setDisplay(col, 'none');
        } else {
          setDisplay(col, 'table-cell');
        }
      } else {
        if (col.classList.contains('panel-create-audio')) {
          setDisplay(col, null);
        } else if ('prevDisplay' in col.dataset) {
          setDisplay(col, col.dataset.prevDisplay || null);
          delete col.dataset.prevDisplay;
        } else {
          setDisplay(col, null);
        }
      }
    });
  }

  function _applyTableViewForTab(tabName) {
    var table = document.getElementById(TABLE_ID);
    if (!table) return;

    state.currentTabName = tabName;

    // Сбрасываем все колонки в display:none (кроме базовых: №, scrolling)
    var allCols = table.querySelectorAll('th, td');
    allCols.forEach(function (el) {
      // Базовые колонки всегда visible
      if (el.classList.contains('col-number') || el.classList.contains('col-scrolling')) {
        el.style.display = 'table-cell';
      } else {
        el.style.display = 'none';
      }
    });

    // Определяем, какое радио выбрано (для закладок general и voice-translations)
    var checkedRadio = document.querySelector('input[name="editorModalVoiceMode"]:checked');
    var voiceMode = checkedRadio ? checkedRadio.value : 'auto';

    // Функция показать колонки по селектору
    function showCols(selector) {
      var els = table.querySelectorAll(selector);
      els.forEach(function (el) { el.style.display = 'table-cell'; });
    }

    // Функция показать только аудио-кнопку (a/f/m) по радио (те, у кого есть panel-create-audio)
    function showAudioBtnByVoiceMode() {
      if (voiceMode === 'auto') {
        showCols('.panel-editing-avto.panel-create-audio');
      } else if (voiceMode === 'have') {
        showCols('.panel-editing-user.panel-create-audio');
      } else if (voiceMode === 'self') {
        showCols('.panel-editing-mic.panel-create-audio');
      }
    }

    if (tabName === 'general') {
      // №, Оригинал, a/f/m (только аудио-кнопка по радио), Перевод, t
      showCols('.panel-original');
      showCols('.panel-translation');
      showAudioBtnByVoiceMode();
    } else if (tabName === 'voice-original-auto') {
      // №, Оригинал, a (все колонки группы avto)
      showCols('.panel-original');
      showCols('.panel-editing-avto');
    } else if (tabName === 'voice-original-have') {
      // №, Оригинал, f, Start, End (все колонки группы user)
      showCols('.panel-original');
      showCols('.panel-editing-user');
    } else if (tabName === 'voice-original-self') {
      // №, Оригинал, m (все колонки группы mic)
      showCols('.panel-original');
      showCols('.panel-editing-mic');
    } else if (tabName === 'voice-translations') {
      // №, Оригинал, a/f/m (только аудио-кнопка по радио), Перевод, t
      showCols('.panel-original');
      showCols('.panel-translation');
      showAudioBtnByVoiceMode();
    } else if (tabName === 'create-audio') {
      showCols('.panel-original');
      showCols('.panel-translation');
      showCols('.panel-create-audio');
      showCols('.col-checkbox-create-audio');
    }

    // Спикер — только для диалогов
    var showSpeaker = (tabName !== 'exercises') && (state.currentDictation && state.currentDictation.is_dialog);
    var speakerHeader = table.querySelector('th.col-speaker');
    if (speakerHeader) {
      speakerHeader.style.display = showSpeaker ? 'table-cell' : 'none';
    }
    var speakerCells = table.querySelectorAll('td.col-speaker');
    speakerCells.forEach(function (td) { td.style.display = showSpeaker ? 'table-cell' : 'none'; });

    _updateExplanationColumnVisibility();
  }

  function _updateExplanationColumnVisibility() {
    var showExplanation = state.currentDictation && state.currentDictation.show_explanation;
    var headers = document.querySelectorAll('#' + TABLE_ID + ' th.col-explanation');
    var cells = document.querySelectorAll('#' + TABLE_ID + ' td.col-explanation');
    headers.forEach(function (el) { el.style.display = showExplanation ? 'table-cell' : 'none'; });
    cells.forEach(function (el) { el.style.display = showExplanation ? 'table-cell' : 'none'; });
  }

  /* ===== НАВИГАЦИЯ ПО СТРОКАМ ===== */

  function _selectSentenceRow(row) {
    if (!row) return;
    var table = document.getElementById(TABLE_ID);
    if (!table) return;
    table.querySelectorAll('tbody tr.selected').forEach(function (r) { r.classList.remove('selected'); });
    row.classList.add('selected');
    _updateCurrentRowNumber();

    // Обновляем панель над волной: текст текущей строки
    var key = row.dataset.key;
    if (key && state.content) {
      var cores = state.content.getAllSentenceCores();
      var found = null;
      for (var i = 0; i < cores.length; i++) {
        if (cores[i].key === key) {
          found = cores[i];
          break;
        }
      }
      if (found) {
        // Обновляем текст оригинала в панели над волной
        var sentenceTextEl = document.getElementById('editorModalWaveformSentenceText');
        if (sentenceTextEl) {
          sentenceTextEl.textContent = found.text_original || '—';
        }
      }
    }

    // Обновляем регионы волны и поля Start/End под волной при выборе строки
    var wf = window.editorModalWaveform;
    if (wf) {
      if (key && state.content) {
        var cores = state.content.getAllSentenceCores();
        var found = null;
        for (var i = 0; i < cores.length; i++) {
          if (cores[i].key === key) {
            found = cores[i];
            break;
          }
        }
        if (found && found.start !== undefined && found.start !== '' && found.end !== undefined && found.end !== '') {
          var startVal = parseFloat(found.start);
          var endVal = parseFloat(found.end);
          if (!isNaN(startVal) && !isNaN(endVal)) {
            wf.setRegion(startVal, endVal);
            // Также обновляем поля под волной
            var startInput = document.getElementById('editorModalAudioStartTime');
            var endInput = document.getElementById('editorModalAudioEndTime');
            if (startInput) startInput.value = startVal.toFixed(2);
            if (endInput) endInput.value = endVal.toFixed(2);
          }
        }
      }
    }
  }

  function _updateCurrentRowNumber() {
    var currentRow = document.querySelector('#' + TABLE_ID + ' tbody tr.selected');
    var rowNumberSpan = document.getElementById('editorModalCurrentRowNumber');
    if (currentRow && rowNumberSpan) {
      var rowNumber = currentRow.querySelector('.col-number')?.textContent || '1';
      rowNumberSpan.textContent = rowNumber;
    }
  }

  function _navigateToPreviousRow() {
    var currentRow = document.querySelector('#' + TABLE_ID + ' tbody tr.selected');
    if (!currentRow) return;
    var prevRow = currentRow.previousElementSibling;
    if (prevRow) {
      _selectSentenceRow(prevRow);
    }
  }

  function _navigateToNextRow() {
    var currentRow = document.querySelector('#' + TABLE_ID + ' tbody tr.selected');
    if (!currentRow) return;
    var nextRow = currentRow.nextElementSibling;
    if (nextRow) {
      _selectSentenceRow(nextRow);
    }
  }

  /* ===== РЕНДЕРИНГ ТАБЛИЦЫ ===== */

  function _renderTable() {
    var table = document.getElementById(TABLE_ID);
    if (!table) return;
    var tbody = table.querySelector('tbody');
    if (!tbody) return;

    var cores = state.content ? state.content.getAllSentenceCores() : [];
    tbody.innerHTML = '';

    cores.forEach(function (s, index) {
      var key = s.key || 's_' + index;

      var tr = document.createElement('tr');
      tr.dataset.key = key;

      // №
      var tdNum = document.createElement('td');
      tdNum.className = 'col-number';
      tdNum.textContent = index + 1;
      tr.appendChild(tdNum);

      // Спикер
      var tdSpeaker = document.createElement('td');
      tdSpeaker.className = 'col-speaker';
      tdSpeaker.style.display = 'none';
      tdSpeaker.textContent = s.speaker || '';
      tr.appendChild(tdSpeaker);

      // Оригинал
      var tdOrig = document.createElement('td');
      tdOrig.className = 'col-original panel-original';
      var origInput = document.createElement('input');
      origInput.type = 'text';
      origInput.className = 'table-input';
      origInput.value = s.text_original || '';
      origInput.dataset.key = key;
      origInput.dataset.field = 'text_original';
      origInput.addEventListener('change', function () {
        if (state.content) {
          var sentence = state.content.getSentence(key);
          if (sentence) {
            sentence.text_original = this.value;
            _setDirtyFlags({ db: true });
          }
        }
      });
      tdOrig.appendChild(origInput);
      tr.appendChild(tdOrig);

      // Generate TTS (audio) — кнопка o
      var tdGenTts = document.createElement('td');
      tdGenTts.className = 'col-generate-tts panel-editing-avto panel-create-audio';
      var genTtsBtn = document.createElement('button');
      genTtsBtn.type = 'button';
      genTtsBtn.className = 'audio-btn';
      genTtsBtn.dataset.key = key;
      genTtsBtn.dataset.lang = state.config?.originalLanguage || '';
      genTtsBtn.dataset.field = 'audio';
      genTtsBtn.dataset.state = s.audio ? 'ready' : 'creating';
      genTtsBtn.style.background = 'none';
      genTtsBtn.style.border = 'none';
      genTtsBtn.style.cursor = 'pointer';
      genTtsBtn.style.padding = '2px';
      genTtsBtn.innerHTML = '<i data-lucide="' + (s.audio ? 'play' : 'hammer') + '"></i>';
      tdGenTts.appendChild(genTtsBtn);
      tr.appendChild(tdGenTts);

      // Play audio (user) — кнопка f
      var tdPlayAudio = document.createElement('td');
      tdPlayAudio.className = 'col-play-audio panel-editing-user panel-create-audio';
      var playUserBtn = document.createElement('button');
      playUserBtn.type = 'button';
      playUserBtn.className = 'audio-btn';
      playUserBtn.dataset.key = key;
      playUserBtn.dataset.lang = state.config?.originalLanguage || '';
      playUserBtn.dataset.field = 'audio_file';
      playUserBtn.dataset.state = s.audio_file ? 'ready' : 'creating';
      playUserBtn.style.background = 'none';
      playUserBtn.style.border = 'none';
      playUserBtn.style.cursor = 'pointer';
      playUserBtn.style.padding = '2px';
      playUserBtn.innerHTML = '<i data-lucide="' + (s.audio_file ? 'play' : 'hammer') + '"></i>';
      tdPlayAudio.appendChild(playUserBtn);
      tr.appendChild(tdPlayAudio);

      // Play audio (mic) — кнопка m
      var tdPlayMic = document.createElement('td');
      tdPlayMic.className = 'col-play-audio panel-editing-mic panel-create-audio';
      var playMicBtn = document.createElement('button');
      playMicBtn.type = 'button';
      playMicBtn.className = 'audio-btn';
      playMicBtn.dataset.key = key;
      playMicBtn.dataset.lang = state.config?.originalLanguage || '';
      playMicBtn.dataset.field = 'audio_mic';
      playMicBtn.dataset.state = s.audio_mic ? 'ready' : 'creating';
      playMicBtn.style.background = 'none';
      playMicBtn.style.border = 'none';
      playMicBtn.style.cursor = 'pointer';
      playMicBtn.style.padding = '2px';
      playMicBtn.innerHTML = '<i data-lucide="' + (s.audio_mic ? 'play' : 'hammer') + '"></i>';
      tdPlayMic.appendChild(playMicBtn);
      tr.appendChild(tdPlayMic);

      // Чекбокс
      var tdCheckbox = document.createElement('td');
      tdCheckbox.className = 'col-checkbox-create-audio';
      tdCheckbox.style.display = 'none';
      var checkboxBtn = document.createElement('button');
      checkboxBtn.className = 'checkbox-btn';
      checkboxBtn.dataset.key = key;
      checkboxBtn.type = 'button';
      checkboxBtn.style.background = 'none';
      checkboxBtn.style.border = 'none';
      checkboxBtn.style.cursor = 'pointer';
      checkboxBtn.style.padding = '2px';
      var checkboxIcon = document.createElement('i');
      checkboxIcon.className = 'checkbox-icon';
      checkboxIcon.setAttribute('data-lucide', s.checked ? 'circle-check' : 'circle');
      checkboxIcon.style.width = '18px';
      checkboxIcon.style.height = '18px';
      checkboxBtn.appendChild(checkboxIcon);
      tdCheckbox.appendChild(checkboxBtn);
      tr.appendChild(tdCheckbox);

      // Перевод
      var tdTrans = document.createElement('td');
      tdTrans.className = 'col-translation panel-translation';
      var transInput = document.createElement('input');
      transInput.type = 'text';
      transInput.className = 'table-input';
      transInput.value = s.text_translation || '';
      transInput.dataset.key = key;
      transInput.dataset.field = 'text_translation';
      transInput.addEventListener('change', function () {
        if (state.content) {
          var sentence = state.content.getSentence(key);
          if (sentence) {
            sentence.text_translation = this.value;
            _setDirtyFlags({ db: true });
          }
        }
      });
      tdTrans.appendChild(transInput);
      tr.appendChild(tdTrans);

      // Play translation — кнопка t
      var tdPlayTrans = document.createElement('td');
      tdPlayTrans.className = 'col-play-translation panel-translation panel-create-audio';
      var playTransBtn = document.createElement('button');
      playTransBtn.type = 'button';
      playTransBtn.className = 'audio-btn';
      playTransBtn.dataset.key = key;
      playTransBtn.dataset.lang = state.config?.translationLanguage || '';
      playTransBtn.dataset.field = 'audio_translation';
      playTransBtn.dataset.state = s.audio_translation ? 'ready' : 'creating';
      playTransBtn.style.background = 'none';
      playTransBtn.style.border = 'none';
      playTransBtn.style.cursor = 'pointer';
      playTransBtn.style.padding = '2px';
      playTransBtn.innerHTML = '<i data-lucide="' + (s.audio_translation ? 'play' : 'hammer') + '"></i>';
      tdPlayTrans.appendChild(playTransBtn);
      tr.appendChild(tdPlayTrans);

      // Explanation
      var tdExpl = document.createElement('td');
      tdExpl.className = 'col-explanation';
      tdExpl.style.display = 'none';
      tdExpl.textContent = s.explanation || '';
      tr.appendChild(tdExpl);

      // Start
      var tdStart = document.createElement('td');
      tdStart.className = 'col-start panel-editing-user';
      var startLabel = document.createElement('span');
      startLabel.className = 'time-label';
      startLabel.textContent = (s.start != null && s.start !== '') ? s.start : '';
      tdStart.appendChild(startLabel);
      tr.appendChild(tdStart);

      // End
      var tdEnd = document.createElement('td');
      tdEnd.className = 'col-end panel-editing-user';
      var endLabel = document.createElement('span');
      endLabel.className = 'time-label';
      endLabel.textContent = (s.end != null && s.end !== '') ? s.end : '';
      tdEnd.appendChild(endLabel);
      tr.appendChild(tdEnd);

      // Scrolling
      var tdScroll = document.createElement('td');
      tdScroll.className = 'col-scrolling';
      tr.appendChild(tdScroll);

      // Click to select row
      tr.addEventListener('click', function () {
        _selectSentenceRow(this);
      });

      tbody.appendChild(tr);
    });

    // Выбираем первую строку
    var firstRow = tbody.querySelector('tr');
    if (firstRow) {
      _selectSentenceRow(firstRow);
    }

    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }

    _applyTableViewForTab(state.currentTabName);
  }

  /* ===== ОБРАБОТКА АУДИО (ПОЛНЫЙ МЕХАНИЗМ) ===== */

  function _getSentenceForButton(button) {
    if (!button || !state.content) return null;
    var key = button.dataset.key;
    if (!key) return null;
    return state.content.getSentence(key);
  }

  function _handleAudioPlayback(event) {
    var button = event.currentTarget;
    if (!button) return;

    var key = button.dataset.key;
    var lang = button.dataset.lang;
    var field = button.dataset.field;

    if (!key || !lang || !field) return;

    var am = _ensureAudioManager();
    if (!am) {
      console.warn('[dictationEditorModal] AudioManager not available');
      return;
    }

    var sentence = _getSentenceForButton(button);
    var audioFilename = sentence ? (sentence[field] || null) : null;
    var currentState = button.dataset.state || 'ready';

    // Если audioManager уже играет с этой кнопки — ставим на паузу
    if (currentState === 'playing' || currentState === 'playing-shared') {
      if (typeof am.pause === 'function') {
        am.pause();
      } else if (typeof am.stop === 'function') {
        am.stop();
      }
      _setButtonState(button, 'ready');
      return;
    }

    // Если файла нет — переключаем в режим создания (молоток)
    if (!audioFilename) {
      _setButtonState(button, 'creating');
      return;
    }

    // Если кнопка в состоянии 'creating' (молоток) — обрезаем аудио
    if (currentState === 'creating') {
      _handleCutAudioForSentence(button, sentence, lang, field);
      return;
    }

    // Останавливаем предыдущее аудио, если оно играет с другой кнопки
    if (am.currentButton && am.currentButton !== button) {
      if (typeof am.stop === 'function') {
        am.stop();
      }
    }

    var audioUrl = am.buildDictationAudioUrl(state.config.dictationId, lang, audioFilename);
    if (!audioUrl) return;

    // Воспроизводим через audioManager
    if (typeof am.play === 'function') {
      am.play(button, audioUrl, {
        onEnd: function () {
          _setButtonState(button, 'ready');
        }
      });
      _setButtonState(button, 'playing');
    } else {
      // Fallback: просто new Audio
      try {
        var audio = new Audio(audioUrl);
        audio.play().catch(function (err) {
          console.warn('[dictationEditorModal] Audio play error', err);
        });
        _setButtonState(button, 'playing');
        audio.addEventListener('ended', function () {
          _setButtonState(button, 'ready');
        });
      } catch (e) {
        console.warn('[dictationEditorModal] Audio creation error', e);
      }
    }
  }

  /**
   * Обрезает исходное общее аудио по start/end предложения через /cut-audio,
   * сохраняет результат в CacheStorage через AudioManager,
   * обновляет sentence.audio_file и проигрывает.
   */
  async function _handleCutAudioForSentence(button, sentence, lang, field) {
    if (!sentence) return;
    if (!state._sharedAudioFile) {
      console.warn('[dictationEditorModal] Нет shared audio file для обрезания');
      return;
    }

    var startVal = parseFloat(sentence.start);
    var endVal = parseFloat(sentence.end);
    if (isNaN(startVal) || isNaN(endVal)) {
      console.warn('[dictationEditorModal] Некорректные start/end для обрезания');
      return;
    }

    var dictationId = state.config ? state.config.dictationId : '';
    if (!dictationId) return;

    _setButtonState(button, 'creating'); // Показываем молоток (загрузка)

    try {
      // Читаем shared audio file как base64
      var file = state._sharedAudioFile;
      var base64 = await _readFileAsBase64(file);

      var body = {
        dictation_id: dictationId,
        filename: state._sharedAudioFilename || 'audio.' + (file.name ? file.name.split('.').pop() : 'mp3'),
        audio_b64: base64,
        mime: file.type || 'audio/mpeg',
        start_time: startVal,
        end_time: endVal,
        language: lang
      };

      var response = await fetch('/cut-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      var data = await response.json();
      if (!data.success || !data.audio_b64) {
        console.error('[dictationEditorModal] Ошибка обрезания аудио:', data.error);
        return;
      }

      // Создаём blob из audio_b64
      var binaryStr = atob(data.audio_b64);
      var bytes = new Uint8Array(binaryStr.length);
      for (var j = 0; j < binaryStr.length; j++) {
        bytes[j] = binaryStr.charCodeAt(j);
      }
      var blob = new Blob([bytes], { type: data.mime || file.type || 'audio/mpeg' });

      // Генерируем имя файла
      var newFilename = 'cut_' + sentence.key + '_' + Date.now() + '.mp3';

      // Сохраняем в CacheStorage через AudioManager (вместо draft cache)
      var am = _ensureAudioManager();
      if (am && typeof am.saveDictationAudioBlob === 'function') {
        await am.saveDictationAudioBlob(dictationId, lang, newFilename, blob, data.mime || file.type || 'audio/mpeg');
      }

      // Обновляем sentence
      sentence.audio_file = newFilename;

      // Устанавливаем dirty flags
      _setDirtyFlags({ db: true, audio: true });

      // Строим canonical URL через AudioManager и проигрываем
      if (am && typeof am.play === 'function') {
        var canonicalUrl = am.buildDictationAudioUrl(dictationId, lang, newFilename);
        am.play(button, canonicalUrl, {
          onEnd: function () {
            _setButtonState(button, 'ready');
          }
        });
        _setButtonState(button, 'playing');
      } else {
        // Fallback: создаём blob URL напрямую
        try {
          var blobUrl = URL.createObjectURL(blob);
          var audio = new Audio(blobUrl);
          audio.play().catch(function (err) {
            console.warn('[dictationEditorModal] Audio play error', err);
          });
          _setButtonState(button, 'playing');
          audio.addEventListener('ended', function () {
            _setButtonState(button, 'ready');
          });
        } catch (e) {
          console.warn('[dictationEditorModal] Audio creation error', e);
        }
      }
    } catch (e) {
      console.error('[dictationEditorModal] cut audio error', e);
      _setButtonState(button, 'creating');
    }
  }

  function _readFileAsBase64(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function (e) {
        var base64 = e.target.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = function (e) {
        reject(e);
      };
      reader.readAsDataURL(file);
    });
  }

  /**
   * Загружает все аудиофайлы из CacheStorage на B2 через AudioManager.
   * Собирает canonical URLs для всех audio_file в предложениях и передаёт
   * в AudioManager.uploadDictationAudioFromCacheToB2().
   */
  async function _uploadDraftAudioToB2(dictationId, token) {
    if (!state.content || !dictationId || !token) return;

    // Нормализуем dictationId: добавляем префикс dict_ если его нет
    var normalizedId = String(dictationId || '').trim();
    if (normalizedId && !normalizedId.startsWith('dict_')) {
      normalizedId = 'dict_' + normalizedId;
    }
    dictationId = normalizedId;

    var lang = state.content.langOrig || (state.config ? state.config.originalLanguage : '');
    if (!lang) return;

    var am = _ensureAudioManager();
    if (!am || typeof am.uploadDictationAudioFromCacheToB2 !== 'function') {
      console.warn('[dictationEditorModal] AudioManager.uploadDictationAudioFromCacheToB2 not available');
      return;
    }

    var sentences = state.content.getAllSentenceCores();
    var langCode = String(lang).toLowerCase().trim();

    // Собираем canonical URLs для всех файлов, которые есть в предложениях
    var urls = [];
    for (var i = 0; i < sentences.length; i++) {
      var s = sentences[i];
      var filename = s.audio_file;
      if (!filename) continue;
      urls.push(am.buildDictationAudioUrl(dictationId, langCode, filename));
    }

    // Добавляем shared audio файл, если он есть
    if (state._sharedAudioFilename) {
      urls.push(am.buildDictationAudioUrl(dictationId, langCode, state._sharedAudioFilename));
    }

    if (urls.length === 0) return;

    try {
      var result = await am.uploadDictationAudioFromCacheToB2({
        dictationId: dictationId,
        token: token,
        urls: urls,
        onUploaded: function (uploadedUrl) {
          console.log('[dictationEditorModal] B2 upload success:', uploadedUrl);
        },
        onProgress: function (progress) {
          // Можно добавить индикатор прогресса при необходимости
        }
      });

      if (result && result.failed && result.failed.length > 0) {
        console.warn('[dictationEditorModal] Некоторые файлы не загрузились на B2:', result.failed);
      }
    } catch (e) {
      console.warn('[dictationEditorModal] B2 upload error', e);
    }
  }

  function _bindAudioPlaybackHandlers() {
    var table = document.getElementById(TABLE_ID);
    if (!table) return;

    var playButtons = table.querySelectorAll('.audio-btn');
    playButtons.forEach(function (btn) {
      btn.removeEventListener('click', _handleAudioPlayback);
      btn.addEventListener('click', _handleAudioPlayback);
    });
  }

  /* ===== КНОПКИ УПРАВЛЕНИЯ ТАБЛИЦЕЙ ===== */

  function _setupTableControls() {
    var prevBtn = document.getElementById('editorModalPrevRowBtn');
    if (prevBtn && !prevBtn.getAttribute('data-table-control-handler')) {
      prevBtn.setAttribute('data-table-control-handler', '1');
      prevBtn.addEventListener('click', _navigateToPreviousRow);
    }

    var nextBtn = document.getElementById('editorModalNextRowBtn');
    if (nextBtn && !nextBtn.getAttribute('data-table-control-handler')) {
      nextBtn.setAttribute('data-table-control-handler', '1');
      nextBtn.addEventListener('click', _navigateToNextRow);
    }

    var rowNumberSpan = document.getElementById('editorModalCurrentRowNumber');
    if (rowNumberSpan && !rowNumberSpan.getAttribute('data-table-control-handler')) {
      rowNumberSpan.setAttribute('data-table-control-handler', '1');
      rowNumberSpan.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          rowNumberSpan.blur();
          return;
        }
        var allowedKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Tab'];
        if (!/^\d$/.test(event.key) && !allowedKeys.includes(event.key)) {
          event.preventDefault();
        }
      });

      rowNumberSpan.addEventListener('blur', function () {
        var rows = Array.from(document.querySelectorAll('#' + TABLE_ID + ' tbody tr'));
        if (!rows.length) {
          rowNumberSpan.textContent = '1';
          return;
        }
        var rawValue = rowNumberSpan.textContent.replace(/[^\d]/g, '');
        var targetNumber = parseInt(rawValue, 10);
        if (isNaN(targetNumber)) {
          _updateCurrentRowNumber();
          return;
        }
        if (targetNumber < 1) targetNumber = 1;
        if (targetNumber > rows.length) targetNumber = rows.length;
        var targetRow = rows[targetNumber - 1];
        if (targetRow) {
          _selectSentenceRow(targetRow);
        } else {
          _updateCurrentRowNumber();
        }
      });
    }

    var addBtn = document.getElementById('editorModalAddRowBtn');
    if (addBtn && !addBtn.getAttribute('data-table-control-handler')) {
      addBtn.setAttribute('data-table-control-handler', '1');
      addBtn.addEventListener('click', function () {
        if (typeof window.DesktopConfirmModal !== 'undefined' && window.DesktopConfirmModal.open) {
          window.DesktopConfirmModal.open({
            title: 'Добавить строку',
            message: 'Куда добавить новую строку?',
            buttons: [
              { text: 'Выше', class: 'modal-btn modal-btn-secondary', callback: function () { _addNewRow('above'); } },
              { text: 'Ниже', class: 'modal-btn modal-btn-secondary', callback: function () { _addNewRow('below'); } },
              { text: 'Отмена', class: 'modal-btn modal-btn-secondary transparent' },
            ]
          });
        } else {
          _addNewRow('below');
        }
      });
    }

    var deleteBtn = document.getElementById('editorModalDeleteRowBtn');
    if (deleteBtn && !deleteBtn.getAttribute('data-table-control-handler')) {
      deleteBtn.setAttribute('data-table-control-handler', '1');
      deleteBtn.addEventListener('click', function () {
        var selectedRow = document.querySelector('#' + TABLE_ID + ' tbody tr.selected');
        if (!selectedRow) return;
        if (typeof window.DesktopConfirmModal !== 'undefined' && window.DesktopConfirmModal.open) {
          window.DesktopConfirmModal.open({
            title: 'Удалить строку',
            message: 'Вы уверены, что хотите удалить эту строку?',
            buttons: [
              { text: 'Удалить', class: 'modal-btn modal-btn-danger', callback: function () { _deleteRow(selectedRow); } },
              { text: 'Отмена', class: 'modal-btn modal-btn-secondary transparent' },
            ]
          });
        } else {
          _deleteRow(selectedRow);
        }
      });
    }

    var toggleExplBtn = document.getElementById('editorModalToggleExplanationBtn');
    if (toggleExplBtn && !toggleExplBtn.getAttribute('data-table-control-handler')) {
      toggleExplBtn.setAttribute('data-table-control-handler', '1');
      toggleExplBtn.addEventListener('click', function () {
        if (!state.currentDictation) state.currentDictation = {};
        state.currentDictation.show_explanation = !state.currentDictation.show_explanation;
        _updateExplanationColumnVisibility();
      });
    }

    var refillBtn = document.getElementById('editorModalRefillTableBtn');
    if (refillBtn && !refillBtn.getAttribute('data-table-control-handler')) {
      refillBtn.setAttribute('data-table-control-handler', '1');
      refillBtn.addEventListener('click', function () {
        if (typeof window.DesktopConfirmModal !== 'undefined' && window.DesktopConfirmModal.open) {
          window.DesktopConfirmModal.open({
            title: 'Перезаполнить таблицу',
            message: 'Это действие перезапишет все строки. Продолжить?',
            buttons: [
              { text: 'Перезаполнить', class: 'modal-btn modal-btn-primary', callback: function () { _refillTable(); } },
              { text: 'Отмена', class: 'modal-btn modal-btn-secondary transparent' },
            ]
          });
        } else {
          _refillTable();
        }
      });
    }
  }

  function _addNewRow(position) {
    var table = document.getElementById(TABLE_ID);
    if (!table) return;
    var tbody = table.querySelector('tbody');
    if (!tbody) return;

    var selectedRow = tbody.querySelector('tr.selected');
    if (!state.content) return;

    var cores = state.content.getAllSentenceCores();
    var maxKey = 0;
    cores.forEach(function (s) {
      var num = parseInt(String(s.key).replace('s_', '') || '0', 10);
      if (num > maxKey) maxKey = num;
    });
    var newKey = 's_' + (maxKey + 1);

    var newSentence = {
      key: newKey,
      position: null,
      text_original: '',
      text_translation: '',
      audio_original: '',
      audio_translation: '',
      audio_file: null,
      audio_mic: null,
      start: '',
      end: '',
      checked: false,
      explanation: '',
      speaker: '',
    };

    if (position === 'above' && selectedRow) {
      var index = Array.from(tbody.children).indexOf(selectedRow);
      state.content._sentences.splice(index, 0, newSentence);
    } else {
      state.content._sentences.push(newSentence);
    }

    _setDirtyFlags({ db: true });
    _renderTable();
    _bindAudioPlaybackHandlers();
  }

  function _deleteRow(row) {
    if (!row) return;
    var table = document.getElementById(TABLE_ID);
    if (!table) return;
    var tbody = table.querySelector('tbody');
    if (!tbody) return;

    var key = row.dataset.key;
    if (!state.content) return;

    var index = state.content._sentences.findIndex(function (s) { return s.key === key; });
    if (index !== -1) {
      state.content._sentences.splice(index, 1);
    }

    _setDirtyFlags({ db: true });
    _renderTable();
    _bindAudioPlaybackHandlers();
  }

  function _refillTable() {
    _renderTable();
    _bindAudioPlaybackHandlers();
  }

  /* ===== ИНИЦИАЛИЗАЦИЯ ПОЛЕЙ ===== */

  function _setupCloseButton() {
    const closeBtn = document.getElementById('dictationEditorModalCloseBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', close);
    }
  }

  function _setupOverlayClose() {
    const modal = document.getElementById(MODAL_ID);
    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) {
          close();
        }
      });
    }
  }

  function _setupUserSection() {
    try {
      const avatarEl = document.getElementById('dictationEditorModalAvatar');
      if (avatarEl) {
        const sourceAvatar = document.querySelector('.user-avatar-small');
        if (sourceAvatar) {
          const bg = sourceAvatar.style.backgroundImage || '';
          if (bg) avatarEl.style.backgroundImage = bg;
        }
      }

      const usernameEl = document.getElementById('dictationEditorModalUsername');
      if (usernameEl) {
        const sourceName = document.querySelector('.username-text');
        usernameEl.textContent = sourceName ? (sourceName.textContent || '').trim() : '';
      }
    } catch (e) {
      console.warn('[dictationEditorModal] userSection error', e);
    }
  }

  function _initLanguageFlags() {
    try {
      const container = document.getElementById('editorModalLangPair');
      if (!container) return;
      if (!window.LanguageManager || typeof window.initLanguageSelector !== 'function') return;

      const languageData = window.LanguageManager.getLanguageData();
      if (!languageData || !state.config) return;

      const orig = _normalizeLangCode(state.config.originalLanguage);
      const tr = _normalizeLangCode(state.config.translationLanguage);

      const validOrig = languageData[orig] ? orig : '';
      const validTr = languageData[tr] ? tr : '';

      container.innerHTML = '';

      if (!validOrig && !validTr) {
        console.warn('[dictationEditorModal] No valid language codes for flags', { orig, tr });
        return;
      }

      if (validOrig && validTr) {
        state.headerLangPairSelector = window.initLanguageSelector('editorModalLangPair', {
          mode: 'flag-pair-fixed',
          currentLearning: validOrig,
          nativeLanguage: validTr,
          languageData: languageData
        });
      } else if (validOrig) {
        state.headerLangPairSelector = window.initLanguageSelector('editorModalLangPair', {
          mode: 'flag-single',
          currentLearning: validOrig,
          nativeLanguage: validOrig,
          languageData: languageData
        });
      }
    } catch (e) {
      console.warn('[dictationEditorModal] _initLanguageFlags error', e);
    }
  }

  function _initFormFields() {
    if (!state.config) return;

    const titleEl = document.getElementById('dictationEditorModalTitle');
    const titleInput = document.getElementById('dictationEditorModalTitleInput');
    if (titleEl && state.config.title) {
      titleEl.textContent = state.config.title;
    }
    if (titleInput && state.config.title) {
      titleInput.value = state.config.title;
    }

    const idEl = document.getElementById('dictation-editor-modal-id');
    if (idEl && state.config.dictationId) {
      idEl.textContent = '#' + state.config.dictationId;
    }

    const authorUrlInput = document.getElementById('dictationEditorModalAuthorUrl');
    if (authorUrlInput && state.config.authorMaterialsUrl) {
      authorUrlInput.value = state.config.authorMaterialsUrl;
    }

    const coverImg = document.getElementById('dictationEditorModalCoverImage');
    if (state.config.coverUrl) {
      if (coverImg) coverImg.src = state.config.coverUrl;
    }
  }

  function _initLevelSelector() {
    const control = document.getElementById('dictationEditorModalLevelSelect');
    if (!control) return;

    const button = control.querySelector('.speed-select-button');
    const valueSpan = control.querySelector('.level-select-value');
    const options = control.querySelectorAll('.speed-options li');

    if (!button || !valueSpan) return;

    const savedLevel = (state.config && state.config.level) || 'A1';
    valueSpan.textContent = savedLevel;

    options.forEach(function (opt) {
      if (opt.getAttribute('data-value') === savedLevel) {
        opt.classList.add('selected');
      } else {
        opt.classList.remove('selected');
      }
    });

    button.addEventListener('click', function (e) {
      e.stopPropagation();
      control.classList.toggle('open');
    });

    options.forEach(function (opt) {
      opt.addEventListener('click', function (e) {
        e.stopPropagation();
        const value = opt.getAttribute('data-value');
        valueSpan.textContent = value;
        options.forEach(function (o) { o.classList.remove('selected'); });
        opt.classList.add('selected');
        control.classList.remove('open');
        _setDirtyFlags({ db: true });
      });
    });

    document.addEventListener('click', function () {
      control.classList.remove('open');
    });
  }

  function _initVoiceModeRadios() {
    const radios = document.querySelectorAll('input[name="editorModalVoiceMode"]');
    if (!radios.length) return;

    const updateTabVisibility = function (selectedValue) {
      document.querySelectorAll('.dictation-editor-modal__tab-btn[data-voice-mode]').forEach(function (btn) {
        const mode = btn.getAttribute('data-voice-mode');
        btn.style.display = (mode === selectedValue) ? '' : 'none';
      });

      const activeTab = document.querySelector('.dictation-editor-modal__tab-btn.active');
      if (activeTab && activeTab.style.display === 'none') {
        const generalTab = document.querySelector('.dictation-editor-modal__tab-btn[data-tab="general"]');
        if (generalTab) {
          generalTab.click();
        }
      }
    };

    // Сначала сбрасываем радио в значение из config.
    // config.voice_mode может быть 'auto', 'have', 'self' (старый формат)
    // или config.audio_order может быть 'f', 'm', '' (новый формат из БД).
    // Маппинг: '' → 'auto', 'f' → 'have', 'm' → 'self'
    var voiceMode = state.config ? state.config.voice_mode : null;
    var audioOrder = state.config ? state.config.audio_order : null;
    
    // Если audio_order задан (из БД), используем его как источник истины
    if (audioOrder !== null && audioOrder !== undefined) {
      if (audioOrder === 'f') {
        voiceMode = 'have';
      } else if (audioOrder === 'm') {
        voiceMode = 'self';
      } else {
        voiceMode = 'auto';
      }
    }
    
    if (voiceMode) {
      radios.forEach(function (radio) {
        radio.checked = (radio.value === voiceMode);
      });
    } else {
      // Если voice_mode не указан, выбираем радио "auto" по умолчанию
      radios.forEach(function (radio) {
        if (radio.value === 'auto') {
          radio.checked = true;
        } else {
          radio.checked = false;
        }
      });
    }

    // Удаляем старые обработчики и вешаем новые (чтобы не было дублирования при повторном открытии)
    // Просто заменяем через клонирование — но проще хранить ссылку.
    // Используем подход: удаляем все старые listeners через замену элемента.
    // Но чтобы не ломать DOM, просто будем вешать обработчик один раз в init().
    // В _initVoiceModeRadios добавляем обработчики только если их ещё нет.
    var handlerAttr = 'data-voice-mode-handler';
    radios.forEach(function (radio) {
      if (radio.getAttribute(handlerAttr)) return; // уже есть обработчик
      radio.setAttribute(handlerAttr, '1');
      radio.addEventListener('change', function () {
        if (this.checked) {
          updateTabVisibility(this.value);
          // Обновляем таблицу, если мы на закладке, где радио влияет на колонки
          if (state.currentTabName === 'general' || state.currentTabName === 'voice-translations') {
            _applyTableViewForTab(state.currentTabName);
          }
          // Изменение режима голоса — это изменение в БД (voice_mode), зажигаем звезду
          _setDirtyFlags({ db: true });
        }
      });
    });

    // После сброса применяем видимость вкладок по выбранному значению
    const checkedRadio = document.querySelector('input[name="editorModalVoiceMode"]:checked');
    if (checkedRadio) {
      updateTabVisibility(checkedRadio.value);
    }
  }

  function _initCoverUpload() {
    const uploadBtn = document.getElementById('dictationEditorModalCoverUploadBtn');
    const fileInput = document.getElementById('dictationEditorModalCoverFile');
    const coverImage = document.getElementById('dictationEditorModalCoverImage');

    if (!uploadBtn || !fileInput) return;

    if (!uploadBtn.getAttribute('data-cover-handler')) {
      uploadBtn.setAttribute('data-cover-handler', '1');
      uploadBtn.addEventListener('click', function () {
        fileInput.click();
      });
    }

    if (!fileInput.getAttribute('data-cover-handler')) {
      fileInput.setAttribute('data-cover-handler', '1');
      fileInput.addEventListener('change', function (e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function (ev) {
          if (coverImage) coverImage.src = ev.target.result;
          _setDirtyFlags({ cover: true });
        };
        reader.readAsDataURL(file);
      });
    }
  }

  /* ===== ВКЛАДКА "Є АУДІО" (voice-original-have) ===== */

  function _initHaveAudioTab() {
    var selectBtn = document.getElementById('editorModalSelectFileBtn');
    var fileInput = document.getElementById('editorModalAudioFileInput');

    // Защита от дублирования обработчиков при повторных вызовах open()
    if (selectBtn && fileInput && !selectBtn.getAttribute('data-have-audio-handler')) {
      selectBtn.setAttribute('data-have-audio-handler', '1');
      selectBtn.addEventListener('click', function () {
        fileInput.click();
      });
    }

    if (fileInput && !fileInput.getAttribute('data-have-audio-handler')) {
      fileInput.setAttribute('data-have-audio-handler', '1');
      fileInput.addEventListener('change', function (e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        _uploadSharedAudioFile(file);
        // Сбрасываем value, чтобы можно было выбрать тот же файл повторно
        fileInput.value = '';
      });
    }

    // Кнопка "разрезать на 1000 кусков"
    var splitBtn = document.getElementById('editorModalSplitBtn');
    if (splitBtn && !splitBtn.getAttribute('data-have-audio-handler')) {
      splitBtn.setAttribute('data-have-audio-handler', '1');
      splitBtn.addEventListener('click', function () {
        _handleSplitAudio();
      });
    }

    // Кнопка "умная нарезка"
    var smartSplitBtn = document.getElementById('editorModalSmartSplitBtn');
    if (smartSplitBtn && !smartSplitBtn.getAttribute('data-have-audio-handler')) {
      smartSplitBtn.setAttribute('data-have-audio-handler', '1');
      smartSplitBtn.addEventListener('click', function () {
        _handleSmartSplit();
      });
    }

    // Кнопка воспроизведения под волной
    var playBtn = document.getElementById('editorModalAudioPlayBtn');
    if (playBtn && !playBtn.getAttribute('data-have-audio-handler')) {
      playBtn.setAttribute('data-have-audio-handler', '1');
      playBtn.addEventListener('click', function (event) {
        _handleSharedAudioPlayback(event);
      });
    }

    // Стрелки для полей Start/End
    document.querySelectorAll('.time-input-arrow').forEach(function (btn) {
      if (btn.getAttribute('data-have-audio-handler')) return;
      btn.setAttribute('data-have-audio-handler', '1');
      btn.addEventListener('click', function () {
        var targetId = this.dataset.target;
        var dir = this.dataset.dir;
        var input = document.getElementById(targetId);
        if (!input) return;
        var step = parseFloat(input.step) || 0.01;
        var val = parseFloat(input.value) || 0;
        if (dir === 'up') {
          val = Math.round((val + step) * 100) / 100;
        } else {
          val = Math.round((val - step) * 100) / 100;
          if (val < 0) val = 0;
        }
        input.value = val.toFixed(2);
        // Синхронизируем регион волны
        var field = targetId === 'editorModalAudioStartTime' ? 'start' : 'end';
        _syncWaveformRegion(field, val);
        // Синхронизируем с менеджером данных и лейблами таблицы
        _syncStartEndToSentence(field, val);
      });
    });

    // Ручной ввод в поля Start/End — синхронизация с волной и данными
    var startInput = document.getElementById('editorModalAudioStartTime');
    var endInput = document.getElementById('editorModalAudioEndTime');
    if (startInput && !startInput.getAttribute('data-have-audio-handler')) {
      startInput.setAttribute('data-have-audio-handler', '1');
      startInput.addEventListener('change', function () {
        var val = parseFloat(this.value);
        if (!isNaN(val) && val >= 0) {
          _syncWaveformRegion('start', val);
          _syncStartEndToSentence('start', val);
        }
      });
    }
    if (endInput && !endInput.getAttribute('data-have-audio-handler')) {
      endInput.setAttribute('data-have-audio-handler', '1');
      endInput.addEventListener('change', function () {
        var val = parseFloat(this.value);
        if (!isNaN(val) && val >= 0) {
          _syncWaveformRegion('end', val);
          _syncStartEndToSentence('end', val);
        }
      });
    }
  }

  function _uploadSharedAudioFile(file) {
    // Освобождаем старый blob URL, если был
    if (state._sharedAudioUrl && state._sharedAudioUrl.startsWith('blob:')) {
      URL.revokeObjectURL(state._sharedAudioUrl);
    }

    // Уничтожаем старый waveform, если есть
    if (window.editorModalWaveform) {
      window.editorModalWaveform.destroy();
      window.editorModalWaveform = null;
    }

    var audio = new Audio();
    var audioUrl = URL.createObjectURL(file);

    // Сохраняем URL, чтобы освободить при закрытии
    state._sharedAudioUrl = audioUrl;
    // Сохраняем File объект для отправки на сервер при split
    state._sharedAudioFile = file;

    // Обновляем название файла в панели над волной
    var filenameEl = document.getElementById('editorModalWaveformFilename');
    if (filenameEl) {
      filenameEl.textContent = file.name;
    }

    audio.addEventListener('loadedmetadata', function () {
      var duration = audio.duration;
      state._sharedAudioFilename = file.name;
      state._sharedAudioDuration = duration;

      // Инициализируем волну
      _initWaveform(audioUrl);

      // Устанавливаем start/end на весь файл
      var startInput = document.getElementById('editorModalAudioStartTime');
      var endInput = document.getElementById('editorModalAudioEndTime');
      if (startInput) startInput.value = '0';
      if (endInput) endInput.value = duration.toFixed(2);

      // Помечаем, что есть несохранённые изменения:
      // db: true — имя файла нужно сохранить в БД (колонка audio_user_shared)
      // audio: true — сам аудиофайл нужно загрузить в B2
      _setDirtyFlags({ db: true, audio: true });

      // Сохраняем файл в CacheStorage, чтобы _uploadDraftAudioToB2() мог его найти
      // и чтобы после reopen resolvePlayableUrl() мог его восстановить
      _cacheSharedAudioFile(file);
    });

    audio.addEventListener('error', function () {
      console.warn('[dictationEditorModal] Ошибка загрузки аудио');
    });

    audio.src = audioUrl;
  }

  /**
   * Сохраняет shared audio файл в CacheStorage через AudioManager.
   * Нужно для последующей загрузки в B2 и восстановления после reopen.
   */
  async function _cacheSharedAudioFile(file) {
    var dictationId = state.config ? state.config.dictationId : '';
    var lang = state.config ? state.config.originalLanguage : '';
    var filename = state._sharedAudioFilename;
    if (!dictationId || !lang || !filename || !file) return;

    var am = _ensureAudioManager();
    if (!am || typeof am.saveDictationAudioBlob !== 'function') return;

    try {
      await am.saveDictationAudioBlob(dictationId, lang, filename, file, file.type || 'audio/mpeg');
      console.log('[dictationEditorModal] Shared audio сохранён в CacheStorage:', filename);
    } catch (e) {
      console.warn('[dictationEditorModal] Не удалось сохранить shared audio в CacheStorage', e);
    }
  }

  function _initWaveform(audioUrl) {
    var container = document.getElementById('editorModalAudioWaveform');
    if (!container) return;

    // Проверяем, что контейнер имеет размеры
    if (container.offsetWidth === 0 || container.offsetHeight === 0) {
      console.warn('[dictationEditorModal] Контейнер waveform не видим, принудительно устанавливаем размеры');
      container.style.width = '100%';
      container.style.height = '100px';
      container.style.minHeight = '100px';

      // Если размеры все еще 0, откладываем инициализацию
      if (container.offsetWidth === 0 || container.offsetHeight === 0) {
        console.warn('[dictationEditorModal] Не удалось установить размеры контейнера, откладываем инициализацию');
        return;
      }
    }

    // Проверяем, что WaveformCanvas загружен
    if (typeof WaveformCanvas === 'undefined') {
      console.warn('[dictationEditorModal] WaveformCanvas не загружен');
      return;
    }

    // Уничтожаем старый экземпляр
    if (window.editorModalWaveform) {
      window.editorModalWaveform.destroy();
      window.editorModalWaveform = null;
    }

    try {
      var wf = new WaveformCanvas(container);
      window.editorModalWaveform = wf;

      // Подключаем к audioManager
      var am = _ensureAudioManager();
      if (am && typeof am.setWaveformCanvas === 'function') {
        am.setWaveformCanvas(wf);
      }

      // Callback при окончании воспроизведения — возвращаем кнопку в исходное состояние
      wf.onPlaybackEnd(function () {
        var playBtn = document.getElementById('editorModalAudioPlayBtn');
        if (playBtn) {
          _setButtonState(playBtn, 'ready-shared');
        }
      });

      wf.loadAudio(audioUrl).then(function () {
        var duration = wf.getDuration();
        wf.setRegion(0, duration);
      }).catch(function (err) {
        console.warn('[dictationEditorModal] Waveform load error', err);
      });

      // Callback при изменении региона
      wf.onRegionUpdate(function (region) {
        var startInput = document.getElementById('editorModalAudioStartTime');
        var endInput = document.getElementById('editorModalAudioEndTime');
        if (startInput) startInput.value = region.start.toFixed(2);
        if (endInput) endInput.value = region.end.toFixed(2);
      });

    } catch (e) {
      console.warn('[dictationEditorModal] Waveform init error', e);
    }
  }

  function _syncWaveformRegion(field, value) {
    var wf = window.editorModalWaveform;
    if (!wf) return;
    var region = wf.getRegion();
    if (!region) return;
    if (field === 'start') {
      wf.setRegion(value, region.end);
    } else if (field === 'end') {
      wf.setRegion(region.start, value);
    }
  }

  /**
   * Синхронизирует значение поля Start/End под волной с менеджером данных (state.content)
   * и с лейблами в таблице. Если у предложения есть audio_file, меняет кнопку f на молоточек.
   */
  function _syncStartEndToSentence(field, value) {
    var table = document.getElementById(TABLE_ID);
    if (!table) return;
    var selectedRow = table.querySelector('tbody tr.selected');
    if (!selectedRow) return;

    var key = selectedRow.dataset.key;
    if (!key || !state.content) return;

    var sentence = state.content.getSentence(key);
    if (!sentence) return;

    // Обновляем данные в менеджере
    var strVal = (typeof value === 'number') ? value.toFixed(2) : String(value);
    if (field === 'start') {
      sentence.start = strVal;
    } else if (field === 'end') {
      sentence.end = strVal;
    }

    // Обновляем лейблы в таблице (прямое DOM-обновление)
    var startLabel = selectedRow.querySelector('.col-start .time-label');
    var endLabel = selectedRow.querySelector('.col-end .time-label');
    if (startLabel) startLabel.textContent = sentence.start;
    if (endLabel) endLabel.textContent = sentence.end;

    // Если у предложения есть audio_file — меняем кнопку f на молоточек (creating)
    if (sentence.audio_file) {
      var playBtn = selectedRow.querySelector('.col-play-audio.panel-editing-user .audio-btn');
      if (playBtn) {
        _setButtonState(playBtn, 'creating');
      }
    }

    // Устанавливаем dirty flags
    _setDirtyFlags({ db: true, audio: true });
  }

  function _handleSharedAudioPlayback(event) {
    var button = event.currentTarget;
    if (!button) return;

    var currentState = button.dataset.state || 'ready-shared';

    // Если уже играет — останавливаем
    if (currentState === 'playing' || currentState === 'playing-shared') {
      var wf = window.editorModalWaveform;
      if (wf && wf.currentAudio) {
        try {
          wf.currentAudio.pause();
        } catch (e) {}
      }
      // Также останавливаем через audioManager
      var am = _ensureAudioManager();
      if (am) {
        if (typeof am.pause === 'function') am.pause();
        else if (typeof am.stop === 'function') am.stop();
      }
      _setButtonState(button, 'ready-shared');
      return;
    }

    var wf = window.editorModalWaveform;
    if (!wf) return;

    // Используем сохранённый blob URL из state
    var audioUrl = state._sharedAudioUrl;
    if (!audioUrl) return;

    // Останавливаем предыдущее воспроизведение audioManager, если оно есть
    var am = _ensureAudioManager();
    if (am && am.currentButton && am.currentButton !== button) {
      if (typeof am.stop === 'function') am.stop();
    }

    // Создаём Audio элемент из blob URL и передаём волне для воспроизведения в рамках региона
    var audio = new Audio(audioUrl);

    // Устанавливаем кнопку в состояние "играет"
    _setButtonState(button, 'playing-shared');

    // Волна сама управляет воспроизведением: стартует с region.start, играет до region.end,
    // вызывает onPlaybackEnd по окончании
    wf.startPlayback(audio).catch(function (err) {
      console.warn('[dictationEditorModal] Waveform playback error', err);
      _setButtonState(button, 'ready-shared');
    });
  }

  function _handleSplitAudio() {
    if (!state._sharedAudioFilename) {
      alert('Не выбран аудиофайл');
      return;
    }

    var file = state._sharedAudioFile;
    if (!file) {
      alert('Файл не найден. Пожалуйста, выберите аудиофайл заново.');
      return;
    }

    // Собираем все предложения для разрезания
    var cores = state.content ? state.content.getAllSentenceCores() : [];
    var validCores = cores.filter(function (s) { return s.key; });

    if (validCores.length === 0) {
      alert('Нет предложений для разрезания');
      return;
    }

    // Вычисляем start/end на основе длительности аудио (равные отрезки)
    var totalDuration = state._sharedAudioDuration || 0;
    var segmentDuration = totalDuration / validCores.length;

    var sentences = [];
    validCores.forEach(function (s, index) {
      var startTime = index === 0 ? 0 : (index * segmentDuration);
      var endTime = (index + 1) * segmentDuration;
      // Округляем до 2 знаков
      startTime = Math.floor(startTime * 100) / 100;
      endTime = Math.floor(endTime * 100) / 100;

      // Сохраняем start/end в DictationContent
      s.start = String(startTime);
      s.end = String(endTime);

      sentences.push({
        key: s.key,
        start_time: startTime,
        end_time: endTime,
        language: state.config ? state.config.originalLanguage : ''
      });
    });

    // Читаем файл как base64 и отправляем на сервер
    var reader = new FileReader();
    reader.onload = function (e) {
      var base64 = e.target.result.split(',')[1];
      _splitAudioOnServer(state._sharedAudioFilename, sentences, base64, file.type);
    };
    reader.readAsDataURL(file);
  }

  async function _splitAudioOnServer(filename, sentences, audio_b64, mime) {
    try {
      var body = {
        filename: filename,
        dictation_id: state.config ? state.config.dictationId : '',
        sentences: sentences
      };
      if (audio_b64) {
        body.audio_b64 = audio_b64;
        body.mime = mime || 'audio/mpeg';
      }
      var response = await fetch('/split-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      var data = await response.json();
      if (data.success && Array.isArray(data.files)) {
        var dictationId = state.config ? state.config.dictationId : '';
        var am = _ensureAudioManager();
        for (var i = 0; i < data.files.length; i++) {
          var f = data.files[i];
          if (!f || !f.filename || !f.key) continue;
          // Обновляем sentence в DictationContent
          if (state.content) {
            var sentence = state.content.getSentence(f.key);
            if (sentence) {
              sentence.audio_file = f.filename;
              // Сервер возвращает start_time / end_time
              var st = f.start_time != null ? f.start_time : f.start;
              var et = f.end_time != null ? f.end_time : f.end;
              if (st != null) sentence.start = (typeof st === 'number') ? st.toFixed(2) : String(st);
              if (et != null) sentence.end = (typeof et === 'number') ? et.toFixed(2) : String(et);
            }
          }
          // Сохраняем audio_b64 в CacheStorage через AudioManager (вместо draft cache)
          if (f.audio_b64 && dictationId) {
            try {
              var binaryStr = atob(f.audio_b64);
              var bytes = new Uint8Array(binaryStr.length);
              for (var j = 0; j < binaryStr.length; j++) {
                bytes[j] = binaryStr.charCodeAt(j);
              }
              var blob = new Blob([bytes], { type: f.mime || mime || 'audio/mpeg' });
              var lang = state.config ? state.config.originalLanguage : '';
              if (am && typeof am.saveDictationAudioBlob === 'function') {
                await am.saveDictationAudioBlob(dictationId, lang, f.filename, blob, f.mime || mime || 'audio/mpeg');
              }
            } catch (e) {
              console.warn('[dictationEditorModal] failed to cache audio blob', e);
            }
          }
        }
        _setDirtyFlags({ audio: true, db: true });
        _renderTable();
        _bindAudioPlaybackHandlers();
      } else {
        alert('Ошибка разрезания аудио');
      }
    } catch (e) {
      console.error('[dictationEditorModal] split error', e);
      alert('Ошибка разрезания аудио');
    }
  }

  function _handleSmartSplit() {
    if (!state._sharedAudioFilename) {
      alert('Не выбран аудиофайл');
      return;
    }

    var file = state._sharedAudioFile;
    if (!file) {
      alert('Файл не найден. Пожалуйста, выберите аудиофайл заново.');
      return;
    }

    // Читаем файл как base64 и отправляем на сервер
    var reader = new FileReader();
    reader.onload = function (e) {
      var base64 = e.target.result.split(',')[1];
      _smartSplitOnServer(state._sharedAudioFilename, base64, file.type);
    };
    reader.readAsDataURL(file);
  }

  async function _smartSplitOnServer(filename, audio_b64, mime) {
    try {
      var body = {
        filename: filename,
        dictation_id: state.config ? state.config.dictationId : '',
        smart: true,
        language: state.config ? state.config.originalLanguage : '',
        sentences: state.content ? state.content.getAllSentenceCores().map(function (s) {
          return {
            key: s.key,
            text: s.text_original || '',
            language: state.config ? state.config.originalLanguage : ''
          };
        }) : []
      };
      if (audio_b64) {
        body.audio_b64 = audio_b64;
        body.mime = mime || 'audio/mpeg';
      }
      var response = await fetch('/split-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      var data = await response.json();
      if (data.success && Array.isArray(data.files)) {
        var dictationId = state.config ? state.config.dictationId : '';
        var am = _ensureAudioManager();
        for (var i = 0; i < data.files.length; i++) {
          var f = data.files[i];
          if (!f || !f.filename || !f.key) continue;
          if (state.content) {
            var sentence = state.content.getSentence(f.key);
            if (sentence) {
              sentence.audio_file = f.filename;
              // Сервер возвращает start_time / end_time
              var st = f.start_time != null ? f.start_time : f.start;
              var et = f.end_time != null ? f.end_time : f.end;
              if (st != null) sentence.start = (typeof st === 'number') ? st.toFixed(2) : String(st);
              if (et != null) sentence.end = (typeof et === 'number') ? et.toFixed(2) : String(et);
            }
          }
          // Сохраняем audio_b64 в CacheStorage через AudioManager (вместо draft cache)
          if (f.audio_b64 && dictationId) {
            try {
              var binaryStr = atob(f.audio_b64);
              var bytes = new Uint8Array(binaryStr.length);
              for (var j = 0; j < binaryStr.length; j++) {
                bytes[j] = binaryStr.charCodeAt(j);
              }
              var blob = new Blob([bytes], { type: f.mime || mime || 'audio/mpeg' });
              var lang = state.config ? state.config.originalLanguage : '';
              if (am && typeof am.saveDictationAudioBlob === 'function') {
                await am.saveDictationAudioBlob(dictationId, lang, f.filename, blob, f.mime || mime || 'audio/mpeg');
              }
            } catch (e) {
              console.warn('[dictationEditorModal] failed to cache audio blob', e);
            }
          }
        }
        _setDirtyFlags({ audio: true, db: true });
        _renderTable();
        _bindAudioPlaybackHandlers();
      } else {
        alert('Ошибка умной нарезки');
      }
    } catch (e) {
      console.error('[dictationEditorModal] smart split error', e);
      alert('Ошибка умной нарезки');
    }
  }

  function _setupTabs() {
    const panel = document.querySelector('.dictation-editor-modal__tabs-panel');
    if (!panel) return;

    panel.querySelectorAll('.dictation-editor-modal__tab-btn').forEach(function (btn) {
      // Защита от дублирования обработчиков при повторных вызовах open()
      if (btn.getAttribute('data-tab-handler')) return;
      btn.setAttribute('data-tab-handler', '1');

      btn.addEventListener('click', function () {
        const tabName = btn.getAttribute('data-tab');

        panel.querySelectorAll('.dictation-editor-modal__tab-btn').forEach(function (b) {
          b.classList.remove('active');
        });
        panel.querySelectorAll('.dictation-editor-modal__tab-content').forEach(function (c) {
          c.classList.remove('active');
        });

        btn.classList.add('active');
        var tabContent = document.getElementById('tab-' + tabName);
        if (tabContent) {
          tabContent.classList.add('active');
        }

        _applyTableViewForTab(tabName);

        if (typeof lucide !== 'undefined') {
          lucide.createIcons();
        }
      });
    });
  }

  /* ===== SAVE SYSTEM ===== */

  async function _handleSave() {
    var saveBtn = document.getElementById('dictationEditorModalSaveBtn');
    if (!saveBtn) return;

    saveBtn.disabled = true;
    var originalHTML = saveBtn.innerHTML;
    saveBtn.innerHTML = '<i data-lucide="loader-2"></i>';
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons();
    }

    try {
      var flags = _getDirtyFlags();
      var hasChanges = _hasUnsavedChanges();

      if (!hasChanges) {
        console.log('[dictationEditorModal] Нет изменений для сохранения');
        return;
      }

      // Собираем данные для сохранения
      var dictationId = state.config ? state.config.dictationId : null;
      if (!dictationId) {
        console.warn('[dictationEditorModal] Нет ID диктанта для сохранения');
        return;
      }

      // Получаем токен
      var token = null;
      if (window.UM && window.UM.token) {
        token = window.UM.token;
      } else {
        token = localStorage.getItem('jwt_token');
      }

      if (!token) {
        console.warn('[dictationEditorModal] Нет токена авторизации');
        return;
      }

      // Собираем предложения из DictationContent
      var sentencesPayload = {};
      if (state.content) {
        var langOrig = state.content.langOrig || (state.config ? state.config.originalLanguage : '');
        var langTr = state.content.langTr || (state.config ? state.config.translationLanguage : '');
        var allSentences = state.content.getAllSentenceCores();

        if (langOrig) {
          sentencesPayload[langOrig] = {
            title: state.config ? state.config.title : '',
            sentences: allSentences.map(function (s) {
              return {
                key: s.key,
                position: s.position,
                text: s.text_original || '',
                translation: s.text_translation || '',
                audio: s.audio_original || '',
                audio_tr: s.audio_translation || '',
                audio_file: s.audio_file || null,
                audio_mic: s.audio_mic || null,
                start: s.start || '',
                end: s.end || '',
                checked: s.checked || false,
                explanation: s.explanation || '',
                speaker: s.speaker || '',
              };
            })
          };
        }

        // ВАЖНО: также отправляем предложения на языке перевода, иначе сервер
        // удалит их из БД (см. cleanup-логику save_dictation_final).
        // Это фиксит баг: после сохранения пропадает язык перевода (два US флага)
        // и сбрасываются флаги tr_*.
        if (langTr && langTr !== langOrig) {
          sentencesPayload[langTr] = {
            title: '',
            sentences: allSentences.map(function (s) {
              return {
                key: s.key,
                position: s.position,
                text: s.text_translation || '',
                translation: s.text_original || '',
                audio: s.audio_translation || '',
                audio_tr: s.audio_original || '',
                audio_file: null,
                audio_mic: null,
                start: s.start || '',
                end: s.end || '',
                checked: s.checked || false,
                explanation: s.explanation || '',
                speaker: s.speaker || '',
              };
            })
          };
        }
      }

      // Нормализуем dictationId: добавляем префикс dict_ если его нет
      var normalizedId = String(dictationId || '').trim();
      if (normalizedId && !normalizedId.startsWith('dict_')) {
        normalizedId = 'dict_' + normalizedId;
      }

      // Определяем audio_order из выбранного радио
      // Маппинг: 'auto' → '', 'have' → 'f', 'self' → 'm'
      var selectedRadio = document.querySelector('input[name="editorModalVoiceMode"]:checked');
      var audioOrderValue = '';
      if (selectedRadio) {
        if (selectedRadio.value === 'have') {
          audioOrderValue = 'f';
        } else if (selectedRadio.value === 'self') {
          audioOrderValue = 'm';
        } else {
          audioOrderValue = '';
        }
      }

      var saveData = {
        id: normalizedId,
        temp_id: normalizedId,
        language_original: state.config ? state.config.originalLanguage : '',
        language_translation: state.config ? state.config.translationLanguage : '',
        title: state.config ? state.config.title : 'Без названия',
        level: state.config ? (state.config.level || 'A1') : 'A1',
        is_dialog: state.currentDictation ? !!state.currentDictation.is_dialog : false,
        audio_user_shared: state._sharedAudioFilename || null,
        audio_order: audioOrderValue,
        sentences: sentencesPayload,
      };

      // Если есть shared audio filename, но db флаг не стоит — всё равно помечаем db dirty,
      // чтобы audio_user_shared гарантированно сохранился в БД
      if (state._sharedAudioFilename && !flags.db) {
        flags.db = true;
      }

      // Этап 1: Сохраняем текст/БД (если dirty db)
      if (flags.db) {
        console.log('[dictationEditorModal] Сохраняю текст/БД...');
        var dbResponse = await fetch('/save_dictation_final', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          },
          body: JSON.stringify(saveData)
        });

        if (dbResponse.ok) {
          var dbResult = await dbResponse.json();
          if (dbResult.success) {
            _setDirtyFlags({ db: false });
            console.log('[dictationEditorModal] Текст/БД сохранён');

            // Обновляем audio_order в state.config и в DictationContent,
            // чтобы при повторном открытии (без перезагрузки страницы) радио выставилось правильно
            if (state.config) {
              state.config.audio_order = audioOrderValue;
            }
            if (state.content) {
              state.content.audio_order = audioOrderValue;
            }

            // Обновляем audio_user_shared в DictationContent после сохранения,
            // чтобы при повторном открытии (без перезагрузки страницы) shared audio восстановился
            if (state.content) {
              state.content.audio_user_shared = state._sharedAudioFilename || null;
            }
          } else {
            console.error('[dictationEditorModal] Ошибка сохранения БД:', dbResult.error);
          }
        } else {
          console.error('[dictationEditorModal] Ошибка HTTP при сохранении БД:', dbResponse.status);
        }
      }

      // Этап 2: Сохраняем аудио (если dirty audio)
      if (flags.audio) {
        console.log('[dictationEditorModal] Сохраняю аудио...');
        try {
          await _uploadDraftAudioToB2(normalizedId, token);
          _setDirtyFlags({ audio: false });
          console.log('[dictationEditorModal] Аудио сохранено');
        } catch (audioErr) {
          console.error('[dictationEditorModal] Ошибка сохранения аудио:', audioErr);
        }
      }

      // Этап 3: Сохраняем обложку (если dirty cover)
      if (flags.cover) {
        console.log('[dictationEditorModal] Сохраняю обложку...');
        // Здесь будет вызов uploadDictationCoverFromCacheToB2
        // Пока просто сбрасываем флаг
        _setDirtyFlags({ cover: false });
      }

      console.log('[dictationEditorModal] Сохранение завершено');
    } catch (error) {
      console.error('[dictationEditorModal] Ошибка сохранения:', error);
    } finally {
      saveBtn.innerHTML = originalHTML;
      if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
      }
      saveBtn.disabled = false;
    }
  }

  /* ===== OPEN / CLOSE ===== */

  function open(config) {
    // Если модалка уже открыта — сначала закрываем (чистим состояние),
    // чтобы при повторном открытии для другого диктанта не осталось данных от предыдущего.
    if (state.isOpen) {
      close();
    }

    state.config = config || {};
    console.log('[dictationEditorModal] open() config:', JSON.stringify(state.config));
    state.isOpen = true;
    state.dirtyFlags = { db: false, audio: false, cover: false };

    // Сбрасываем shared audio состояние (оно могло остаться от предыдущего открытия)
    state._sharedAudioFilename = null;
    state._sharedAudioUrl = null;
    state._sharedAudioDuration = null;
    state._sharedAudioFile = null;

    // Сбрасываем waveform (уничтожаем предыдущий экземпляр если был)
    if (window.editorModalWaveform) {
      try {
        window.editorModalWaveform.destroy();
      } catch (e) {
        // ignore
      }
      window.editorModalWaveform = null;
    }

    // Сбрасываем текст в панели waveform
    var filenameEl = document.getElementById('editorModalWaveformFilename');
    if (filenameEl) filenameEl.textContent = '';
    var sentenceTextEl = document.getElementById('editorModalWaveformSentenceText');
    if (sentenceTextEl) sentenceTextEl.textContent = '';
    var waveformContainer = document.getElementById('editorModalWaveform');
    if (waveformContainer) waveformContainer.innerHTML = '';

    // Создаём DictationContent
    var dictationId = config.dictationId || '';
    var langOrig = config.originalLanguage || '';
    var langTr = config.translationLanguage || '';
    var rawSentences = config.sentences || [];
    var audioOrderFromConfig = config.audio_order || '';
    var audioUserSharedFromConfig = config.audio_user_shared || null;

    // Пробуем получить content из DictationRuntime (если он уже загружен)
    if (typeof DictationRuntime !== 'undefined' && DictationRuntime.getOrCreateContent) {
      state.content = DictationRuntime.getOrCreateContent({
        dictationId: dictationId,
        langTr: langTr || langOrig,
      });
      // Если content уже существовал и в нём есть sentences — используем их,
      // иначе устанавливаем sentences из config
      if (rawSentences && rawSentences.length > 0) {
        var existingCores = state.content.getAllSentenceCores();
        if (!existingCores || existingCores.length === 0) {
          state.content.setSentences(rawSentences);
        }
      }
      // Если content уже существовал и в нём есть audio_order — используем его
      // как источник истины (приоритет над config)
      if (state.content.audio_order !== undefined && state.content.audio_order !== null && state.content.audio_order !== '') {
        state.config.audio_order = state.content.audio_order;
      } else if (audioOrderFromConfig) {
        // Если в content нет audio_order, но есть в config — сохраняем в content
        state.content.audio_order = audioOrderFromConfig;
      }
      // Аналогично для audio_user_shared
      if (state.content.audio_user_shared) {
        state.config.audio_user_shared = state.content.audio_user_shared;
        state._sharedAudioFilename = state.content.audio_user_shared;
      } else if (audioUserSharedFromConfig) {
        state.content.audio_user_shared = audioUserSharedFromConfig;
      }
    } else if (typeof DictationContent !== 'undefined') {
      state.content = new DictationContent({
        dictationId: dictationId,
        langOrig: langOrig,
        langTr: langTr,
        sentences: rawSentences,
        audio_order: audioOrderFromConfig,
        audio_user_shared: audioUserSharedFromConfig,
      });
    } else {
      state.content = {
        dictationId: dictationId,
        langOrig: langOrig,
        langTr: langTr,
        audio_order: audioOrderFromConfig,
        audio_user_shared: audioUserSharedFromConfig,
        _sentences: rawSentences.map(function (s, i) {
          return {
            key: s.key || 's_' + i,
            position: s.position != null ? Number(s.position) : null,
            text_original: s.original || s.text || s.text_original || '',
            text_translation: s.translation || s.text_translation || '',
            audio: s.audio_a || s.audio || s.audio_original || '',
            audio_original: s.audio || s.audio_original || '',
            audio_translation: s.translation_audio || s.audio_tr || s.audio_translation || '',
            audio_file: s.audio_file || s.audio_f || null,
            audio_mic: s.audio_mic || s.audio_m || null,
            start: (s.start != null && s.start !== '') ? s.start : '',
            end: (s.end != null && s.end !== '') ? s.end : '',
            checked: s.checked || false,
            explanation: s.explanation || '',
            speaker: s.speaker || '',
          };
        }),
        getAllSentenceCores: function () { return this._sentences.slice(); },
        getSentence: function (key) { return this._sentences.find(function (s) { return s.key === String(key); }) || null; },
        getAllKeys: function () { return this._sentences.map(function (s) { return s.key; }); },
      };
    }

    state.currentDictation = {
      is_dialog: config.is_dialog || false,
      show_explanation: config.show_explanation || false,
    };

    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;

    modal.style.display = 'flex';

    // Инициализация
    _setupUserSection();
    _initLanguageFlags();
    _initFormFields();
    _initLevelSelector();
    _initVoiceModeRadios();
    _initCoverUpload();
    _initHaveAudioTab();
    _setupTabs();
    _renderTable();
    _bindAudioPlaybackHandlers();
    _setupTableControls();
    _updateUnsavedStar();

    // Инициализируем AudioManager
    _ensureAudioManager();

    // Пытаемся восстановить shared audio из данных предложений (после reopen)
    _restoreSharedAudioFromSentences();

    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }

    document.body.style.overflow = 'hidden';
  }

  /**
   * Восстанавливает shared audio после повторного открытия редактора.
   * Использует audio_user_shared из config (сохранённый в БД),
   * загружает аудио через AudioManager.resolvePlayableUrl().
   * Если audio_user_shared пустой — ничего не показывает.
   */
  async function _restoreSharedAudioFromSentences() {
    if (!state.content) return;

    // Берём имя shared audio файла из config (сохранён в БД как audio_user_shared)
    var sharedFilename = state.config?.audio_user_shared || state._sharedAudioFilename;
    if (!sharedFilename) {
      // Нет shared audio — ничего не показываем, не лезем в строки
      return;
    }

    var lang = state.config?.originalLanguage || '';
    var dictationId = state.config?.dictationId || '';

    // Обновляем название файла в панели над волной
    var filenameEl = document.getElementById('editorModalWaveformFilename');
    if (filenameEl) {
      filenameEl.textContent = sharedFilename;
    }

    // Показываем имя shared audio файла в лейбе вместо текста первого предложения
    var sentenceTextEl = document.getElementById('editorModalWaveformSentenceText');
    if (sentenceTextEl) {
      sentenceTextEl.textContent = sharedFilename;
    }

    // Пробуем получить URL через AudioManager (CacheStorage → fetch)
    var am = _ensureAudioManager();
    if (!am) return;

    try {
      var canonicalUrl = am.buildDictationAudioUrl(dictationId, lang, sharedFilename);
      var playableUrl = await am.resolvePlayableUrl(canonicalUrl);
      if (playableUrl) {
        _initWaveform(playableUrl);
        state._sharedAudioUrl = playableUrl;
        state._sharedAudioFilename = sharedFilename;
        return;
      }
    } catch (e) {
      console.warn('[dictationEditorModal] Не удалось восстановить shared audio через кэш', e);
    }

    // Если не нашли в кэше — пробуем загрузить напрямую с сервера
    try {
      var directUrl = am.buildDictationAudioUrl(dictationId, lang, sharedFilename);
      // Пробуем просто использовать canonical URL как playable (сервер отдаст файл)
      _initWaveform(directUrl);
      state._sharedAudioUrl = directUrl;
      state._sharedAudioFilename = sharedFilename;
      console.log('[dictationEditorModal] Shared audio восстановлен через прямой URL:', directUrl);
    } catch (e2) {
      console.warn('[dictationEditorModal] Не удалось восстановить shared audio даже через прямой URL', e2);
    }
  }

  function close() {
    if (!state.isOpen) return;

    state.isOpen = false;
    state.config = null;
    state.headerLangPairSelector = null;
    // НЕ удаляем state.content из DictationRuntime — он может использоваться
    // другими компонентами (DictationKart, DictationModal). Просто сбрасываем ссылку.
    state.content = null;
    state.currentDictation = null;
    state.dirtyFlags = { db: false, audio: false, cover: false };
    state._sharedAudioFilename = null;
    state._sharedAudioDuration = null;
    state._sharedAudioFile = null;

    // Освобождаем blob URL для shared audio
    if (state._sharedAudioUrl) {
      URL.revokeObjectURL(state._sharedAudioUrl);
      state._sharedAudioUrl = null;
    }

    // Уничтожаем waveform
    if (window.editorModalWaveform) {
      window.editorModalWaveform.destroy();
      window.editorModalWaveform = null;
    }

    const modal = document.getElementById(MODAL_ID);
    if (modal) {
      modal.style.display = 'none';
    }

    document.body.style.overflow = '';
  }

  /* ===== INIT ===== */

  function init() {
    _setupCloseButton();
    _setupOverlayClose();

    // Кнопка сохранения
    var saveBtn = document.getElementById('dictationEditorModalSaveBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', _handleSave);
    }
  }

  // Экспортируем в глобальную область
  window.DictationEditorModal = {
    open: open,
    close: close,
    init: init,
  };

  // Авто-инициализация при загрузке DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
