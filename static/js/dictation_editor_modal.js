/**
 * dictation_editor_modal.js — Редактор диктанта в модальном окне
 *
 * Содержит:
 * - Полный механизм audio playback (play/pause/hammer, audioManager)
 * - Save system с dirty flags (db/audio/cover) и цветными звёздами
 * - Таблицу предложений с управлением колонками
 */

var EDITOR_MODAL_ID = 'dictationEditorModal';
var EDITOR_BODY_ID = 'dictationEditorModalBody';
var EDITOR_TABLE_ID = 'editorModalSentencesTable';

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

  // ---- Стан для self-закладки (voice-original-self) ----

  /** blob URL для self waveform */
  _selfAudioUrl: null,
  /** Имя файла self audio (audio_mic) */
  _selfAudioFilename: null,
  /** Длительность self audio */
  _selfAudioDuration: null,
  /** File объект self audio */
  _selfAudioFile: null,

  /** EditorMicPanel для запису з мікрофона */
  _micPanel: null,
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
  } catch (e) { }
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
  var table = document.getElementById(EDITOR_TABLE_ID);
  if (!table) return;
  table.classList.remove('state-original-translation', 'state-original-editing');
  if (group === 'original') {
    table.classList.add('state-original-editing');
  } else if (group === 'translation') {
    table.classList.add('state-original-translation');
  }
}

function _toggleCheckboxColumn(show) {
  var header = document.querySelector('#' + EDITOR_TABLE_ID + ' th.col-checkbox-create-audio');
  var cells = document.querySelectorAll('#' + EDITOR_TABLE_ID + ' td.col-checkbox-create-audio');
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
  var table = document.getElementById(EDITOR_TABLE_ID);
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
  var table = document.getElementById(EDITOR_TABLE_ID);
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
  var headers = document.querySelectorAll('#' + EDITOR_TABLE_ID + ' th.col-explanation');
  var cells = document.querySelectorAll('#' + EDITOR_TABLE_ID + ' td.col-explanation');
  headers.forEach(function (el) { el.style.display = showExplanation ? 'table-cell' : 'none'; });
  cells.forEach(function (el) { el.style.display = showExplanation ? 'table-cell' : 'none'; });
}

/* ===== НАВИГАЦИЯ ПО СТРОКАМ ===== */

function _selectSentenceRow(row) {
  if (!row) return;
  var table = document.getElementById(EDITOR_TABLE_ID);
  if (!table) return;
  table.querySelectorAll('tbody tr.selected').forEach(function (r) { r.classList.remove('selected'); });
  row.classList.add('selected');
  _updateCurrentRowNumber();

  // Обновляем панель над волной: текст текущей строки
  var key = row.dataset.key;
  if (key && state.content) {
    var langBlocks = state.content.langBlocks;
    var origBlock = langBlocks && langBlocks.length > 0 ? langBlocks[0] : null;
    var origSentences = origBlock ? origBlock.sentences : [];
    var found = null;
    for (var i = 0; i < origSentences.length; i++) {
      if (origSentences[i].key === key) {
        found = origSentences[i];
        break;
      }
    }
    if (found) {
      // Обновляем текст оригинала в панели над волной
      var sentenceTextEl = document.getElementById('editorModalWaveformSentenceText');
      if (sentenceTextEl) {
        sentenceTextEl.textContent = found.text || '—';
      }
      // Обновляем текст текущей строки на закладке "Автозаполнение оригинала"
      var autoSentenceTextEl = document.getElementById('editorModalAutoSentenceText');
      if (autoSentenceTextEl) {
        autoSentenceTextEl.textContent = found.text || '—';
      }
      // Загружаем self waveform для audio_mic текущей строки
      // (функція сама оновлює лейбли над волною)
      _loadSelfAudioForRow(found);
    }
  }

  // Обновляем регионы волны и поля Start/End под волной при выборе строки
  var wf = window.editorModalWaveform;
  if (wf) {
    if (key && state.content) {
      var langBlocks = state.content.langBlocks;
      var origBlock = langBlocks && langBlocks.length > 0 ? langBlocks[0] : null;
      var origSentences = origBlock ? origBlock.sentences : [];
      var found = null;
      for (var i = 0; i < origSentences.length; i++) {
        if (origSentences[i].key === key) {
          found = origSentences[i];
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
  var currentRow = document.querySelector('#' + EDITOR_TABLE_ID + ' tbody tr.selected');
  var rowNumberSpan = document.getElementById('editorModalCurrentRowNumber');
  if (currentRow && rowNumberSpan) {
    var rowNumber = currentRow.querySelector('.col-number')?.textContent || '1';
    rowNumberSpan.textContent = rowNumber;
  }
}

function _navigateToPreviousRow() {
  var currentRow = document.querySelector('#' + EDITOR_TABLE_ID + ' tbody tr.selected');
  if (!currentRow) return;
  var prevRow = currentRow.previousElementSibling;
  if (prevRow) {
    _selectSentenceRow(prevRow);
  }
}

function _navigateToNextRow() {
  var currentRow = document.querySelector('#' + EDITOR_TABLE_ID + ' tbody tr.selected');
  if (!currentRow) return;
  var nextRow = currentRow.nextElementSibling;
  if (nextRow) {
    _selectSentenceRow(nextRow);
  }
}

/* ===== РЕНДЕРИНГ ТАБЛИЦЫ ===== */

function _renderTable() {
  var table = document.getElementById(EDITOR_TABLE_ID);
  if (!table) return;
  var tbody = table.querySelector('tbody');
  if (!tbody) return;

  // Получаем langBlocks: langBlocks[0] — оригинал, langBlocks[1] — перевод (если есть)
  var langBlocks = state.content ? state.content.langBlocks : [];
  var origBlock = langBlocks.length > 0 ? langBlocks[0] : null;
  var trBlock = langBlocks.length > 1 ? langBlocks[1] : null;
  var origSentences = origBlock ? origBlock.sentences : [];
  var langOrig = origBlock ? origBlock.lang : (state.config?.originalLanguage || '');
  var langTr = trBlock ? trBlock.lang : (state.config?.translationLanguage || '');

  tbody.innerHTML = '';

  origSentences.forEach(function (s, index) {
    var key = s.key || 's_' + index;

    // Получаем предложение перевода по тому же ключу
    var trSentence = trBlock ? trBlock.sentences.find(function (ts) { return ts.key === key; }) : null;

    var tr = document.createElement('tr');
    tr.dataset.key = key;

    // №
    var tdNum = document.createElement('td');
    tdNum.className = 'col-number';
    tdNum.textContent = index + 1;
    tr.appendChild(tdNum);

    // Спикер (удалён из структуры, колонка скрыта)
    var tdSpeaker = document.createElement('td');
    tdSpeaker.className = 'col-speaker';
    tdSpeaker.style.display = 'none';
    tdSpeaker.textContent = '';
    tr.appendChild(tdSpeaker);

    // Оригинал
    var tdOrig = document.createElement('td');
    tdOrig.className = 'col-original panel-original';
    var origInput = document.createElement('input');
    origInput.type = 'text';
    origInput.className = 'table-input';
    origInput.value = s.text || '';
    origInput.dataset.key = key;
    origInput.dataset.field = 'text';
    origInput.dataset.lang = langOrig;
    origInput.addEventListener('change', function () {
      if (state.content) {
        var sentence = state.content.getSentenceForLang(key, langOrig);
        if (sentence) {
          sentence.text = this.value;
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
    genTtsBtn.dataset.lang = langOrig;
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
    playUserBtn.dataset.lang = langOrig;
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
    playMicBtn.dataset.lang = langOrig;
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
    transInput.value = trSentence ? (trSentence.text || '') : '';
    transInput.dataset.key = key;
    transInput.dataset.field = 'text';
    transInput.dataset.lang = langTr;
    transInput.addEventListener('change', function () {
      if (state.content && langTr) {
        var sentence = state.content.getSentenceForLang(key, langTr);
        if (sentence) {
          sentence.text = this.value;
          _setDirtyFlags({ db: true });
        }
      }
    });
    tdTrans.appendChild(transInput);
    tr.appendChild(tdTrans);

    // Play translation — кнопка t (показывает audio текущего языка перевода)
    var tdPlayTrans = document.createElement('td');
    tdPlayTrans.className = 'col-play-translation panel-translation panel-create-audio';
    var playTransBtn = document.createElement('button');
    playTransBtn.type = 'button';
    playTransBtn.className = 'audio-btn';
    playTransBtn.dataset.key = key;
    playTransBtn.dataset.lang = langTr;
    playTransBtn.dataset.field = 'audio';
    playTransBtn.dataset.state = (trSentence && trSentence.audio) ? 'ready' : 'creating';
    playTransBtn.style.background = 'none';
    playTransBtn.style.border = 'none';
    playTransBtn.style.cursor = 'pointer';
    playTransBtn.style.padding = '2px';
    playTransBtn.innerHTML = '<i data-lucide="' + ((trSentence && trSentence.audio) ? 'play' : 'hammer') + '"></i>';
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
  var lang = button.dataset.lang;
  // Если указан язык — ищем предложение для этого языка,
  // иначе возвращаем из первого языкового блока (оригинал).
  if (lang) {
    return state.content.getSentenceForLang(key, lang) || state.content.getSentence(key);
  }
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

  // Пробуем найти blob URL в AudioManager (для свежесгенерированных аудио,
  // которые ещё не сохранены на сервере). Если нашли — используем blob URL,
  // чтобы избежать 404 при попытке fetch.
  var blobUrl = '';
  try {
    var cacheKey = am._toCacheKey(audioUrl);
    console.log('[DEM] _handleAudioPlayback lookup', { audioUrl, cacheKey: cacheKey ? cacheKey.slice(0, 80) : '(empty)', lang, field, key });
    if (cacheKey) {
      blobUrl = am._getObjectUrlForCanonical(cacheKey);
      console.log('[DEM] _handleAudioPlayback blobUrl found:', blobUrl ? blobUrl.slice(0, 60) : '(empty)');
    }
  } catch (e) {
    blobUrl = '';
    console.warn('[DEM] _handleAudioPlayback lookup error:', e);
  }

  var playUrl = (blobUrl && blobUrl.startsWith('blob:')) ? blobUrl : audioUrl;
  console.log('[DEM] _handleAudioPlayback playUrl:', playUrl.slice(0, 80));

  // Воспроизводим через audioManager
  if (typeof am.play === 'function') {
    am.play(button, playUrl, function () {
      _setButtonState(button, 'ready');
    });
    _setButtonState(button, 'playing');
  } else {
    // Fallback: просто new Audio
    try {
      var audio = new Audio(playUrl);
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
      am.play(button, canonicalUrl, function () {
        _setButtonState(button, 'ready');
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

  var lang = (state.config ? state.config.originalLanguage : '');
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

  if (urls.length === 0) {
    console.log('[dictationEditorModal] _uploadDraftAudioToB2: нет URL для загрузки (sentences.length=' + sentences.length + ')');
    return;
  }

  console.log('[dictationEditorModal] _uploadDraftAudioToB2: dictationId=' + dictationId + ' lang=' + langCode + ' urls=' + JSON.stringify(urls));

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

    console.log('[dictationEditorModal] _uploadDraftAudioToB2 результат:', JSON.stringify(result));

    if (result && result.failed && result.failed.length > 0) {
      console.warn('[dictationEditorModal] Некоторые файлы не загрузились на B2:', result.failed);
    }
    if (result && result.cacheMiss && result.cacheMiss > 0) {
      console.warn('[dictationEditorModal] cacheMiss=' + result.cacheMiss + ' — аудио не найдено в кеше!');
    }
  } catch (e) {
    console.warn('[dictationEditorModal] B2 upload error', e);
  }
}

/**
 * Конвертирует Blob в base64-строку (data URL).
 * @param {Blob} blob
 * @returns {Promise<string>}
 */
function _blobToBase64(blob) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onloadend = function () { resolve(reader.result); };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function _bindAudioPlaybackHandlers() {
  var table = document.getElementById(EDITOR_TABLE_ID);
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
      var rows = Array.from(document.querySelectorAll('#' + EDITOR_TABLE_ID + ' tbody tr'));
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
      var selectedRow = document.querySelector('#' + EDITOR_TABLE_ID + ' tbody tr.selected');
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

function _findFreeKey() {
  if (!state.content) return 's_0';
  var langBlocks = state.content.langBlocks;
  if (!langBlocks || langBlocks.length === 0) return 's_0';

  // Собираем все существующие ключи из первого блока (оригинал)
  var origBlock = langBlocks[0];
  var usedNumbers = [];
  origBlock.sentences.forEach(function (s) {
    var num = parseInt(String(s.key).replace('s_', '') || '0', 10);
    if (!isNaN(num)) usedNumbers.push(num);
  });

  // Сортируем
  usedNumbers.sort(function (a, b) { return a - b; });

  // Ищем первый свободный номер
  var freeNum = 0;
  for (var i = 0; i < usedNumbers.length; i++) {
    if (usedNumbers[i] === freeNum) {
      freeNum++;
    } else if (usedNumbers[i] > freeNum) {
      break; // нашли дырку
    }
  }

  return 's_' + freeNum;
}

function _addNewRow(position) {
  var table = document.getElementById(EDITOR_TABLE_ID);
  if (!table) return;
  var tbody = table.querySelector('tbody');
  if (!tbody) return;

  var selectedRow = tbody.querySelector('tr.selected');
  if (!state.content) return;

  // Получаем langBlocks
  var langBlocks = state.content.langBlocks;
  if (!langBlocks || langBlocks.length === 0) return;

  // Открываем модальное окно добавления строки
  _openAddRowModal(position, selectedRow);
}

function _openAddRowModal(position, selectedRow) {
  var modal = document.getElementById('addRowModal');
  if (!modal) return;

  // Получаем языки перевода (все блоки кроме первого — оригинал)
  var langBlocks = state.content ? state.content.langBlocks : [];
  var translationLangs = [];
  if (langBlocks.length > 1) {
    for (var i = 1; i < langBlocks.length; i++) {
      translationLangs.push(langBlocks[i].lang);
    }
  }

  // Заполняем таблицу переводов
  var tbody = document.querySelector('#addRowModalTranslationsTable tbody');
  if (tbody) {
    tbody.innerHTML = '';
    if (translationLangs.length > 0) {
      translationLangs.forEach(function (lang) {
        var tr = document.createElement('tr');
        var langTd = document.createElement('td');
        langTd.textContent = lang;
        var inputTd = document.createElement('td');
        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'text-input';
        input.placeholder = 'Перевод...';
        input.dataset.lang = lang;
        inputTd.appendChild(input);
        tr.appendChild(langTd);
        tr.appendChild(inputTd);
        tbody.appendChild(tr);
      });
    } else {
      var tr = document.createElement('tr');
      var td = document.createElement('td');
      td.setAttribute('colspan', '2');
      td.textContent = 'Нет языков перевода';
      td.style.textAlign = 'center';
      td.style.color = '#888';
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
  }

  // Сбрасываем поле оригинала
  var origInput = document.getElementById('addRowModalOrigInput');
  if (origInput) origInput.value = '';

  // Сохраняем позицию для создания
  modal.dataset.position = position || 'below';
  if (selectedRow) {
    modal.dataset.selectedRowKey = selectedRow.dataset.key;
  } else {
    modal.dataset.selectedRowKey = '';
  }

  modal.style.display = 'flex';
}

function _closeAddRowModal() {
  var modal = document.getElementById('addRowModal');
  if (modal) modal.style.display = 'none';
}

function _handleAddRowCreate() {
  var modal = document.getElementById('addRowModal');
  if (!modal) return;

  var position = modal.dataset.position || 'below';
  var selectedRowKey = modal.dataset.selectedRowKey || '';

  var origInput = document.getElementById('addRowModalOrigInput');
  var origText = origInput ? origInput.value.trim() : '';

  // Собираем переводы
  var translations = {};
  var translationInputs = document.querySelectorAll('#addRowModalTranslationsTable tbody input[type="text"]');
  translationInputs.forEach(function (input) {
    var lang = input.dataset.lang;
    var text = input.value.trim();
    if (lang && text) {
      translations[lang] = text;
    }
  });

  // Находим свободный ключ
  var newKey = _findFreeKey();

  var table = document.getElementById(EDITOR_TABLE_ID);
  if (!table) return;
  var tbody = table.querySelector('tbody');
  if (!tbody) return;

  var langBlocks = state.content.langBlocks;
  if (!langBlocks || langBlocks.length === 0) return;

  // Определяем индекс вставки
  var insertIndex = -1;
  if (selectedRowKey) {
    var origBlock = langBlocks[0];
    for (var i = 0; i < origBlock.sentences.length; i++) {
      if (origBlock.sentences[i].key === selectedRowKey) {
        insertIndex = i;
        break;
      }
    }
    if (position === 'below' && insertIndex >= 0) {
      insertIndex = insertIndex + 1;
    }
  }

  // Создаём новое предложение для каждого языка
  langBlocks.forEach(function (block) {
    var isOrig = (block === langBlocks[0]);
    var sentence = {
      key: newKey,
      position: null,
      text: isOrig ? origText : (translations[block.lang] || ''),
      audio: '',
      audio_file: null,
      audio_mic: null,
      start: '',
      end: '',
      checked: false,
      explanation: '',
    };

    if (insertIndex >= 0 && insertIndex <= block.sentences.length) {
      block.sentences.splice(insertIndex, 0, sentence);
    } else {
      block.sentences.push(sentence);
    }
  });

  // Если включено авто — генерируем аудио для оригинала
  var checkedRadio = document.querySelector('input[name="editorModalVoiceMode"]:checked');
  var voiceMode = checkedRadio ? checkedRadio.value : 'auto';
  var dictationId = state.config ? state.config.dictationId : '';

  if (voiceMode === 'auto' && origText && dictationId) {
    _generateAudioForSentence(newKey, langBlocks[0].lang, origText, dictationId);
  }

  // Если включено авто — генерируем аудио для переводов
  if (voiceMode === 'auto' && dictationId) {
    Object.keys(translations).forEach(function (lang) {
      var trText = translations[lang];
      if (trText) {
        _generateAudioForSentence(newKey, lang, trText, dictationId);
      }
    });
  }

  _closeAddRowModal();
  _setDirtyFlags({ db: true, audio: voiceMode === 'auto' });
  _renderTable();
  _bindAudioPlaybackHandlers();
}

async function _generateAudioForSentence(key, lang, text, dictationId) {
  try {
    var safeEmail = '';
    try {
      if (window.UM && typeof window.UM.getSafeEmail === 'function') {
        safeEmail = window.UM.getSafeEmail();
      }
    } catch (e) {}

    var response = await fetch('/generate_audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dictation_id: dictationId,
        text: text,
        language: lang,
        filename_audio: 'tts_' + key + '_' + Date.now() + '.mp3',
        tipe_audio: 'avto',
        safe_email: safeEmail,
      })
    });

    var data = await response.json();
    if (!data.success || !data.audio_b64) return;

    var binaryStr = atob(data.audio_b64);
    var bytes = new Uint8Array(binaryStr.length);
    for (var j = 0; j < binaryStr.length; j++) {
      bytes[j] = binaryStr.charCodeAt(j);
    }
    var blob = new Blob([bytes], { type: data.mime || 'audio/mpeg' });
    var newFilename = data.filename || ('tts_' + key + '_' + Date.now() + '.mp3');

    var am = _ensureAudioManager();
    if (am && typeof am.saveDictationAudioBlob === 'function') {
      await am.saveDictationAudioBlob(dictationId, lang, newFilename, blob, data.mime || 'audio/mpeg');
    }

    // Обновляем sentence
    var sentence = state.content.getSentenceForLang(key, lang);
    if (sentence) {
      sentence.audio = newFilename;
    }
  } catch (e) {
    console.error('[dictationEditorModal] _generateAudioForSentence error', key, lang, e);
  }
}

function _deleteRow(row) {
  if (!row) return;
  var table = document.getElementById(EDITOR_TABLE_ID);
  if (!table) return;
  var tbody = table.querySelector('tbody');
  if (!tbody) return;

  var key = row.dataset.key;
  if (!state.content) return;

  // Удаляем предложение из всех langBlocks
  var langBlocks = state.content.langBlocks;
  if (langBlocks) {
    langBlocks.forEach(function (block) {
      var index = block.sentences.findIndex(function (s) { return s.key === key; });
      if (index !== -1) {
        block.sentences.splice(index, 1);
      }
    });
  }

  _setDirtyFlags({ db: true });
  _renderTable();
  _bindAudioPlaybackHandlers();
}

function _refillTable() {
  _renderTable();
  _bindAudioPlaybackHandlers();
}

/* ===== УПРАВЛЕНИЕ ЯЗЫКАМИ ПЕРЕВОДА (вкладка 5) ===== */

function _renderTranslationsTable() {
  var tbody = document.querySelector('#editorModalTranslationsTable tbody');
  if (!tbody) return;

  tbody.innerHTML = '';

  var langBlocks = state.content ? state.content.langBlocks : [];
  // Первый блок — оригинал, остальные — переводы
  var translationLangs = [];
  if (langBlocks.length > 1) {
    for (var i = 1; i < langBlocks.length; i++) {
      translationLangs.push(langBlocks[i].lang);
    }
  }

  if (translationLangs.length === 0) {
    var emptyRow = document.createElement('tr');
    var emptyTd = document.createElement('td');
    emptyTd.setAttribute('colspan', '2');
    emptyTd.textContent = 'Нет языков перевода';
    emptyTd.style.textAlign = 'center';
    emptyTd.style.color = '#888';
    emptyRow.appendChild(emptyTd);
    tbody.appendChild(emptyRow);
    return;
  }

  translationLangs.forEach(function (lang) {
    var tr = document.createElement('tr');

    var langTd = document.createElement('td');
    langTd.textContent = lang;

    var actionTd = document.createElement('td');
    var deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'dictation-editor-modal__table-control-btn delete-btn';
    deleteBtn.title = 'Удалить язык перевода';
    deleteBtn.innerHTML = '<i data-lucide="trash-2"></i>';
    deleteBtn.addEventListener('click', function () {
      _openRemoveTranslationModal(lang);
    });
    actionTd.appendChild(deleteBtn);

    tr.appendChild(langTd);
    tr.appendChild(actionTd);
    tbody.appendChild(tr);
  });

  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

function _openAddTranslationModal() {
  var modal = document.getElementById('addTranslationModal');
  if (!modal) return;

  // Получаем список уже добавленных языков перевода
  var langBlocks = state.content ? state.content.langBlocks : [];
  var existingLangs = {};
  langBlocks.forEach(function (block) {
    existingLangs[block.lang] = true;
  });

  var origLang = state.config ? state.config.originalLanguage : '';
  var nativeLang = state.config ? state.config.translationLanguage : '';

  // Создаём LanguageSelector для выбора языка
  var selectorContainer = document.getElementById('addTranslationLangSelector');
  if (!selectorContainer) return;

  selectorContainer.innerHTML = '';

  if (window.LanguageManager && typeof window.initLanguageSelector === 'function') {
    var languageData = window.LanguageManager.getLanguageData();
    if (languageData) {
      // Фильтруем: показываем только языки, которых ещё нет в langBlocks,
      // не равные оригинальному языку и не равные языку перевода (родному языку пользователя)
      var filteredData = {};
      Object.keys(languageData).forEach(function (code) {
        if (!existingLangs[code] && code !== origLang && code !== nativeLang) {
          filteredData[code] = languageData[code];
        }
      });

      if (Object.keys(filteredData).length === 0) {
        selectorContainer.textContent = 'Все доступные языки уже добавлены';
        selectorContainer.style.color = '#888';
        selectorContainer.style.textAlign = 'center';
        selectorContainer.style.padding = '20px';
        return;
      }

      // Берём первый доступный язык как значение по умолчанию для отображения флага
      var availableCodes = Object.keys(filteredData);
      var defaultLang = availableCodes.length > 0 ? availableCodes[0] : '';
      var selector = window.initLanguageSelector('addTranslationLangSelector', {
        mode: 'flag-single',
        currentLearning: defaultLang,
        nativeLanguage: defaultLang,
        languageData: filteredData
      });

      // Сохраняем ссылку на селектор
      modal._langSelector = selector;
    }
  }

  modal.style.display = 'flex';
}

function _closeAddTranslationModal() {
  var modal = document.getElementById('addTranslationModal');
  if (modal) {
    modal.style.display = 'none';
    modal._langSelector = null;
  }
}

async function _handleAddTranslationConfirm() {
  var modal = document.getElementById('addTranslationModal');
  if (!modal) return;

  var selector = modal._langSelector;
  if (!selector || typeof selector.getValues !== 'function') return;

  var values = selector.getValues();
  var selectedLang = values.currentLearning || '';
  if (!selectedLang) return;

  // Проверяем, не добавлен ли уже этот язык
  var langBlocks = state.content ? state.content.langBlocks : [];
  var alreadyExists = langBlocks.some(function (block) { return block.lang === selectedLang; });
  if (alreadyExists) {
    alert('Язык "' + selectedLang + '" уже добавлен');
    return;
  }

  // Добавляем новый блок языка в langBlocks
  if (state.content && state.content.langBlocks) {
    // Создаём пустые предложения для нового языка (по количеству предложений оригинала)
    var origBlock = state.content.langBlocks[0];
    var newSentences = [];
    if (origBlock && origBlock.sentences) {
      origBlock.sentences.forEach(function (s) {
        newSentences.push({
          key: s.key,
          position: s.position,
          text: '',
          audio: '',
          audio_file: null,
          audio_mic: null,
          start: '',
          end: '',
          checked: false,
          explanation: '',
        });
      });
    }
    state.content.langBlocks.push({
      lang: selectedLang,
      sentences: newSentences
    });
  }

  _closeAddTranslationModal();

  // Автоматически переводим все строки на новый язык
  var dictationId = state.config ? state.config.dictationId : '';
  var origLang = state.config ? state.config.originalLanguage : '';
  if (dictationId && origLang && origBlock && origBlock.sentences) {
    var safeEmail = '';
    try {
      if (window.UM && typeof window.UM.getSafeEmail === 'function') {
        safeEmail = window.UM.getSafeEmail();
      }
    } catch (e) {}

    for (var i = 0; i < origBlock.sentences.length; i++) {
      var s = origBlock.sentences[i];
      if (s.text) {
        try {
          var trResp = await fetch('/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: s.text,
              source_lang: origLang,
              target_lang: selectedLang,
            })
          });
          var trData = await trResp.json();
          if (trData.success && trData.translated_text) {
            // Находим соответствующее предложение в новом блоке
            var newBlock = state.content.langBlocks.find(function (b) { return b.lang === selectedLang; });
            if (newBlock) {
              var targetSentence = newBlock.sentences.find(function (ns) { return ns.key === s.key; });
              if (targetSentence) {
                targetSentence.text = trData.translated_text;
              }
            }
          }
        } catch (e) {
          console.error('[dictationEditorModal] Translation error for', s.key, selectedLang, e);
        }
      }
    }
  }

  // Автоозвучка для нового языка (если выбран режим "авто")
  var checkedRadio = document.querySelector('input[name="editorModalVoiceMode"]:checked');
  var voiceMode = checkedRadio ? checkedRadio.value : 'auto';
  if (voiceMode === 'auto' && dictationId) {
    var newBlock = state.content.langBlocks.find(function (b) { return b.lang === selectedLang; });
    if (newBlock && newBlock.sentences) {
      for (var i = 0; i < newBlock.sentences.length; i++) {
        var s = newBlock.sentences[i];
        if (s.text) {
          await _generateAudioForSentence(s.key, selectedLang, s.text, dictationId);
        }
      }
    }
  }

  // Обновляем таблицу языков и основную таблицу
  _renderTranslationsTable();
  _renderTable();
  _bindAudioPlaybackHandlers();
  _setDirtyFlags({ db: true, audio: voiceMode === 'auto' });
}

function _openRemoveTranslationModal(langCode) {
  if (typeof window.DesktopConfirmModal !== 'undefined' && window.DesktopConfirmModal.open) {
    window.DesktopConfirmModal.open({
      title: 'Удалить язык перевода',
      message: 'Вы уверены, что хотите удалить язык "' + langCode + '" и все его переводы?',
      buttons: [
        {
          text: 'Удалить',
          class: 'modal-btn modal-btn-danger',
          callback: function () {
            _removeTranslationLanguage(langCode);
          }
        },
        { text: 'Отмена', class: 'modal-btn modal-btn-secondary transparent' },
      ]
    });
  } else {
    if (confirm('Удалить язык "' + langCode + '" и все его переводы?')) {
      _removeTranslationLanguage(langCode);
    }
  }
}

function _removeTranslationLanguage(langCode) {
  if (!state.content || !state.content.langBlocks) return;

  var index = -1;
  for (var i = 0; i < state.content.langBlocks.length; i++) {
    if (state.content.langBlocks[i].lang === langCode) {
      index = i;
      break;
    }
  }

  if (index === -1) return;
  if (index === 0) return; // Не удаляем оригинал

  state.content.langBlocks.splice(index, 1);

  _renderTranslationsTable();
  _renderTable();
  _bindAudioPlaybackHandlers();
  _setDirtyFlags({ db: true });
}

/* ===== ВИДИМОСТЬ КНОПКИ "ПЕРЕЗАПОЛНИТЬ ВСЕ АВТО" ===== */

function _updateAutoRegenerateAllBtnVisibility() {
  var btn = document.getElementById('editorModalAutoRegenerateAllBtn');
  if (!btn) return;

  var checkedRadio = document.querySelector('input[name="editorModalVoiceMode"]:checked');
  var voiceMode = checkedRadio ? checkedRadio.value : 'auto';

  if (voiceMode !== 'auto') {
    btn.style.display = 'none';
    return;
  }

  // Проверяем, есть ли строки, требующие переформирования авто
  var hasPending = false;
  if (state.content) {
    var cores = state.content.getAllSentenceCores();
    if (cores && cores.length > 0) {
      for (var i = 0; i < cores.length; i++) {
        var s = cores[i];
        // Строка требует авто если: есть текст, но нет audio (пустая строка)
        // или audio не начинается с 'tts_' (не авто)
        if (s.text && (!s.audio || !s.audio.startsWith('tts_'))) {
          hasPending = true;
          break;
        }
      }
    }
  }

  btn.style.display = hasPending ? 'inline-flex' : 'none';
}

/* ===== ИНИЦИАЛИЗАЦИЯ ПОЛЕЙ ===== */

function _setupCloseButton() {
  const closeBtn = document.getElementById('dictationEditorModalCloseBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', close);
  }
}

function _setupOverlayClose() {
  const modal = document.getElementById(EDITOR_MODAL_ID);
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

    const validOrig = languageData[orig] ? orig : '';

    container.innerHTML = '';

    if (!validOrig) {
      console.warn('[dictationEditorModal] No valid original language code', { orig });
      return;
    }

    // Собираем все языки перевода из langBlocks (кроме первого — оригинала)
    var translationLangs = [];
    if (state.content && state.content.langBlocks && state.content.langBlocks.length > 1) {
      for (var i = 1; i < state.content.langBlocks.length; i++) {
        translationLangs.push(state.content.langBlocks[i].lang);
      }
    }

    if (translationLangs.length === 0) {
      // Если нет языков перевода — показываем только оригинал
      state.headerLangPairSelector = window.initLanguageSelector('editorModalLangPair', {
        mode: 'flag-single',
        currentLearning: validOrig,
        nativeLanguage: validOrig,
        languageData: languageData
      });
    } else if (translationLangs.length === 1) {
      // Один язык перевода — показываем пару флагов
      var validTr = languageData[translationLangs[0]] ? translationLangs[0] : '';
      state.headerLangPairSelector = window.initLanguageSelector('editorModalLangPair', {
        mode: 'flag-pair-fixed',
        currentLearning: validOrig,
        nativeLanguage: validTr || validOrig,
        languageData: languageData
      });
    } else {
      // Несколько языков перевода — показываем выпадающий список
      state.headerLangPairSelector = window.initLanguageSelector('editorModalLangPair', {
        mode: 'flag-pair-dropdown',
        currentLearning: validOrig,
        nativeLanguage: translationLangs[0], // первый язык по умолчанию
        languageData: languageData,
        rightDropdown: true, // правый флаг — выпадающий список
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
  if (idEl) {
    var displayId = state.config.dictationId || '';
    if (displayId.startsWith('dict_')) {
      displayId = '#' + displayId.replace('dict_', '');
    } else if (displayId) {
      displayId = '#' + displayId;
    } else {
      displayId = 'новий';
    }
    idEl.textContent = displayId;
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

  // Радио больше не меняет видимость вкладок — только видимость колонок в таблице.

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
  var handlerAttr = 'data-voice-mode-handler';
  radios.forEach(function (radio) {
    if (radio.getAttribute(handlerAttr)) return; // уже есть обработчик
    radio.setAttribute(handlerAttr, '1');
    radio.addEventListener('change', function () {
      if (this.checked) {
        // Обновляем таблицу, если мы на закладке, где радио влияет на колонки
        if (state.currentTabName === 'general' || state.currentTabName === 'voice-translations') {
          _applyTableViewForTab(state.currentTabName);
        }
        // Показываем/скрываем кнопку "Перезаполнить все авто" в шапке таблицы
        _updateAutoRegenerateAllBtnVisibility();
        // Изменение режима голоса — это изменение в БД (voice_mode), зажигаем звезду
        _setDirtyFlags({ db: true });
      }
    });
  });
}

function _initCoverUpload() {
  // Используем CoverManager для выбора и кропа обложки
  if (window.CoverManager && typeof window.CoverManager.bind === 'function') {
    var uploadBtn = document.getElementById('dictationEditorModalCoverUploadBtn');
    if (!uploadBtn) return;
    // Защита от повторного биндинга
    if (uploadBtn.getAttribute('data-cover-bound')) return;
    uploadBtn.setAttribute('data-cover-bound', '1');

    window.CoverManager.bind({
      fileInputId: 'dictationEditorModalCoverFile',
      uploadBtnId: 'dictationEditorModalCoverUploadBtn',
      previewImgId: 'dictationEditorModalCoverImage',
      modalId: 'crop-modal',
      cropImageId: 'crop-image',
      closeBtnId: 'crop-close',
      cancelBtnId: 'crop-cancel',
      confirmBtnId: 'crop-confirm',
      aspectRatio: 200 / 120,
      outputWidth: 200,
      outputHeight: 120,
      outputType: 'image/webp',
      outputQuality: 0.85,
      onDirty: function () {
        _setDirtyFlags({ cover: true });
      },
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

/**
 * Генерирует TTS-аудио для одной строки через /generate_audio.
 * Вызывается при клике на кнопку с молоточком на закладке "Автозаполнение оригинала".
 */
async function _handleGenerateTtsForSentence() {
  var btn = document.getElementById('editorModalAutoGenerateBtn');
  if (!btn) return;

  var key = null;
  var text = null;
  var lang = state.config ? state.config.originalLanguage : '';

  // Берём текущую выбранную строку
  var selectedRow = document.querySelector('#' + EDITOR_TABLE_ID + ' tbody tr.selected');
  if (selectedRow) {
    key = selectedRow.dataset.key;
  }
  if (!key || !state.content) {
    console.warn('[dictationEditorModal] Нет выбранной строки для генерации TTS');
    return;
  }

  var sentence = state.content.getSentence(key);
  if (!sentence) {
    console.warn('[dictationEditorModal] Не найдено предложение для ключа:', key);
    return;
  }

  text = sentence.text;
  if (!text) {
    console.warn('[dictationEditorModal] Пустой текст в предложении, нечего генерировать');
    return;
  }

  var dictationId = state.config ? state.config.dictationId : '';
  if (!dictationId) return;

  // Показываем состояние загрузки на кнопке
  var originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader-2"></i>';
  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();

  var safeEmail = '';
  try {
    if (window.UM && typeof window.UM.getSafeEmail === 'function') {
      safeEmail = window.UM.getSafeEmail();
    }
  } catch (e) {}

  try {
    var response = await fetch('/generate_audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dictation_id: dictationId,
        text: text,
        language: lang,
        filename_audio: 'tts_' + key + '_' + Date.now() + '.mp3',
        tipe_audio: 'avto',
        safe_email: safeEmail,
      })
    });

    var data = await response.json();
    if (!data.success || !data.audio_b64) {
      console.error('[dictationEditorModal] Ошибка генерации TTS:', data.error);
      btn.disabled = false;
      btn.innerHTML = originalHTML;
      return;
    }

    // Создаём blob из audio_b64
    var binaryStr = atob(data.audio_b64);
    var bytes = new Uint8Array(binaryStr.length);
    for (var j = 0; j < binaryStr.length; j++) {
      bytes[j] = binaryStr.charCodeAt(j);
    }
    var blob = new Blob([bytes], { type: data.mime || 'audio/mpeg' });
    var newFilename = data.filename || ('tts_' + key + '_' + Date.now() + '.mp3');

    // Сохраняем в CacheStorage через AudioManager
    var am = _ensureAudioManager();
    if (am && typeof am.saveDictationAudioBlob === 'function') {
      await am.saveDictationAudioBlob(dictationId, lang, newFilename, blob, data.mime || 'audio/mpeg');
    }

    // Обновляем sentence
    sentence.audio = newFilename;

    // Устанавливаем dirty flags
    _setDirtyFlags({ db: true, audio: true });

    // Обновляем иконку кнопки в таблице для этой строки
    var ttsBtn = document.querySelector('#' + EDITOR_TABLE_ID + ' .col-generate-tts button[data-key="' + key + '"]');
    if (ttsBtn) {
      ttsBtn.dataset.state = 'ready';
      var icon = ttsBtn.querySelector('i[data-lucide]');
      if (icon) {
        icon.setAttribute('data-lucide', 'play');
      }
    }
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();

    console.log('[dictationEditorModal] TTS сгенерирован для строки', key, newFilename);
  } catch (e) {
    console.error('[dictationEditorModal] Ошибка при генерации TTS:', e);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }
}

/**
 * Перегенерирует TTS-аудио для всех строк через /generate_audio.
 * Вызывается при клике на кнопку "Перезаполнить все" на закладке "Автозаполнение оригинала".
 */
async function _handleRegenerateAllTts() {
  var btn = document.getElementById('editorModalAutoRegenerateAllBtn');
  if (!btn) return;

  if (!state.content) return;
  var cores = state.content.getAllSentenceCores();
  if (!cores || cores.length === 0) return;

  var lang = state.config ? state.config.originalLanguage : '';
  var dictationId = state.config ? state.config.dictationId : '';
  if (!dictationId || !lang) return;

  // Показываем состояние загрузки на кнопке
  var originalHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="loader-2"></i> <span>Генерація...</span>';
  if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();

  var successCount = 0;
  var errorCount = 0;

  var safeEmail = '';
  try {
    if (window.UM && typeof window.UM.getSafeEmail === 'function') {
      safeEmail = window.UM.getSafeEmail();
    }
  } catch (e) {}

  try {
    for (var i = 0; i < cores.length; i++) {
      var sentence = state.content.getSentence(cores[i].key);
      if (!sentence) continue;

      var text = sentence.text;
      if (!text) {
        errorCount++;
        continue;
      }

      try {
        var response = await fetch('/generate_audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dictation_id: dictationId,
            text: text,
            language: lang,
            filename_audio: 'tts_' + cores[i].key + '_' + Date.now() + '.mp3',
            tipe_audio: 'avto',
            safe_email: safeEmail,
          })
        });

        var data = await response.json();
        if (!data.success || !data.audio_b64) {
          errorCount++;
          continue;
        }

        // Создаём blob из audio_b64
        var binaryStr = atob(data.audio_b64);
        var bytes = new Uint8Array(binaryStr.length);
        for (var j = 0; j < binaryStr.length; j++) {
          bytes[j] = binaryStr.charCodeAt(j);
        }
        var blob = new Blob([bytes], { type: data.mime || 'audio/mpeg' });
        var newFilename = data.filename || ('tts_' + cores[i].key + '_' + Date.now() + '.mp3');

        // Сохраняем в CacheStorage через AudioManager
        var am = _ensureAudioManager();
        if (am && typeof am.saveDictationAudioBlob === 'function') {
          await am.saveDictationAudioBlob(dictationId, lang, newFilename, blob, data.mime || 'audio/mpeg');
        }

        // Обновляем sentence
        sentence.audio = newFilename;

        // Обновляем иконку кнопки в таблице
        var ttsBtn = document.querySelector('#' + EDITOR_TABLE_ID + ' .col-generate-tts button[data-key="' + cores[i].key + '"]');
        if (ttsBtn) {
          ttsBtn.dataset.state = 'ready';
          var icon = ttsBtn.querySelector('i[data-lucide]');
          if (icon) {
            icon.setAttribute('data-lucide', 'play');
          }
        }

        successCount++;
      } catch (e) {
        console.error('[dictationEditorModal] Ошибка генерации TTS для строки', cores[i].key, e);
        errorCount++;
      }
    }

    // Устанавливаем dirty flags
    _setDirtyFlags({ db: true, audio: true });

    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();

    console.log('[dictationEditorModal] TTS перегенерация завершена: успешно', successCount, 'ошибок', errorCount);
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }
}

/**
 * Инициализирует обработчики для закладки "Автозаполнение оригинала" (voice-original-auto).
 */
function _initAutoAudioTab() {
  // Кнопка генерации для текущей строки
  var generateBtn = document.getElementById('editorModalAutoGenerateBtn');
  if (generateBtn && !generateBtn.getAttribute('data-auto-audio-handler')) {
    generateBtn.setAttribute('data-auto-audio-handler', '1');
    generateBtn.addEventListener('click', function () {
      _handleGenerateTtsForSentence();
    });
  }

  // Кнопка "Перезаполнить все"
  var regenerateAllBtn = document.getElementById('editorModalAutoRegenerateAllBtn');
  if (regenerateAllBtn && !regenerateAllBtn.getAttribute('data-auto-audio-handler')) {
    regenerateAllBtn.setAttribute('data-auto-audio-handler', '1');
    regenerateAllBtn.addEventListener('click', function () {
      _handleRegenerateAllTts();
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
  var table = document.getElementById(EDITOR_TABLE_ID);
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
      } catch (e) { }
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
          text: s.text || '',
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

    // Собираем предложения из DictationContent в плоский массив с language_code
    var sentencesPayload = [];
    if (state.content) {
      var langBlocks = state.content.langBlocks || [];
      langBlocks.forEach(function (block) {
        var lang = block.lang || '';
        if (!lang) return;
        block.sentences.forEach(function (s) {
          sentencesPayload.push({
            language_code: lang,
            key: s.key,
            position: s.position,
            text: s.text || '',
            audio: s.audio || '',
            audio_file: s.audio_file || null,
            audio_mic: s.audio_mic || null,
            start: s.start || '',
            end: s.end || '',
            checked: s.checked || false,
            explanation: s.explanation || '',
          });
        });
      });
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

    // Читаем book_id из sessionStorage (устанавливается при создании нового диктанта
    // через setDictationTargetBook() в desktop.js или book_modal.js)
    var targetBookStr = null;
    var targetBookId = null;
    try {
      targetBookStr = sessionStorage.getItem('dictationTargetBook');
      if (targetBookStr) {
        var parsed = JSON.parse(targetBookStr);
        if (parsed && parsed.book_id != null) {
          targetBookId = Number(parsed.book_id);
        }
      }
    } catch (e) {
      targetBookId = null;
    }

    // Получаем db_id из config (если ID был зарезервирован на сервере)
    var dbId = state.config ? state.config.dbId : null;

    // Если обложка была изменена (dirty cover), получаем blob через CoverManager
    // и конвертируем в base64 для передачи в save_dictation_final
    var cover_b64 = null;
    if (flags.cover) {
      try {
        if (window.CoverManager && typeof window.CoverManager.getCroppedBlob === 'function') {
          var coverBlob = window.CoverManager.getCroppedBlob();
          if (coverBlob) {
            cover_b64 = await _blobToBase64(coverBlob);
          }
        }
      } catch (e) {
        console.warn('[dictationEditorModal] Не удалось получить blob обложки:', e);
      }
    }

    var saveData = {
      id: normalizedId,
      temp_id: normalizedId,
      db_id: dbId,
      language_original: state.config ? state.config.originalLanguage : '',
      language_translation: state.config ? state.config.translationLanguage : '',
      title: state.config ? state.config.title : 'Без названия',
      level: state.config ? (state.config.level || 'A1') : 'A1',
      is_dialog: state.currentDictation ? !!state.currentDictation.is_dialog : false,
      audio_user_shared: state._sharedAudioFilename || null,
      audio_order: audioOrderValue,
      sentences: sentencesPayload,
      book_id: targetBookId,
      cover_b64: cover_b64,
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

          // Обновляем ID диктанта из ответа сервера (на случай, если это был новый диктант)
          var newDictationId = dbResult.dictation_id;
          if (newDictationId && state.config) {
            var prevId = state.config.dictationId || '';
            if (prevId !== newDictationId) {
              console.log('[dictationEditorModal] Обновляю ID диктанта:', prevId, '->', newDictationId);
              state.config.dictationId = newDictationId;
              // Обновляем ID в DictationContent
              if (state.content) {
                state.content.dictationId = newDictationId;
              }
              // Обновляем отображение ID в UI
              var idSpan = document.getElementById('dictation-editor-modal-id');
              if (idSpan) {
                var displayId = newDictationId.replace('dict_', '');
                idSpan.textContent = '#' + displayId;
              }
            }
            // Обновляем dbId в config (сервер мог создать новую запись в БД)
            if (dbResult.id && (!state.config.dbId || state.config.dictationId !== prevId)) {
              state.config.dbId = dbResult.id;
            }
          }

          // Добавляем диктант на рабочий стол (если это новый диктант)
          try {
            // Пытаемся получить числовой ID диктанта из ответа сервера
            var newDbId = dbResult.id || dbResult.db_id;
            // Если не нашли в ответе — пробуем извлечь из dictation_id
            if (!newDbId && dbResult.dictation_id) {
              var idStr = String(dbResult.dictation_id).replace('dict_', '');
              var parsed = parseInt(idStr, 10);
              if (!isNaN(parsed)) newDbId = parsed;
            }
            // Если всё ещё нет — используем state.config.dbId (зарезервированный ID)
            if (!newDbId && state.config && state.config.dbId) {
              newDbId = state.config.dbId;
            }
            if (newDbId) {
              var deskResp = await fetch('/desk/api/items', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': 'Bearer ' + token
                },
                body: JSON.stringify({ dictation_id: Number(newDbId) })
              });
              if (deskResp.ok) {
                console.log('[dictationEditorModal] Диктант добавлен на рабочий стол');
                // Показываем тост
                try {
                  if (window.DictationKart && typeof window.DictationKart._showToast === 'function') {
                    window.DictationKart._showToast('Диктант додано на робочий стіл', { durationMs: 2200 });
                  }
                } catch (e) {}
              } else {
                console.warn('[dictationEditorModal] Не удалось добавить диктант на стол');
              }
            }
          } catch (e) {
            console.warn('[dictationEditorModal] Ошибка добавления на стол:', e);
          }

          // Обновляем десктоп, если он есть (перезагружаем карточки)
          try {
            if (window.Desktop && typeof window.Desktop.loadDeskItems === 'function') {
              window.Desktop.loadDeskItems();
            }
          } catch (e) {
            console.warn('[dictationEditorModal] Ошибка обновления десктопа:', e);
          }
        } else {
          console.error('[dictationEditorModal] Ошибка сохранения БД:', dbResult.error);
        }
      } else {
        console.error('[dictationEditorModal] Ошибка HTTP при сохранении БД:', dbResponse.status);
      }
    }

    // После сохранения БД используем актуальный ID для аудио и обложки
    var effectiveDictationId = state.config ? state.config.dictationId : normalizedId;
    if (!effectiveDictationId) effectiveDictationId = normalizedId;

    // Этап 2: Сохраняем аудио (если dirty audio)
    if (flags.audio) {
      console.log('[dictationEditorModal] Сохраняю аудио...');
      try {
        await _uploadDraftAudioToB2(effectiveDictationId, token);
        _setDirtyFlags({ audio: false });
        console.log('[dictationEditorModal] Аудио сохранено');
      } catch (audioErr) {
        console.error('[dictationEditorModal] Ошибка сохранения аудио:', audioErr);
      }
    }

    // Обложка передаётся как cover_b64 внутри save_dictation_final (этап 1),
    // поэтому отдельный этап для обложки не нужен.
    if (flags.cover) {
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

  // Сбрасываем self audio состояние
  state._selfAudioFilename = null;
  state._selfAudioUrl = null;
  state._selfAudioDuration = null;
  state._selfAudioFile = null;

  // Сбрасываем waveform (уничтожаем предыдущий экземпляр если был)
  if (window.editorModalWaveform) {
    try {
      window.editorModalWaveform.destroy();
    } catch (e) {
      // ignore
    }
    window.editorModalWaveform = null;
  }

  // Сбрасываем self waveform
  if (window.editorModalSelfWaveform) {
    try {
      window.editorModalSelfWaveform.destroy();
    } catch (e) {
      // ignore
    }
    window.editorModalSelfWaveform = null;
  }

  // Сбрасываем текст в панели waveform
  var filenameEl = document.getElementById('editorModalWaveformFilename');
  if (filenameEl) filenameEl.textContent = '';
  var sentenceTextEl = document.getElementById('editorModalWaveformSentenceText');
  if (sentenceTextEl) sentenceTextEl.textContent = '';
  var waveformContainer = document.getElementById('editorModalWaveform');
  if (waveformContainer) waveformContainer.innerHTML = '';

  // Сбрасываем текст в панели self
  var selfFilenameEl = document.getElementById('editorModalSelfFilename');
  if (selfFilenameEl) selfFilenameEl.textContent = '';
  var selfSentenceTextEl = document.getElementById('editorModalSelfSentenceText');
  if (selfSentenceTextEl) selfSentenceTextEl.textContent = '';
  var selfWaveformContainer = document.getElementById('editorModalSelfAudioWaveform');
  if (selfWaveformContainer) selfWaveformContainer.innerHTML = '';

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
    });
    // Если content уже существовал и в нём есть langBlocks — используем их,
    // иначе устанавливаем sentences из config
    if (rawSentences && rawSentences.length > 0) {
      var existingBlocks = state.content.langBlocks;
      var hasSentences = existingBlocks && existingBlocks.length > 0 &&
        existingBlocks[0].sentences && existingBlocks[0].sentences.length > 0;
      if (!hasSentences) {
        state.content.setSentences(rawSentences);
      }
    }
    // Если content уже существовал и в нём есть audio_or_order — используем его
    // как источник истины (приоритет над config)
    if (state.content.audio_or_order !== undefined && state.content.audio_or_order !== null && state.content.audio_or_order !== '') {
      state.config.audio_order = state.content.audio_or_order;
    } else if (audioOrderFromConfig) {
      // Если в content нет audio_or_order, но есть в config — сохраняем в content
      state.content.audio_or_order = audioOrderFromConfig;
    }
    // Аналогично для audio_or_shared
    if (state.content.audio_or_shared) {
      state.config.audio_user_shared = state.content.audio_or_shared;
      state._sharedAudioFilename = state.content.audio_or_shared;
    } else if (audioUserSharedFromConfig) {
      state.content.audio_or_shared = audioUserSharedFromConfig;
    }
  } else if (typeof DictationContent !== 'undefined') {
    // Группируем rawSentences по language_code в langBlocks
    var langBlocks = [];
    if (rawSentences && rawSentences.length > 0) {
      var grouped = {};
      rawSentences.forEach(function (s) {
        var lc = s.language_code || '';
        if (!lc) return;
        if (!grouped[lc]) grouped[lc] = [];
        grouped[lc].push(s);
      });
      langBlocks = Object.keys(grouped).map(function (lc) {
        return { lang: lc, sentences: grouped[lc] };
      });
    } else {
      // Если нет sentences, создаём пустые блоки для оригинального и переводного языков
      if (langOrig) langBlocks.push({ lang: langOrig, sentences: [] });
      if (langTr && langTr !== langOrig) langBlocks.push({ lang: langTr, sentences: [] });
    }
    state.content = new DictationContent({
      dictationId: dictationId,
      langBlocks: langBlocks,
      audio_or_order: audioOrderFromConfig,
      audio_or_shared: audioUserSharedFromConfig,
    });
  } else {
    // Fallback: создаём простой объект с методами, совместимыми с новой структурой
    var fallbackLangBlocks = [];
    if (rawSentences && rawSentences.length > 0) {
      var grouped = {};
      rawSentences.forEach(function (s) {
        var lc = s.language_code || '';
        if (!lc) return;
        if (!grouped[lc]) grouped[lc] = [];
        grouped[lc].push({
          key: s.key || 's_' + grouped[lc].length,
          position: s.position != null ? Number(s.position) : null,
          text: s.text || '',
          audio: s.audio || '',
          audio_file: s.audio_file || null,
          audio_mic: s.audio_mic || null,
          start: (s.start != null && s.start !== '') ? s.start : '',
          end: (s.end != null && s.end !== '') ? s.end : '',
          checked: s.checked || false,
          explanation: s.explanation || '',
        });
      });
      fallbackLangBlocks = Object.keys(grouped).map(function (lc) {
        return { lang: lc, sentences: grouped[lc] };
      });
    } else {
      if (langOrig) fallbackLangBlocks.push({ lang: langOrig, sentences: [] });
      if (langTr && langTr !== langOrig) fallbackLangBlocks.push({ lang: langTr, sentences: [] });
    }
    state.content = {
      dictationId: dictationId,
      audio_or_order: audioOrderFromConfig,
      audio_or_shared: audioUserSharedFromConfig,
      langBlocks: fallbackLangBlocks,
      getAllSentenceCores: function () {
        var orig = this.langBlocks[0];
        return orig ? orig.sentences.slice() : [];
      },
      getSentence: function (key) {
        var orig = this.langBlocks[0];
        if (!orig) return null;
        return orig.sentences.find(function (s) { return s.key === String(key); }) || null;
      },
      getSentenceForLang: function (key, lang) {
        var block = this.langBlocks.find(function (b) { return b.lang === lang; });
        if (!block) return null;
        return block.sentences.find(function (s) { return s.key === String(key); }) || null;
      },
      getAllKeys: function () {
        var orig = this.langBlocks[0];
        return orig ? orig.sentences.map(function (s) { return s.key; }) : [];
      },
      setSentences: function (sentences) {
        if (!Array.isArray(sentences)) return;
        var grouped = {};
        sentences.forEach(function (s) {
          var lc = s.language_code || '';
          if (!lc) return;
          if (!grouped[lc]) grouped[lc] = [];
          grouped[lc].push({
            key: s.key || 's_' + grouped[lc].length,
            position: s.position != null ? Number(s.position) : null,
            text: s.text || '',
            audio: s.audio || '',
            audio_file: s.audio_file || null,
            audio_mic: s.audio_mic || null,
            start: (s.start != null && s.start !== '') ? s.start : '',
            end: (s.end != null && s.end !== '') ? s.end : '',
            checked: s.checked || false,
            explanation: s.explanation || '',
          });
        });
        this.langBlocks = Object.keys(grouped).map(function (lc) {
          return { lang: lc, sentences: grouped[lc] };
        });
      },
    };
  }

  state.currentDictation = {
    is_dialog: config.is_dialog || false,
    show_explanation: config.show_explanation || false,
  };

  const modal = document.getElementById(EDITOR_MODAL_ID);
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
  _initSelfAudioTab();
  _setupTabs();
  _renderTable();
  _renderTranslationsTable();
  _updateAutoRegenerateAllBtnVisibility();
  _bindAudioPlaybackHandlers();
  _setupTableControls();
  _updateUnsavedStar();

  // Инициализируем AudioManager
  _ensureAudioManager();

  // Пытаемся восстановить shared audio из данных предложений (после reopen)
  _restoreSharedAudioFromSentences();

  // После восстановления shared audio обновляем текст в панели над волной
  // из первой (активной) строки таблицы, чтобы там не осталось имени файла
  var firstRowAfterRestore = document.querySelector('#' + EDITOR_TABLE_ID + ' tbody tr');
  if (firstRowAfterRestore) {
    _selectSentenceRow(firstRowAfterRestore);
  }

  // Переключаемся на правильную закладку в зависимости от режима audio_order.
  // Если audio_order === 'f' (режим "э файл") — открываем закладку с волной,
  // чтобы waveform могла корректно инициализироваться (wavesurfer не работает в скрытом контейнере).
  // Если audio_order === 'm' (режим "сам") — открываем закладку с микрофоном.
  // В остальных случаях — открываем первую закладку (Общие данные).
  var audioOrder = state.config ? state.config.audio_order : null;
  if (audioOrder === 'f') {
    var haveTabBtn = document.querySelector('.dictation-editor-modal__tab-btn[data-tab="voice-original-have"]');
    if (haveTabBtn) {
      haveTabBtn.click();
    }
    // После переключения на закладку с волной — синхронизируем регионы
    // для текущей (первой) строки, если у неё есть start/end
    var wf = window.editorModalWaveform;
    if (wf) {
      var selectedRow = document.querySelector('#' + EDITOR_TABLE_ID + ' tbody tr.selected');
      if (selectedRow) {
        var key = selectedRow.dataset.key;
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
              var startInput = document.getElementById('editorModalAudioStartTime');
              var endInput = document.getElementById('editorModalAudioEndTime');
              if (startInput) startInput.value = startVal.toFixed(2);
              if (endInput) endInput.value = endVal.toFixed(2);
            }
          }
        }
      }
    }
  } else if (audioOrder === 'm') {
    // Режим "сам" — переключаемся на закладку voice-original-self
    var selfTabBtn = document.querySelector('.dictation-editor-modal__tab-btn[data-tab="voice-original-self"]');
    if (selfTabBtn) {
      selfTabBtn.click();
    }
    // Пытаемся восстановить self audio из данных первого предложения
    _restoreSelfAudioFromSentences();
  } else {
    var defaultTabBtn = document.querySelector('.dictation-editor-modal__tab-btn[data-tab="general"]');
    if (defaultTabBtn) {
      defaultTabBtn.click();
    }
  }

  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }

  document.body.style.overflow = 'hidden';

  // Если это новый диктант — открываем fill modal поверх редактора
  if (state.config && state.config.isNewDictation) {
    // Даём редактору отрисоваться, затем открываем fill modal
    setTimeout(function () {
      if (window.NewDictationFillModal && typeof window.NewDictationFillModal.open === 'function') {
        window.NewDictationFillModal.open(state.config);
      }
    }, 100);
  }
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

  // НЕ пишем имя файла в editorModalWaveformSentenceText — это лейба для текста предложения.
  // Имя файла уже отображается в editorModalWaveformFilename выше.
  // editorModalWaveformSentenceText остаётся пустым; при клике на строку таблицы
  // _selectSentenceRow() обновит его текстом выбранного предложения.

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

/**
 * Восстанавливает self audio (audio_mic) из данных предложений
 * для текущей выбранной строки на закладке voice-original-self.
 */
async function _restoreSelfAudioFromSentences() {
  if (!state.content) return;

  var selectedRow = document.querySelector('#' + EDITOR_TABLE_ID + ' tbody tr.selected');
  if (!selectedRow) return;

  var key = selectedRow.dataset.key;
  if (!key) return;

  var sentence = state.content.getSentence(key);
  if (!sentence) return;

  var micFilename = sentence.audio_mic || sentence.audio_m || null;
  if (!micFilename) {
    // Нет self audio — ничего не показываем
    return;
  }

  var lang = state.config?.originalLanguage || '';
  var dictationId = state.config?.dictationId || '';

  // Обновляем лейблы
  var filenameEl = document.getElementById('editorModalSelfFilename');
  if (filenameEl) filenameEl.textContent = micFilename;
  var sentenceTextEl = document.getElementById('editorModalSelfSentenceText');
  if (sentenceTextEl) sentenceTextEl.textContent = sentence.text || '—';

  // Пробуем получить URL через AudioManager
  var am = _ensureAudioManager();
  if (!am) return;

  try {
    var canonicalUrl = am.buildDictationAudioUrl(dictationId, lang, micFilename);
    var playableUrl = await am.resolvePlayableUrl(canonicalUrl);
    if (playableUrl) {
      _initSelfWaveform(playableUrl);
      state._selfAudioUrl = playableUrl;
      state._selfAudioFilename = micFilename;

      // Устанавливаем start/end регионы, если есть
      if (sentence.start !== undefined && sentence.start !== '' && sentence.end !== undefined && sentence.end !== '') {
        var startVal = parseFloat(sentence.start);
        var endVal = parseFloat(sentence.end);
        if (!isNaN(startVal) && !isNaN(endVal)) {
          var wf = window.editorModalSelfWaveform;
          if (wf) {
            // Даём время на загрузку waveform, потом устанавливаем регион
            setTimeout(function () {
              wf.setRegion(startVal, endVal);
              var startInput = document.getElementById('editorModalSelfAudioStartTime');
              var endInput = document.getElementById('editorModalSelfAudioEndTime');
              if (startInput) startInput.value = startVal.toFixed(2);
              if (endInput) endInput.value = endVal.toFixed(2);
            }, 500);
          }
        }
      }
      return;
    }
  } catch (e) {
    console.warn('[dictationEditorModal] Не удалось восстановить self audio через кэш', e);
  }

  // Если не нашли в кэше — пробуем загрузить напрямую с сервера
  try {
    var directUrl = am.buildDictationAudioUrl(dictationId, lang, micFilename);
    _initSelfWaveform(directUrl);
    state._selfAudioUrl = directUrl;
    state._selfAudioFilename = micFilename;
    console.log('[dictationEditorModal] Self audio восстановлен через прямой URL:', directUrl);
  } catch (e2) {
    console.warn('[dictationEditorModal] Не удалось восстановить self audio даже через прямой URL', e2);
  }
}

/**
 * Загружает self waveform для указанного предложения (по audio_mic).
 * Вызывается при переключении строк в _selectSentenceRow().
 * Если audio_mic пустой — очищает waveform.
 */
async function _loadSelfAudioForRow(sentence) {
  // Уничтожаем старую self waveform
  if (window.editorModalSelfWaveform) {
    window.editorModalSelfWaveform.destroy();
    window.editorModalSelfWaveform = null;
  }

  // Освобождаем старый blob URL
  if (state._selfAudioUrl && state._selfAudioUrl.startsWith('blob:')) {
    URL.revokeObjectURL(state._selfAudioUrl);
  }
  state._selfAudioUrl = null;
  state._selfAudioFilename = null;
  state._selfAudioDuration = null;
  state._selfAudioFile = null;

  // Очищаем контейнер waveform
  var waveformContainer = document.getElementById('editorModalSelfAudioWaveform');
  if (waveformContainer) {
    waveformContainer.innerHTML = '';
  }

  // Сбрасываем поля Start/End
  var startInput = document.getElementById('editorModalSelfAudioStartTime');
  var endInput = document.getElementById('editorModalSelfAudioEndTime');
  if (startInput) startInput.value = '0';
  if (endInput) endInput.value = '0';

  // Оновлюємо лейбли над волною
  var selfFilenameEl = document.getElementById('editorModalSelfFilename');
  var selfSentenceTextEl = document.getElementById('editorModalSelfSentenceText');
  if (selfFilenameEl) {
    selfFilenameEl.textContent = (sentence && sentence.audio_mic) ? sentence.audio_mic : '';
  }
  if (selfSentenceTextEl) {
    selfSentenceTextEl.textContent = (sentence && sentence.text) ? sentence.text : '—';
  }

  if (!sentence) return;

  var micFilename = sentence.audio_mic || sentence.audio_m || null;
  if (!micFilename) {
    // Нет self audio — волна пустая (лейбли вже оновлено вище)
    return;
  }

  var lang = state.config?.originalLanguage || '';
  var dictationId = state.config?.dictationId || '';

  // Пробуем получить URL через AudioManager
  var am = _ensureAudioManager();
  if (!am) return;

  try {
    var canonicalUrl = am.buildDictationAudioUrl(dictationId, lang, micFilename);
    var playableUrl = await am.resolvePlayableUrl(canonicalUrl);
    if (playableUrl) {
      _initSelfWaveform(playableUrl);
      state._selfAudioUrl = playableUrl;
      state._selfAudioFilename = micFilename;

      // Устанавливаем start/end регионы, если есть
      if (sentence.start !== undefined && sentence.start !== '' && sentence.end !== undefined && sentence.end !== '') {
        var startVal = parseFloat(sentence.start);
        var endVal = parseFloat(sentence.end);
        if (!isNaN(startVal) && !isNaN(endVal)) {
          var wf = window.editorModalSelfWaveform;
          if (wf) {
            // Даём время на загрузку waveform, потом устанавливаем регион
            setTimeout(function () {
              wf.setRegion(startVal, endVal);
              if (startInput) startInput.value = startVal.toFixed(2);
              if (endInput) endInput.value = endVal.toFixed(2);
            }, 500);
          }
        }
      }
      return;
    }
  } catch (e) {
    console.warn('[dictationEditorModal] Не удалось загрузить self audio через кэш', e);
  }

  // Если не нашли в кэше — пробуем загрузить напрямую с сервера
  try {
    var directUrl = am.buildDictationAudioUrl(dictationId, lang, micFilename);
    _initSelfWaveform(directUrl);
    state._selfAudioUrl = directUrl;
    state._selfAudioFilename = micFilename;
    console.log('[dictationEditorModal] Self audio загружен через прямой URL:', directUrl);
  } catch (e2) {
    console.warn('[dictationEditorModal] Не удалось загрузить self audio даже через прямой URL', e2);
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

  // Уничтожаем waveform для shared audio
  if (window.editorModalWaveform) {
    window.editorModalWaveform.destroy();
    window.editorModalWaveform = null;
  }

  // ---- Очистка self audio состояния ----

  // Сбрасываем self audio состояние
  state._selfAudioFilename = null;
  state._selfAudioDuration = null;
  state._selfAudioFile = null;

  // Освобождаем blob URL для self audio
  if (state._selfAudioUrl) {
    URL.revokeObjectURL(state._selfAudioUrl);
    state._selfAudioUrl = null;
  }

  // Уничтожаем self waveform
  if (window.editorModalSelfWaveform) {
    window.editorModalSelfWaveform.destroy();
    window.editorModalSelfWaveform = null;
  }

  // Сбрасываем UI self-закладки
  var selfFilenameEl = document.getElementById('editorModalSelfFilename');
  if (selfFilenameEl) selfFilenameEl.textContent = '';
  var selfSentenceTextEl = document.getElementById('editorModalSelfSentenceText');
  if (selfSentenceTextEl) selfSentenceTextEl.textContent = '';
  var selfWaveformContainer = document.getElementById('editorModalSelfAudioWaveform');
  if (selfWaveformContainer) selfWaveformContainer.innerHTML = '';

  // ---- Очистка UnifiedSpeechRecognition (record-режим, запис з мікрофона) ----
  if (state._micRecorder) {
    state._micRecorder.destroyRecordUI();
    state._micRecorder = null;
  }

  const modal = document.getElementById(EDITOR_MODAL_ID);
  if (modal) {
    modal.style.display = 'none';
  }

  document.body.style.overflow = '';
}

/* ===== ВКЛАДКА "ОЗВУЧКА ОРИГІНАЛУ (САМ)" (voice-original-self) ===== */


/**
 * Ініціалізує обробники для закладки "Озвучка оригинала (сам)".
 */
function _initSelfAudioTab() {
  // Кнопка вибору файлу
  var selectBtn = document.getElementById('editorModalSelfSelectFileBtn');
  var fileInput = document.getElementById('editorModalSelfAudioFileInput');
  if (selectBtn && fileInput && !selectBtn.getAttribute('data-self-audio-handler')) {
    selectBtn.setAttribute('data-self-audio-handler', '1');
    selectBtn.addEventListener('click', function () {
      fileInput.click();
    });
  }
  if (fileInput && !fileInput.getAttribute('data-self-audio-handler')) {
    fileInput.setAttribute('data-self-audio-handler', '1');
    fileInput.addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      _uploadSelfAudioFile(file);
      fileInput.value = '';
    });
  }

  // Кнопка Play під хвилею
  var playBtn = document.getElementById('editorModalSelfAudioPlayBtn');
  if (playBtn && !playBtn.getAttribute('data-self-audio-handler')) {
    playBtn.setAttribute('data-self-audio-handler', '1');
    playBtn.addEventListener('click', function (event) {
      _handleSelfAudioPlayback(event);
    });
  }

  // Кнопка "Обрізати" (cut/trim по Start/End)
  var cutBtn = document.getElementById('editorModalSelfCutBtn');
  if (cutBtn && !cutBtn.getAttribute('data-self-audio-handler')) {
    cutBtn.setAttribute('data-self-audio-handler', '1');
    cutBtn.addEventListener('click', function () {
      _handleSelfCutAudio();
    });
  }

  // Стрілки для полів Start/End
  document.querySelectorAll('#tab-voice-original-self .time-input-arrow').forEach(function (btn) {
    if (btn.getAttribute('data-self-audio-handler')) return;
    btn.setAttribute('data-self-audio-handler', '1');
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
      var field = targetId === 'editorModalSelfAudioStartTime' ? 'start' : 'end';
      _syncSelfWaveformRegion(field, val);
      _syncStartEndToSentence(field, val);
    });
  });

  // Ручний ввід у поля Start/End
  var startInput = document.getElementById('editorModalSelfAudioStartTime');
  var endInput = document.getElementById('editorModalSelfAudioEndTime');
  if (startInput && !startInput.getAttribute('data-self-audio-handler')) {
    startInput.setAttribute('data-self-audio-handler', '1');
    startInput.addEventListener('change', function () {
      var val = parseFloat(this.value);
      if (!isNaN(val) && val >= 0) {
        _syncSelfWaveformRegion('start', val);
        _syncStartEndToSentence('start', val);
      }
    });
  }
  if (endInput && !endInput.getAttribute('data-self-audio-handler')) {
    endInput.setAttribute('data-self-audio-handler', '1');
    endInput.addEventListener('change', function () {
      var val = parseFloat(this.value);
      if (!isNaN(val) && val >= 0) {
        _syncSelfWaveformRegion('end', val);
        _syncStartEndToSentence('end', val);
      }
    });
  }

  // ---- UnifiedSpeechRecognition (record-режим): запис з мікрофона ----
  // Створюємо екземпляр, якщо ще не створений
  if (!state._micRecorder) {
    state._micRecorder = new window.UnifiedSpeechRecognition({
      mode: 'record',
      onApply: function (filename, blob) {
        _applySelfMicFile(filename, blob);
      },
      getRowKey: function () {
        var selectedRow = document.querySelector('#' + EDITOR_TABLE_ID + ' tbody tr.selected');
        return selectedRow ? selectedRow.dataset.key : 'unknown';
      },
    });
  }
  state._micRecorder.bindRecordUI();
}

/* ---- Завантаження файлу для self-закладки ---- */

/**
 * Завантажує аудіофайл для поточної строки (записує в audio_mic).
 */
function _uploadSelfAudioFile(file) {
  var selectedRow = document.querySelector('#' + EDITOR_TABLE_ID + ' tbody tr.selected');
  if (!selectedRow) {
    alert('Не вибрано рядок для завантаження файлу');
    return;
  }

  var key = selectedRow.dataset.key;
  if (!key || !state.content) return;

  var sentence = state.content.getSentence(key);
  if (!sentence) return;

  // Записуємо ім'я файлу в audio_mic поточної строки
  sentence.audio_mic = file.name;

  // Зберігаємо файл у CacheStorage
  _cacheSelfAudioFile(file, file.name);

  // Помічаємо dirty
  _setDirtyFlags({ db: true, audio: true });

  // Виконуємо процедуру "актуальна строка" — оновлюємо лейбли і волну
  _loadSelfAudioForRow(sentence);
}

/**
 * Зберігає self audio файл у CacheStorage.
 */
async function _cacheSelfAudioFile(file, filename) {
  var dictationId = state.config ? state.config.dictationId : '';
  var lang = state.config ? state.config.originalLanguage : '';
  if (!dictationId || !lang || !filename || !file) return;

  var am = _ensureAudioManager();
  if (!am || typeof am.saveDictationAudioBlob !== 'function') return;

  try {
    await am.saveDictationAudioBlob(dictationId, lang, filename, file, file.type || 'audio/mpeg');
    console.log('[dictationEditorModal] Self audio збережено в CacheStorage:', filename);
  } catch (e) {
    console.warn('[dictationEditorModal] Не вдалося зберегти self audio в CacheStorage', e);
  }
}

/* ---- Хвиля для self-закладки ---- */

function _initSelfWaveform(audioUrl) {
  var container = document.getElementById('editorModalSelfAudioWaveform');
  if (!container) return;

  if (container.offsetWidth === 0 || container.offsetHeight === 0) {
    container.style.width = '100%';
    container.style.height = '100px';
    container.style.minHeight = '100px';
    if (container.offsetWidth === 0 || container.offsetHeight === 0) {
      console.warn('[dictationEditorModal] Self waveform container not visible');
      return;
    }
  }

  if (typeof WaveformCanvas === 'undefined') {
    console.warn('[dictationEditorModal] WaveformCanvas not loaded');
    return;
  }

  if (window.editorModalSelfWaveform) {
    window.editorModalSelfWaveform.destroy();
    window.editorModalSelfWaveform = null;
  }

  try {
    var wf = new WaveformCanvas(container);
    window.editorModalSelfWaveform = wf;

    var am = _ensureAudioManager();
    if (am && typeof am.setWaveformCanvas === 'function') {
      am.setWaveformCanvas(wf);
    }

    wf.onPlaybackEnd(function () {
      var playBtn = document.getElementById('editorModalSelfAudioPlayBtn');
      if (playBtn) {
        _setButtonState(playBtn, 'ready');
      }
    });

    wf.loadAudio(audioUrl).then(function () {
      var duration = wf.getDuration();
      wf.setRegion(0, duration);
    }).catch(function (err) {
      console.warn('[dictationEditorModal] Self waveform load error', err);
    });

    wf.onRegionUpdate(function (region) {
      var startInput = document.getElementById('editorModalSelfAudioStartTime');
      var endInput = document.getElementById('editorModalSelfAudioEndTime');
      if (startInput) startInput.value = region.start.toFixed(2);
      if (endInput) endInput.value = region.end.toFixed(2);
    });

  } catch (e) {
    console.warn('[dictationEditorModal] Self waveform init error', e);
  }
}

function _syncSelfWaveformRegion(field, value) {
  var wf = window.editorModalSelfWaveform;
  if (!wf) return;
  var region = wf.getRegion();
  if (!region) return;
  if (field === 'start') {
    wf.setRegion(value, region.end);
  } else if (field === 'end') {
    wf.setRegion(region.start, value);
  }
}

/* ---- Відтворення shared audio на self-закладці ---- */

function _handleSelfAudioPlayback(event) {
  var button = event.currentTarget;
  if (!button) return;

  var currentState = button.dataset.state || 'ready';

  if (currentState === 'playing' || currentState === 'playing-shared') {
    var wf = window.editorModalSelfWaveform;
    if (wf && wf.currentAudio) {
      try { wf.currentAudio.pause(); } catch (e) { }
    }
    var am = _ensureAudioManager();
    if (am) {
      if (typeof am.pause === 'function') am.pause();
      else if (typeof am.stop === 'function') am.stop();
    }
    _setButtonState(button, 'ready');
    return;
  }

  var wf = window.editorModalSelfWaveform;
  if (!wf) return;

  var audioUrl = state._selfAudioUrl;
  if (!audioUrl) return;

  var am = _ensureAudioManager();
  if (am && am.currentButton && am.currentButton !== button) {
    if (typeof am.stop === 'function') am.stop();
  }

  var audio = new Audio(audioUrl);
  _setButtonState(button, 'playing-shared');

  wf.startPlayback(audio).catch(function (err) {
    console.warn('[dictationEditorModal] Self waveform playback error', err);
    _setButtonState(button, 'ready');
  });
}

/* ---- Cut (обрізка) для self-закладки ---- */

/**
 * Обрізає self-аудіо за поточними Start/End регіонами.
 * Бере файл з audio_mic поточної строки, завантажує через AudioManager.
 */
async function _handleSelfCutAudio() {
  var selectedRow = document.querySelector('#' + EDITOR_TABLE_ID + ' tbody tr.selected');
  if (!selectedRow || !state.content) {
    alert('Не вибрано рядок');
    return;
  }

  var key = selectedRow.dataset.key;
  var sentence = state.content.getSentence(key);
  if (!sentence) {
    alert('Рядок не знайдено');
    return;
  }

  var micFilename = sentence.audio_mic || sentence.audio_m || null;
  if (!micFilename) {
    alert('У цьому рядку немає аудіофайлу (audio_mic)');
    return;
  }

  var startInput = document.getElementById('editorModalSelfAudioStartTime');
  var endInput = document.getElementById('editorModalSelfAudioEndTime');
  if (!startInput || !endInput) return;

  var startVal = parseFloat(startInput.value);
  var endVal = parseFloat(endInput.value);
  if (isNaN(startVal) || isNaN(endVal)) {
    alert('Будь ласка, вкажіть Start і End для обрізки');
    return;
  }

  var dictationId = state.config ? state.config.dictationId : '';
  var lang = state.config ? state.config.originalLanguage : '';
  if (!dictationId || !lang) {
    alert('Не визначено диктант або мову');
    return;
  }

  // Завантажуємо файл через AudioManager з CacheStorage
  var am = _ensureAudioManager();
  if (!am || typeof am.loadDictationAudioBlob !== 'function') {
    alert('AudioManager недоступний');
    return;
  }

  var blob;
  try {
    blob = await am.loadDictationAudioBlob(dictationId, lang, micFilename);
  } catch (e) {
    console.warn('[dictationEditorModal] Не вдалося завантажити файл з кешу', e);
  }

  if (!blob) {
    // Спробуємо через fetch з сервера
    try {
      var url = am.buildDictationAudioUrl(dictationId, lang, micFilename);
      var resp = await fetch(url);
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      blob = await resp.blob();
    } catch (e2) {
      console.error('[dictationEditorModal] Не вдалося завантажити аудіофайл', e2);
      alert('Не вдалося завантажити аудіофайл. Спробуйте вибрати файл заново.');
      return;
    }
  }

  // Конвертуємо blob в base64
  var reader = new FileReader();
  reader.onload = async function (e) {
    var arrayBuffer = e.target.result;
    var bytes = new Uint8Array(arrayBuffer);
    var binary = '';
    for (var i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    var audioB64 = btoa(binary);
    var mime = blob.type || 'audio/webm';

    var body = {
      dictation_id: dictationId,
      language: lang,
      filename: micFilename,
      audio_b64: audioB64,
      mime: mime,
      start_time: startVal,
      end_time: endVal,
    };

    try {
      var response = await fetch('/cut-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      var data = await response.json();
      if (data.success) {
        // Оновлюємо дані поточної строки
        if (state.content) {
          var s = state.content.getSentence(key);
          if (s) {
            s.start = String(startVal);
            s.end = String(endVal);
            if (data.audio_mic) s.audio_mic = data.audio_mic;
            _setDirtyFlags({ db: true, audio: true });
            _renderTable();
            // Оновлюємо волну з новим файлом
            _loadSelfAudioForRow(s);
          }
        }
        console.log('[dictationEditorModal] Self cut успішно виконано');
      } else {
        console.error('[dictationEditorModal] Помилка self cut:', data.error);
        alert('Помилка обрізки: ' + (data.error || 'невідома помилка'));
      }
    } catch (e) {
      console.error('[dictationEditorModal] Self cut error', e);
      alert('Помилка обрізки аудіо');
    }
  };
  reader.readAsArrayBuffer(blob);
}


/**
 * Застосовує записаний з мікрофона файл до поточної строки.
 * Викликається з EditorMicPanel.onApply.
 */
async function _applySelfMicFile(filename, blob) {
  var selectedRow = document.querySelector('#' + EDITOR_TABLE_ID + ' tbody tr.selected');
  if (!selectedRow) {
    alert('Не вибрано рядок');
    return;
  }
  var key = selectedRow.dataset.key;
  if (!key || !state.content) return;

  var sentence = state.content.getSentence(key);
  if (!sentence) return;

  // Зберігаємо в CacheStorage
  var am = _ensureAudioManager();
  if (am && typeof am.saveDictationAudioBlob === 'function') {
    try {
      var dictationId = state.config ? state.config.dictationId : '';
      var lang = state.config ? state.config.originalLanguage : '';
      await am.saveDictationAudioBlob(dictationId, lang, filename, blob, 'audio/webm');
    } catch (e) {
      console.warn('[dictationEditorModal] Не вдалося зберегти записане аудіо в CacheStorage', e);
    }
  }

  // Записуємо в sentence
  sentence.audio_mic = filename;
  sentence.start = '0';
  sentence.end = '';

  // Помічаємо dirty
  _setDirtyFlags({ db: true, audio: true });

  // Оновлюємо таблицю (щоб змінилась іконка в колонці audio_mic)
  _renderTable();
  _bindAudioPlaybackHandlers();

  // Оновлюємо лейбли і волну для поточної строки
  _loadSelfAudioForRow(sentence);
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

  // Обработчики кнопок fill modal
  // Кнопка newDictationFillCreateBtn использует onclick в HTML, поэтому здесь не дублируем

  var fillCloseBtn = document.getElementById('newDictationFillCloseBtn');
  if (fillCloseBtn) {
    fillCloseBtn.addEventListener('click', function () {
      if (window.NewDictationFillModal && typeof window.NewDictationFillModal.close === 'function') {
        window.NewDictationFillModal.close();
      }
    });
  }

  // Закрытие fill modal по клику вне его — НЕ закрываем (только крестик и кнопка)
  // (намеренно ничего не делаем)

  // Закрытие fill modal по Escape
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var fillModalEl = document.getElementById('newDictationFillModal');
      if (fillModalEl && fillModalEl.style.display !== 'none') {
        if (window.NewDictationFillModal && typeof window.NewDictationFillModal.close === 'function') {
          window.NewDictationFillModal.close();
        }
      }
    }
  });

  // ---- Обработчики модального окна добавления языка перевода ----

  var addTranslationBtn = document.getElementById('editorModalAddTranslationBtn');
  if (addTranslationBtn) {
    addTranslationBtn.addEventListener('click', _openAddTranslationModal);
  }

  var addTranslationConfirmBtn = document.getElementById('addTranslationModalAddBtn');
  if (addTranslationConfirmBtn) {
    addTranslationConfirmBtn.addEventListener('click', _handleAddTranslationConfirm);
  }

  var addTranslationCloseBtn = document.getElementById('addTranslationModalCloseBtn');
  if (addTranslationCloseBtn) {
    addTranslationCloseBtn.addEventListener('click', _closeAddTranslationModal);
  }

  // Закрытие addTranslationModal по Escape
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var addModal = document.getElementById('addTranslationModal');
      if (addModal && addModal.style.display !== 'none') {
        _closeAddTranslationModal();
      }
    }
  });

  // ---- Обработчики модального окна добавления строки ----

  var addRowCreateBtn = document.getElementById('addRowModalCreateBtn');
  if (addRowCreateBtn) {
    addRowCreateBtn.addEventListener('click', _handleAddRowCreate);
  }

  var addRowCloseBtn = document.getElementById('addRowModalCloseBtn');
  if (addRowCloseBtn) {
    addRowCloseBtn.addEventListener('click', _closeAddRowModal);
  }

  // Enter в поле оригинала → автоперевод
  var addRowOrigInput = document.getElementById('addRowModalOrigInput');
  if (addRowOrigInput) {
    addRowOrigInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        // Заполняем таблицу переводов (автоперевод)
        var text = addRowOrigInput.value.trim();
        if (!text) return;
        var origLang = state.config ? state.config.originalLanguage : '';
        if (!origLang) return;
        var langBlocks = state.content ? state.content.langBlocks : [];
        if (!langBlocks || langBlocks.length < 2) return;
        var translationLangs = [];
        for (var i = 1; i < langBlocks.length; i++) {
          translationLangs.push(langBlocks[i].lang);
        }
        if (translationLangs.length === 0) return;
        var tbody = document.querySelector('#addRowModalTranslationsTable tbody');
        if (!tbody) return;
        var rows = tbody.querySelectorAll('tr');
        rows.forEach(function (row) {
          var langCode = row.dataset.lang;
          if (!langCode) return;
          var input = row.querySelector('input');
          if (!input) return;
          // Показываем индикатор загрузки
          input.placeholder = 'Переклад...';
          input.disabled = true;
          fetch('/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: text,
              source_lang: origLang,
              target_lang: langCode,
            }),
          })
            .then(function (r) { return r.json(); })
            .then(function (data) {
              if (data.translated_text) {
                input.value = data.translated_text;
              }
              input.disabled = false;
              input.placeholder = '';
            })
            .catch(function () {
              input.disabled = false;
              input.placeholder = '';
            });
        });
      }
    });
  }

  // Закрытие addRowModal по Escape
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var rowModal = document.getElementById('addRowModal');
      if (rowModal && rowModal.style.display !== 'none') {
        _closeAddRowModal();
      }
    }
  });

  // ---- Обработчик кнопки "Перезаполнить все авто" ----

  var autoRegenerateBtn = document.getElementById('editorModalAutoRegenerateAllBtn');
  if (autoRegenerateBtn) {
    autoRegenerateBtn.addEventListener('click', _handleRegenerateAllTts);
  }
}

/* ============================================================
   NewDictationFillModal — модальное окно начального заполнения
   нового диктанта (открывается поверх DictationEditorModal)
   ============================================================ */
window.NewDictationFillModal = {
  _editorConfig: null,
  _languageSelector: null,
  _initialVoiceMode: 'auto',
  _currentVoiceMode: 'auto',

  /**
   * Открыть модальное окно начального заполнения.
   * @param {Object} editorConfig — конфиг, переданный в DictationEditorModal.open()
   */
  open: function (editorConfig) {
    console.log('[NewDictationFillModal] open() called', editorConfig);
    this._editorConfig = editorConfig || {};
    this._currentVoiceMode = 'auto';
    this._initialVoiceMode = 'auto';

    var modal = document.getElementById('newDictationFillModal');
    if (!modal) {
      console.warn('[NewDictationFillModal] modal element not found!');
      return;
    }

    // Сброс полей
    var titleInput = document.getElementById('newDictationFillTitle');
    if (titleInput) titleInput.value = '';

    var textEditor = document.getElementById('newDictationFillText');
    if (textEditor) textEditor.innerHTML = '';

    var delimiterInput = document.getElementById('newDictationFillDelimiter');
    if (delimiterInput) delimiterInput.value = '//';

    // Сброс ID
    var idSpan = document.getElementById('newDictationFillId');
    if (idSpan) idSpan.textContent = 'новий';

    // Сброс radio
    var autoRadio = document.querySelector('input[name="newDictationVoiceMode"][value="auto"]');
    if (autoRadio) autoRadio.checked = true;
    this._currentVoiceMode = 'auto';
    this._initialVoiceMode = 'auto';

    // Инициализация LanguageSelector
    this._initLanguageSelector();

    // Подсветка строк перевода
    this._setupTextareaHighlighting();

    // Показываем модалку
    modal.style.display = 'flex';

    // Lucide иконки
    if (typeof lucide !== 'undefined') {
      lucide.createIcons({ root: modal });
    }

    // Фокус на поле названия
    if (titleInput) {
      setTimeout(function () { titleInput.focus(); }, 100);
    }
  },

  /**
   * Закрыть модальное окно.
   * Если voice mode изменился — вызываем _refillAndApply.
   */
  close: function () {
    var modal = document.getElementById('newDictationFillModal');
    if (!modal) return;

    // Проверяем, изменился ли voice mode
    var selectedRadio = document.querySelector('input[name="newDictationVoiceMode"]:checked');
    var currentMode = selectedRadio ? selectedRadio.value : 'auto';
    var modeChanged = (currentMode !== this._initialVoiceMode);

    modal.style.display = 'none';

    // Если radio изменился — перезаполняем и применяем
    if (modeChanged) {
      this._refillAndApply(currentMode);
    }
  },

  /**
   * Создать диктант из введённых данных.
   */
  create: async function () {
    console.log('[NewDictationFillModal] create() called');
    var self = this;

    try {
      console.log('[NewDictationFillModal] create() getting text');
      // Получаем текст
      var textEditor = document.getElementById('newDictationFillText');
      var rawText = textEditor ? (textEditor.innerText || textEditor.textContent || '') : '';
      var text = rawText.trim();
      if (!text) {
        alert('Введіть текст диктанту');
        return;
      }

      // Получаем разделитель
      var delimiterInput = document.getElementById('newDictationFillDelimiter');
      var delimiter = delimiterInput ? String(delimiterInput.value || '').trim() : '//';
      if (!delimiter) delimiter = '//';

      // Получаем языки
      var langs = this._getSelectedLanguages();
      var langOrig = langs.original;
      var langTr = langs.translation;
      console.log('[NewDictationFillModal] create() languages', { langOrig, langTr });

      if (!langOrig) {
        alert('Виберіть мову оригіналу');
        return;
      }

      // Получаем название
      var titleInput = document.getElementById('newDictationFillTitle');
      var title = titleInput ? String(titleInput.value || '').trim() : '';
      if (!title) title = 'Без названия';

      // Получаем voice mode
      var selectedRadio = document.querySelector('input[name="newDictationVoiceMode"]:checked');
      var voiceMode = selectedRadio ? selectedRadio.value : 'auto';

      // Определяем, нужно ли генерировать аудио (только для voiceMode === 'auto')
      var shouldGenerateAudio = (voiceMode === 'auto');

      // Получаем dictationId из конфига (для генерации аудио)
      // Для нового диктанта ID уже должен быть зарезервирован на сервере (desktop.js вызывает /api/dictation/reserve_id)
      // Если по какой-то причине ID нет — генерируем временный
      var dictationId = this._editorConfig ? this._editorConfig.dictationId : '';
      if (!dictationId) {
        dictationId = 'dict_temp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
        console.log('[NewDictationFillModal] generated temp dictationId:', dictationId);
        // Сохраняем временный ID в конфиг, чтобы _updateEditorFromFillConfig и _renderTable
        // могли использовать его для построения URL аудио
        if (this._editorConfig) {
          this._editorConfig.dictationId = dictationId;
        }
      }

      // Получаем safe_email для API запросов
      var safeEmail = '';
      try {
        if (window.UM && typeof window.UM.getSafeEmail === 'function') {
          safeEmail = window.UM.getSafeEmail();
        }
      } catch (e) {}

      // Парсим текст на предложения (по образу parseInputText из script_dictation_editor.js)
      var normalizedText = text.replace(/\u2028/g, '\n');
      var lines = normalizedText.split('\n').map(function (l) { return l.trim(); }).filter(function (l) { return l.length > 0; });
      // Плоский массив предложений с language_code
      var flatSentences = [];
      var keyCounter = 0;

      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];

        // Пропускаем строки, начинающиеся с разделителя (это строки перевода, они обрабатываются ниже)
        if (line.startsWith(delimiter)) continue;

        var key = String(keyCounter).padStart(3, '0');
        keyCounter++;

        // Оригинальный текст
        var origText = line;

        // Проверяем, есть ли перевод на следующей строке (начинается с delimiter)
        var trText = '';
        var hasExplicitTranslation = false;
        if (i + 1 < lines.length && lines[i + 1].startsWith(delimiter)) {
          trText = lines[i + 1].substring(delimiter.length).trim();
          i++;
          hasExplicitTranslation = true;
        }

        // Если явного перевода нет, делаем автоперевод через API /translate
        if (!hasExplicitTranslation && langTr) {
          try {
            console.log('[NewDictationFillModal] auto-translating:', origText);
            var trResp = await fetch('/translate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: origText,
                language_original: langOrig,
                language_translation: langTr,
              })
            });
            var trData = await trResp.json();
            if (trData.translation) {
              trText = trData.translation;
            } else {
              console.warn('[NewDictationFillModal] translate API error:', trData.error);
              trText = '';
            }
          } catch (e) {
            console.warn('[NewDictationFillModal] autoTranslate error:', e);
            trText = '';
          }
        }

        // Собираем explanation (строки // после текущего предложения)
        var explanationText = '';
        while (i + 1 < lines.length && lines[i + 1].startsWith('//')) {
          var commentLine = lines[i + 1].substring(2).trim();
          if (explanationText) {
            explanationText += '\n' + commentLine;
          } else {
            explanationText = commentLine;
          }
          i++;
        }

        // Генерируем аудио для оригинала (только если voiceMode === 'auto')
        var audioOrig = '';
        var audioTr = '';
        if (shouldGenerateAudio && dictationId) {
          try {
            console.log('[NewDictationFillModal] generating audio for original:', key);
            var genResp = await fetch('/generate_audio', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                dictation_id: dictationId,
                text: origText,
                language: langOrig,
                filename_audio: 'tts_' + key + '_' + Date.now() + '.mp3',
                tipe_audio: 'avto',
                safe_email: safeEmail,
              })
            });
            var genData = await genResp.json();
            if (genData.success && genData.audio_b64) {
              // Сохраняем blob через AudioManager
              var binaryStr = atob(genData.audio_b64);
              var bytes = new Uint8Array(binaryStr.length);
              for (var j = 0; j < binaryStr.length; j++) {
                bytes[j] = binaryStr.charCodeAt(j);
              }
              var blob = new Blob([bytes], { type: genData.mime || 'audio/mpeg' });
              var newFilename = genData.filename || ('tts_' + key + '_' + Date.now() + '.mp3');
              var am = _ensureAudioManager();
              if (am && typeof am.saveDictationAudioBlob === 'function') {
                var savedKey = await am.saveDictationAudioBlob(dictationId, langOrig, newFilename, blob, genData.mime || 'audio/mpeg');
                // saveDictationAudioBlob() сама создаёт blob URL в _objectUrlByCanonicalUrl,
                // так что _handleAudioPlayback() сможет найти аудио без поиска в CacheStorage.
              }
              audioOrig = newFilename;
              console.log('[NewDictationFillModal] generated audio for original:', key, audioOrig);
            } else {
              console.warn('[NewDictationFillModal] generate_audio API error:', genData.error);
            }
          } catch (e) {
            console.warn('[NewDictationFillModal] generateAudioForSentence error:', e);
          }

          // Генерируем аудио для перевода (если есть текст перевода)
          if (trText) {
            try {
              console.log('[NewDictationFillModal] generating audio for translation:', key, { langTr, trText: trText.slice(0, 50) });
              var genTrResp = await fetch('/generate_audio', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  dictation_id: dictationId,
                  text: trText,
                  language: langTr,
                  filename_audio: 'tts_' + key + '_tr_' + Date.now() + '.mp3',
                  tipe_audio: 'avto',
                  safe_email: safeEmail,
                })
              });
              var genTrData = await genTrResp.json();
              if (genTrData.success && genTrData.audio_b64) {
                var binaryStrTr = atob(genTrData.audio_b64);
                var bytesTr = new Uint8Array(binaryStrTr.length);
                for (var j2 = 0; j2 < binaryStrTr.length; j2++) {
                  bytesTr[j2] = binaryStrTr.charCodeAt(j2);
                }
                var blobTr = new Blob([bytesTr], { type: genTrData.mime || 'audio/mpeg' });
                var newFilenameTr = genTrData.filename || ('tts_' + key + '_tr_' + Date.now() + '.mp3');
                var am2 = _ensureAudioManager();
                if (am2 && typeof am2.saveDictationAudioBlob === 'function') {
                  var savedKeyTr = await am2.saveDictationAudioBlob(dictationId, langTr, newFilenameTr, blobTr, genTrData.mime || 'audio/mpeg');
                  // saveDictationAudioBlob() сама создаёт blob URL в _objectUrlByCanonicalUrl,
                  // так что _handleAudioPlayback() сможет найти аудио без поиска в CacheStorage.
                }
                audioTr = newFilenameTr;
                console.log('[NewDictationFillModal] generated audio for translation:', key, audioTr);
              } else {
                console.warn('[NewDictationFillModal] generate_audio API error for translation:', genTrData.error);
              }
            } catch (e) {
              console.warn('[NewDictationFillModal] generateAudioForSentence translation error:', e);
            }
          }
        }

        // Добавляем предложение оригинала с language_code
        flatSentences.push({
          language_code: langOrig,
          key: key,
          position: keyCounter,
          text: origText,
          audio: audioOrig,
          audio_file: null,
          audio_mic: null,
          start: '',
          end: '',
          checked: false,
          explanation: explanationText,
        });

        // Добавляем предложение перевода с language_code (если есть текст перевода)
        if (trText) {
          flatSentences.push({
            language_code: langTr,
            key: key,
            position: keyCounter,
            text: trText,
            audio: audioTr,
            audio_file: null,
            audio_mic: null,
            start: '',
            end: '',
            checked: false,
            explanation: '',
          });
        }
      }

      // Определяем audio_order в зависимости от voice mode
      var audioOrder = '';
      if (voiceMode === 'file') {
        audioOrder = 'f';
      } else if (voiceMode === 'self') {
        audioOrder = 'm';
      } else {
        audioOrder = '';
      }

      var config = this._editorConfig;
      config.title = title;
      config.originalLanguage = langOrig;
      config.translationLanguage = langTr || '';
      config.level = config.level || 'A1';
      config.audio_order = audioOrder;
      config.sentences = flatSentences;

      // Обновляем state.content ДО закрытия fill-модалки,
      // чтобы _renderTable() в _updateEditorFromFillConfig могла прочитать sentences
      if (state.content) {
        if (typeof state.content.setSentences === 'function') {
          state.content.setSentences(flatSentences);
        }
      }

      this.close();

      config.isNewDictation = true;

      if (typeof open === 'function') {
        _updateEditorFromFillConfig(config);
      }

      // Помечаем изменения как несохранённые, чтобы появились звёздочки
      _setDirtyFlags({ db: true });
      if (shouldGenerateAudio) {
        _setDirtyFlags({ audio: true });
      }

      this._switchTabByVoiceMode(voiceMode);
    } catch (e) {
      console.error('[NewDictationFillModal] create error:', e);
      alert('Помилка при створенні диктанту: ' + (e.message || e));
    }
  },

  /**
   * Переключение закладки редактора в зависимости от voice mode.
   */
  _switchTabByVoiceMode: function (voiceMode) {
    var tabBtn = null;
    if (voiceMode === 'file') {
      tabBtn = document.querySelector('.dictation-editor-modal__tab-btn[data-tab="voice-original-have"]');
    } else if (voiceMode === 'self') {
      tabBtn = document.querySelector('.dictation-editor-modal__tab-btn[data-tab="voice-original-self"]');
    } else {
      tabBtn = document.querySelector('.dictation-editor-modal__tab-btn[data-tab="general"]');
    }
    if (tabBtn) {
      tabBtn.click();
    }
  },

  /**
   * Перезаполнение и применение при изменении voice mode.
   */
  _refillAndApply: function (newMode) {
    // Обновляем audio_order в config
    if (this._editorConfig) {
      if (newMode === 'file') {
        this._editorConfig.audio_order = 'f';
      } else if (newMode === 'self') {
        this._editorConfig.audio_order = 'm';
      } else {
        this._editorConfig.audio_order = '';
      }
    }

    // Переключаем закладку
    this._switchTabByVoiceMode(newMode);

    // Обновляем radio в редакторе, если они есть
    var editorRadio = document.querySelector('input[name="editorModalVoiceMode"][value="' + newMode + '"]');
    if (editorRadio) {
      editorRadio.checked = true;
      // Триггерим change event для обновления видимости закладок
      var evt = document.createEvent('HTMLEvents');
      evt.initEvent('change', true, false);
      editorRadio.dispatchEvent(evt);
    }
  },

  /**
   * Получить выбранные языки из LanguageSelector.
   */
  _getSelectedLanguages: function () {
    var result = { original: '', translation: '' };
    try {
      if (this._languageSelector && typeof this._languageSelector.getValues === 'function') {
        var values = this._languageSelector.getValues();
        if (values) {
          result.original = values.currentLearning || '';
          result.translation = values.nativeLanguage || '';
        }
      }
    } catch (e) {
      console.warn('[NewDictationFillModal] _getSelectedLanguages error', e);
    }

    // Fallback: читаем из data-атрибутов
    if (!result.original) {
      try {
        var container = document.getElementById('newDictationFillLangPair');
        if (container) {
          var leftFlag = container.querySelector('.language-selector-flag-left');
          if (leftFlag) {
            result.original = leftFlag.getAttribute('data-lang') || '';
          }
        }
      } catch (e) {}
    }
    if (!result.translation) {
      try {
        var container = document.getElementById('newDictationFillLangPair');
        if (container) {
          var rightFlag = container.querySelector('.language-selector-flag-right');
          if (rightFlag) {
            result.translation = rightFlag.getAttribute('data-lang') || '';
          }
        }
      } catch (e) {}
    }

    return result;
  },

  /**
   * Инициализация LanguageSelector для выбора пары языков.
   */
  _initLanguageSelector: function () {
    var self = this;
    var container = document.getElementById('newDictationFillLangPair');
    if (!container) return;

    var tryInit = function () {
      try {
        if (!window.LanguageManager || !window.LanguageManager.isInitialized) {
          setTimeout(tryInit, 100);
          return;
        }

        var languageData = window.LanguageManager.getLanguageData();
        if (!languageData) {
          setTimeout(tryInit, 100);
          return;
        }

        // Языки по умолчанию: из профиля пользователя
        var defaultLearning = 'en';
        var nativeLang = 'ru';
        try {
          // Пробуем получить из USER_LANGUAGE_DATA (устанавливается на странице /library)
          if (window.USER_LANGUAGE_DATA) {
            if (window.USER_LANGUAGE_DATA.currentLearning || window.USER_LANGUAGE_DATA.learning || window.USER_LANGUAGE_DATA.learningLanguage) {
              defaultLearning = String(window.USER_LANGUAGE_DATA.currentLearning || window.USER_LANGUAGE_DATA.learning || window.USER_LANGUAGE_DATA.learningLanguage);
            }
            if (window.USER_LANGUAGE_DATA.nativeLanguage || window.USER_LANGUAGE_DATA.nativeLang) {
              nativeLang = String(window.USER_LANGUAGE_DATA.nativeLanguage || window.USER_LANGUAGE_DATA.nativeLang).toLowerCase();
            }
          } else if (window.UM && typeof window.UM.getCurrentUser === 'function') {
            // На desktop USER_LANGUAGE_DATA не установлен — читаем напрямую из UM
            var user = window.UM.getCurrentUser();
            if (user) {
              if (user.current_learning) defaultLearning = String(user.current_learning).toLowerCase();
              if (user.native_language) nativeLang = String(user.native_language).toLowerCase();
            }
          }
        } catch (e) {
          defaultLearning = 'en';
          nativeLang = 'ru';
        }

        var allLangs = Object.keys(languageData)
          .map(function (x) { return String(x || '').toLowerCase(); })
          .filter(Boolean);

        var leftList = allLangs;
        var rightList = allLangs.filter(function (x) { return x !== defaultLearning; });

        container.innerHTML = '';

        self._languageSelector = window.initLanguageSelector('newDictationFillLangPair', {
          mode: 'flag-pair-dropdown-both',
          currentLearning: defaultLearning,
          nativeLanguage: nativeLang,
          learningLanguages: leftList,
          nativeLanguages: rightList,
          languageData: languageData,
          onLanguageChange: function (values) {
            // При смене языка обновляем списки
            try {
              var leftV = values && values.currentLearning ? String(values.currentLearning).toLowerCase() : '';
              var rightV = values && values.nativeLanguage ? String(values.nativeLanguage).toLowerCase() : '';
              if (leftV && rightV === leftV) {
                // Если выбрали одинаковые — сбрасываем правый
                values.nativeLanguage = allLangs.find(function (x) { return x !== leftV; }) || 'ru';
              }
            } catch (e) {}
          }
        });
      } catch (e) {
        console.warn('[NewDictationFillModal] _initLanguageSelector error', e);
        setTimeout(tryInit, 200);
      }
    };

    tryInit();
  },

  /**
   * Подсветка строк перевода в текстовом редакторе.
   * Аналог setupTextareaHighlighting из script_dictation_editor.js
   */
  _setupTextareaHighlighting: function () {
    var self = this;
    var editor = document.getElementById('newDictationFillText');
    if (!editor) return;

    var isUpdating = false;

    // Вспомогательные функции для сохранения/восстановления позиции курсора
    function _getCursorOffset(el, range) {
      var text = el.innerText || el.textContent || '';
      var preCaretRange = range.cloneRange();
      preCaretRange.selectNodeContents(el);
      preCaretRange.setEnd(range.endContainer, range.endOffset);
      return preCaretRange.toString().length;
    }

    function _setCursorAtOffset(el, offset) {
      var sel = window.getSelection();
      var charIndex = 0;
      var node = el.firstChild;
      while (node) {
        if (node.nodeType === 3) { // text node
          var nextCharIndex = charIndex + node.length;
          if (offset >= charIndex && offset <= nextCharIndex) {
            var range = document.createRange();
            range.setStart(node, offset - charIndex);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            return;
          }
          charIndex = nextCharIndex;
        }
        node = node.nextSibling;
      }
      // fallback: ставим в конец
      try {
        var range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (e) {}
    }

    function updateHighlight() {
      if (isUpdating) return;

      var text = editor.innerText || editor.textContent;
      // Заменяем U+2028 (LINE SEPARATOR) на \n для единообразия
      var normalized = text.replace(/\u2028/g, '\n');
      var lines = normalized.split('\n');
      var delimiterInput = document.getElementById('newDictationFillDelimiter');
      var delimiter = delimiterInput ? (delimiterInput.value || '//') : '//';

      var highlightedText = lines.map(function (line) {
        if (line.trim().startsWith(delimiter)) {
          return '<span class="line-translation">' + escapeHtml(line) + '</span>';
        }
        return escapeHtml(line);
      }).join('\n');

      // Сохраняем позицию курсора
      var selection = window.getSelection();
      var range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      var cursorOffset = range ? _getCursorOffset(editor, range) : 0;

      isUpdating = true;
      editor.innerHTML = highlightedText;

      // Восстанавливаем позицию курсора
      if (cursorOffset !== null) {
        _setCursorAtOffset(editor, cursorOffset);
      }
      isUpdating = false;
    }

    editor.addEventListener('input', function () {
      if (!isUpdating) {
        setTimeout(updateHighlight, 10);
      }
    });

    editor.addEventListener('paste', function (e) {
      e.preventDefault();
      var text = (e.clipboardData || window.clipboardData).getData('text');
      // Заменяем U+2028 на \n при вставке
      text = text.replace(/\u2028/g, '\n');
      document.execCommand('insertText', false, text);
      setTimeout(updateHighlight, 10);
    });

    // Обработчик изменения разделителя
    var delimiterInput = document.getElementById('newDictationFillDelimiter');
    if (delimiterInput) {
      delimiterInput.addEventListener('input', updateHighlight);
    }

    // Первоначальная подсветка
    setTimeout(updateHighlight, 50);
  },
};

/**
 * Обновить редактор из конфига fill modal.
 * Вызывается после create() для применения данных.
 */
function _updateEditorFromFillConfig(config) {
  if (!config) return;

  // Обновляем state.config
  state.config = config;

  // Обновляем заголовок — используем span#dictationEditorModalTitle,
  // чтобы не уничтожить дочерние элементы (звёздочки unsaved-star)
  var titleSpan = document.getElementById('dictationEditorModalTitle');
  if (titleSpan) {
    titleSpan.textContent = config.title || 'Новий диктант';
  }

  // Обновляем поле названия
  var titleInput = document.querySelector('.dictation-editor-modal__title-level-row input[type="text"]');
  if (titleInput) {
    titleInput.value = config.title || '';
  }

  // Обновляем ID диктанта в UI (под логотипом)
  var idSpan = document.getElementById('dictation-editor-modal-id');
  if (idSpan) {
    var displayId = config.dictationId || '';
    // Показываем только числовую часть, если есть
    if (displayId.startsWith('dict_')) {
      displayId = displayId.replace('dict_', '');
    }
    idSpan.textContent = displayId || 'новий';
  }

  // Языковые флаги отображаются через LanguageSelector в #editorModalLangPair
  // (инициализируется в _initLanguageFlags()). Код ниже удалён, т.к. элемента
  // #dictation-editor-modal-lang-flags не существует в HTML-шаблоне.

  // Устанавливаем статическую обложку-заглушку для языка (если нет загруженной обложки)
  var coverImg = document.getElementById('dictationEditorModalCoverImage');
  if (coverImg && (!coverImg.src || coverImg.src === window.location.href || coverImg.src.endsWith('/'))) {
    var langForCover = config.originalLanguage || config.translationLanguage || '';
    if (langForCover) {
      // Пробуем статическую обложку для конкретного языка
      coverImg.src = '/static/data/covers/cover_' + langForCover + '.webp';
      coverImg.onerror = function () {
        // Если нет обложки для языка — показываем общую заглушку
        this.src = '/static/data/covers/cover.webp';
      };
    } else {
      coverImg.src = '/static/data/covers/cover.webp';
    }
  }

  // Обновляем языки через LanguageSelector
  // Если LanguageSelector ещё не инициализирован (например, при создании нового диктанта
  // open() был вызван с пустыми языками) — инициализируем его сейчас,
  // когда языки уже известны из fill modal.
  if (!state.headerLangPairSelector) {
    _initLanguageFlags();
  }
  if (config.originalLanguage || config.translationLanguage) {
    try {
      if (state.headerLangPairSelector && typeof state.headerLangPairSelector.setValues === 'function') {
        state.headerLangPairSelector.setValues({
          currentLearning: config.originalLanguage || '',
          nativeLanguage: config.translationLanguage || '',
        });
      }
    } catch (e) {
      console.warn('[dictationEditorModal] _updateEditorFromFillConfig setValues error', e);
    }
  }

  // Обновляем audio_order radio
  var audioOrder = config.audio_order || '';
  var radioValue = 'auto';
  if (audioOrder === 'f') radioValue = 'have';
  else if (audioOrder === 'm') radioValue = 'self';

  var radio = document.querySelector('input[name="editorModalVoiceMode"][value="' + radioValue + '"]');
  if (radio) {
    radio.checked = true;
    var evt = document.createEvent('HTMLEvents');
    evt.initEvent('change', true, false);
    radio.dispatchEvent(evt);
  }

  // Если state.content был обнулён (например, после close()), восстанавливаем его из config.sentences
  if (!state.content && config.sentences && config.sentences.length > 0) {
    if (typeof DictationContent !== 'undefined') {
      // Группируем config.sentences по language_code в langBlocks
      var langBlocks = [];
      var grouped = {};
      config.sentences.forEach(function (s) {
        var lc = s.language_code || '';
        if (!lc) return;
        if (!grouped[lc]) grouped[lc] = [];
        grouped[lc].push(s);
      });
      langBlocks = Object.keys(grouped).map(function (lc) {
        return { lang: lc, sentences: grouped[lc] };
      });
      state.content = new DictationContent({
        dictationId: config.dictationId || '',
        langBlocks: langBlocks,
        audio_or_order: config.audio_order || '',
      });
    } else {
      // Fallback: создаём простой объект с методами, совместимыми с новой структурой
      var fallbackLangBlocks = [];
      var grouped = {};
      config.sentences.forEach(function (s) {
        var lc = s.language_code || '';
        if (!lc) return;
        if (!grouped[lc]) grouped[lc] = [];
        grouped[lc].push({
          key: s.key || 's_' + grouped[lc].length,
          position: s.position != null ? Number(s.position) : null,
          text: s.text || '',
          audio: s.audio || '',
          audio_file: s.audio_file || null,
          audio_mic: s.audio_mic || null,
          start: (s.start != null && s.start !== '') ? s.start : '',
          end: (s.end != null && s.end !== '') ? s.end : '',
          checked: s.checked || false,
          explanation: s.explanation || '',
        });
      });
      fallbackLangBlocks = Object.keys(grouped).map(function (lc) {
        return { lang: lc, sentences: grouped[lc] };
      });
      state.content = {
        dictationId: config.dictationId || '',
        audio_or_order: config.audio_order || '',
        langBlocks: fallbackLangBlocks,
        getAllSentenceCores: function () {
          var orig = this.langBlocks[0];
          return orig ? orig.sentences.slice() : [];
        },
        getSentence: function (key) {
          var orig = this.langBlocks[0];
          if (!orig) return null;
          return orig.sentences.find(function (s) { return s.key === String(key); }) || null;
        },
        getSentenceForLang: function (key, lang) {
          var block = this.langBlocks.find(function (b) { return b.lang === lang; });
          if (!block) return null;
          return block.sentences.find(function (s) { return s.key === String(key); }) || null;
        },
        getAllKeys: function () {
          var orig = this.langBlocks[0];
          return orig ? orig.sentences.map(function (s) { return s.key; }) : [];
        },
        setSentences: function (sentences) {
          if (!Array.isArray(sentences)) return;
          var grouped = {};
          sentences.forEach(function (s) {
            var lc = s.language_code || '';
            if (!lc) return;
            if (!grouped[lc]) grouped[lc] = [];
            grouped[lc].push({
              key: s.key || 's_' + grouped[lc].length,
              position: s.position != null ? Number(s.position) : null,
              text: s.text || '',
              audio: s.audio || '',
              audio_file: s.audio_file || null,
              audio_mic: s.audio_mic || null,
              start: (s.start != null && s.start !== '') ? s.start : '',
              end: (s.end != null && s.end !== '') ? s.end : '',
              checked: s.checked || false,
              explanation: s.explanation || '',
            });
          });
          this.langBlocks = Object.keys(grouped).map(function (lc) {
            return { lang: lc, sentences: grouped[lc] };
          });
        },
      };
    }
  }

  // Перерисовываем таблицу и обновляем обработчики
  _renderTable();
  _renderTranslationsTable();
  _updateAutoRegenerateAllBtnVisibility();
  _bindAudioPlaybackHandlers();
  _updateUnsavedStar();
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
