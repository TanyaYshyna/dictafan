# Архитектура: кэш редактора, timestamp-нейминг и diff-based B2

## Проблемы

### 1. Утечка кэша DictationContent при выходе без сохранения

**Текущее поведение** ([`_closeEditorModal()`](static/js/dictation_editor_modal.js:4566)):
- `_closeEditorModal()` сбрасывает `state.content = null` (локальная ссылка)
- НО экземпляр `DictationContent` **остаётся** в `DictationSessionsStore._contents` Map
- При повторном `open()` того же диктанта — [`open()`](static/js/dictation_editor_modal.js:4130) пересоздаёт `DictationContent` через `getOrCreateContent()` — но кэш уже содержит мутированный (грязный) экземпляр

**Сценарий утечки**:
1. Открыли диктант → `DictationSessionsStore.getOrCreateContent()` создал `DictationContent`
2. Наудаляли строки, загрузили другое аудио — всё попало в `state.content` = тот же экземпляр из Map
3. Закрыли БЕЗ сохранения → `_closeEditorModal()`: `state.content = null`, но Map не очищен
4. Открыли снова → `getOrCreateContent()` **возвращает тот же мутированный экземпляр из Map**!

**Корень**: `DictationSessionsStore._contents` — долгоживущий кэш, который не знает о save/discard.

### 2. Хаотичный нейминг аудиофайлов

| Тип | Текущее имя | Проблема |
|-----|------------|----------|
| Shared audio | `shared_audio_16.mp3` | Нет timestamp'а — при перезагрузке файла имя не меняется |
| TTS (авто) | `tts_{key}_{Date.now()}.mp3` | Timestamp есть ✓, но формат неконсистентный |
| Split segments (сервер) | `{key}_{language}_user.mp3` | Нет ID диктанта, нет timestamp'а |
| Mic запись | Разное | Зависит от контекста |

**Проблемы без timestamp'ов**:
- Нельзя понять, изменился ли файл → приходится перезаписывать всё
- Нельзя отследить какие файлы устарели → мусор в B2
- При перегенерации имя не меняется → CacheStorage может отдать старый blob

### 3. Полная перезапись в B2 при каждом сохранении

**Текущее поведение** ([`_uploadDraftAudioToB2()`](static/js/dictation_editor_modal.js:1099)):
- Собирает ВСЕ URL из всех `langBlocks[].sentences[].audio/audio_file/audio_mic`
- Грузит ВСЁ на B2 (даже если файл не менялся)
- Нет сравнения «что было в БД» vs «что сейчас»

## Решение

### A. Очистка кэша при выходе без сохранения

Добавить в [`DictationSessionsStore`](static/js/dictation_runtime/dictation_store.js):
```javascript
discardContent(dictationId) {
  this._contents.delete(dictationId);
  // Удаляем связанные сессии
  for (const [key, session] of this._sessions) {
    if (session.dictationId === dictationId) {
      this._sessions.delete(key);
    }
  }
}
```

В [`_closeEditorModal()`](static/js/dictation_editor_modal.js:4566) вызывать:
```javascript
// При выходе БЕЗ сохранения — удаляем мутированный контент из кэша
if (!wasSaved && window.DictationRuntime && window.DictationRuntime.store) {
  var store = window.DictationRuntime.store;
  if (typeof store.discardContent === 'function') {
    store.discardContent(closingDictationId);
  }
}
```

Флаг `wasSaved` выставляется в `_maybeCloseWithPrompt()` и в save-потоке.

### B. Единая схема timestamp-имён

**Формат**: `{prefix}_{dictId}_{key}_{timestamp}.{ext}`

Ключ (`key`) — реальный идентификатор строки из `sentence.key`: `001`, `023`, `s_5` и т.д.
Используется как есть, без преобразований.

| Тип | Шаблон | Пример | Где генерируется |
|-----|--------|--------|-----------------|
| Shared audio | `shared_{dictId}_{ts}.{ext}` | `shared_16_1723456789.mp3` | [`_uploadSharedAudioFile()`](static/js/dictation_editor_modal.js:2957) |
| TTS | `tts_{dictId}_{key}_{ts}.mp3` | `tts_16_001_1723456789.mp3` | [`_generateAudioForSentence()`](static/js/dictation_editor_modal.js:1571) |
| Split segment | `seg_{dictId}_{key}_{ts}.mp3` | `seg_16_001_1723456789.mp3` | [`split_audio_file()`](routes/dictation_editor.py:1531) |
| Mic | `mic_{dictId}_{key}_{ts}.{ext}` | `mic_16_023_1723456789.webm` | [`_applySelfMicFile()`](static/js/dictation_editor_modal.js:5038) |

**Генерация timestamp'а** — единая хелпер-функция:
```javascript
function _makeAudioFilename(prefix, dictId, key, ext) {
  var ts = Date.now();
  var parts = [prefix];
  if (dictId) parts.push(dictId);
  if (key != null && key !== '') parts.push(key);
  parts.push(ts);
  return parts.join('_') + '.' + (ext || 'mp3');
}
```

**Серверная сторона** — [`split_audio_file()`](routes/dictation_editor.py:1531):
Вместо `f"{key}_{language}_user.mp3"` → клиент передаёт `segment_filename` в каждом sentence (сгенерированное с timestamp'ом). Сервер больше не придумывает имя сам.

Клиент генерирует имена ДО отправки на сервер:
```json
{
  "filename": "shared_16_1723456789.mp3",
  "dictation_id": "dict_16",
  "sentences": [
    {"key": "001", "start_time": 0, "end_time": 2.5, "segment_filename": "seg_16_001_1723456800.mp3"},
    {"key": "004", "start_time": 2.5, "end_time": 5.1, "segment_filename": "seg_16_004_1723456800.mp3"}
  ]
}
```

### C. Diff-based загрузка в B2

**Принцип**: вместо `flags.audio` (глобальный флаг) — отслеживаем какие конкретно файлы изменились.

**Где взять списки — без запросов к B2:**

| Список | Источник | Где |
|--------|----------|-----|
| **Новые имена** (keep-list) | `state.content.langBlocks[].sentences[].audio/audio_file/audio_mic` | В памяти редактора |
| **Старые имена** (что было до редактирования) | БД: колонки `audio`, `audio_file`, `audio_mic` в таблице sentences | Сервер читает при сохранении |
| **Dirty имена** (что изменилось) | `state.dirtyFlags.audio.dirty` — Set имён, помеченных как грязные | Клиент отслеживает |

**Новая структура dirty-флагов**:
```javascript
state.dirtyFlags = {
  db: false,
  cover: false,
  audio: {
    dirty: new Set(),  // имена файлов, которые изменились (только basename)
  }
};
```

**Алгоритм сохранения аудио — два источника, никакого B2 для чтения:**

1. **Клиент**: собирает `newKeepList` — все `audio`/`audio_file`/`audio_mic` из `state.content`
2. **Клиент**: из `newKeepList` фильтрует только те, что есть в `dirtyFlags.audio.dirty` → `dirtyList`
3. **Клиент → B2**: загружает только `dirtyList` (изменённые файлы)
4. **Клиент → Сервер**: отправляет `newKeepList` в `save_dictation_final`
5. **Сервер**: читает старые имена из БД, сравнивает с `newKeepList`
6. **Сервер → B2**: удаляет orphan'ы (файлы в БД, которых нет в `newKeepList`)

**Изменения в `_setDirtyFlags()`**:
```javascript
function _setDirtyFlags(next) {
  if (next.db !== undefined) state.dirtyFlags.db = next.db;
  if (next.cover !== undefined) state.dirtyFlags.cover = next.cover;
  if (next.audio !== undefined) {
    // next.audio — имя конкретного изменившегося файла (basename)
    state.dirtyFlags.audio.dirty.add(next.audio);
  }
  _updateUnsavedStar();
}
```

**Что меняется в `_uploadDraftAudioToB2()`**:
- Принимает параметр `dirtyOnly` — если `true`, собирает URL только для файлов из `dirtyFlags.audio.dirty`
- При `dirtyOnly=false` (первое сохранение нового диктанта) — грузит всё (dirty set пустой)

**Что меняется в `save_dictation_final` (сервер)**:
- Принимает новое поле `audio_keep_list` — полный список имён, которые должны остаться в B2
- После сохранения в БД — сравнивает старые имена из БД с `audio_keep_list` → удаляет orphan'ы через B2 API

### D. Порядок реализации

1. **`DictationSessionsStore.discardContent()`** — метод удаления контента при discard
2. **`_closeEditorModal()`** — вызов `discardContent()` при выходе без сохранения
3. **`_makeAudioFilename()`** — единый генератор имён
4. **`_uploadSharedAudioFile()`** — перевести на `_makeAudioFilename()`
5. **`_generateAudioForSentence()`** — перевести на `_makeAudioFilename()` 
6. **`split_audio_file()` (сервер)** — принимать `segment_filename` от клиента
7. **`_handleSplitAudio()` / `_handleSmartSplit()`** — генерировать `segment_filename` с timestamp'ом перед отправкой на сервер
8. **`_setDirtyFlags()`** — поддержка per-file dirty tracking
9. **`_uploadDraftAudioToB2()`** — загружать только dirty + cleanup orphan'ов
10. **`_handleSave()`** — передавать keep-список в cleanup
