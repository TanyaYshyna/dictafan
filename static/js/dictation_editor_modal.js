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
  /** 'fill' — начальное заполнение, 'append' — дополнение */
  editorMode: 'fill',
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

  /** Флаг: волна на закладке "have" уже инициализирована */
  _waveformInitialized: false,

  /** true, если во время текущей сессии редактирования диктант был успешно сохранён.
   *  Нужно, чтобы при закрытии через крестик (когда грязные флаги уже сброшены)
   *  книжная модалка всё равно обновила список новым диктантом. */
  _savedInSession: false,
};

/* ===== Хранилище контента через DictationSessionsStore ===== */
function _getEditorRuntimeStore() {
  try {
    // Используем общий синглтон, как dictation_modal.js и active_dictations_modal.js
    if (window.__dictationRuntimeStore) return window.__dictationRuntimeStore;
    if (!window.DictationRuntime || !window.DictationRuntime.DictationSessionsStore) return null;
    window.__dictationRuntimeStore = new window.DictationRuntime.DictationSessionsStore({
      maxSessions: window.DictationRuntime.MAX_OPEN_SESSIONS || 5,
    });
    return window.__dictationRuntimeStore;
  } catch (e) {
    return null;
  }
}

/* ===== Сохранение/восстановление последнего языка перевода ===== */
function _saveLastTranslationLanguage(dictationId, lang) {
  if (!dictationId || !lang) return;
  try {
    localStorage.setItem('editorLastTrLang_' + dictationId, lang);
  } catch (e) {}
}

function _loadLastTranslationLanguage(dictationId) {
  if (!dictationId) return '';
  try {
    return localStorage.getItem('editorLastTrLang_' + dictationId) || '';
  } catch (e) {
    return '';
  }
}

/* ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===== */

function _normalizeLangCode(code) {
  if (!code) return '';
  return String(code).toLowerCase().trim();
}

/**
 * Единый генератор имён аудиофайлов.
 * Формат: {prefix}_{dictId}_{key}_{timestamp}.{ext}
 *
 * @param {string} prefix  - 'shared' | 'tts' | 'seg' | 'mic'
 * @param {string|number} dictId - числовой ID диктанта (без 'dict_')
 * @param {string|null} key - ключ строки ('' или null для shared audio)
 * @param {string} [ext='mp3'] - расширение (с точкой, например '.mp3' или '.webm')
 * @returns {string} имя файла, например 'tts_16_001_1723456789.mp3'
 */
function _makeAudioFilename(prefix, dictId, key, ext) {
  var ts = Date.now();
  var parts = [prefix];
  if (dictId) parts.push(dictId);
  if (key != null && key !== '') parts.push(key);
  parts.push(ts);
  return parts.join('_') + (ext || '.mp3');
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

/**
 * Инициализирует структуру dirty-флагов для per-file отслеживания аудио.
 * audio.dirty — Set с именами изменённых файлов (basename),
 * или '*' (сентинел «все файлы грязные»).
 */
function _ensureDirtyStructure() {
  if (!state.dirtyFlags) {
    state.dirtyFlags = { db: false, cover: false, audio: { dirty: new Set() } };
  } else if (!state.dirtyFlags.audio || state.dirtyFlags.audio === true || state.dirtyFlags.audio === false) {
    // Мигрируем старый формат { audio: boolean } → { audio: { dirty: Set } }
    var wasDirty = !!state.dirtyFlags.audio;
    state.dirtyFlags.audio = { dirty: new Set() };
    if (wasDirty) state.dirtyFlags.audio.dirty.add('*');
  }
  return state.dirtyFlags;
}

function _getDirtyFlags() {
  return _ensureDirtyStructure();
}

function _setDirtyFlags(next) {
  _ensureDirtyStructure();
  if (next.db === true) state.dirtyFlags.db = true;
  if (next.db === false) state.dirtyFlags.db = false;
  if (next.cover === true) state.dirtyFlags.cover = true;
  if (next.cover === false) state.dirtyFlags.cover = false;
  if (next.audio !== undefined) {
    if (next.audio === false) {
      // Полный сброс аудио-грязи
      state.dirtyFlags.audio.dirty.clear();
    } else if (typeof next.audio === 'string') {
      // Per-file tracking: добавляем конкретное имя файла
      state.dirtyFlags.audio.dirty.add(next.audio);
    } else if (next.audio === true) {
      // Глобальный dirty: все файлы помечены (сентинел '*')
      state.dirtyFlags.audio.dirty.add('*');
    }
  }
  _updateUnsavedStar();
}

function _hasUnsavedChanges() {
  var f = _getDirtyFlags();
  var audioDirty = !!(f.audio && f.audio.dirty && f.audio.dirty.size > 0);
  return !!(f.db || f.cover || audioDirty);
}

function _updateUnsavedStar() {
  var flags = _getDirtyFlags();
  var audioDirty = !!(flags.audio && flags.audio.dirty && flags.audio.dirty.size > 0);

  var dbStar = document.getElementById('dictationEditorModalUnsavedStarDb');
  if (dbStar) {
    dbStar.style.display = flags.db ? 'inline-flex' : 'none';
    dbStar.style.color = 'var(--color-button-text-lightgreen, #2ecc71)';
    dbStar.title = 'Изменения в тексте/БД';
  }

  var audioStar = document.getElementById('dictationEditorModalUnsavedStarAudio');
  if (audioStar) {
    audioStar.style.display = audioDirty ? 'inline-flex' : 'none';
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
    case 'loading':
      newIcon = 'loader-2';
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
    // №, Оригинал, a/f/m (только аудио-кнопка по радио)
    showCols('.panel-original');
    showAudioBtnByVoiceMode();
    // Перевод и t показываем только если есть язык перевода
    var langBlocks = state.content ? state.content.langBlocks : [];
    var hasTranslation = langBlocks.length > 1;
    if (hasTranslation) {
      showCols('.panel-translation');
    }
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
    showAudioBtnByVoiceMode();
    var langBlocksVT = state.content ? state.content.langBlocks : [];
    var hasTranslationVT = langBlocksVT.length > 1;
    if (hasTranslationVT) {
      showCols('.panel-translation');
    }
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

  // Получаем langBlocks: langBlocks[0] — оригинал, остальные — переводы
  var langBlocks = state.content ? state.content.langBlocks : [];
  var origBlock = langBlocks.length > 0 ? langBlocks[0] : null;
  var origSentences = origBlock ? origBlock.sentences : [];
  var langOrig = origBlock ? origBlock.lang : (state.config?.originalLanguage || '');

  // Выбираем блок перевода по текущему языку из config (если есть несколько)
  var currentTrLang = (state.config && state.config.translationLanguage) || '';
  var trBlock = null;
  if (currentTrLang && langBlocks.length > 1) {
    for (var i = 1; i < langBlocks.length; i++) {
      if (langBlocks[i].lang === currentTrLang) {
        trBlock = langBlocks[i];
        break;
      }
    }
  }
  // Fallback: если не нашли по currentTrLang — берём первый переводной блок
  if (!trBlock && langBlocks.length > 1) {
    trBlock = langBlocks[1];
  }
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
          // Clear TTS audio and set button to hammer
          sentence.audio = '';
          _setDirtyFlags({ db: true, audio: true });
          // Update the TTS button icon to hammer
          var ttsBtn = document.querySelector('#' + EDITOR_TABLE_ID + ' .col-generate-tts button[data-key="' + key + '"]');
          if (ttsBtn) {
            _setButtonState(ttsBtn, 'creating');
          }
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

    // Перевод — показываем данные из первого языка перевода (langBlocks[1]),
    // при переключении языка через дропдаун данные переписываются _updateTranslationDisplay()
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
      // Используем this.dataset.lang — он обновляется _updateTranslationDisplay()
      var currentLang = this.dataset.lang || '';
      if (state.content && currentLang) {
        var sentence = state.content.getSentenceForLang(key, currentLang);
        if (sentence) {
          sentence.text = this.value;
          // Clear TTS audio and set translation play button to hammer
          sentence.audio = '';
          _setDirtyFlags({ db: true, audio: true });
          // Update the translation play button icon to hammer
          var playTransBtn = document.querySelector('#' + EDITOR_TABLE_ID + ' .col-play-translation button[data-key="' + key + '"][data-lang="' + currentLang + '"]');
          if (playTransBtn) {
            _setButtonState(playTransBtn, 'creating');
          }
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
    // dataset.lang будет обновляться _updateTranslationDisplay() при смене языка
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

  // Если кнопка в состоянии 'creating' (молоток):
  //   - Для поля 'audio' (TTS) — генерируем TTS аудио автоматически
  //   - Для полей 'audio_file'/'audio_mic' — обрезаем shared audio по start/end
  if (currentState === 'creating') {
    if (field === 'audio') {
      // TTS auto-generation
      _handleHammerGenerateTts(button, key, lang, sentence);
    } else {
      // Cut audio for audio_file / audio_mic
      _handleCutAudioForSentence(button, sentence, lang, field);
    }
    return;
  }

  // Если файла нет — переключаем в режим создания (молоток)
  if (!audioFilename) {
    _setButtonState(button, 'creating');
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
 * Генерирует TTS аудио при клике на молоточек (кнопка в состоянии 'creating').
 * Используется для кнопок TTS оригинала (поле 'audio') и перевода (поле 'audio').
 * После генерации автоматически проигрывает аудио и меняет иконку на play.
 */
async function _handleHammerGenerateTts(button, key, lang, sentence) {
  if (!sentence || !sentence.text) {
    console.warn('[dictationEditorModal] Пустой текст в предложении, нечего генерировать');
    return;
  }

  var dictationId = state.config ? state.config.dictationId : '';
  if (!dictationId) return;

  // Показываем состояние загрузки (кружок-спиннер)
  _setButtonState(button, 'loading');
  button.disabled = true;

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
        text: sentence.text,
        language: lang,
        filename_audio: _makeAudioFilename('tts', String(dictationId).replace(/^dict_/, ''), key, '.mp3'),
        tipe_audio: 'avto',
        safe_email: safeEmail,
      })
    });

    var data = await response.json();
    if (!data.success || !data.audio_b64) {
      console.error('[dictationEditorModal] Ошибка генерации TTS:', data.error);
      button.disabled = false;
      _setButtonState(button, 'creating');
      return;
    }

    // Создаём blob из audio_b64
    var binaryStr = atob(data.audio_b64);
    var bytes = new Uint8Array(binaryStr.length);
    for (var j = 0; j < binaryStr.length; j++) {
      bytes[j] = binaryStr.charCodeAt(j);
    }
    var blob = new Blob([bytes], { type: data.mime || 'audio/mpeg' });
    var newFilename = data.filename || _makeAudioFilename('tts', String(dictationId).replace(/^dict_/, ''), key, '.mp3');

    // Сохраняем в CacheStorage через AudioManager
    var am = _ensureAudioManager();
    if (am && typeof am.saveDictationAudioBlob === 'function') {
      await am.saveDictationAudioBlob(dictationId, lang, newFilename, blob, data.mime || 'audio/mpeg');
    }

    // Обновляем sentence
    sentence.audio = newFilename;

    // Устанавливаем dirty flags (зелёная + фиолетовая звезда)
    _setDirtyFlags({ db: true, audio: true });

    // Проигрываем сгенерированное аудио
    button.disabled = false;
    if (am && typeof am.play === 'function') {
      var canonicalUrl = am.buildDictationAudioUrl(dictationId, lang, newFilename);
      am.play(button, canonicalUrl, function () {
        _setButtonState(button, 'ready');
      });
      _setButtonState(button, 'playing');
    } else {
      // Fallback
      var blobUrl = URL.createObjectURL(blob);
      var audio = new Audio(blobUrl);
      audio.play().catch(function (err) {
        console.warn('[dictationEditorModal] Audio play error', err);
      });
      _setButtonState(button, 'playing');
      audio.addEventListener('ended', function () {
        _setButtonState(button, 'ready');
      });
    }

    console.log('[dictationEditorModal] TTS сгенерирован и проигран для строки', key, newFilename);
  } catch (e) {
    console.error('[dictationEditorModal] Ошибка при генерации TTS:', e);
    button.disabled = false;
    _setButtonState(button, 'creating');
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

  _setButtonState(button, 'loading'); // Показываем спиннер (загрузка)

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

    // Генерируем имя файла через единый генератор
    var numId = (state.config && state.config.dictationId) ? String(state.config.dictationId).replace(/^dict_/, '') : '';
    var newFilename = _makeAudioFilename('cut', numId, sentence.key, '.mp3');

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
async function _uploadDraftAudioToB2(dictationId, token, dirtySetParam) {
  var flowNum = window.__SAVE_FLOW || 0;
  if (!state.content || !dictationId || !token) {
    console.log('[dictationEditorModal] [FLOW-' + flowNum + '] _uploadDraftAudioToB2 пропущено: content=' + !!state.content + ' dictationId=' + dictationId + ' token=' + !!token);
    return { ok: false, reason: 'missing_data' };
  }

  // Нормализуем dictationId: добавляем префикс dict_ если его нет
  var normalizedId = String(dictationId || '').trim();
  if (normalizedId && !normalizedId.startsWith('dict_')) {
    normalizedId = 'dict_' + normalizedId;
  }
  dictationId = normalizedId;

  console.log('[dictationEditorModal] [FLOW-' + flowNum + '] _uploadDraftAudioToB2: старт, dictationId=' + dictationId + ' time=' + new Date().toISOString());

  var am = _ensureAudioManager();
  if (!am || typeof am.uploadDictationAudioFromCacheToB2 !== 'function') {
    console.warn('[dictationEditorModal] [FLOW-' + flowNum + '] AudioManager.uploadDictationAudioFromCacheToB2 not available');
    return { ok: false, reason: 'no_audio_manager' };
  }

  // Используем переданный dirtySet (снапшот ДО очистки в _handleSave),
  // либо читаем текущее состояние (для обратной совместимости).
  var dirtySet;
  if (dirtySetParam instanceof Set) {
    dirtySet = dirtySetParam;
  } else {
    var flags = _getDirtyFlags();
    dirtySet = (flags.audio && flags.audio.dirty) ? flags.audio.dirty : new Set();
  }
  var uploadAll = dirtySet.has('*');
  console.log('[dictationEditorModal] [FLOW-' + flowNum + '] _uploadDraftAudioToB2: uploadAll=' + uploadAll + ' dirtySet.size=' + dirtySet.size + ' (from param=' + (dirtySetParam instanceof Set) + ')');

  // Если dirtySet пуст и нет сентинела '*' — нечего загружать
  if (dirtySet.size === 0) {
    console.log('[dictationEditorModal] [FLOW-' + flowNum + '] _uploadDraftAudioToB2: dirtySet пуст, нечего загружать');
    return { ok: true, uploaded: 0, skipped: 0, failed: [] };
  }

  // Проходим по всем языковым блокам (оригинал + переводы)
  var langBlocks = state.content.langBlocks || [];
  var urls = [];
  var allFilenames = []; // keep-list для cleanup

  console.log('[dictationEditorModal] [FLOW-' + flowNum + '] _uploadDraftAudioToB2: аналізую ' + langBlocks.length + ' мовних блоків');

  for (var b = 0; b < langBlocks.length; b++) {
    var block = langBlocks[b];
    if (!block || !block.lang || !Array.isArray(block.sentences)) continue;

    var langCode = String(block.lang).toLowerCase().trim();
    var sentences = block.sentences;
    var langUrls = [];

    for (var i = 0; i < sentences.length; i++) {
      var s = sentences[i];
      // Собираем все возможные аудио поля: audio (TTS), audio_file (файл), audio_mic (микрофон)
      var filenames = [];
      if (s.audio) filenames.push(s.audio);
      if (s.audio_file) filenames.push(s.audio_file);
      if (s.audio_mic) filenames.push(s.audio_mic);

      for (var f = 0; f < filenames.length; f++) {
        var fn = filenames[f];
        if (!fn) continue;
        allFilenames.push(fn);
        // Dirty-only: пропускаем чистые файлы (если не uploadAll)
        if (!uploadAll && !dirtySet.has(fn)) continue;
        var buildUrl = am.buildDictationAudioUrl(dictationId, langCode, fn);
        langUrls.push(buildUrl);
        urls.push(buildUrl);
      }
    }
    console.log('[dictationEditorModal] [FLOW-' + flowNum + '] _uploadDraftAudioToB2: мова=' + langCode + ' знайдено ' + langUrls.length + ' URL для завантаження');
  }

  // Добавляем shared audio файл, если он есть (всегда для оригинального языка)
  if (state._sharedAudioFilename) {
    allFilenames.push(state._sharedAudioFilename);
    var origLang = (state.config ? state.config.originalLanguage : '');
    if (origLang && (uploadAll || dirtySet.has(state._sharedAudioFilename))) {
      var sharedUrl = am.buildDictationAudioUrl(dictationId, String(origLang).toLowerCase().trim(), state._sharedAudioFilename);
      urls.push(sharedUrl);
      console.log('[dictationEditorModal] [FLOW-' + flowNum + '] _uploadDraftAudioToB2: shared audio ' + state._sharedAudioFilename);
    }
  }

  if (urls.length === 0) {
    console.log('[dictationEditorModal] [FLOW-' + flowNum + '] _uploadDraftAudioToB2: немає dirty URL для завантаження (dirtySet.size=' + dirtySet.size + ')');
    // Орфанов не чистим, так как БД ещё не обновлена — cleanup сделает сервер после save_dictation_final
    return { ok: true, uploaded: 0, skipped: 0, failed: [] };
  }

  console.log('[dictationEditorModal] [FLOW-' + flowNum + '] _uploadDraftAudioToB2: всього ' + urls.length + ' dirty URL для завантаження на B2 (из ' + (new Set(allFilenames)).size + ' всего)');

  try {
    var result = await am.uploadDictationAudioFromCacheToB2({
      dictationId: dictationId,
      token: token,
      urls: urls,
      onUploaded: function (uploadedUrl) {
        console.log('[dictationEditorModal] [FLOW-' + flowNum + '] B2 upload success:', uploadedUrl);
      },
      onProgress: function (progress) {
        // Можно добавить индикатор прогресса при необходимости
      }
    });

    console.log('[dictationEditorModal] [FLOW-' + flowNum + '] _uploadDraftAudioToB2 результат: ok=' + (result ? result.ok : 'N/A') + ' uploaded=' + (result ? result.uploaded : 'N/A') + ' skipped=' + (result ? result.skipped : 'N/A') + ' failed=' + (result ? result.failed?.length || result.failed : 'N/A') + ' cacheMiss=' + (result ? result.cacheMiss : 'N/A'));

    if (result && result.failed && result.failed.length > 0) {
      console.warn('[dictationEditorModal] [FLOW-' + flowNum + '] Некоторые файлы не загрузились на B2:', JSON.stringify(result.failed));
    }
    if (result && result.cacheMiss && result.cacheMiss > 0) {
      console.warn('[dictationEditorModal] [FLOW-' + flowNum + '] cacheMiss=' + result.cacheMiss + ' — аудио не найдено в кеші!');
    }

    return result || { ok: true, uploaded: 0, skipped: 0, failed: [] };
  } catch (e) {
    console.warn('[dictationEditorModal] [FLOW-' + flowNum + '] B2 upload error', e);
    return { ok: false, reason: 'exception', error: e };
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
      _openAddRowModal('below');
    });
  }

  var deleteBtn = document.getElementById('editorModalDeleteRowBtn');
  if (deleteBtn && !deleteBtn.getAttribute('data-table-control-handler')) {
    deleteBtn.setAttribute('data-table-control-handler', '1');
    deleteBtn.addEventListener('click', function () {
      var selectedRow = document.querySelector('#' + EDITOR_TABLE_ID + ' tbody tr.selected');
      if (!selectedRow) return;
      _deleteRow(selectedRow);
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

/** Получить URL флага для языка */
function _getFlagUrlForLang(lang) {
  try {
    if (window.LanguageManager && typeof window.LanguageManager.getCountryCode === 'function') {
      var cc = window.LanguageManager.getCountryCode(lang);
      if (cc) return '/static/flags/' + cc + '.svg';
    }
  } catch (e) {}
  return '';
}

/** Получить отображаемое имя языка */
function _getLangDisplayName(lang) {
  try {
    if (window.LanguageManager && typeof window.LanguageManager.getLanguageDisplayName === 'function') {
      return window.LanguageManager.getLanguageDisplayName(lang);
    }
  } catch (e) {}
  return lang;
}

/** Автоперевод всех пустых полей перевода по тексту оригинала (фоновый, не ждёт) */
function _autoFillTranslations(origText) {
  _autoFillTranslationsAsync(origText);
}

/** Автоперевод всех пустых полей перевода — возвращает Promise, ждёт все fetch */
async function _autoFillTranslationsAsync(origText, origLangOverride) {
  if (!origText) return;
  var origLang = origLangOverride || (state.config ? state.config.originalLanguage : '');
  if (!origLang) return;
  var rows = document.querySelectorAll('#addRowModalTranslationsTable tbody tr');
  var promises = [];
  rows.forEach(function (row) {
    var input = row.querySelector('input[type="text"]');
    if (!input) return;
    var lang = input.dataset.lang;
    if (!lang) return;
    var currentText = input.value.trim();
    if (currentText) return;
    input.placeholder = 'Переклад...';
    input.disabled = true;
    var p = fetch('/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: origText,
        source_lang: origLang,
        target_lang: lang,
      }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.translation) {
          input.value = data.translation;
        }
        input.disabled = false;
        input.placeholder = 'Перевод...';
      })
      .catch(function () {
        input.disabled = false;
        input.placeholder = 'Перевод...';
      });
    promises.push(p);
  });
  await Promise.all(promises);
}

function _openAddRowModal(position) {
  var modal = document.getElementById('addRowModal');
  if (!modal) return;

  var langBlocks = state.content ? state.content.langBlocks : [];
  var origBlock = langBlocks.length > 0 ? langBlocks[0] : null;
  if (!origBlock) return;

  // Проверка лимита 1000 строк
  if (origBlock.sentences.length >= 1000) {
    alert('Достигнут лимит в 1000 строк. Добавление невозможно.');
    return;
  }

  // Вычисляем свободный ключ и отображаем его
  var freeKey = _findFreeKey();
  var freeNum = parseInt(String(freeKey).replace('s_', '') || '0', 10);
  var displayCode = String(freeNum).padStart(3, '0');

  var codeBadge = document.getElementById('addRowModalCodeDisplay');
  if (codeBadge) codeBadge.textContent = 'Код: ' + displayCode;

  // Получаем языки перевода (все блоки кроме первого — оригинал)
  var translationLangs = [];
  if (langBlocks.length > 1) {
    for (var i = 1; i < langBlocks.length; i++) {
      translationLangs.push(langBlocks[i].lang);
    }
  }

  // Заполняем таблицу переводов с флагами
  var tbody = document.querySelector('#addRowModalTranslationsTable tbody');
  if (tbody) {
    tbody.innerHTML = '';
    if (translationLangs.length > 0) {
      translationLangs.forEach(function (lang) {
        var tr = document.createElement('tr');

        // Флаг
        var flagTd = document.createElement('td');
        flagTd.className = 'add-row-modal__col-flag';
        var flagUrl = _getFlagUrlForLang(lang);
        if (flagUrl) {
          var flagImg = document.createElement('img');
          flagImg.src = flagUrl;
          flagImg.className = 'add-row-modal__flag-img';
          flagImg.alt = lang;
          flagTd.appendChild(flagImg);
        }

        // Код языка
        var langTd = document.createElement('td');
        langTd.className = 'add-row-modal__col-lang';
        langTd.textContent = lang;

        // Поле ввода перевода
        var inputTd = document.createElement('td');
        inputTd.className = 'add-row-modal__col-text';
        var input = document.createElement('input');
        input.type = 'text';
        input.className = 'text-input';
        input.placeholder = 'Перевод...';
        input.dataset.lang = lang;
        inputTd.appendChild(input);

        tr.appendChild(flagTd);
        tr.appendChild(langTd);
        tr.appendChild(inputTd);
        tbody.appendChild(tr);
      });
    } else {
      var tr = document.createElement('tr');
      var td = document.createElement('td');
      td.setAttribute('colspan', '3');
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

  // Сохраняем позицию и свободный ключ в dataset модалки
  var effectivePosition = position || 'below';
  modal.dataset.position = effectivePosition;
  modal.dataset.freeKey = freeKey;

  // Предвыбираем соответствующую радио-кнопку
  var positionRadio = document.querySelector('input[name="addRowPosition"][value="' + effectivePosition + '"]');
  if (positionRadio) positionRadio.checked = true;

  modal.style.display = 'flex';

  // Устанавливаем фокус на поле ввода оригинала
  setTimeout(function () {
    if (origInput) origInput.focus();
  }, 50);
}

function _closeAddRowModal() {
  var modal = document.getElementById('addRowModal');
  if (modal) modal.style.display = 'none';
}

/** Пересчитывает position у всех предложений во всех langBlocks по порядковому индексу */
function _recalcPositions() {
  if (!state.content) return;
  var langBlocks = state.content.langBlocks;
  if (!langBlocks) return;
  langBlocks.forEach(function (block) {
    block.sentences.forEach(function (s, idx) {
      s.position = idx;
    });
  });
}

async function _handleAddRowCreate() {
  var modal = document.getElementById('addRowModal');
  if (!modal) return;

  var freeKey = modal.dataset.freeKey;
  if (!freeKey) return;

  var origInput = document.getElementById('addRowModalOrigInput');
  var origText = origInput ? origInput.value.trim() : '';

  var langBlocks = state.content.langBlocks;
  if (!langBlocks || langBlocks.length === 0) return;

  var origBlock = langBlocks[0];
  var origLang = origBlock.lang;

  // Дожидаемся автоперевода всех пустых полей
  await _autoFillTranslationsAsync(origText, origLang);

  // Собираем переводы (уже заполненные)
  var translations = {};
  var translationInputs = document.querySelectorAll('#addRowModalTranslationsTable tbody input[type="text"]');
  translationInputs.forEach(function (input) {
    var lang = input.dataset.lang;
    var text = input.value.trim();
    if (lang) {
      translations[lang] = text;
    }
  });

  // Определяем индекс вставки относительно выделенной строки
  var selectedRow = document.querySelector('#' + EDITOR_TABLE_ID + ' tbody tr.selected');
  var selectedKey = selectedRow ? selectedRow.dataset.key : '';
  var positionRadio = document.querySelector('input[name="addRowPosition"]:checked');
  var position = positionRadio ? positionRadio.value : 'below';

  var insertIndex;

  if (position === 'start') {
    insertIndex = 0;
  } else if (position === 'end') {
    insertIndex = origBlock.sentences.length;
  } else {
    // above / below — всегда есть выделенная строка
    insertIndex = origBlock.sentences.length; // fallback
    if (selectedKey) {
      for (var i = 0; i < origBlock.sentences.length; i++) {
        if (origBlock.sentences[i].key === selectedKey) {
          insertIndex = (position === 'above') ? i : (i + 1);
          break;
        }
      }
    }
  }

  // Вычисляем start = конец предыдущей строки, end = длительность общего аудиофайла
  var newStart = '0';
  var newEnd = '0';
  if (insertIndex > 0 && origBlock.sentences[insertIndex - 1]) {
    var prevEnd = parseFloat(origBlock.sentences[insertIndex - 1].end);
    if (!isNaN(prevEnd)) {
      newStart = prevEnd.toFixed(2);
    }
  }
  // Длительность аудиофайла
  if (state._sharedAudioDuration && state._sharedAudioDuration > 0) {
    newEnd = state._sharedAudioDuration.toFixed(2);
  } else {
    var wf = window.editorModalWaveform;
    if (wf && typeof wf.getDuration === 'function') {
      var dur = wf.getDuration();
      if (dur > 0) newEnd = dur.toFixed(2);
    }
  }

  // Создаём новое предложение для каждого языкового блока
  langBlocks.forEach(function (block) {
    var isOrig = (block === langBlocks[0]);
    var sentence = {
      key: freeKey,
      position: null,
      text: isOrig ? origText : (translations[block.lang] || ''),
      audio: '',
      audio_file: null,
      audio_mic: null,
      start: newStart,
      end: newEnd,
      checked: false,
      explanation: '',
    };

    block.sentences.splice(insertIndex, 0, sentence);
  });

  // Пересчитываем position для всех строк
  _recalcPositions();

  // Генерируем аудио: оригинал — если voiceMode auto, переводы — всегда если есть текст
  var checkedRadio = document.querySelector('input[name="editorModalVoiceMode"]:checked');
  var voiceMode = checkedRadio ? checkedRadio.value : 'auto';
  var dictationId = state.config ? state.config.dictationId : '';

  if (voiceMode === 'auto' && origText && dictationId) {
    await _generateAudioForSentence(freeKey, langBlocks[0].lang, origText, dictationId);
  }

  // Для переводов — последовательный await
  if (dictationId) {
    var langKeys = Object.keys(translations);
    for (var k = 0; k < langKeys.length; k++) {
      var langKey = langKeys[k];
      var trText = translations[langKey];
      if (trText) {
        await _generateAudioForSentence(freeKey, langKey, trText, dictationId);
      }
    }
  }

  _closeAddRowModal();
  _setDirtyFlags({ db: true, audio: voiceMode === 'auto' });
  _renderTable();
  _bindAudioPlaybackHandlers();
}

async function _generateAudioForSentence(key, lang, text, dictationId) {
  var flowNum = window.__SAVE_FLOW || 0;
  try {
    var safeEmail = '';
    try {
      if (window.UM && typeof window.UM.getSafeEmail === 'function') {
        safeEmail = window.UM.getSafeEmail();
      }
    } catch (e) {}

    console.log('[dictationEditorModal] [FLOW-' + flowNum + '] _generateAudioForSentence: key=' + key + ' lang=' + lang + ' dictationId=' + dictationId + ' time=' + new Date().toISOString());

    var numId = String(dictationId).replace(/^dict_/, '');
    var genFilename = _makeAudioFilename('tts', numId, key, '.mp3');

    var response = await fetch('/generate_audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dictation_id: dictationId,
        text: text,
        language: lang,
        filename_audio: genFilename,
        tipe_audio: 'avto',
        safe_email: safeEmail,
      })
    });

    var data = await response.json();
    if (!data.success || !data.audio_b64) {
      console.warn('[dictationEditorModal] [FLOW-' + flowNum + '] _generateAudioForSentence: генерація аудіо не вдалась для key=' + key + ' lang=' + lang, data.error || 'no audio_b64');
      return;
    }

    var binaryStr = atob(data.audio_b64);
    var bytes = new Uint8Array(binaryStr.length);
    for (var j = 0; j < binaryStr.length; j++) {
      bytes[j] = binaryStr.charCodeAt(j);
    }
    var blob = new Blob([bytes], { type: data.mime || 'audio/mpeg' });
    var newFilename = data.filename || genFilename;

    console.log('[dictationEditorModal] [FLOW-' + flowNum + '] _generateAudioForSentence: аудіо отримано, filename=' + newFilename + ' blobSize=' + blob.size);

    var am = _ensureAudioManager();
    if (am && typeof am.saveDictationAudioBlob === 'function') {
      console.log('[dictationEditorModal] [FLOW-' + flowNum + '] _generateAudioForSentence: зберігаю blob в CacheStorage... dictationId=' + dictationId + ' lang=' + lang + ' filename=' + newFilename);
      await am.saveDictationAudioBlob(dictationId, lang, newFilename, blob, data.mime || 'audio/mpeg');
      console.log('[dictationEditorModal] [FLOW-' + flowNum + '] _generateAudioForSentence: blob збережено в CacheStorage');
    } else {
      console.warn('[dictationEditorModal] [FLOW-' + flowNum + '] _generateAudioForSentence: AudioManager.saveDictationAudioBlob недоступний!');
    }

    // Обновляем sentence
    var sentence = state.content.getSentenceForLang(key, lang);
    if (sentence) {
      sentence.audio = newFilename;
      console.log('[dictationEditorModal] [FLOW-' + flowNum + '] _generateAudioForSentence: sentence.audio=' + newFilename);
    } else {
      console.warn('[dictationEditorModal] [FLOW-' + flowNum + '] _generateAudioForSentence: sentence not found for key=' + key + ' lang=' + lang);
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

  // Пересчитываем position для всех строк
  _recalcPositions();

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
    deleteBtn.className = 'translations-delete-btn';
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

  // Создаём LanguageSelector для выбора языка
  var selectorContainer = document.getElementById('addTranslationLangSelector');
  if (!selectorContainer) return;

  selectorContainer.innerHTML = '';

  if (window.LanguageManager && typeof window.initLanguageSelector === 'function') {
    var languageData = window.LanguageManager.getLanguageData();
    if (languageData) {
      // Фильтруем: показываем все языки, кроме оригинала и уже добавленных переводов
      var availableCodes = Object.keys(languageData).filter(function (code) {
        return !existingLangs[code] && code !== origLang;
      });

      if (availableCodes.length === 0) {
        selectorContainer.textContent = 'Все доступные языки уже добавлены';
        selectorContainer.style.color = '#888';
        selectorContainer.style.textAlign = 'center';
        selectorContainer.style.padding = '20px';
        return;
      }

      // Используем native-selector — выпадающий список со всеми доступными языками
      var selector = window.initLanguageSelector('addTranslationLangSelector', {
        mode: 'native-selector',
        nativeLanguage: availableCodes[0],
        nativeLanguages: availableCodes,
        languageData: languageData
      });
      if (typeof selector.init === 'function') {
        selector.init();
      }

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
  var selectedLang = values.nativeLanguage || '';
  if (!selectedLang) return;

  window.__SAVE_FLOW = (window.__SAVE_FLOW || 0) + 1;
  console.log('[dictationEditorModal] [FLOW-' + window.__SAVE_FLOW + '] _handleAddTranslationConfirm: починаємо додавання lang=' + selectedLang + ' time=' + new Date().toISOString(), { selectedLang });

  // Проверяем, не добавлен ли уже этот язык
  var langBlocks = state.content ? state.content.langBlocks : [];
  var alreadyExists = langBlocks.some(function (block) { return block.lang === selectedLang; });
  if (alreadyExists) {
    alert('Язык "' + selectedLang + '" уже добавлен');
    return;
  }

  // Показываем универсальный лоадер
  try {
    if (window.DesktopLoadingModal && typeof window.DesktopLoadingModal.show === 'function') {
      window.DesktopLoadingModal.show('Створення перекладу...');
    }
  } catch (e) {}

  try {
    console.log('[dictationEditorModal] _handleAddTranslationConfirm: створюємо пусті речення для', selectedLang);

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

    console.log('[dictationEditorModal] _handleAddTranslationConfirm: модалку закрито, починаємо переклад на', selectedLang);

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
          console.log('[dictationEditorModal] перекладаємо речення', s.key, 'з', origLang, 'на', selectedLang);
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
            console.log('[dictationEditorModal] відповідь перекладу для', s.key, trData);
            // Сервер возвращает {"translation": "..."} без поля success
            if (trData.translation) {
              var translatedText = trData.translation || '';
              if (translatedText) {
                var newBlock = state.content.langBlocks.find(function (b) { return b.lang === selectedLang; });
                if (newBlock) {
                  var targetSentence = newBlock.sentences.find(function (ns) { return ns.key === s.key; });
                  if (targetSentence) {
                    targetSentence.text = translatedText;
                    console.log('[dictationEditorModal] збережено переклад для', s.key, ':', translatedText);
                  }
                }
              }
            }
          } catch (e) {
            console.error('[dictationEditorModal] Translation error for', s.key, selectedLang, e);
          }
        }
      }
    }

    // Автоозвучка для нового языка перевода — всегда генерируем TTS,
    // независимо от выбранного радио voiceMode (которое относится к оригиналу).
    if (dictationId) {
      var newBlock = state.content.langBlocks.find(function (b) { return b.lang === selectedLang; });
      if (newBlock && newBlock.sentences) {
        console.log('[dictationEditorModal] [FLOW-' + window.__SAVE_FLOW + '] автоозвучка перекладу: генеруємо TTS для ' + newBlock.sentences.length + ' речень, мова=' + selectedLang);
        for (var i = 0; i < newBlock.sentences.length; i++) {
          var s = newBlock.sentences[i];
          if (s.text) {
            await _generateAudioForSentence(s.key, selectedLang, s.text, dictationId);
          }
        }
      }
    } else {
      console.log('[dictationEditorModal] [FLOW-' + (window.__SAVE_FLOW || 0) + '] TTS перекладу не генерується: dictationId відсутній');
    }

    console.log('[dictationEditorModal] оновлюємо інтерфейс для', selectedLang);

    // Устанавливаем текущий язык перевода в config — _renderTable() использует его для поиска блока
    if (state.config) {
      state.config.translationLanguage = selectedLang;
    }

    // Обновляем таблицу языков, флаги в шапке и основную таблицу
    _renderTranslationsTable();
    _initLanguageFlags();

    // Переключаем флаг в шапке на новый язык, чтобы пользователь сразу увидел результат
    var allTranslationLangs = [];
    if (state.content && state.content.langBlocks && state.content.langBlocks.length > 1) {
      for (var i = 1; i < state.content.langBlocks.length; i++) {
        allTranslationLangs.push(state.content.langBlocks[i].lang);
      }
    }
    if (state.headerLangPairSelector && typeof state.headerLangPairSelector.setValues === 'function') {
      state.headerLangPairSelector.setValues({
        nativeLanguage: selectedLang,
        nativeLanguages: allTranslationLangs
      });
    }
    _updateTranslationDisplay(selectedLang);
    _renderTable();
    _bindAudioPlaybackHandlers();
    console.log('[dictationEditorModal] [FLOW-' + window.__SAVE_FLOW + '] _handleAddTranslationConfirm ЗАВЕРШЕНО: dirtyFlags db=true audio=true time=' + new Date().toISOString());
    _setDirtyFlags({ db: true, audio: true });
  } finally {
    // Скрываем универсальный лоадер в любом случае (успех или ошибка)
    try {
      if (window.DesktopLoadingModal && typeof window.DesktopLoadingModal.hide === 'function') {
        window.DesktopLoadingModal.hide();
      }
    } catch (e) {
      console.warn('[dictationEditorModal] error hiding loading overlay', e);
    }
  }
}

function _openRemoveTranslationModal(langCode) {
  if (typeof window.DesktopConfirmModal !== 'undefined' && window.DesktopConfirmModal.open) {
    window.DesktopConfirmModal.open({
      title: 'Удалить язык перевода',
      message: 'Вы уверены, что хотите удалить язык "' + langCode + '" и все его переводы?',
      buttons: [
        {
          text: 'Удалить',
          type: 'danger',
          onClick: function () {
            _removeTranslationLanguage(langCode);
          }
        },
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

  // Показываем универсальный лоадер
  try {
    if (window.DesktopLoadingModal && typeof window.DesktopLoadingModal.show === 'function') {
      window.DesktopLoadingModal.show('Видалення мови перекладу...');
    }
  } catch (e) {}

  var index = -1;
  for (var i = 0; i < state.content.langBlocks.length; i++) {
    if (state.content.langBlocks[i].lang === langCode) {
      index = i;
      break;
    }
  }

  if (index === -1) {
    try { if (window.DesktopLoadingModal && typeof window.DesktopLoadingModal.hide === 'function') window.DesktopLoadingModal.hide(); } catch (e) {}
    return;
  }
  if (index === 0) {
    try { if (window.DesktopLoadingModal && typeof window.DesktopLoadingModal.hide === 'function') window.DesktopLoadingModal.hide(); } catch (e) {}
    return; // Не удаляем оригинал
  }

  state.content.langBlocks.splice(index, 1);

  // Если удалённый язык был активным в config, переключаемся на первый доступный перевод
  if (state.config && state.config.translationLanguage === langCode) {
    var remainingLangs = [];
    for (var i = 1; i < state.content.langBlocks.length; i++) {
      remainingLangs.push(state.content.langBlocks[i].lang);
    }
    state.config.translationLanguage = remainingLangs.length > 0 ? remainingLangs[0] : '';
  }

  _renderTranslationsTable();
  _initLanguageFlags();
  _renderTable();
  _bindAudioPlaybackHandlers();
  _setDirtyFlags({ db: true, audio: true });

  // Скрываем лоадер
  try {
    if (window.DesktopLoadingModal && typeof window.DesktopLoadingModal.hide === 'function') {
      window.DesktopLoadingModal.hide();
    }
  } catch (e) {}
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
    closeBtn.addEventListener('click', function () {
      console.log('[dictationEditorModal] closeBtn clicked');
      _maybeCloseWithPrompt();
    });
  }
}

function _setupOverlayClose() {
  const modal = document.getElementById(EDITOR_MODAL_ID);
  if (modal) {
    modal.addEventListener('click', function (e) {
      if (e.target === modal) {
        console.log('[dictationEditorModal] overlay clicked');
        _maybeCloseWithPrompt();
      }
    });
  }
}

/**
 * Проверяет, есть ли несохранённые изменения.
 * Если есть — показывает DesktopConfirmModal с 3 кнопками:
 *   крестик = отмена (вернуться в модалку)
 *   выйти без сохранения = close()
 *   выйти с сохранением = _handleSave() затем close()
 * Если изменений нет — закрывает сразу.
 */
function _maybeCloseWithPrompt() {
  if (_hasUnsavedChanges()) {
    if (typeof window.DesktopConfirmModal !== 'undefined' && typeof window.DesktopConfirmModal.open === 'function') {
      window.DesktopConfirmModal.open({
        showSave: true,
        onDiscard: function () {
          _closeEditorModal(); // wasSaved=false → discardContent
        },
        onSave: async function () {
          console.log('[dictationEditorModal] [SAVE-CLOSE] ===== ЗАКРЫТИЕ С СОХРАНЕНИЕМ (модалка "Сохранить и выйти?") =====');
          console.log('[dictationEditorModal] [SAVE-CLOSE] time=' + new Date().toISOString());
          var ok = false;
          try {
            ok = await _handleSave();
          } catch (e) {
            console.error('[dictationEditorModal] _handleSave error in onSave:', e);
          }
          if (ok) {
            _closeEditorModal(true); // wasSaved=true — НЕ удаляем контент из кэша
          }
        },
      });
      return;
    }
    // fallback без универсальной модалки
    var wantSave = window.confirm('Есть несохранённые изменения. Сохранить и выйти?');
    if (wantSave) {
      console.log('[dictationEditorModal] [SAVE-CLOSE] ===== ЗАКРЫТИЕ С СОХРАНЕНИЕМ (window.confirm fallback) =====');
      console.log('[dictationEditorModal] [SAVE-CLOSE] time=' + new Date().toISOString());
      _handleSave().then(function () { _closeEditorModal(true); }).catch(function () { _closeEditorModal(); });
      return;
    }
    var wantDiscard = window.confirm('Выйти без сохранения?');
    if (wantDiscard) {
      _closeEditorModal(); // wasSaved=false → discardContent
    }
    return;
  }
  _closeEditorModal(); // wasSaved=false, но изменений нет — discardContent безвреден
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

    const mode = state.editorMode || 'fill';

    if (mode === 'fill') {
      // Режим "Начальное заполнение" — используем flag-pair-checkboxes
      // Левый флаг: язык оригинала (фиксированный)
      // Правый флаг: открывает панель со всеми языками и чекбоксами
      state.headerLangPairSelector = window.initLanguageSelector('editorModalLangPair', {
        mode: 'flag-pair-checkboxes',
        currentLearning: validOrig,
        nativeLanguage: translationLangs[0] || '',
        nativeLanguages: translationLangs.length > 0 ? translationLangs : [],
        languageData: languageData,
        onLanguageChange: function(values) {
          var langs = values.nativeLanguages || [];
          var currentLang = values.nativeLanguage || (langs.length > 0 ? langs[0] : '');
          if (currentLang && langs.indexOf(currentLang) === -1) {
            currentLang = langs[0] || '';
          }
          _syncTranslationLanguages(langs, currentLang);
        }
      });
      if (state.headerLangPairSelector && typeof state.headerLangPairSelector.init === 'function') {
        state.headerLangPairSelector.init();
      }
    } else {
      // Режим "Дополнение" — флаги для просмотра существующего диктанта
      if (translationLangs.length === 0) {
        state.headerLangPairSelector = window.initLanguageSelector('editorModalLangPair', {
          mode: 'flag-single',
          currentLearning: validOrig,
          nativeLanguage: validOrig,
          languageData: languageData
        });
        if (state.headerLangPairSelector && typeof state.headerLangPairSelector.init === 'function') {
          state.headerLangPairSelector.init();
        }
      } else if (translationLangs.length === 1) {
        var validTr = languageData[translationLangs[0]] ? translationLangs[0] : '';
        state.headerLangPairSelector = window.initLanguageSelector('editorModalLangPair', {
          mode: 'flag-pair-fixed',
          currentLearning: validOrig,
          nativeLanguage: validTr || validOrig,
          languageData: languageData
        });
        if (state.headerLangPairSelector && typeof state.headerLangPairSelector.init === 'function') {
          state.headerLangPairSelector.init();
        }
      } else {
        // Несколько переводов — правый флаг открывает выпадающий список выбора языка
        // Определяем начальный отображаемый язык: config.translationLanguage, если он есть в списке
        var initialDisplayLang = translationLangs[0];
        if (state.config && state.config.translationLanguage && translationLangs.indexOf(state.config.translationLanguage) !== -1) {
          initialDisplayLang = state.config.translationLanguage;
        }
        state.headerLangPairSelector = window.initLanguageSelector('editorModalLangPair', {
          mode: 'flag-pair-dropdown-right',
          currentLearning: validOrig,
          nativeLanguage: initialDisplayLang,
          nativeLanguages: translationLangs,
          languageData: languageData,
          onLanguageChange: function(values) {
            var newLang = values.nativeLanguage || '';
            if (!newLang) return;
            // Синхронизируем config.translationLanguage с выбранным флагом
            if (state.config) {
              state.config.translationLanguage = newLang;
            }
            _updateTranslationDisplay(newLang);
            // После ререндера в LanguageSelector сбрасывается inline-left,
            // поэтому перепозиционируем дропдаун под правым флагом
            _positionRightDropdown(container);
          }
        });
        if (state.headerLangPairSelector && typeof state.headerLangPairSelector.init === 'function') {
          state.headerLangPairSelector.init();
          // После рендеринга позиционируем дропдаун под правым флагом
          _positionRightDropdown(container);
        }
      }
    }
  } catch (e) {
    console.warn('[dictationEditorModal] _initLanguageFlags error', e);
  }
}

/**
 * Позиционирует дропдаун правого флага так, чтобы его левый верхний угол
 * совпадал с левым нижним углом правого флага (флага перевода).
 * Вычисляет offsetLeft правого флага внутри контейнера и устанавливает left.
 */
function _positionRightDropdown(container) {
  try {
    if (!container) return;
    var rightSide = container.querySelector('.flag-pair-side--right');
    var dropdown = container.querySelector('.flag-pair-dropdown[data-side="right"]');
    if (!rightSide || !dropdown) return;
    // offsetLeft даёт позицию относительно offsetParent.
    // Так как контейнер имеет position: relative, offsetParent = контейнер.
    dropdown.style.left = rightSide.offsetLeft + 'px';
    dropdown.style.right = 'auto';
  } catch (e) {
    console.warn('[dictationEditorModal] _positionRightDropdown error', e);
  }
}

/**
 * Синхронизирует langBlocks при изменении списка языков перевода.
 * @param {string[]} translationLangs - массив языков (отмеченных чекбоксами)
 * @param {string} currentDisplayLang - текущий отображаемый язык перевода
 */
function _syncTranslationLanguages(translationLangs, currentDisplayLang) {
  try {
    if (!state.content || !state.content.langBlocks || state.content.langBlocks.length === 0) return;
    if (!Array.isArray(translationLangs)) return;

    var origLang = state.content.langBlocks[0].lang;
    var origSentences = state.content.langBlocks[0].sentences;

    // Нормализуем входные языки
    var newLangs = translationLangs
      .map(function(l) { return String(l || '').trim().toLowerCase(); })
      .filter(Boolean);

    // Проверяем, что оригинал не равен языку перевода
    newLangs = newLangs.filter(function(l) { return l !== origLang; });

    // Убираем дубликаты
    newLangs = newLangs.filter(function(l, i, arr) { return arr.indexOf(l) === i; });

    // Получаем текущие языки из langBlocks (кроме оригинала)
    var currentLangs = [];
    for (var i = 1; i < state.content.langBlocks.length; i++) {
      currentLangs.push(state.content.langBlocks[i].lang);
    }

    // Определяем, какие языки добавить, какие удалить
    var langsToAdd = newLangs.filter(function(l) { return currentLangs.indexOf(l) === -1; });
    var langsToRemove = currentLangs.filter(function(l) { return newLangs.indexOf(l) === -1; });

    if (langsToAdd.length === 0 && langsToRemove.length === 0) {
      // Языки не изменились — только обновляем текущий отображаемый
      if (currentDisplayLang && state.config) {
        state.config.translationLanguage = currentDisplayLang;
      }
      _updateTranslationDisplay(currentDisplayLang);
      return;
    }

    // Удаляем блоки для убранных языков
    if (langsToRemove.length > 0) {
      state.content.langBlocks = state.content.langBlocks.filter(function(block) {
        return langsToRemove.indexOf(block.lang) === -1;
      });
    }

    // Добавляем блоки для новых языков (с пустыми предложениями)
    if (langsToAdd.length > 0) {
      langsToAdd.forEach(function(lang) {
        // Создаём пустые предложения для нового языка (копируем ключи из оригинала)
        var emptySentences = origSentences.map(function(s) {
          return {
            key: s.key,
            position: s.position != null ? Number(s.position) : null,
            text: '',
            audio: '',
            audio_file: null,
            audio_mic: null,
            start: '',
            end: '',
            checked: false,
            explanation: '',
          };
        });
        state.content.langBlocks.push({ lang: lang, sentences: emptySentences });
      });
    }

    // Обновляем config.translationLanguage
    if (currentDisplayLang && state.config) {
      state.config.translationLanguage = currentDisplayLang;
    }

    // Помечаем dirty
    _setDirtyFlags({ db: true });

    // Перерисовываем таблицу и таблицу переводов
    _renderTable();
    _renderTranslationsTable();
    _updateAutoRegenerateAllBtnVisibility();
    _updateTranslationDisplay(currentDisplayLang);

    console.log('[dictationEditorModal] _syncTranslationLanguages done', {
      added: langsToAdd,
      removed: langsToRemove,
      currentDisplay: currentDisplayLang
    });
  } catch (e) {
    console.warn('[dictationEditorModal] _syncTranslationLanguages error', e);
  }
}

/**
 * Обновляет содержимое столбца перевода данными из выбранного языка.
 * Переписывает текст и аудио в единственном столбце перевода.
 */
function _updateTranslationDisplay(currentLang) {
  if (!currentLang) return;
  if (!state.content || !state.content.langBlocks) return;

  // Находим блок перевода для выбранного языка
  var trBlock = null;
  for (var i = 0; i < state.content.langBlocks.length; i++) {
    if (state.content.langBlocks[i].lang === currentLang) {
      trBlock = state.content.langBlocks[i];
      break;
    }
  }
  if (!trBlock) return;

  var table = document.getElementById('editorModalSentencesTable');
  if (!table) return;

  // Обновляем заголовок столбца перевода
  var headerCell = table.querySelector('thead th.col-translation');
  if (headerCell) {
    headerCell.textContent = 'Переклад (' + (currentLang || '').toUpperCase() + ')';
  }

  // Обновляем каждую строку таблицы
  var rows = table.querySelectorAll('tbody tr');
  rows.forEach(function(tr) {
    var key = tr.dataset.key;
    if (!key) return;

    var trSentence = trBlock.sentences.find(function(ts) { return ts.key === key; }) || null;

    // Обновляем поле ввода перевода
    var transInput = tr.querySelector('td.col-translation input');
    if (transInput) {
      transInput.value = trSentence ? (trSentence.text || '') : '';
      transInput.dataset.lang = currentLang;
    }

    // Обновляем кнопку аудио перевода
    var playTransBtn = tr.querySelector('td.col-play-translation .audio-btn');
    if (playTransBtn) {
      playTransBtn.dataset.lang = currentLang;
      playTransBtn.dataset.state = (trSentence && trSentence.audio) ? 'ready' : 'creating';
      var icon = playTransBtn.querySelector('i[data-lucide]');
      if (icon) {
        icon.setAttribute('data-lucide', (trSentence && trSentence.audio) ? 'play' : 'hammer');
      }
    }
  });

  // Обновляем иконки lucide
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

/**
 * Отображает режим редактора в хедере модалки.
 */
function _updateEditorModeDisplay() {
  var modeEl = document.getElementById('dictationEditorModalMode');
  if (!modeEl) return;
  if (state.editorMode === 'fill') {
    modeEl.textContent = 'Начальное заполнение';
    modeEl.dataset.mode = 'fill';
  } else {
    modeEl.textContent = 'Дополнение';
    modeEl.dataset.mode = 'append';
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
        // Изменение режима голоса — это изменение в БД (voice_mode), зажигаем звезду.
        // НО только для реальных кликов пользователя: программный dispatchEvent('change')
        // (например, из _updateEditorFromFillConfig после заполнения формы или из _refillAndApply)
        // не должен помечать редактор "грязным".
        if (this.__userClickedVoiceMode) {
          _setDirtyFlags({ db: true });
        }
      }
    });
    // Ловим именно действия пользователя (мышь/клавиатура), а не программные dispatchEvent.
    radio.addEventListener('click', function () {
      radio.__userClickedVoiceMode = true;
    });
    radio.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'ArrowDown' ||
          e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        radio.__userClickedVoiceMode = true;
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
    var numId = String(dictationId).replace(/^dict_/, '');
    var genFilename = _makeAudioFilename('tts', numId, key, '.mp3');

    var response = await fetch('/generate_audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dictation_id: dictationId,
        text: text,
        language: lang,
        filename_audio: genFilename,
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
    var newFilename = data.filename || genFilename;

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
        var numId = String(dictationId).replace(/^dict_/, '');
        var genFilename = _makeAudioFilename('tts', numId, cores[i].key, '.mp3');

        var response = await fetch('/generate_audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dictation_id: dictationId,
            text: text,
            language: lang,
            filename_audio: genFilename,
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
        var newFilename = data.filename || genFilename;

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
  console.log('[dictationEditorModal] [TRACE] _uploadSharedAudioFile: file.name=' + file.name + ' _sharedAudioFilename_до=' + state._sharedAudioFilename);

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

  // НЕМЕДЛЕННО сохраняем имя файла, не дожидаясь loadedmetadata!
  // Генерируем предсказуемое имя с timestamp: shared_{dictId}_{timestamp}.{ext}
  // Это исключает проблемы с пробелами, спецсимволами и %20 в URL,
  // а timestamp гарантирует уникальность при повторной загрузке.
  var ext = '.mp3';
  var extMatch = file.name.match(/\.([a-z0-9]{2,5})$/i);
  if (extMatch) ext = '.' + extMatch[1].toLowerCase();
  var dictId = (state.config && state.config.dictationId) ? String(state.config.dictationId).replace(/^dict_/, '') : '';
  if (!dictId) dictId = Date.now();
  state._sharedAudioFilename = _makeAudioFilename('shared', dictId, '', ext);
  console.log('[dictationEditorModal] [TRACE] _uploadSharedAudioFile: _sharedAudioFilename сгенерировано=' + state._sharedAudioFilename + ' (оригинал=' + file.name + ')');

  // Обновляем название файла в панели над волной — показываем системное имя
  var filenameEl = document.getElementById('editorModalWaveformFilename');
  if (filenameEl) {
    filenameEl.textContent = state._sharedAudioFilename;
  }

  audio.addEventListener('loadedmetadata', function () {
    var duration = audio.duration;
    state._sharedAudioDuration = duration;
    console.log('[dictationEditorModal] [TRACE] _uploadSharedAudioFile loadedmetadata: duration=' + duration + ' _sharedAudioFilename=' + state._sharedAudioFilename);

    // Инициализируем волну и устанавливаем регион на весь файл
    _initWaveform(audioUrl).then(function () {
      var wf = window.editorModalWaveform;
      if (wf) {
        wf.setRegion(0, duration);
      }
    });

    // Устанавливаем start/end на весь файл
    var startInput = document.getElementById('editorModalAudioStartTime');
    var endInput = document.getElementById('editorModalAudioEndTime');
    if (startInput) startInput.value = '0';
    if (endInput) endInput.value = duration.toFixed(2);

    // Помечаем, что есть несохранённые изменения:
    // db: true — имя файла нужно сохранить в БД (колонка audio_user_shared)
    // audio: true — сам аудиофайл нужно загрузить в B2
    console.log('[dictationEditorModal] [TRACE] _uploadSharedAudioFile: выставляю dirty db+audio');
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
  if (!container) return Promise.resolve();

  // Проверяем, что контейнер имеет размеры
  if (container.offsetWidth === 0 || container.offsetHeight === 0) {
    console.warn('[dictationEditorModal] Контейнер waveform не видим, принудительно устанавливаем размеры');
    container.style.width = '100%';
    container.style.height = '100px';
    container.style.minHeight = '100px';

    // Если размеры все еще 0, откладываем инициализацию
    if (container.offsetWidth === 0 || container.offsetHeight === 0) {
      console.warn('[dictationEditorModal] Не удалось установить размеры контейнера, откладываем инициализацию');
      return Promise.resolve();
    }
  }

  // Проверяем, что WaveformCanvas загружен
  if (typeof WaveformCanvas === 'undefined') {
    console.warn('[dictationEditorModal] WaveformCanvas не загружен');
    return Promise.resolve();
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

    // Callback при изменении региона
    wf.onRegionUpdate(function (region) {
      var startInput = document.getElementById('editorModalAudioStartTime');
      var endInput = document.getElementById('editorModalAudioEndTime');
      if (startInput) startInput.value = region.start.toFixed(2);
      if (endInput) endInput.value = region.end.toFixed(2);
      // Синхронизируем с моделью предложения (start/end), чтобы _handleCutAudioForSentence видел актуальные значения
      _syncStartEndToSentence('start', region.start.toFixed(2));
      _syncStartEndToSentence('end', region.end.toFixed(2));
    });

    // Возвращаем промис, который резолвится после полной загрузки аудио.
    // НЕ устанавливаем регион по умолчанию — это делается только в _uploadSharedAudioFile
    // (при загрузке нового файла) и в _selectSentenceRow (при выборе строки).
    return wf.loadAudio(audioUrl).then(function () {
      // Регион не трогаем — он будет установлен вызывающим кодом
    }).catch(function (err) {
      console.warn('[dictationEditorModal] Waveform load error', err);
    });

  } catch (e) {
    console.warn('[dictationEditorModal] Waveform init error', e);
    return Promise.resolve();
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
 * и с лейблами в таблице. Если значение региона действительно изменилось и у предложения
 * есть audio_file/audio — меняет соответствующую кнопку на молоточек.
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

  var strVal = (typeof value === 'number') ? value.toFixed(2) : String(value);

  // Проверяем, действительно ли значение изменилось (сравниваем как числа,
  // чтобы '0' и '0.00' считались одинаковыми)
  var oldVal = (field === 'start') ? sentence.start : sentence.end;
  var oldNum = parseFloat(oldVal);
  var newNum = parseFloat(strVal);
  var changed = isNaN(oldNum) || isNaN(newNum) ? (String(oldVal) !== strVal) : (Math.abs(oldNum - newNum) > 0.001);

  // Обновляем данные в менеджере
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

  // Только если значение действительно изменилось — инвалидируем аудио
  if (!changed) return;

  // Если у предложения есть audio_file — меняем кнопку f на молоточек (creating)
  if (sentence.audio_file) {
    var playBtn = selectedRow.querySelector('.col-play-audio.panel-editing-user .audio-btn');
    if (playBtn) {
      _setButtonState(playBtn, 'creating');
    }
  }

  // Если у предложения есть audio (TTS) — сбрасываем его и меняем кнопку o на молоточек
  if (sentence.audio) {
    sentence.audio = '';
    var ttsBtn = selectedRow.querySelector('.col-generate-tts.panel-editing-avto .audio-btn');
    if (ttsBtn) {
      _setButtonState(ttsBtn, 'creating');
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

    // Генерируем segment_filename с timestamp через единый генератор
    var numId = (state.config && state.config.dictationId) ? String(state.config.dictationId).replace(/^dict_/, '') : '';
    var segFilename = _makeAudioFilename('seg', numId, s.key, '.mp3');

    sentences.push({
      key: s.key,
      start_time: startTime,
      end_time: endTime,
      language: state.config ? state.config.originalLanguage : '',
      segment_filename: segFilename
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
        var numId = (state.config && state.config.dictationId) ? String(state.config.dictationId).replace(/^dict_/, '') : '';
        return {
          key: s.key,
          text: s.text || '',
          language: state.config ? state.config.originalLanguage : '',
          segment_filename: _makeAudioFilename('seg', numId, s.key, '.mp3')
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

      // Ленивая инициализация волны — только при первом открытии закладки
      if (tabName === 'voice-original-have' && !state._waveformInitialized) {
        state._waveformInitialized = true;
        console.log('[dictationEditorModal] [TRACE] _setupTabs: lazy wave init, _sharedAudioFilename=' + state._sharedAudioFilename + ' config.audio_user_shared=' + (state.config && state.config.audio_user_shared));
        _restoreSharedAudioFromSentences().then(function () {
          // После восстановления волны — синхронизируем регионы для первой строки
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
        });
      } else if (tabName === 'voice-original-self' && !state._waveformInitialized) {
        state._waveformInitialized = true;
        _restoreSelfAudioFromSentences();
      }

      if (typeof lucide !== 'undefined') {
        lucide.createIcons();
      }
    });
  });
}

/* ===== SAVE SYSTEM ===== */

function _applySavedDictationIds(savedMeta, prevId) {
  if (!savedMeta || !state.config) return;
  var newDictationId = savedMeta.dictation_id;
  if (!newDictationId) return;
  var prev = prevId || '';
  if (prev !== newDictationId) {
    console.log('[dictationEditorModal] Обновляю ID диктанта:', prev, '->', newDictationId);
    state.config.dictationId = newDictationId;
    if (state.content) {
      state.content.dictationId = newDictationId;
    }
    var idSpan = document.getElementById('dictation-editor-modal-id');
    if (idSpan) {
      var displayId = String(newDictationId).replace('dict_', '');
      idSpan.textContent = '#' + displayId;
    }
  }
  if (savedMeta.db_id && (!state.config.dbId || state.config.dictationId !== prev)) {
    state.config.dbId = savedMeta.db_id;
  }
}

async function _handleSave() {
  var saveBtn = document.getElementById('dictationEditorModalSaveBtn');
  if (!saveBtn) return false;

  // Защита от параллельных вызовов _handleSave():
  // если сохранение уже выполняется — ждём его завершения,
  // потом запускаемся с актуальными данными (включая новые переводы/TTS).
  if (window.__DICTATION_EDITOR_SAVE_IN_PROGRESS) {
    console.warn('[dictationEditorModal] _handleSave уже выполняется — ожидаем завершения...');
    var waitStarted = Date.now();
    while (window.__DICTATION_EDITOR_SAVE_IN_PROGRESS && (Date.now() - waitStarted) < 30000) {
      await new Promise(function (r) { setTimeout(r, 200); });
    }
    if (window.__DICTATION_EDITOR_SAVE_IN_PROGRESS) {
      console.error('[dictationEditorModal] _handleSave таймаут ожидания — выходим');
      return false;
    }
    console.log('[dictationEditorModal] _handleSave предыдущий вызов завершился, запускаем повторно');
  }
  window.__DICTATION_EDITOR_SAVE_IN_PROGRESS = true;

  // Показываем универсальный лоадер с правильным текстом "Збереження даних"
  try {
    if (window.DesktopLoadingModal && typeof window.DesktopLoadingModal.show === 'function') {
      window.DesktopLoadingModal.show('Збереження даних...');
    }
  } catch (e) {}

  saveBtn.disabled = true;
  var originalHTML = saveBtn.innerHTML;
  saveBtn.innerHTML = '<i data-lucide="loader-2"></i>';
  if (typeof lucide !== 'undefined' && lucide.createIcons) {
    lucide.createIcons();
  }

  var saved = false;

  try {
    var flags = _getDirtyFlags();
    var hasChanges = _hasUnsavedChanges();

    window.__SAVE_FLOW = (window.__SAVE_FLOW || 0) + 1;
    var flowNum = window.__SAVE_FLOW;
    console.log('[dictationEditorModal] [FLOW-' + flowNum + '] _handleSave ПОЧАТОК: db=' + flags.db + ' audio.size=' + (flags.audio && flags.audio.dirty ? flags.audio.dirty.size : 0) + ' cover=' + flags.cover + ' online=' + navigator.onLine + ' langBlocks=' + (state.content ? state.content.langBlocks.length : 0) + ' time=' + new Date().toISOString());

    if (!hasChanges) {
      console.log('[dictationEditorModal] Нет изменений для сохранения');
      return false;
    }

    // Собираем данные для сохранения
    var dictationId = state.config ? state.config.dictationId : null;
    var prevDictationId = String(dictationId || '');
    if (!dictationId) {
      console.warn('[dictationEditorModal] Нет ID диктанта для сохранения');
      return false;
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
      return false;
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
        var parsed = null;
        try {
          parsed = JSON.parse(targetBookStr);
        } catch (e) {
          parsed = null;
        }
        if (parsed && typeof parsed === 'object' && parsed.book_id != null) {
          // Формат desktop.js / book_modal.js: { book_id: <number> }
          targetBookId = Number(parsed.book_id);
        } else {
          // Обратная совместимость: старый формат — голая строка/число "123".
          var legacyId = Number(targetBookStr);
          if (!isNaN(legacyId) && legacyId > 0) {
            targetBookId = legacyId;
          }
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
      audio_user_shared: (function () {
        // Защита: не сохраняем повреждённые/плейсхолдерные имена файлов
        // (например, "audio ___.mp3" с пробелами или не содержащие реального расширения)
        var name = state._sharedAudioFilename;
        if (!name || typeof name !== 'string') return null;
        name = name.trim();
        if (!name) return null;
        // Нормализуем пробелы → подчёркивания (на случай старых кэшированных имён)
        if (/\s/.test(name)) {
          console.warn('[dictationEditorModal] Нормализуем пробелы в audio_user_shared:', name);
          name = name.replace(/\s+/g, '_');
          // Синхронизируем нормализованное имя обратно в state, чтобы CacheStorage/B2
          // тоже использовали чистое имя
          state._sharedAudioFilename = name;
        }
        // Имя файла должно иметь расширение (хотя бы .mp3, .wav, .ogg и т.п.)
        if (!/\.[a-z0-9]{2,5}$/i.test(name)) {
          console.warn('[dictationEditorModal] Пропускаем сохранение audio_user_shared — нет расширения:', name);
          return null;
        }
        return name;
      })(),
      audio_order: audioOrderValue,
      sentences: sentencesPayload,
      book_id: targetBookId,
      cover_b64: cover_b64,
    };

    console.log('[dictationEditorModal] [TRACE] _handleSave: audio_user_shared=' + saveData.audio_user_shared + ' _sharedAudioFilename=' + state._sharedAudioFilename + ' dirty.db=' + flags.db + ' dirty.audio.size=' + (flags.audio && flags.audio.dirty ? flags.audio.dirty.size : 0));

    // Если есть shared audio filename, но db флаг не стоит — всё равно помечаем db dirty,
    // чтобы audio_user_shared гарантированно сохранился в БД
    if (state._sharedAudioFilename && !flags.db) {
      flags.db = true;
    }

    // НОВО: Используем очередь сохранения SaveQueueBatcher (для нестабильного интернета)
    if (window.SaveQueueBatcher && typeof window.SaveQueueBatcher.enqueueSave === 'function') {
      try {
        console.log('[dictationEditorModal] Сохраняю через SaveQueueBatcher...');

        // СНАПШОТИМ dirty audio ДО вызова _setDirtyFlags(), т.к. flags — ссылка на
        // state.dirtyFlags и _setDirtyFlags() ниже мутирует тот же объект!
        var hasDirtyAudio = !!(flags.audio && flags.audio.dirty && flags.audio.dirty.size > 0);
        // Клонируем dirty set для передачи в _uploadDraftAudioToB2 (он будет вызван ПОСЛЕ очистки)
        var dirtySetSnapshot = null;
        if (hasDirtyAudio && flags.audio.dirty instanceof Set) {
          dirtySetSnapshot = new Set(flags.audio.dirty);
        }

        // Добавляем флаг dirty audio — чтобы при отправке batcher знал
        saveData._audioDirty = hasDirtyAudio;

        console.log('[dictationEditorModal] [FLOW-' + flowNum + '] SaveQueueBatcher audio=' + hasDirtyAudio + ' dirtySetSnapshot.size=' + (dirtySetSnapshot ? dirtySetSnapshot.size : 0) + ' online=' + navigator.onLine + ' langBlocks=' + (state.content ? state.content.langBlocks.length : 0));

        // Пишем в очередь IndexedDB
        var queueKey = await window.SaveQueueBatcher.enqueueSave(normalizedId, saveData);

        if (queueKey) {
          // Пытаемся сразу отправить.
          // flushAll() возвращает метаданные успешно отправленных записей:
          // [{ key, dictation_id, db_id }] — для новых диктантов это реальный ID.
          var flushResults = await window.SaveQueueBatcher.flushAll();
          if (!Array.isArray(flushResults)) flushResults = [];

          // Проверяем осталась ли запись в очереди
          var queueInfo = await window.SaveQueueBatcher.getQueueInfo();

          // Находим результат для нашего ключа (ID диктанта уже зарезервирован,
          // но сервер может вернуть актуальные dictation_id/db_id в метаданных).
          var savedMeta = null;
          for (var mi = 0; mi < flushResults.length; mi++) {
            if (flushResults[mi] && flushResults[mi].key === queueKey) {
              savedMeta = flushResults[mi];
              break;
            }
          }

          if (queueInfo.pending === 0) {
            // Отправлено успешно
            saved = true;
            _setDirtyFlags({ db: false, audio: false, cover: false });
            console.log('[dictationEditorModal] Данные сохранены через очередь');

            // Обновляем реальный ID диктанта из ответа сервера (на случай, если он изменился).
            if (savedMeta) {
              _applySavedDictationIds(savedMeta, prevDictationId);
            }

            // Добавляем диктант на рабочий стол
            try {
              var newDbId = state.config ? state.config.dbId : null;
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
                  try {
                    if (window.DictationKart && typeof window.DictationKart._showToast === 'function') {
                      window.DictationKart._showToast('Диктант додано на робочий стіл', { durationMs: 2200 });
                    }
                  } catch (e) {}
                }
              }
            } catch (e) {
              console.warn('[dictationEditorModal] Ошибка добавления на стол:', e);
            }

            // Обновляем десктоп
            try {
              if (window.Desktop && typeof window.Desktop.loadDeskItems === 'function') {
                await window.Desktop.loadDeskItems();
              }
            } catch (e) {}
          } else {
            // Данные в очереди — не все отправилось, но локально сохранено
            console.log('[dictationEditorModal] Данные сохранены локально, ожидают отправки (pending=' + queueInfo.pending + ')');
            _setDirtyFlags({ db: false, audio: false, cover: false });
            saved = true;

            // Показываем тост об отсроченной отправке
            try {
              if (window.DictationKart && typeof window.DictationKart._showToast === 'function') {
                window.DictationKart._showToast('Дані збережено локально, надішлемо при з\'єднанні', { durationMs: 3000 });
              }
            } catch (e) {}
          }

          // Загружаем аудио на B2, если флаг audio был установлен ДО сброса dirtyFlags.
          // Используем hasDirtyAudio (скопирован ДО _setDirtyFlags), а НЕ flags.audio,
          // потому что _setDirtyFlags() мутирует тот же объект state.dirtyFlags.
          // Важно: используем актуальный (уже обновлённый) ID диктанта, чтобы аудио
          // загрузилось под реальным dict_<id>.
          var effectiveDictationIdForB2 = state.config ? (state.config.dictationId || normalizedId) : normalizedId;
          if (hasDirtyAudio && navigator.onLine) {
            console.log('[dictationEditorModal] [FLOW-' + flowNum + '] Загружаем аудио на B2: dictationId=' + effectiveDictationIdForB2);
            try {
              var b2Result = await _uploadDraftAudioToB2(effectiveDictationIdForB2, token, dirtySetSnapshot);
              if (b2Result && b2Result.ok) {
                _setDirtyFlags({ audio: false });
                console.log('[dictationEditorModal] [FLOW-' + flowNum + '] Аудио загружено на B2 успешно: uploaded=' + b2Result.uploaded + ' skipped=' + b2Result.skipped + ' failed=' + (b2Result.failed ? b2Result.failed.length : 0) + ' cacheMiss=' + b2Result.cacheMiss);
              } else if (b2Result && b2Result.reason === 'inflight_timeout') {
                console.warn('[dictationEditorModal] [FLOW-' + flowNum + '] Аудио не загрузилось — таймаут ожидания inflight');
              } else if (b2Result && b2Result.reason === 'inflight') {
                console.warn('[dictationEditorModal] [FLOW-' + flowNum + '] Аудио не загрузилось — inflight (race condition)');
              } else if (b2Result && b2Result.uploaded > 0 && b2Result.failed && b2Result.failed.length > 0) {
                console.warn('[dictationEditorModal] [FLOW-' + flowNum + '] Аудио загружено частково: uploaded=' + b2Result.uploaded + ' failed=' + b2Result.failed.length);
              } else {
                console.warn('[dictationEditorModal] [FLOW-' + flowNum + '] Аудио не загрузилось: ' + JSON.stringify(b2Result));
              }
            } catch (audioErr) {
              console.warn('[dictationEditorModal] [FLOW-' + flowNum + '] Аудио не загрузилось (останется в кеше):', audioErr);
              // Не фатально — аудио осталось в MEDIA_CACHE_PERSIST
            }
          } else if (hasDirtyAudio && !navigator.onLine) {
            console.log('[dictationEditorModal] [FLOW-' + flowNum + '] Аудио отложено — нет сети: dictationId=' + normalizedId);
          } else {
            console.log('[dictationEditorModal] [FLOW-' + flowNum + '] Аудио не требуется: hasDirtyAudio=' + hasDirtyAudio);
          }

          console.log('[dictationEditorModal] Сохранение через очередь завершено');
          return saved;
        } else {
          console.warn('[dictationEditorModal] SaveQueueBatcher.enqueueSave не удался — fallback на прямой fetch');
        }
      } catch (e) {
        console.warn('[dictationEditorModal] Ошибка SaveQueueBatcher:', e, '— fallback на прямой fetch');
      }
    }

    // Этап 1: Сохраняем текст/БД (если dirty db) — старый путь, если SaveQueueBatcher не доступен
    if (flags.db) {
      console.log('[dictationEditorModal] Сохраняю текст/БД (прямой fetch)...');
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
          saved = true;
          console.log('[dictationEditorModal] Текст/БД сохранён');

          // Обновляем audio_order в state.config и в DictationContent,
          // чтобы при повторном открытии (без перезагрузки страницы) радио выставилось правильно
          if (state.config) {
            state.config.audio_order = audioOrderValue;
          }
          if (state.content) {
            state.content.audio_order = audioOrderValue;
          }

          // Обновляем audio_or_shared в DictationContent после сохранения,
          // чтобы при повторном открытии (без перезагрузки страницы) shared audio восстановился
          if (state.content) {
            state.content.audio_or_shared = state._sharedAudioFilename || null;
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
              await window.Desktop.loadDeskItems();
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

    // Этап 2: Сохраняем аудио (если dirty audio) — прямой fetch путь
    var hasDirtyAudioLegacy = !!(flags.audio && flags.audio.dirty && flags.audio.dirty.size > 0);
    var dirtySetSnapshotLegacy = null;
    if (hasDirtyAudioLegacy && flags.audio.dirty instanceof Set) {
      dirtySetSnapshotLegacy = new Set(flags.audio.dirty);
    }
    console.log('[dictationEditorModal] [FLOW-' + flowNum + '] Прямий fetch: hasDirtyAudio=' + hasDirtyAudioLegacy + ' online=' + navigator.onLine);
    if (hasDirtyAudioLegacy) {
      console.log('[dictationEditorModal] [FLOW-' + flowNum + '] Сохраняю аудио на B2 (прямий fetch)... dictationId=' + effectiveDictationId);
      try {
        var legacyB2Result = await _uploadDraftAudioToB2(effectiveDictationId, token, dirtySetSnapshotLegacy);
        if (legacyB2Result && legacyB2Result.ok) {
          _setDirtyFlags({ audio: false });
          console.log('[dictationEditorModal] [FLOW-' + flowNum + '] Аудио сохранено на B2: uploaded=' + legacyB2Result.uploaded);
        } else {
          console.warn('[dictationEditorModal] [FLOW-' + flowNum + '] Аудио не загрузилось: ' + JSON.stringify(legacyB2Result));
        }
      } catch (audioErr) {
        console.error('[dictationEditorModal] [FLOW-' + flowNum + '] Ошибка сохранения аудио:', audioErr);
      }
    } else {
      console.log('[dictationEditorModal] [FLOW-' + flowNum + '] Аудио не требуется: hasDirtyAudio=false');
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
    console.log('[dictationEditorModal] _handleSave finally');
    if (saved) {
      state._savedInSession = true;
    }
    window.__DICTATION_EDITOR_SAVE_IN_PROGRESS = false;
    saveBtn.innerHTML = originalHTML;
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
      lucide.createIcons();
    }
    saveBtn.disabled = false;

    // Скрываем универсальный лоадер
    try {
      if (window.DesktopLoadingModal && typeof window.DesktopLoadingModal.hide === 'function') {
        window.DesktopLoadingModal.hide();
      }
    } catch (e) {}
  }

  return saved;
}

/* ===== OPEN / CLOSE ===== */

function open(config) {
  // Сбрасываем флаг "сохранено в этой сессии" ДО возможного _closeEditorModal(),
  // чтобы не было ложного обновления списка книги при переоткрытии редактора.
  state._savedInSession = false;

  // Если модалка уже открыта — сначала закрываем (чистим состояние),
  // чтобы при повторном открытии для другого диктанта не осталось данных от предыдущего.
  if (state.isOpen) {
    _closeEditorModal();
  }

  state.config = config || {};

  // Восстанавливаем последний язык перевода из localStorage (поверх того, что пришло из config)
  var dictationId = config ? config.dictationId || '' : '';
  var savedTrLang = _loadLastTranslationLanguage(dictationId);
  if (savedTrLang && state.config) {
    state.config.translationLanguage = savedTrLang;
  }

  console.log('[dictationEditorModal] open() config:', JSON.stringify(state.config));
  console.log('[dictationEditorModal] [TRACE] open(): config.audio_user_shared=' + (config && config.audio_user_shared));
  state.isOpen = true;
  state.dirtyFlags = { db: false, cover: false, audio: { dirty: new Set() } };

  // Определяем режим редактора:
  // - isNewDictation === true → "Начальное заполнение" (fill)
  // - иначе → "Дополнение" (append)
  state.editorMode = (config && config.isNewDictation) ? 'fill' : 'append';

  // Сбрасываем shared audio состояние
  console.log('[dictationEditorModal] [TRACE] open(): сбрасываю _sharedAudioFilename (было=' + state._sharedAudioFilename + ')');
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

  // Создаём / получаем DictationContent через DictationSessionsStore
  var langOrig = config.originalLanguage || '';
  var langTr = config.translationLanguage || '';
  var rawSentences = config.sentences || [];
  var audioOrderFromConfig = config.audio_order || '';
  var audioUserSharedFromConfig = config.audio_user_shared || null;

  var store = _getEditorRuntimeStore();
  console.log('[dictationEditorModal] [TRACE] open(): кэш content.audio_or_shared=' + (store ? store.getOrCreateContent({dictationId: dictationId}).audio_or_shared : 'N/A') + ' config.audio_user_shared=' + audioUserSharedFromConfig);
  if (store) {
    // Используем DictationSessionsStore — он сам кеширует content через _contents Map
    state.content = store.getOrCreateContent({ dictationId: dictationId });
    // ВСЕГДА устанавливаем sentences из config — редактор всегда получает
    // полные данные с сервера (оригинал + все переводы).
    // Нельзя полагаться на кешированный content, потому что он мог быть создан
    // при запуске диктанта (где только оригинальный язык), и тогда переводы потеряются.
    if (rawSentences && rawSentences.length > 0) {
      state.content.setSentences(rawSentences, langOrig);
    }
    // Если content уже существовал и в нём есть audio_or_order — используем его
    // как источник истины (приоритет над config)
    if (state.content.audio_or_order !== undefined && state.content.audio_or_order !== null && state.content.audio_or_order !== '') {
      state.config.audio_order = state.content.audio_or_order;
    } else if (audioOrderFromConfig) {
      // Если в content нет audio_or_order, но есть в config — сохраняем в content
      state.content.audio_or_order = audioOrderFromConfig;
    }
    // ВАЖНО: config.audio_user_shared — источник истины (с сервера/свежего кэша dictation_kart).
    // Кэшированный content.audio_or_shared НИКОГДА не перезаписывает config,
    // потому что может содержать устаревшее/повреждённое значение из предыдущих сессий.
    if (audioUserSharedFromConfig) {
      // Нормализуем на случай старых данных с пробелами в имени
      var normalized = audioUserSharedFromConfig.replace(/\s+/g, '_');
      state.config.audio_user_shared = normalized;
      state._sharedAudioFilename = normalized;
      state.content.audio_or_shared = normalized;
      console.log('[dictationEditorModal] [TRACE] open(): _sharedAudioFilename из config: ' + normalized + (normalized !== audioUserSharedFromConfig ? ' (было: ' + audioUserSharedFromConfig + ')' : ''));
    } else if (state.content.audio_or_shared) {
      var normalized2 = state.content.audio_or_shared.replace(/\s+/g, '_');
      state.config.audio_user_shared = normalized2;
      state._sharedAudioFilename = normalized2;
      console.log('[dictationEditorModal] [TRACE] open(): _sharedAudioFilename из кэша: ' + normalized2 + (normalized2 !== state.content.audio_or_shared ? ' (было: ' + state.content.audio_or_shared + ')' : ''));
    } else {
      state.content.audio_or_shared = null;
      console.log('[dictationEditorModal] [TRACE] open(): _sharedAudioFilename сброшен (нет ни в config, ни в кэше)');
    }
  } else if (typeof DictationContent !== 'undefined') {
    // Создаём DictationContent напрямую (без хранилища)
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
      // Сортируем: оригинальный язык — первым
      if (langOrig) {
        langBlocks.sort(function (a, b) {
          if (a.lang === langOrig) return -1;
          if (b.lang === langOrig) return 1;
          return 0;
        });
      }
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
      // Сортируем: оригинальный язык — первым
      if (langOrig) {
        fallbackLangBlocks.sort(function (a, b) {
          if (a.lang === langOrig) return -1;
          if (b.lang === langOrig) return 1;
          return 0;
        });
      }
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
      setSentences: function (sentences, originalLanguage) {
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
        // Сортируем: оригинальный язык — первым
        if (originalLanguage) {
          this.langBlocks.sort(function (a, b) {
            if (a.lang === originalLanguage) return -1;
            if (b.lang === originalLanguage) return 1;
            return 0;
          });
        }
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

  // Сбрасываем флаг инициализации волны — она будет нарисована только при
  // первом открытии соответствующей закладки (ленивая инициализация).
  state._waveformInitialized = false;

  // Всегда открываем первую закладку (Общие данные), независимо от audio_order.
  // Волна рисуется лениво при первом переключении на закладку "have"/"self".
  var defaultTabBtn = document.querySelector('.dictation-editor-modal__tab-btn[data-tab="general"]');
  if (defaultTabBtn) {
    defaultTabBtn.click();
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
  console.log('[dictationEditorModal] [TRACE] _restoreSharedAudioFromSentences: начало, content=' + !!state.content + ' config.audio_user_shared=' + (state.config && state.config.audio_user_shared) + ' _sharedAudioFilename=' + state._sharedAudioFilename);

  if (!state.content) return;

  // Берём имя shared audio файла из config (сохранён в БД как audio_user_shared)
  var sharedFilename = state.config?.audio_user_shared || state._sharedAudioFilename;
  console.log('[dictationEditorModal] [TRACE] _restoreSharedAudioFromSentences: sharedFilename=' + sharedFilename);
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
      await _initWaveform(playableUrl);
      state._sharedAudioUrl = playableUrl;
      state._sharedAudioFilename = sharedFilename;
      // Восстанавливаем File-объект из кэша для _handleCutAudioForSentence
      try {
        var resp = await fetch(playableUrl);
        if (resp.ok) {
          var blob = await resp.blob();
          state._sharedAudioFile = new File([blob], sharedFilename, { type: blob.type || 'audio/mpeg' });
        }
      } catch (e) {
        console.warn('[dictationEditorModal] Could not restore File object from cached audio', e);
      }
      return;
    }
  } catch (e) {
    console.warn('[dictationEditorModal] Не удалось восстановить shared audio через кэш', e);
  }

  // Если не нашли в кэше — пробуем загрузить напрямую с сервера.
  // Проверяем доступность URL через HEAD перед инициализацией waveform,
  // чтобы избежать EncodingError при 404 ответе.
  var restored = false;
  try {
    var directUrl = am.buildDictationAudioUrl(dictationId, lang, sharedFilename);
    var headResp = await fetch(directUrl, { method: 'HEAD' });
    if (!headResp.ok) {
      console.warn('[dictationEditorModal] Shared audio file not found (HTTP ' + headResp.status + '):', directUrl);
    } else {
      await _initWaveform(directUrl);
      state._sharedAudioUrl = directUrl;
      state._sharedAudioFilename = sharedFilename;
      // Восстанавливаем File-объект для _handleCutAudioForSentence
      try {
        var resp = await fetch(directUrl);
        if (resp.ok) {
          var blob = await resp.blob();
          state._sharedAudioFile = new File([blob], sharedFilename, { type: blob.type || 'audio/mpeg' });
        }
      } catch (e) {
        console.warn('[dictationEditorModal] Could not restore File object from direct URL', e);
      }
      restored = true;
      console.log('[dictationEditorModal] Shared audio восстановлен через прямой URL:', directUrl);
    }
  } catch (e2) {
    console.warn('[dictationEditorModal] Не удалось восстановить shared audio даже через прямой URL', e2);
  }

  if (!restored) {
    // Если не удалось восстановить shared audio файл — очищаем повреждённое значение,
    // чтобы оно не циркулировало через кэш при повторных открытиях/сохранениях.
    console.warn('[dictationEditorModal] Shared audio file not accessible, clearing stale reference:', sharedFilename);
    if (state.config) {
      state.config.audio_user_shared = null;
    }
    if (state.content) {
      state.content.audio_or_shared = null;
    }
    state._sharedAudioFilename = null;
    var fnEl = document.getElementById('editorModalWaveformFilename');
    if (fnEl) fnEl.textContent = '';
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

function _closeEditorModal(wasSaved) {
  if (!state.isOpen) {
    return;
  }
  state.isOpen = false;

  // Сохраняем последний язык перевода в localStorage (до закрытия, пока state.config ещё жив)
  var closingDictationId = state.config && state.config.dictationId ? String(state.config.dictationId).trim() : '';
  if (closingDictationId && state.config && state.config.translationLanguage) {
    _saveLastTranslationLanguage(closingDictationId, state.config.translationLanguage);
  }

  // При выходе БЕЗ сохранения — удаляем мутированный контент из кэша DictationSessionsStore,
  // чтобы при повторном open() не вернулся грязный экземпляр с несохранёнными изменениями.
  if (!wasSaved && closingDictationId && window.DictationRuntime && window.DictationRuntime.store) {
    var store = window.DictationRuntime.store;
    if (typeof store.discardContent === 'function') {
      store.discardContent(closingDictationId);
      console.log('[dictationEditorModal] discardContent для dictationId=' + closingDictationId);
    }
  }

  state.config = null;
  state.headerLangPairSelector = null;
  state.content = null;
  state.currentDictation = null;
  state.dirtyFlags = { db: false, cover: false, audio: { dirty: new Set() } };
  state._sharedAudioFilename = null;
  state._sharedAudioDuration = null;
  state._sharedAudioFile = null;

  // Освобождаем blob URL'ы диктанта через AudioManager (включая мапу _objectUrlByCanonicalUrl)
  if (closingDictationId) {
    var am = _ensureAudioManager();
    if (am && typeof am.revokeDictationBlobUrls === 'function') {
      am.revokeDictationBlobUrls(closingDictationId);
    }
  }

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

  // Если диктант был сохранён — просим книжную модалку обновить список,
  // чтобы новый диктант сразу появился в открытом списке (без переоткрытия модалки).
  // Учитываем и случай "сохранил через дискету, потом закрыл через крестик":
  // в этом случае wasSaved не передаётся (изменений уже нет), но мы помним, что сессия была сохранена.
  var savedThisSession = !!wasSaved || !!state._savedInSession;
  if (savedThisSession && window.BookModal && typeof window.BookModal.onNewDictationSaved === 'function') {
    try {
      window.BookModal.onNewDictationSaved();
    } catch (e) {
      console.warn('[dictationEditorModal] Ошибка обновления списка книги после сохранения:', e);
    }
  }
  state._savedInSession = false;
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

  // Генерируем имя файла через единый генератор (с timestamp)
  var numId = (state.config && state.config.dictationId) ? String(state.config.dictationId).replace(/^dict_/, '') : '';
  var generatedFilename = _makeAudioFilename('mic', numId, key, '.mp3');

  // Записуємо ім'я файлу в audio_mic поточної строки
  sentence.audio_mic = generatedFilename;

  // Зберігаємо файл у CacheStorage
  _cacheSelfAudioFile(file, generatedFilename);

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
    saveBtn.addEventListener('click', function (e) {
      console.log('[dictationEditorModal] [SAVE-BTN] ===== КЛИК ПО КНОПКЕ "СОХРАНИТЬ" (дискета) =====');
      console.log('[dictationEditorModal] [SAVE-BTN] event.type=' + e.type + ' isTrusted=' + e.isTrusted + ' time=' + new Date().toISOString());
      console.log('[dictationEditorModal] [SAVE-BTN] Стек вызовов (trace):');
      console.trace('[dictationEditorModal] [SAVE-BTN]');
      _handleSave();
    });
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

  // При изменении текста оригинала — автозаполнение пустых переводов
  var addRowOrigInput = document.getElementById('addRowModalOrigInput');
  if (addRowOrigInput) {
    addRowOrigInput.addEventListener('input', function () {
      var text = addRowOrigInput.value.trim();
      if (text) {
        _autoFillTranslations(text);
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

    // Отображаем бейдж режима: Начальное заполнение / Дополнение
    var modeBadge = document.getElementById('newDictationFillMode');
    if (modeBadge) {
      var isNew = editorConfig && editorConfig.isNewDictation;
      if (isNew) {
        modeBadge.textContent = 'Начальное заполнение';
        modeBadge.dataset.mode = 'fill';
      } else {
        modeBadge.textContent = 'Дополнение';
        modeBadge.dataset.mode = 'append';
      }
    }

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

      // Получаем dictationId из конфига (для генерации аудио).
      // ID нового диктанта должен быть зарезервирован на сервере заранее
      // (desktop.js и book_modal.js вызывают /api/dictation/reserve_id перед открытием).
      // Устаревшая генерация dict_temp_* полностью удалена.
      var dictationId = this._editorConfig ? this._editorConfig.dictationId : '';
      if (!dictationId) {
        console.error('[NewDictationFillModal] Ошибка: dictationId не зарезервирован, создание невозможно');
        alert('Помилка: не вдалося зарезервувати ID диктанта. Спробуйте ще раз.');
        return;
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
        }

        // Генерируем аудио для перевода (всегда, независимо от voiceMode)
        if (trText && dictationId) {
          try {
            console.log('[NewDictationFillModal] generating audio for translation:', key, { langTr, trText: trText.slice(0, 50) });
            var genTrResp = await fetch('/generate_audio', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                dictation_id: dictationId,
                text: trText,
                language: langTr,
                filename_audio: 'tts_' + key + '_' + Date.now() + '.mp3',
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
              var newFilenameTr = genTrData.filename || ('tts_' + key + '_' + Date.now() + '.mp3');
              var am2 = _ensureAudioManager();
              if (am2 && typeof am2.saveDictationAudioBlob === 'function') {
                var savedKeyTr = await am2.saveDictationAudioBlob(dictationId, langTr, newFilenameTr, blobTr, genTrData.mime || 'audio/mpeg');
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

      var trLanguagesList = langs.translationLanguages || [];
      // Если нет translationLanguages, используем langTr
      if (trLanguagesList.length === 0 && langTr) {
        trLanguagesList = [langTr];
      }

      var config = this._editorConfig;
      config.title = title;
      config.originalLanguage = langOrig;
      config.translationLanguage = langTr || (trLanguagesList.length > 0 ? trLanguagesList[0] : '');
      config.translationLanguages = trLanguagesList;
      config.level = config.level || 'A1';
      config.audio_order = audioOrder;
      config.sentences = flatSentences;

      // Обновляем state.content ДО закрытия fill-модалки,
      // чтобы _renderTable() в _updateEditorFromFillConfig могла прочитать sentences
      if (state.content) {
        if (typeof state.content.setSentences === 'function') {
          state.content.setSentences(flatSentences, langOrig);
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
    var result = { original: '', translation: '', translationLanguages: [] };
    try {
      if (this._languageSelector && typeof this._languageSelector.getValues === 'function') {
        var values = this._languageSelector.getValues();
        if (values) {
          result.original = values.currentLearning || '';
          result.translation = values.nativeLanguage || '';
          result.translationLanguages = Array.isArray(values.nativeLanguages) ? values.nativeLanguages : [];
        }
      }
    } catch (e) {
      console.warn('[NewDictationFillModal] _getSelectedLanguages error', e);
    }

    return result;
  },

  /**
   * Инициализация LanguageSelector для выбора пары языков.
   * Левый флаг: выпадающий список ВСЕХ языков (выбор изучаемого языка)
   * Правый флаг: панель с чекбоксами всех языков (выбор языков перевода)
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
          if (window.USER_LANGUAGE_DATA) {
            if (window.USER_LANGUAGE_DATA.currentLearning || window.USER_LANGUAGE_DATA.learning || window.USER_LANGUAGE_DATA.learningLanguage) {
              defaultLearning = String(window.USER_LANGUAGE_DATA.currentLearning || window.USER_LANGUAGE_DATA.learning || window.USER_LANGUAGE_DATA.learningLanguage);
            }
            if (window.USER_LANGUAGE_DATA.nativeLanguage || window.USER_LANGUAGE_DATA.nativeLang) {
              nativeLang = String(window.USER_LANGUAGE_DATA.nativeLanguage || window.USER_LANGUAGE_DATA.nativeLang).toLowerCase();
            }
          } else if (window.UM && typeof window.UM.getCurrentUser === 'function') {
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

        container.innerHTML = '';

        self._languageSelector = window.initLanguageSelector('newDictationFillLangPair', {
          mode: 'flag-pair-checkboxes',
          leftDropdown: true,  // левый флаг открывает список всех языков
          currentLearning: defaultLearning,
          nativeLanguage: nativeLang,
          nativeLanguages: [nativeLang],  // по умолчанию только родной язык
          languageData: languageData,
          onLanguageChange: function (values) {
            try {
              var leftV = values && values.currentLearning ? String(values.currentLearning).toLowerCase() : '';
              var rightV = values && values.nativeLanguage ? String(values.nativeLanguage).toLowerCase() : '';
              // Если оригинал = перевод, сбрасываем правый на другой язык
              if (leftV && rightV === leftV) {
                var allLangs = Object.keys(languageData)
                  .map(function (x) { return String(x || '').toLowerCase(); })
                  .filter(Boolean);
                var newRight = allLangs.find(function (x) { return x !== leftV; }) || 'ru';
                values.nativeLanguage = newRight;
                // Обновляем и в LanguageSelector
                if (self._languageSelector) {
                  self._languageSelector.setValues({
                    nativeLanguage: newRight,
                    nativeLanguages: values.nativeLanguages || [newRight]
                  });
                }
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

    // Защита от повторного биндинга — при повторном open() не навешиваем дублирующие обработчики
    if (editor.dataset.fillHighlightBound === '1') return;
    editor.dataset.fillHighlightBound = '1';

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
        // Собираем языки перевода из config.translationLanguages или из langBlocks
        var trLangs = [];
        if (config.translationLanguages && Array.isArray(config.translationLanguages)) {
          trLangs = config.translationLanguages;
        } else if (config.translationLanguage) {
          trLangs = [config.translationLanguage];
        } else if (state.content && state.content.langBlocks && state.content.langBlocks.length > 1) {
          for (var i = 1; i < state.content.langBlocks.length; i++) {
            trLangs.push(state.content.langBlocks[i].lang);
          }
        }
        state.headerLangPairSelector.setValues({
          currentLearning: config.originalLanguage || '',
          nativeLanguage: config.translationLanguage || (trLangs.length > 0 ? trLangs[0] : ''),
          nativeLanguages: trLangs
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
      // Сортируем: оригинальный язык — первым
      if (config.originalLanguage) {
        langBlocks.sort(function (a, b) {
          if (a.lang === config.originalLanguage) return -1;
          if (b.lang === config.originalLanguage) return 1;
          return 0;
        });
      }
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
      // Сортируем: оригинальный язык — первым
      if (config.originalLanguage) {
        fallbackLangBlocks.sort(function (a, b) {
          if (a.lang === config.originalLanguage) return -1;
          if (b.lang === config.originalLanguage) return 1;
          return 0;
        });
      }
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
        setSentences: function (sentences, originalLanguage) {
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
          // Сортируем: оригинальный язык — первым
          if (originalLanguage) {
            this.langBlocks.sort(function (a, b) {
              if (a.lang === originalLanguage) return -1;
              if (b.lang === originalLanguage) return 1;
              return 0;
            });
          }
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
  close: _closeEditorModal,
  init: init,
  /** Доступ к внутреннему state для отладки через консоль */
  state: state,
};

// Авто-инициализация при загрузке DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
