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

    // Убираем voice-mode классы
    table.classList.remove('voice-mode-auto', 'voice-mode-have', 'voice-mode-self');

    if (tabName === 'general' || tabName === 'dialog') {
      _toggleColumnGroup('translation');
      _toggleCheckboxColumn(false);
      _toggleCreateAudioColumns(false);

      // На вкладке "общие данные" показываем a/f/m вместо o в зависимости от радио
      var checkedRadio = document.querySelector('input[name="editorModalVoiceMode"]:checked');
      var voiceMode = checkedRadio ? checkedRadio.value : 'auto';
      table.classList.add('voice-mode-' + voiceMode);
    } else if (tabName === 'voice-original-auto') {
      _toggleColumnGroup('original');
      var avtoColumns = table.querySelectorAll('.panel-editing-avto');
      avtoColumns.forEach(function (col) { col.style.display = 'table-cell'; });
      var userColumns = table.querySelectorAll('.panel-editing-user');
      userColumns.forEach(function (col) { col.style.display = 'none'; });
      var micColumns = table.querySelectorAll('.panel-editing-mic');
      micColumns.forEach(function (col) { col.style.display = 'none'; });
      _toggleCheckboxColumn(false);
    } else if (tabName === 'voice-original-have') {
      _toggleColumnGroup('original');
      var userCols = table.querySelectorAll('.panel-editing-user');
      userCols.forEach(function (col) { col.style.display = 'table-cell'; });
      var micCols = table.querySelectorAll('.panel-editing-mic');
      micCols.forEach(function (col) { col.style.display = 'none'; });
      var avtoCols = table.querySelectorAll('.panel-editing-avto');
      avtoCols.forEach(function (col) { col.style.display = 'none'; });
      _toggleCheckboxColumn(false);
    } else if (tabName === 'voice-original-self') {
      _toggleColumnGroup('original');
      var micCols2 = table.querySelectorAll('.panel-editing-mic');
      micCols2.forEach(function (col) { col.style.display = 'table-cell'; });
      var userCols2 = table.querySelectorAll('.panel-editing-user');
      userCols2.forEach(function (col) { col.style.display = 'none'; });
      var avtoCols2 = table.querySelectorAll('.panel-editing-avto');
      avtoCols2.forEach(function (col) { col.style.display = 'none'; });
      _toggleCheckboxColumn(false);
    } else if (tabName === 'voice-translations') {
      _toggleColumnGroup('translation');
      _toggleCheckboxColumn(false);
      _toggleCreateAudioColumns(false);
    } else if (tabName === 'create-audio') {
      if (table) {
        table.classList.remove('state-original-translation', 'state-original-editing');
        var origHeaders = table.querySelectorAll('th.panel-original');
        var origCells = table.querySelectorAll('td.panel-original');
        origHeaders.forEach(function (th) { th.style.display = 'table-cell'; });
        origCells.forEach(function (td) { td.style.display = 'table-cell'; });
        var transTextHeaders = table.querySelectorAll('th.col-translation');
        var transTextCells = table.querySelectorAll('td.col-translation');
        transTextHeaders.forEach(function (th) { th.style.display = 'table-cell'; });
        transTextCells.forEach(function (td) { td.style.display = 'table-cell'; });
      }
      _toggleCheckboxColumn(true);
      _toggleCreateAudioColumns(true);
    }

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
      tdOrig.textContent = s.text_original || '';
      tr.appendChild(tdOrig);

      // Play original — кнопка o
      var tdPlayOrig = document.createElement('td');
      tdPlayOrig.className = 'col-play-original panel-original panel-create-audio';
      var playOrigBtn = document.createElement('button');
      playOrigBtn.type = 'button';
      playOrigBtn.className = 'audio-btn';
      playOrigBtn.dataset.key = key;
      playOrigBtn.dataset.lang = state.config?.originalLanguage || '';
      playOrigBtn.dataset.field = 'audio_original';
      playOrigBtn.dataset.state = s.audio_original ? 'ready' : 'creating';
      playOrigBtn.style.background = 'none';
      playOrigBtn.style.border = 'none';
      playOrigBtn.style.cursor = 'pointer';
      playOrigBtn.style.padding = '2px';
      playOrigBtn.innerHTML = '<i data-lucide="' + (s.audio_original ? 'play' : 'hammer') + '"></i>';
      tdPlayOrig.appendChild(playOrigBtn);
      tr.appendChild(tdPlayOrig);

      // Generate TTS (audio_avto) — кнопка a
      var tdGenTts = document.createElement('td');
      tdGenTts.className = 'col-generate-tts panel-editing-avto panel-create-audio';
      var genTtsBtn = document.createElement('button');
      genTtsBtn.type = 'button';
      genTtsBtn.className = 'audio-btn';
      genTtsBtn.dataset.key = key;
      genTtsBtn.dataset.lang = state.config?.originalLanguage || '';
      genTtsBtn.dataset.field = 'audio_avto';
      genTtsBtn.dataset.state = s.audio_avto ? 'ready' : 'creating';
      genTtsBtn.style.background = 'none';
      genTtsBtn.style.border = 'none';
      genTtsBtn.style.cursor = 'pointer';
      genTtsBtn.style.padding = '2px';
      genTtsBtn.innerHTML = '<i data-lucide="' + (s.audio_avto ? 'play' : 'hammer') + '"></i>';
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
      playUserBtn.dataset.field = 'audio_user';
      playUserBtn.dataset.state = s.audio_user ? 'ready' : 'creating';
      playUserBtn.style.background = 'none';
      playUserBtn.style.border = 'none';
      playUserBtn.style.cursor = 'pointer';
      playUserBtn.style.padding = '2px';
      playUserBtn.innerHTML = '<i data-lucide="' + (s.audio_user ? 'play' : 'hammer') + '"></i>';
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
      tdTrans.textContent = s.text_translation || '';
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

      // Apply avto
      var tdApplyAvto = document.createElement('td');
      tdApplyAvto.className = 'col-apply-avto panel-editing-avto';
      tdApplyAvto.title = 'Применить';
      var applyAvtoIcon = document.createElement('i');
      applyAvtoIcon.setAttribute('data-lucide', 'corner-down-left');
      applyAvtoIcon.style.width = '16px';
      applyAvtoIcon.style.height = '16px';
      tdApplyAvto.appendChild(applyAvtoIcon);
      tr.appendChild(tdApplyAvto);

      // Start
      var tdStart = document.createElement('td');
      tdStart.className = 'col-start panel-editing-user';
      var startInput = document.createElement('input');
      startInput.type = 'text';
      startInput.value = s.start || '';
      startInput.placeholder = '00:00';
      startInput.dataset.key = key;
      tdStart.appendChild(startInput);
      tr.appendChild(tdStart);

      // End
      var tdEnd = document.createElement('td');
      tdEnd.className = 'col-end panel-editing-user';
      var endInput = document.createElement('input');
      endInput.type = 'text';
      endInput.value = s.end || '';
      endInput.placeholder = '00:00';
      endInput.dataset.key = key;
      tdEnd.appendChild(endInput);
      tr.appendChild(tdEnd);

      // Apply user
      var tdApplyUser = document.createElement('td');
      tdApplyUser.className = 'col-apply-user panel-editing-user';
      tdApplyUser.title = 'Применить';
      var applyUserIcon = document.createElement('i');
      applyUserIcon.setAttribute('data-lucide', 'arrow-big-left-dash');
      applyUserIcon.style.width = '16px';
      applyUserIcon.style.height = '16px';
      tdApplyUser.appendChild(applyUserIcon);
      tr.appendChild(tdApplyUser);

      // Apply mic
      var tdApplyMic = document.createElement('td');
      tdApplyMic.className = 'col-apply-mic panel-editing-mic';
      tdApplyMic.title = 'Применить';
      var applyMicIcon = document.createElement('i');
      applyMicIcon.setAttribute('data-lucide', 'arrow-big-left-dash');
      applyMicIcon.style.width = '16px';
      applyMicIcon.style.height = '16px';
      tdApplyMic.appendChild(applyMicIcon);
      tr.appendChild(tdApplyMic);

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

  function _resolveEditorPlaybackAudioUrl(dictationId, language, filename) {
    if (typeof resolveEditorPlaybackAudioUrl === 'function') {
      return resolveEditorPlaybackAudioUrl(dictationId, language, filename);
    }
    if (!filename) return null;
    if (filename.startsWith('blob:') || filename.startsWith('http://') || filename.startsWith('https://') || filename.startsWith('/api/')) {
      return filename;
    }
    return '/api/audio/' + encodeURIComponent(dictationId) + '/' + encodeURIComponent(language) + '/' + encodeURIComponent(filename);
  }

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
      // Здесь можно будет вызвать createAndPlayAudio в будущем
      return;
    }

    // Останавливаем предыдущее аудио, если оно играет с другой кнопки
    if (am.currentButton && am.currentButton !== button) {
      if (typeof am.stop === 'function') {
        am.stop();
      }
    }

    var audioUrl = _resolveEditorPlaybackAudioUrl(state.config.dictationId, lang, audioFilename);
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
    if (prevBtn) {
      prevBtn.addEventListener('click', _navigateToPreviousRow);
    }

    var nextBtn = document.getElementById('editorModalNextRowBtn');
    if (nextBtn) {
      nextBtn.addEventListener('click', _navigateToNextRow);
    }

    var rowNumberSpan = document.getElementById('editorModalCurrentRowNumber');
    if (rowNumberSpan) {
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
    if (addBtn) {
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
    if (deleteBtn) {
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
    if (toggleExplBtn) {
      toggleExplBtn.addEventListener('click', function () {
        if (!state.currentDictation) state.currentDictation = {};
        state.currentDictation.show_explanation = !state.currentDictation.show_explanation;
        _updateExplanationColumnVisibility();
      });
    }

    var refillBtn = document.getElementById('editorModalRefillTableBtn');
    if (refillBtn) {
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
      audio_avto: null,
      audio_user: null,
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

    radios.forEach(function (radio) {
      radio.addEventListener('change', function () {
        if (this.checked) {
          updateTabVisibility(this.value);
          // Если мы на вкладке "общие данные", обновляем voice-mode класс таблицы
          if (state.currentTabName === 'general' || state.currentTabName === 'dialog') {
            var table = document.getElementById(TABLE_ID);
            if (table) {
              table.classList.remove('voice-mode-auto', 'voice-mode-have', 'voice-mode-self');
              table.classList.add('voice-mode-' + this.value);
            }
          }
        }
      });
    });

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

    uploadBtn.addEventListener('click', function () {
      fileInput.click();
    });

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

  /* ===== ВКЛАДКА "Є АУДІО" (voice-original-have) ===== */

  /** @type {string|null} */
  var _sharedAudioFilename = null;
  /** @type {number|null} */
  var _sharedAudioDuration = null;

  function _initHaveAudioTab() {
    var selectBtn = document.getElementById('editorModalSelectFileBtn');
    var fileInput = document.getElementById('editorModalAudioFileInput');
    var audioInfo = document.getElementById('editorModalCurrentAudioInfo');

    if (selectBtn && fileInput) {
      selectBtn.addEventListener('click', function () {
        fileInput.click();
      });

      fileInput.addEventListener('change', function (e) {
        var file = e.target.files && e.target.files[0];
        if (!file) return;
        _uploadSharedAudioFile(file);
      });
    }

    // Кнопка "разрезать на 1000 кусков"
    var splitBtn = document.getElementById('editorModalSplitBtn');
    if (splitBtn) {
      splitBtn.addEventListener('click', function () {
        _handleSplitAudio();
      });
    }

    // Кнопка "умная нарезка"
    var smartSplitBtn = document.getElementById('editorModalSmartSplitBtn');
    if (smartSplitBtn) {
      smartSplitBtn.addEventListener('click', function () {
        _handleSmartSplit();
      });
    }

    // Кнопка воспроизведения под волной
    var playBtn = document.getElementById('editorModalAudioPlayBtn');
    if (playBtn) {
      playBtn.addEventListener('click', function (event) {
        _handleSharedAudioPlayback(event);
      });
    }
  }

  function _uploadSharedAudioFile(file) {
    var audioInfo = document.getElementById('editorModalCurrentAudioInfo');
    var audio = new Audio();
    var audioUrl = URL.createObjectURL(file);

    // Сохраняем URL, чтобы освободить при закрытии
    state._sharedAudioUrl = audioUrl;

    audio.addEventListener('loadedmetadata', function () {
      var duration = audio.duration;
      _sharedAudioFilename = file.name;
      _sharedAudioDuration = duration;

      if (audioInfo) {
        var rounded = Math.floor(duration * 100) / 100;
        audioInfo.textContent = 'Аудіо для хвилі: ' + file.name + ' (' + rounded + 'с)';
      }

      // Инициализируем волну
      _initWaveform(audioUrl);

      // Устанавливаем start/end на весь файл
      var startInput = document.getElementById('editorModalAudioStartTime');
      var endInput = document.getElementById('editorModalAudioEndTime');
      if (startInput) startInput.value = '0';
      if (endInput) endInput.value = duration.toFixed(2);
    });

    audio.addEventListener('error', function () {
      console.warn('[dictationEditorModal] Ошибка загрузки аудио');
    });

    audio.src = audioUrl;
  }

  function _initWaveform(audioUrl) {
    var container = document.getElementById('editorModalAudioWaveform');
    if (!container) return;

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

  function _handleSharedAudioPlayback(event) {
    var button = event.currentTarget;
    if (!button) return;

    var am = _ensureAudioManager();
    if (!am) return;

    var currentState = button.dataset.state || 'ready-shared';

    if (currentState === 'playing' || currentState === 'playing-shared') {
      if (typeof am.pause === 'function') am.pause();
      else if (typeof am.stop === 'function') am.stop();
      _setButtonState(button, 'ready-shared');
      return;
    }

    // Получаем URL для воспроизведения
    var wf = window.editorModalWaveform;
    if (!wf) return;

    var audioUrl = null;
    try {
      audioUrl = wf.getAudioUrl();
    } catch (e) {}

    if (!audioUrl) return;

    if (am.currentButton && am.currentButton !== button) {
      if (typeof am.stop === 'function') am.stop();
    }

    if (typeof am.play === 'function') {
      am.play(button, audioUrl, {
        onEnd: function () {
          _setButtonState(button, 'ready-shared');
        }
      });
      _setButtonState(button, 'playing-shared');
    }
  }

  function _handleSplitAudio() {
    if (!_sharedAudioFilename) {
      alert('Не выбран аудиофайл');
      return;
    }

    if (window.AudioEditorTools && typeof window.AudioEditorTools.splitAudioIntoSeentences === 'function') {
      window.AudioEditorTools.splitAudioIntoSeentences({ filename: _sharedAudioFilename });
      return;
    }

    // Fallback: собираем предложения с start/end
    var sentences = [];
    if (state.content) {
      var cores = state.content.getAllSentenceCores();
      cores.forEach(function (s) {
        if (s.key && s.end && s.start && Number(s.end) > Number(s.start)) {
          sentences.push({
            key: s.key,
            start_time: Number(s.start) || 0,
            end_time: Number(s.end) || 0,
            language: state.config ? state.config.originalLanguage : ''
          });
        }
      });
    }

    if (sentences.length === 0) {
      alert('Нет предложений с заполненными start/end. Сначала укажите время для каждого предложения.');
      return;
    }

    _splitAudioOnServer(_sharedAudioFilename, sentences);
  }

  async function _splitAudioOnServer(filename, sentences) {
    try {
      var response = await fetch('/split-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: filename,
          dictation_id: state.config ? state.config.dictationId : '',
          sentences: sentences
        })
      });
      var data = await response.json();
      if (data.success && Array.isArray(data.files)) {
        for (var i = 0; i < data.files.length; i++) {
          var f = data.files[i];
          if (!f || !f.filename || !f.audio_b64 || !f.key) continue;
          // Обновляем sentence в DictationContent
          if (state.content) {
            var sentence = state.content.getSentence(f.key);
            if (sentence) {
              sentence.audio_user = f.filename;
            }
          }
        }
        _setDirtyFlags({ audio: true });
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
    if (!_sharedAudioFilename) {
      alert('Не выбран аудиофайл');
      return;
    }

    if (window.AudioEditorTools && typeof window.AudioEditorTools.smartSplit === 'function') {
      window.AudioEditorTools.smartSplit({ filename: _sharedAudioFilename });
      return;
    }

    // Fallback: используем серверный эндпоинт
    _smartSplitOnServer(_sharedAudioFilename);
  }

  async function _smartSplitOnServer(filename) {
    try {
      var response = await fetch('/split-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
        })
      });
      var data = await response.json();
      if (data.success && Array.isArray(data.files)) {
        for (var i = 0; i < data.files.length; i++) {
          var f = data.files[i];
          if (!f || !f.filename || !f.audio_b64 || !f.key) continue;
          if (state.content) {
            var sentence = state.content.getSentence(f.key);
            if (sentence) {
              sentence.audio_user = f.filename;
              if (f.start != null) sentence.start = String(f.start);
              if (f.end != null) sentence.end = String(f.end);
            }
          }
        }
        _setDirtyFlags({ audio: true });
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
                audio_avto: s.audio_avto || null,
                audio_user: s.audio_user || null,
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
      }

      var saveData = {
        id: dictationId,
        temp_id: dictationId,
        language_original: state.config ? state.config.originalLanguage : '',
        language_translation: state.config ? state.config.translationLanguage : '',
        title: state.config ? state.config.title : 'Без названия',
        level: state.config ? (state.config.level || 'A1') : 'A1',
        is_dialog: state.currentDictation ? !!state.currentDictation.is_dialog : false,
        sentences: sentencesPayload,
      };

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
        // Здесь будет вызов uploadAudioThenCleanupB2
        // Пока просто сбрасываем флаг
        _setDirtyFlags({ audio: false });
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
    if (state.isOpen) return;

    state.config = config || {};
    state.isOpen = true;
    state.dirtyFlags = { db: false, audio: false, cover: false };

    // Создаём DictationContent
    var dictationId = config.dictationId || '';
    var langOrig = config.originalLanguage || '';
    var langTr = config.translationLanguage || '';
    var rawSentences = config.sentences || [];

    if (typeof DictationContent !== 'undefined') {
      state.content = new DictationContent({
        dictationId: dictationId,
        langOrig: langOrig,
        langTr: langTr,
        sentences: rawSentences,
      });
    } else {
      state.content = {
        dictationId: dictationId,
        langOrig: langOrig,
        langTr: langTr,
        _sentences: rawSentences.map(function (s, i) {
          return {
            key: s.key || 's_' + i,
            position: s.position != null ? Number(s.position) : null,
            text_original: s.original || s.text || s.text_original || '',
            text_translation: s.translation || s.text_translation || '',
            audio_original: s.audio || s.audio_original || '',
            audio_translation: s.translation_audio || s.audio_tr || s.audio_translation || '',
            audio_avto: s.audio_avto || null,
            audio_user: s.audio_user || null,
            audio_mic: s.audio_mic || null,
            start: s.start || '',
            end: s.end || '',
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

    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }

    document.body.style.overflow = 'hidden';
  }

  function close() {
    if (!state.isOpen) return;

    state.isOpen = false;
    state.config = null;
    state.headerLangPairSelector = null;
    state.content = null;
    state.currentDictation = null;
    state.dirtyFlags = { db: false, audio: false, cover: false };
    _sharedAudioFilename = null;
    _sharedAudioDuration = null;

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
