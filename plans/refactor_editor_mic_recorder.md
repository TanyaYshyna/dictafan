# Рефакторинг: вынести запись с микрофона в UnifiedSpeechRecorder + EditorMicPanel

## Проблема

В [`dictation_editor_modal.js`](static/js/dictation_editor_modal.js) логика записи с микрофона размазана по 10+ отдельным функциям, которые напрямую обращаются к DOM через `document.getElementById()`.

**Подсчёт обращений к одной кнопке** `editorModalSelfRecordBtn`:
1. [`_initSelfAudioTab()`](static/js/dictation_editor_modal.js:3267) — получение элемента для навешивания обработчика
2. [`_startSelfMicRecording()`](static/js/dictation_editor_modal.js:3725) — добавление класса `.recording`
3. [`_updateSelfMicUiAfterRecording()`](static/js/dictation_editor_modal.js:3761) — снятие класса `.recording`
4. [`close()`](static/js/dictation_editor_modal.js:3057) — сброс UI при закрытии

Аналогично для `editorModalSelfRecordIcon`, `editorModalSelfRecordingIndicator`, `editorModalSelfPlayNewBtn`, `editorModalSelfApplyNewBtn` — каждая по 3-4 раза.

**Всего разрозненных функций:**
- `_startSelfMicVisualizer()` — создаёт AudioContext + AnalyserNode
- `_drawSelfMicVisualizer()` — RAF + canvas
- `_stopSelfMicVisualizer()` — cleanup AudioContext
- `_startSelfMicRecording()` — MediaRecorder + stream
- `_stopSelfMicRecording()` — остановка записи
- `_updateSelfMicUiAfterRecording()` — обновление UI после записи
- `_playSelfMicNewAudio()` — воспроизведение записанного
- `_applySelfMicNewAudio()` — применение к строке
- `_updateSelfMicDropdown()` — обновление выпадающего списка
- `_selectSelfMicFile()` — выбор файла из списка

**Состояние** хранится в 10+ полях объекта `state`:
`_selfMicNewUrl`, `_selfMicNewFile`, `_selfMicRecording`, `_selfMicRecorder`, `_selfMicAnalyser`, `_selfMicAudioContext`, `_selfMicSource`, `_selfMicRaf`, `_selfMicStream`, `_selfMicSessionId`, `_selfMicFiles`, `_selfMicSelectedIndex`

## Цель

Сделать как в диктанте — один менеджер с двумя режимами работы.

## Архитектура

```
UnifiedSpeechRecognition (speech_recognition_unified.js)
  |-- Режим "recognition" (как сейчас) — распознавание речи для DictationSpeechRecognitionPanel
  |-- Режим "record" (новый) — просто запись аудио без распознавания для редактора

EditorMicPanel (НОВЫЙ файл: static/js/dictation_editor_mic_panel.js)
  |-- UI-панель для редактора (по аналогии с DictationSpeechRecognitionPanel)
  |-- Получает DOM-элементы через options
  |-- Создаёт внутри себя UnifiedSpeechRecognition в режиме "record"
  |-- Управляет: запись, визуализатор, dropdown, play, apply
```

## Что изменить в UnifiedSpeechRecognition

Добавить поддержку режима `record`:

### 1. В `constructor()` — сохранять режим
```javascript
this.state.mode = this.options.mode || 'recognition'; // 'recognition' | 'record'
```

### 2. В `startRecording()` — упростить для record-режима
- Не требовать `AudioManager` (создавать `MediaRecorder` напрямую)
- Не запускать WebSpeech
- Не загружать Whisper
- Просто получить `getUserMedia`, создать `MediaRecorder`, собирать `chunks`

### 3. В `stopRecording()` — упростить для record-режима
- Не отправлять на сервер
- Не транскрайбить
- Вернуть `{ audioBlob, chunks }` вместо `{ text, audioBlob, ... }`
- Не чистить `_recognition` (его и нет)

### 4. Добавить метод `getRecordedChunks()` — вернуть массив Blob-частей

### 5. Добавить метод `getAudioBlob()` — уже есть, но сейчас возвращает только после stop. Для record-режима можно получать и во время.

## Новый файл: static/js/dictation_editor_mic_panel.js

Класс `EditorMicPanel` — UI-панель для редактора, по аналогии с `DictationSpeechRecognitionPanel`.

### Конструктор
```javascript
class EditorMicPanel {
  constructor(options = {}) {
    this.options = options;
    this._rec = null;  // UnifiedSpeechRecognition
    this._files = [];  // [{ blob, url, filename, rowKey }]
    this._selectedIndex = -1;
    this._sessionId = null;

    // DOM-элементы (получает из options или по ID)
    this.els = {
      recordBtn: options.recordBtn || null,
      recordIcon: options.recordIcon || null,
      indicator: options.indicator || null,
      playNewBtn: options.playNewBtn || null,
      applyNewBtn: options.applyNewBtn || null,
      visualizer: options.visualizer || null,
      filenameLabel: options.filenameLabel || null,
      dropdown: options.dropdown || null,
      dropdownBtn: options.dropdownBtn || null,
    };
  }
}
```

### Методы

| Метод | Описание |
|-------|----------|
| `bind()` | Навесить обработчики на кнопки (с guard `data-bound`) |
| `refreshEls()` | Обновить ссылки на DOM-элементы (аналог `_refreshElsFromDom`) |
| `startRecording()` | Создать `UnifiedSpeechRecognition` в режиме `record`, вызвать `startRecording()` |
| `stopRecording()` | Остановить запись, получить blob, добавить в `_files[]`, обновить dropdown |
| `playSelected()` | Воспроизвести выбранный файл из `_files[]` |
| `applySelected(onApply)` | Применить выбранный файл к строке, вызвать `onApply` колбэк |
| `updateDropdown()` | Построить список файлов для текущей строки |
| `selectFile(index)` | Выбрать файл из списка |
| `destroy()` | Полный cleanup: остановить запись, визуализатор, revokeObjectURL, сбросить UI |
| `resetUi()` | Сбросить UI к исходному состоянию |

### Внутренние методы

| Метод | Описание |
|-------|----------|
| `_startVisualizer(stream)` | Создать AudioContext + AnalyserNode + RAF |
| `_stopVisualizer()` | Остановить RAF, закрыть AudioContext |
| `_drawVisualizer()` | Рисовать столбики на canvas |
| `_updateUiAfterRecording()` | Обновить кнопки/индикаторы после записи |
| `_ensureRecognizer()` | Создать `UnifiedSpeechRecognition` если ещё нет (аналог `_ensureRecognizer` в `DictationSpeechRecognitionPanel`) |

## Что изменить в dictation_editor_modal.js

### 1. Удалить из `state` все поля микрофона:
- `_selfMicNewUrl`, `_selfMicNewFile`, `_selfMicRecording`, `_selfMicRecorder`
- `_selfMicAnalyser`, `_selfMicAudioContext`, `_selfMicSource`, `_selfMicRaf`, `_selfMicStream`
- `_selfMicSessionId`, `_selfMicFiles`, `_selfMicSelectedIndex`

### 2. Добавить в `state`:
```javascript
_micPanel: null,  // EditorMicPanel | null
```

### 3. В `_initSelfAudioTab()`:
```javascript
if (!state._micPanel) {
  state._micPanel = new EditorMicPanel({
    onApply: function(filename, blob) {
      // логика применения к строке (была в _applySelfMicNewAudio)
      _applySelfMicFile(filename, blob);
    }
  });
}
state._micPanel.bind();
```
Удалить все прямые `document.getElementById(...).addEventListener(...)` для кнопок записи.

### 4. Удалить функции:
- `_startSelfMicVisualizer()`, `_drawSelfMicVisualizer()`, `_stopSelfMicVisualizer()`
- `_startSelfMicRecording()`, `_stopSelfMicRecording()`, `_updateSelfMicUiAfterRecording()`
- `_playSelfMicNewAudio()`, `_applySelfMicNewAudio()`
- `_updateSelfMicDropdown()`, `_selectSelfMicFile()`

### 5. В `close()` — заменить блок (строки 3029-3073) на:
```javascript
if (state._micPanel) {
  state._micPanel.destroy();
  state._micPanel = null;
}
```

### 6. Новая функция `_applySelfMicFile(filename, blob)` — чистая логика применения файла к строке (без DOM-обращений к кнопкам записи):
```javascript
async function _applySelfMicFile(filename, blob) {
  var selectedRow = document.querySelector('#' + EDITOR_TABLE_ID + ' tbody tr.selected');
  if (!selectedRow) { alert('Не вибрано рядок'); return; }
  var key = selectedRow.dataset.key;
  if (!key || !state.content) return;
  var sentence = state.content.getSentence(key);
  if (!sentence) return;

  // Сохраняем в CacheStorage
  var am = _ensureAudioManager();
  if (am && typeof am.saveDictationAudioBlob === 'function') {
    var dictationId = state.config ? state.config.dictationId : '';
    var lang = state.config ? state.config.originalLanguage : '';
    await am.saveDictationAudioBlob(dictationId, lang, filename, blob, 'audio/webm');
  }

  sentence.audio_mic = filename;
  sentence.start = '0';
  sentence.end = '';
  _setDirtyFlags({ db: true, audio: true });
  _renderTable();
  _bindAudioPlaybackHandlers();
  _loadSelfAudioForRow(sentence);
}
```

## Изменения в UnifiedSpeechRecognition (speech_recognition_unified.js)

### Добавить режим "record"

```javascript
class UnifiedSpeechRecognition {
  constructor(options) {
    // ... существующий код ...
    this._mode = options.mode || 'recognition'; // 'recognition' | 'record'
  }

  async startRecording() {
    if (this._mode === 'record') {
      return this._startRecordingOnly();
    }
    // существующая логика
  }

  async stopRecording(cause) {
    if (this._mode === 'record') {
      return this._stopRecordingOnly(cause);
    }
    // существующая логика
  }

  async _startRecordingOnly() {
    // 1. getUserMedia
    // 2. Создать MediaRecorder напрямую (без AudioManager)
    // 3. Собирать chunks в ondataavailable
    // 4. Запустить визуализатор (через колбэк onRecordingStart)
    // 5. Установить таймер автостопа 30с
  }

  async _stopRecordingOnly(cause) {
    // 1. Остановить MediaRecorder
    // 2. Создать Blob из chunks
    // 3. Остановить треки
    // 4. Вернуть { audioBlob, chunks }
  }
}
```

## Подключение в base.html

Добавить в [`templates/base.html`](templates/base.html) после `dictation_editor_modal.js`:
```html
<script src="{{ url_for('static', filename='js/dictation_editor_mic_panel.js') }}?v={{ app_cache_revision }}"></script>
```

## Порядок выполнения

1. Добавить режим `record` в `UnifiedSpeechRecognition` (`_startRecordingOnly`, `_stopRecordingOnly`)
2. Создать `EditorMicPanel` в `static/js/dictation_editor_mic_panel.js`
3. Подключить новый файл в `base.html`
4. В `dictation_editor_modal.js`:
   - Удалить поля микрофона из `state`
   - Добавить `_micPanel`
   - Создать `_applySelfMicFile(filename, blob)`
   - В `_initSelfAudioTab()` создать и забиндить `EditorMicPanel`
   - Удалить 10 функций
   - В `close()` заменить на `state._micPanel.destroy()`
5. Протестировать: запись, визуализатор, dropdown, play, apply, cleanup при close()
