/**
 * dictation_editor_modal.js — Редактор диктанта в модальном окне
 * IIFE-паттерн, как dictation_modal.js
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
  };

  /* ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===== */

  function _normalizeLangCode(code) {
    if (!code) return '';
    return String(code).toLowerCase().trim();
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
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

  /* ===== РАБОТА С ТАБЛИЦЕЙ ===== */

  function _toggleColumnGroup(group) {
    const table = document.getElementById(TABLE_ID);
    if (!table) return;
    table.classList.remove('state-original-translation', 'state-original-editing');
    if (group === 'original') {
      table.classList.add('state-original-editing');
    } else if (group === 'translation') {
      table.classList.add('state-original-translation');
    }
  }

  function _toggleCheckboxColumn(show) {
    const header = document.querySelector('#' + TABLE_ID + ' th.col-checkbox-create-audio');
    const cells = document.querySelectorAll('#' + TABLE_ID + ' td.col-checkbox-create-audio');
    if (header) {
      header.style.display = show ? 'table-cell' : 'none';
    }
    cells.forEach(function (cell) {
      cell.style.display = show ? 'table-cell' : 'none';
      if (show) {
        const btn = cell.querySelector('.checkbox-btn');
        if (btn) {
          const key = btn.dataset.key;
          if (key && state.content) {
            const sentence = state.content.getSentence(key);
            const isChecked = sentence ? sentence.checked === true : false;
            const icon = btn.querySelector('.checkbox-icon');
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
    const table = document.getElementById(TABLE_ID);
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

    if (tabName === 'general' || tabName === 'dialog') {
      _toggleColumnGroup('translation');
      _toggleCheckboxColumn(false);
      _toggleCreateAudioColumns(false);
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

      // Play original
      var tdPlayOrig = document.createElement('td');
      tdPlayOrig.className = 'col-play-original panel-original panel-create-audio';
      tdPlayOrig.textContent = 'o';
      tdPlayOrig.dataset.key = key;
      tdPlayOrig.dataset.lang = state.config?.originalLanguage || '';
      tdPlayOrig.dataset.field = 'audio_original';
      tr.appendChild(tdPlayOrig);

      // Перевод
      var tdTrans = document.createElement('td');
      tdTrans.className = 'col-translation panel-translation';
      tdTrans.textContent = s.text_translation || '';
      tr.appendChild(tdTrans);

      // Play translation
      var tdPlayTrans = document.createElement('td');
      tdPlayTrans.className = 'col-play-translation panel-translation panel-create-audio';
      tdPlayTrans.textContent = 't';
      tdPlayTrans.dataset.key = key;
      tdPlayTrans.dataset.lang = state.config?.translationLanguage || '';
      tdPlayTrans.dataset.field = 'audio_translation';
      tr.appendChild(tdPlayTrans);

      // Explanation
      var tdExpl = document.createElement('td');
      tdExpl.className = 'col-explanation';
      tdExpl.style.display = 'none';
      tdExpl.textContent = s.explanation || '';
      tr.appendChild(tdExpl);

      // Generate TTS
      var tdGenTts = document.createElement('td');
      tdGenTts.className = 'col-generate-tts panel-editing-avto panel-create-audio';
      tdGenTts.textContent = 'a';
      tdGenTts.dataset.key = key;
      tdGenTts.dataset.lang = state.config?.originalLanguage || '';
      tdGenTts.dataset.field = 'audio_avto';
      tr.appendChild(tdGenTts);

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

      // Chain
      var tdChain = document.createElement('td');
      tdChain.className = 'col-chain panel-editing-user';
      var chainIcon = document.createElement('i');
      chainIcon.setAttribute('data-lucide', 'link');
      chainIcon.style.width = '16px';
      chainIcon.style.height = '16px';
      tdChain.appendChild(chainIcon);
      tr.appendChild(tdChain);

      // Play audio (user)
      var tdPlayAudio = document.createElement('td');
      tdPlayAudio.className = 'col-play-audio panel-editing-user panel-create-audio';
      tdPlayAudio.textContent = 'f';
      tdPlayAudio.dataset.key = key;
      tdPlayAudio.dataset.lang = state.config?.originalLanguage || '';
      tdPlayAudio.dataset.field = 'audio_user';
      tr.appendChild(tdPlayAudio);

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

      // Play audio (mic)
      var tdPlayMic = document.createElement('td');
      tdPlayMic.className = 'col-play-audio panel-editing-mic panel-create-audio';
      tdPlayMic.textContent = 'm';
      tdPlayMic.dataset.key = key;
      tdPlayMic.dataset.lang = state.config?.originalLanguage || '';
      tdPlayMic.dataset.field = 'audio_mic';
      tr.appendChild(tdPlayMic);

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

  /* ===== ОБРАБОТКА АУДИО ===== */

  function _resolveEditorPlaybackAudioUrl(dictationId, language, filename) {
    if (typeof resolveEditorPlaybackAudioUrl === 'function') {
      return resolveEditorPlaybackAudioUrl(dictationId, language, filename);
    }
    if (!filename) return null;
    return '/api/audio/' + encodeURIComponent(dictationId) + '/' + encodeURIComponent(language) + '/' + encodeURIComponent(filename);
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

    if (typeof am.stop === 'function') {
      am.stop();
    }

    // Все аудио-поля теперь хранятся в DictationContent._sentences
    var audioFilename = null;
    if (state.content) {
      var sentence = state.content.getSentence(key);
      if (sentence) {
        audioFilename = sentence[field] || null;
      }
    }

    if (!audioFilename) {
      console.warn('[dictationEditorModal] No audio file for', key, field);
      return;
    }

    var audioUrl = _resolveEditorPlaybackAudioUrl(state.config.dictationId, lang, audioFilename);
    if (!audioUrl) return;

    if (typeof am.play === 'function') {
      am.play(audioUrl, {
        button: button,
        onEnd: function () {}
      });
    } else {
      try {
        var audio = new Audio(audioUrl);
        audio.play().catch(function (err) {
          console.warn('[dictationEditorModal] Audio play error', err);
        });
      } catch (e) {
        console.warn('[dictationEditorModal] Audio creation error', e);
      }
    }
  }

  function _bindAudioPlaybackHandlers() {
    var table = document.getElementById(TABLE_ID);
    if (!table) return;

    var playButtons = table.querySelectorAll('.col-play-original, .col-play-translation, .col-generate-tts, .col-play-audio');
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

    // Все поля в одном объекте — DictationContent._sentences
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
    } else if (position === 'below' && selectedRow) {
      var index2 = Array.from(tbody.children).indexOf(selectedRow);
      state.content._sentences.splice(index2 + 1, 0, newSentence);
    } else {
      state.content._sentences.push(newSentence);
    }

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
          // При смене режима озвучки переключаем видимость колонок в таблице
          var tabName = 'voice-original-' + this.value;
          _applyTableViewForTab(tabName);
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
      };
      reader.readAsDataURL(file);
    });
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

        // Обновляем видимость колонок таблицы при переключении вкладок
        _applyTableViewForTab(tabName);

        if (typeof lucide !== 'undefined') {
          lucide.createIcons();
        }
      });
    });
  }

  /* ===== OPEN / CLOSE ===== */

  function open(config) {
    if (state.isOpen) return;

    state.config = config || {};
    state.isOpen = true;

    // Создаём DictationContent — единый формат данных
    // Все поля (включая редакторские) теперь сохраняются в DictationContent._sentences
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
      // Fallback: если DictationContent не загружен, создаём вручную
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
    _setupTabs();
    _renderTable();
    _bindAudioPlaybackHandlers();
    _setupTableControls();

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
