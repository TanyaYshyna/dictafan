# Рефакторинг dictation_editor_modal.js

## Проблема

`dictation_editor_modal.js` использует функции из `script_dictation_editor.js`:
- `getDraftAudioUrl()` — чтение blob: URL из in-memory Map
- `putDraftAudioToCache()` — сохранение blob в in-memory Map
- `setDraftAudioUrl()` — запись blob: URL в in-memory Map
- `buildDictationAudioUrl()` — построение канонического URL
- `window.resolveEditorPlaybackAudioUrl()` — глобальная функция-обёртка

Это **критическая ошибка**: `script_dictation_editor.js` — это старый легаси-файл страницы редактора. 
Модальное окно (`dictation_editor_modal.js`) не должно от него зависеть.

Draft cache (`window.__DICTATION_EDITOR_DRAFT_AUDIO_URLS`) — это in-memory Map, который живёт 
только пока открыта страница редактора. После reopen (закрыли и снова открыли редактор) 
draft cache пуст, и аудио не находится.

## Решение

Использовать `AudioManager` (единый экземпляр, как это делает `dictation_modal.js`):

| Было (script_dictation_editor.js) | Стало (AudioManager) |
|---|---|
| `getDraftAudioUrl(lang, name)` | `AudioManager.resolvePlayableUrl(canonicalUrl, playToken)` |
| `putDraftAudioToCache(id, lang, name, blob, mime)` | `AudioManager.saveDictationAudioBlob(id, lang, name, blob, mime)` |
| `buildDictationAudioUrl(id, lang, name)` | `AudioManager.buildDictationAudioUrl(id, lang, name)` |
| `setDraftAudioUrl(lang, name, blobUrl)` | не нужно (AudioManager сам создаёт blob: URL) |
| `window.resolveEditorPlaybackAudioUrl(...)` | `AudioManager.buildDictationAudioUrl()` + `AudioManager.resolvePlayableUrl()` |

## Поток данных (новый)

### До Save (черновик)
1. Пользователь выбирает файл → `_uploadSharedAudioFile()` → `URL.createObjectURL(file)` → waveform
2. Split/Smart-split → сервер возвращает `audio_b64` → `AudioManager.saveDictationAudioBlob()` → CacheStorage
3. Cut audio → сервер возвращает `audio_b64` → `AudioManager.saveDictationAudioBlob()` → CacheStorage
4. Воспроизведение → `AudioManager.buildDictationAudioUrl()` + `AudioManager.resolvePlayableUrl()` → blob: URL из CacheStorage

### После Save (reopen)
1. `open()` получает `config.sentences` с сервера (или из IndexedDB)
2. В sentences есть `audio_file` — имя файла
3. `_restoreSharedAudioFromSentences()` → `AudioManager.resolvePlayableUrl()` → находит в CacheStorage (если prefetch'нуто) или fetch + кэширует
4. Воспроизведение → `AudioManager.resolvePlayableUrl()` → blob: URL из CacheStorage

## Изменения

### 1. Удалить `_resolveEditorPlaybackAudioUrl()` (строка 616)
Функция больше не нужна. Везде использовать `AudioManager.buildDictationAudioUrl()`.

### 2. Переписать `_handleAudioPlayback()` (строка 652)
Вместо:
```javascript
var audioUrl = _resolveEditorPlaybackAudioUrl(state.config.dictationId, lang, audioFilename);
```
Использовать:
```javascript
var canonicalUrl = am.buildDictationAudioUrl(state.config.dictationId, lang, audioFilename);
// AudioManager.play() сам вызовет resolvePlayableUrl()
```

### 3. Переписать `_handleCutAudioForSentence()` (строка 734)
Вместо `putDraftAudioToCache()` + `setDraftAudioUrl()` использовать:
```javascript
await am.saveDictationAudioBlob(dictationId, lang, newFilename, blob, mime);
```

### 4. Переписать `_uploadDraftAudioToB2()` (строка 856)
Вместо `getDraftAudioUrl()` использовать `AudioManager` для получения blob из CacheStorage.

### 5. Переписать `_splitAudioOnServer()` (строка 1711)
Вместо `putDraftAudioToCache()` использовать:
```javascript
await am.saveDictationAudioBlob(dictationId, lang, f.filename, blob, mime);
```

### 6. Переписать `_smartSplitOnServer()` (строка 1796)
Аналогично `_splitAudioOnServer()`.

### 7. Переписать `_restoreSharedAudioFromSentences()` (строка 2137)
Вместо `getDraftAudioUrl()` + `_resolveEditorPlaybackAudioUrl()` + fetch использовать:
```javascript
var canonicalUrl = am.buildDictationAudioUrl(dictationId, lang, filename);
var playableUrl = await am.resolvePlayableUrl(canonicalUrl, playToken);
if (playableUrl) _initWaveform(playableUrl);
```

### 8. `open()` (строка 2046)
- Убрать создание `DictationContent` вручную
- Если `window.DictationRuntime` доступен — использовать `DictationRuntime.getOrCreateContent()`
- Если нет — создать `DictationContent` как сейчас (fallback)

### 9. `close()` (строка 2198)
- Не удалять `state.content` из DictationSessionsStore
- Очистить только состояние модального окна

## Зависимости

- `AudioManager` — уже используется, `_ensureAudioManager()` создаёт/возвращает экземпляр
- `AudioManager.buildDictationAudioUrl(dictationId, lang, filename)` — строит `/api/dictations/{id}/{lang}/{name}`
- `AudioManager.resolvePlayableUrl(canonicalUrl, playToken)` — ищет в CacheStorage, если нет — fetch + кэширует
- `AudioManager.saveDictationAudioBlob(dictationId, lang, filename, blob, mime)` — сохраняет blob в CacheStorage
- `AudioManager.play(button, url, opts)` — воспроизводит аудио (уже используется)
