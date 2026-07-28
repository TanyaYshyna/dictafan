---
description: Dictation Editor Architecture (dataflow, caching, audio)
---

# Послание для будущих поддерживающих (в т.ч. для ИИ)

Этот проект нужно развивать так, чтобы код оставался обслуживаемым и предсказуемым. Любые решения, которые делают систему «быстрее прямо сейчас», но «дороже в сопровождении потом», считаются ошибкой.

## Объекты на удаление (план)

- ~~`templates/private_library.html`~~ **УДАЛЁН**
- ~~`static/js/private_library.js`~~ **УДАЛЁН** (функциональность перенесена в `dictation_editor_modal.js`, `desktop.js`, `book_modal.js`)
- ~~`static/css/style_private_library.css`~~ **УДАЛЁН**
- ~~`static/css/style_dictation.css`~~ **УДАЛЁН**
- ~~`static/js/script_dictation_editor.js`~~ **УДАЛЁН** (функциональность перенесена в `dictation_editor_modal.js`)
- ~~`routes/user_routes.py` → `GET /user/profile` (страница профиля; заменить на модалку на `/desktop`)~~ **ГОТОВО**: роут перенаправляет на `index.index`
- ~~`templates/user_profile_jwt.html`~~ **УДАЛЁН**
- ~~`static/css/style_user_profile.css`~~ **УДАЛЁН** (стили перенесены в `user_profile_modal.css`)
- ~~`static/js/script_user_profile.js`~~ **УДАЛЁН** (код перенесён в `user_profile_modal.js`)
- ~~`assignments`~~ **УДАЛЁН**
- ~~`assignments_by_date`~~ **УДАЛЁН**
- ~~`history_activity`~~ **УДАЛЁН**: таблица удалена миграцией `migrations/drop_history_activity_and_history_successes.sql`. Все данные перенесены в `history_by_day`.
- ~~`history_successes`~~ **УДАЛЁН**: таблица удалена миграцией `migrations/drop_history_activity_and_history_successes.sql`. Все данные перенесены в `history_by_day`.

## Структура таблиц истории (актуальная на 2026-06-23)

### `history_by_day` — дневная история (единственная таблица истории)

| Колонка | Тип | NOT NULL | DEFAULT | Описание |
|---------|-----|----------|---------|----------|
| id | integer | YES | nextval(...) | Первичный ключ |
| user_id | integer | YES | — | ID пользователя |
| teacher_id | integer | YES | — | ID учителя |
| dictation_language_code | text | NO | — | Язык диктанта |
| date_plan | date | YES | — | Плановая дата |
| date_fact | date | YES | — | Фактическая дата |
| perfect_count | integer | YES | 0 | Количество perfect |
| corrected_count | integer | YES | 0 | Количество corrected |
| audio_count | integer | YES | 0 | Количество audio |
| lead_time | bigint | YES | 0 | Время в мс |
| successes | integer | YES | 0 | Число завершений диктанта |
| created_at | timestamp | YES | CURRENT_TIMESTAMP | Дата создания |
| updated_at | timestamp | YES | CURRENT_TIMESTAMP | Дата обновления |
| dictation_id | integer | YES | — | ID диктанта |
| positions | integer[] | YES | '{}' | Выбранные предложения |
| monenumber_of_characters | integer | YES | 0 | Символов (денег) |
| mistake_count | integer | YES | 0 | Число ошибок |
| date_start | date | YES | — | Дата начала |
| activity_count | integer | YES | 0 | Число активностей |
| money_dt_count | integer | YES | 0 | Заработано монет |

Уникальный ключ: `(user_id, teacher_id, dictation_id, positions, date_plan, date_fact)`
## Принципы разделения ответственности

- **HTML = структура**
  - HTML отвечает за семантику и каркас страницы/компонента.
  - В HTML должно быть **минимум форматирования** (inline `style` — только в исключительных случаях).
  - В HTML должно быть **минимум данных**: не хранить большие JSON-структуры в `data-*`, не дублировать state в атрибутах.

- **CSS = оформление**
  - Всё визуальное (отступы, размеры, цвета, состояния, адаптив) должно жить в CSS.
  - Инлайновые стили допускаются только как редкий, осознанный компромисс.

- **JS = поведение и состояние**
  - JS отвечает за логику, события, запросы, состояние и обновление UI.
  - JS state хранится в JS (переменные/модули/`WeakMap` и т.п.), а не в HTML-атрибутах.
  - Не раздувать файлы: если модуль становится слишком большим или начинает отвечать за разные задачи — **нужно заранее предупредить** и предложить вынести в отдельную группу файлов (например `*_modal.html/js/css`).

# Цель документа

Зафиксировать **строгую архитектуру** модальных окон "Редактора диктантов" и "Диктант" (открываются на странице `/desktop`), чтобы любые дальнейшие изменения делались без «вольного творчества».

Документ отвечает на вопросы:

- **Как сохраняются/читаются данные** (текст/переводы/языки/аудио).
- Какие **модули** за что отвечают (Frontend JS / Service Worker / Backend PY / B2).
- Как устроен **кэш** (что там хранится, в каком виде).
- Как устроено **аудио**: до Save (blob), после Save (cache/B2), кто инициирует upload.
- Как должна работать **версионизация (BUILD/VERSION)** и обновление страниц при изменении кода.

# Инварианты (обязательные правила)

## 1) Никаких `/api/temp/...`

- В проекте не должно существовать **ни одного** пути вида `/api/temp/...`.
- Временные данные разрешены только как:
  - **`blob:` URL в памяти вкладки** (до сохранения)
  - или локальный браузерный кэш (`CacheStorage`, `IndexedDB`) с ключами **канонических** URL.

## 2) Аудио в БД хранится только как basename

- В полях БД `audio`, `audio_avto`, `audio_mic`, `audio_user` хранится **только имя файла** (например `000_en_avto.mp3`).
- Запрещено хранить:
  - абсолютные URL (`https://...`)
  - относительные пути (`/api/dictations/...`)
  - префиксы папок (`dictations/...`) и т.п.

## 3) Канонический URL аудио

После сохранения **единственный** допустимый URL для чтения аудио:

`/api/dictations/<dictation_id>/<lang>/<filename>`

где:

- `<dictation_id>` например `dict_8`
- `<lang>` например `en`, `ru`, `uk`, `tr`
- `<filename>` только basename

# Компоненты и ответственность

## Backend (Python / Flask)

### `routes/dictation_editor.py`

Отвечает за:

- сохранение диктанта «финально» через `POST /save_dictation_final`
- нормализацию полей аудио перед записью в БД (**basename-only**)
- сохранение/обновление текстовых данных и переводов
- API для перевода (`POST /translate`), генерации TTS (`POST /generate_audio`), нарезки аудио (`POST /cut-audio`, `POST /split-audio`)
- API для работы с B2: получение upload URL (`POST /api/b2/get_upload_url`), очистка лишних файлов (`POST /api/b2/cleanup_dictation_audio`)
- резервирование ID для нового диктанта (`GET /api/dictation/reserve_id`)

Важно:

- Backend **не должен** генерировать `/api/temp` URL.
- Backend **не должен** заниматься загрузкой/скачиванием уже созданного аудио из B2 (это клиентская задача).

### `routes/dictation.py`

Отвечает за:

- API для получения данных диктанта: `GET /api/dictation/<id>/<lang_orig>/<lang_tr>/sentences`
- отдачу аудио из B2 с fallback на локальные файлы: `GET /api/dictations/<dictation_id>/<lang>/<filename>`
- транскрибацию аудио: `POST /api/speech-recognition/transcribe`
- рендеринг HTML-страницы диктанта (для прямых ссылок, не для `/desktop`)

Важно:

- Сервер **не должен** проксировать скачивание аудио из B2 и отдавать бинарь клиенту.
- Клиент читает аудио **напрямую из B2** по каноническому пути хранения: `dictations/dict_<id>/<lang>/<filename>`.

### `helpers/db_dictations.py`

Отвечает за:

- CRUD по диктантам/предложениям
- обновление translation flags (`tr_*`) по факту наличия данных

## Frontend (JavaScript)

### ~~`static/js/script_dictation_editor.js`~~ **УДАЛЁН** → [`static/js/dictation_editor_modal.js`](static/js/dictation_editor_modal.js)

Старый page-код редактора диктанта (`script_dictation_editor.js`) **полностью удалён**. Вся функциональность перенесена в [`static/js/dictation_editor_modal.js`](static/js/dictation_editor_modal.js) — модальное окно редактора, которое открывается на странице `/desktop`.

Роль `dictation_editor_modal.js`:

- UI редактора в модальном окне `#dictationEditorModal`: таблица предложений, переводы, переключение языков, Save
- хранение **рабочего состояния** в замыкании модуля (`state`)
- сбор payload на сохранение и вызов backend save
- проигрывание аудио через `AudioManager`, разрезка аудио, запись аудио с микрофона
- интеграция с `CoverManager` для загрузки обложек
- интеграция с `NewDictationFillModal` для начального заполнения нового диктанта

Важно:

- Файл **не использует** глобальные переменные страницы (`workingData`, `currentDictation`). Всё состояние хранится в локальном `state` внутри модуля.
- Вызывает сервисы/менеджеры:
  - `AudioManager` (аудио)
  - `CoverManager` (обложки)
  - `DictationRuntime` / `DictationContent` (контент диктанта)
 




### `static/js/dictation_modal.js`

Роль:

- Открывает диктант как модальное окно `#dictationModal`.
- Загружает зависимости рантайма диктанта (`dictation_runtime/*`, `AudioManager`, `ProgressPanel`, распознавание речи).
- Грузит контент диктанта (предложения) в IndexedDB (через существующий слой кэша) и затем в runtime store.
- Управляет стартовой модалкой выбора предложений (`#start-modal`), модалкой паузы (`#pauseModal`), модалкой покупок (`#coinExchangeModal`), модалкой завершения (`#completionModal`).
- Управляет модалкой настроек аудио (`#audioSettingsModal`), включая выбор режима распознавания речи (см. раздел «Распознавание речи: выбор режима»).

Важно:

- Текущий основной UI диктанта на `/desktop` — это `static/js/dictation_modal.js` + runtime слой `static/js/dictation_runtime/*`.
- Режим распознавания речи (`speech_recognition_mode`) хранится в **localStorage** (ключ `dictafan_speech_rec_mode`), а не на сервере. Управление — через `initAudioSettingsModal()`.

Ключевая идея данных:

- **Контент диктанта** отделён от **прогресса/задания**.

### `static/js/dictation_runtime/dictation_store.js`

Роль:

- `DictationContent` — «контент диктанта» (тексты, переводы, ссылки на аудио, `position`).
- `DictationSession` — «сессия выполнения/задание»:
  - хранит прогресс/состояние по каждому предложению
  - хранит выбор предложений (`checked/unchecked/completed`)
  - может быть ограничена поднабором:
    - `subsetPositions` (позиции предложений)
    - `activeKeys`/`selectedKeys` (конкретные ключи предложений)

Это соответствует модели:

- «Класс диктанта» = `DictationContent` (данные)
- «Класс задания» = `DictationSession` (поднабор + прогресс)

### Система оценивания и активностей (звезда/полузвезда/текст/аудио)

#### Терминология

- **Проверка** — одно нажатие кнопки «Проверить» (сравнение введённого текста с оригиналом).
- **Ошибка (в контексте проверки)** — проверка, в которой были найдены расхождения между введённым текстом и оригиналом. Неважно, сколько именно слов/символов не совпало: 1 или 10 — это считается **одной ошибкой** (одна неудачная проверка).
- **Подход (цикл набора)** — последовательность проверок от момента, когда пользователь начал вводить текст, до момента, когда он нажал «Повторить» (или ушёл из предложения). При нажатии «Повторить» начинается новый подход.
- **Итоговый результат предложения** — максимум из результатов всех подходов. Звезда выше полузвезды, полузвезда выше активности.

#### Алгоритм текстовой проверки

Проверка текста состоит из трёх изолированных процедур: **текстовая проверка**, **аудиопроверка**, **общий анализ результата**. Ниже описана только текстовая проверка.

##### 1. Определение результата проверки (`analyze()` в `proverka_na_oshibki.js`)

Функция `analyze()` получает:
- `textAttemptCount` — количество предыдущих проверок с ошибками в **текущем подходе**.
- `prevPerfect`, `prevCorrected` — предыдущие результаты предложения (из `st`).

Если текст введён правильно (`allCorrect = true`):

| `textAttemptCount` | Результат | `starOutcome` | `nextPerfect` | `nextCorrected` |
|---|---|---|---|---|
| 0 (с первого раза) | **Звезда** | `'perfect'` | 1 | 0 |
| 1 (одна проверка была с ошибками) | **Полузвезда** | `'half'` | 0 | 1 |
| 2 и более | **Активность** | `null` | 0 | 0 |

Если текст введён с ошибками (`allCorrect = false`):
- Результат не присваивается.
- `textAttemptCount` увеличивается на 1.
- Пользователь видит подсветку ошибок и может исправить текст.

##### 2. Счётчик проверок с ошибками (`_textAttemptCount`)

- Хранится в `st._textAttemptCount` (сохраняется между вызовами, т.к. `view` пересоздаётся).
- Увеличивается на 1 при каждой проверке, где `allCorrect = false`.
- **Сбрасывается в 0** при:
  - Нажатии кнопки «Повторить» (новый подход).
  - Навигации к другому предложению.
  - Полном сбросе прогресса диктанта.

##### 3. Сохранение результата (максимум из подходов)

Итоговый результат предложения — это **максимум** из ранее сохранённого и только что полученного:

| Было | Стало | Итог |
|---|---|---|
| — | звезда | звезда |
| — | полузвезда | полузвезда |
| — | активность | активность |
| полузвезда | звезда | **звезда** (выше) |
| полузвезда | активность | **полузвезда** (было выше) |
| полузвезда | полузвезда | полузвезда |
| звезда | любой | **звезда** (неизменяема, повтор невозможен) |

Результаты хранятся в `st`:
- `st.number_of_perfect` — 1 если есть звезда, иначе 0.
- `st.number_of_corrected` — 1 если есть полузвезда, иначе 0.
- Если оба 0 — результат не достигнут (активность или ничего).

##### 4. Награды (монеты)

При первом получении результата в рамках цикла наград (`rewardCycleId`):

| Результат | Награда | key прайса |
|---|---|---|
| Звезда | 3 монеты | `star_reward` |
| Полузвезда | 2 монеты | `half_star_reward` |
| Активность | 1 монета | `text_activity_reward` |

Активность также увеличивает `st.text_activity_count` (3 активности можно обменять на полузвезду).

##### 5. Примеры

**Пример A: Идеально с первого раза**
1. Набрала текст, нажала «Проверить».
2. `textAttemptCount = 0`, `allCorrect = true` → звезда.
3. Кнопка «Проверить» → режим звезды (disabled).

**Пример B: Одна ошибка, затем исправление**
1. Набрала текст, нажала «Проверить»: ошибки → `textAttemptCount = 1`.
2. Исправила, нажала «Проверить»: всё правильно → `textAttemptCount = 1` → полузвезда.
3. Кнопка «Проверить» → режим полузвезды (можно нажать «Повторить»).

**Пример C: Три ошибки, затем исправление**
1. Проверка: ошибки → `textAttemptCount = 1`.
2. Проверка: ошибки → `textAttemptCount = 2`.
3. Проверка: ошибки → `textAttemptCount = 3`.
4. Проверка: всё правильно → `textAttemptCount = 3` → активность.
5. Кнопка «Проверить» → режим активности (оранжевая, можно нажать «Повторить»).

**Пример D: Повтор после полузвезды, с первого раза правильно**
1. Была полузвезда (`st.number_of_corrected = 1`).
2. Нажала «Повторить» → `_textAttemptCount = 0` (новый подход).
3. Набрала текст, нажала «Проверить»: всё правильно → `textAttemptCount = 0` → звезда.
4. Итог: звезда (максимум: полузвезда < звезда).

**Пример E: Повтор после полузвезды, несколько ошибок**
1. Была полузвезда (`st.number_of_corrected = 1`).
2. Нажала «Повторить» → `_textAttemptCount = 0`.
3. Проверка: ошибки → `textAttemptCount = 1`.
4. Проверка: ошибки → `textAttemptCount = 2`.
5. Проверка: всё правильно → `textAttemptCount = 2` → активность.
6. Итог: полузвезда (максимум: полузвезда > активность).

#### Аудиопроверка

(Описание аудио-алгоритма — пока без изменений, см. ниже.)

#### Важно

- Параметры живут в состоянии `DictationSession` по ключу предложения:
  - `number_of_perfect`, `number_of_corrected`, `number_of_audio`
  - `text_activity_count`, `audio_activity50_count`, `money_count`
  - `_textAttemptCount` — служебное поле, сбрасывается при повторе/навигации.

### Прайс/стоимости и покупки

Единая точка правды прайса:

- `window.DictafanPricing.values` (инициализируется на десктоп-странице в `static/js/dictation_modal.js`).
- `dictation_modal.js` читает цены через `getPricingValue(key, fallback)`.

Ключи прайса (англ):

- `star_reward`
- `half_star_reward`
- `text_activity_reward`
- `audio_activity_reward`
- `half_star_purchase_cost`
- `audio_purchase_cost`

Меню прайса (как показываем в UI по умолчанию на `/desktop`):

- **Earn**
  - `Star reward` (`star_reward`) = `3`
  - `Half-star reward` (`half_star_reward`) = `2`
  - `Text activity reward` (`text_activity_reward`) = `1`
  - `Audio activity reward (>=80%)` (`audio_activity_reward`) = `1`
- **Spend**
  - `Buy half-star (cost)` (`half_star_purchase_cost`) = `3`
  - `Buy audio (mic) (cost)` (`audio_purchase_cost`) = `3`

Покупки:

- Покупка «полузвезды» и «аудио (микрофон)» выполняется через `#coinExchangeModal` и списание через API `POST /api/statistics/money/spend`.
- При покупке мы **платим монеты** и выставляем состояние предложения (полузвезда/аудио выполнено), но **не получаем деньги**.

### Учёт заданий (упражнений)

На десктопе задание = «упражнение» с поднабором предложений:

- В UI карточки диктанта есть кнопка запуска упражнения (меню заданий/диапазонов).
- При запуске упражнения в `DictationModal.open(href, { subsetPositions })` передаётся `subsetPositions`.
- `DictationModal` создаёт `DictationSession` с этим `subsetPositions` и активирует только нужные предложения.
- В заголовке модалки диктанта показывается подпись диапазона: `Название (1-10)`.

Важно:

- Страница **не должна** работать с `CacheStorage` напрямую (`caches.open/match/put/delete`).
- Страница **не должна** полагаться на Service Worker для prefetch/check аудио.
- Канонические URL аудио строятся и нормализуются через `AudioManager`.
- Для проигрывания/кеша на странице диктанта используются только:
  - `audio` (original)
  - `audio_tr` (translation)
- `AudioManager` считается обязательной зависимостью: если он не загружен, это ошибка (page-код кидает исключение).

### `static/js/audio_manager.js`

Роль (текущее состояние):

- единая точка правды для работы с аудио:
  - **Хранение**: `saveDictationAudioBlob(dictationId, lang, filename, blob, mime)` — сохраняет blob в CacheStorage под каноническим ключом
  - **Чтение**: `resolvePlayableUrl(canonicalUrl, playToken)` — возвращает playable URL: сначала проверяет CacheStorage, если нет — канонический URL
  - **Проигрывание**: `play(button, audioUrl, onEndedCallback)` — управляет воспроизведением с визуальной синхронизацией (playhead)
  - **Построение канонических URL**: `buildDictationAudioUrl(dictationId, language, filename)` — нормализует ID (приводит `"123"` → `"dict_123"`)
  - **Загрузка в B2**: `uploadDictationAudioFromCacheToB2({ dictationId, token, urls, ... })`:
    - Читает blob из CacheStorage
    - Проверяет SHA256 в `b2_upload_ledger` (IndexedDB) для дедупликации
    - Загружает недостающие файлы в B2
    - Возвращает `{ ok, total, uploaded, skipped, failed, cacheMiss, errors }`
  - **Очистка B2**: `cleanupStaleB2DictationAudio({ dictationId, token, keepRemotePaths })` — удаляет лишние файлы
  - **Удаление**: `deleteDictationAudioFromCache(dictationId)` — удаляет все аудио диктанта из CacheStorage

Ключевые внутренние хранилища:
- **CacheStorage** (через `openMediaCache()`): кеш аудио-файлов по каноническим URL
- **IndexedDB** (`b2_upload_ledger`): ledger SHA256-хешей для дедупликации при загрузке в B2
- **В памяти**: blob URL mapping (`_objectUrls`), текущее состояние воспроизведения

Инварианты:
- Канонический URL всегда содержит `dict_<id>` (не числовой ID)
- До Save аудио существует в CacheStorage (после `saveDictationAudioBlob()`) и как `blob:` URL
- После Save аудио загружается в B2 и остаётся в CacheStorage

### ~~`static/js/private_library.js`~~ **УДАЛЁН**

Старый page-код приватной библиотеки и рабочего стола **полностью удалён**. Функциональность распределена:

- [`static/js/desktop.js`](static/js/desktop.js) — рабочий стол (desk): карточки диктантов, drag-and-drop, меню, создание нового диктанта
- [`static/js/book_modal.js`](static/js/book_modal.js) — модалка книги: просмотр разделов, добавление/удаление диктантов
- [`static/js/dictation_editor_modal.js`](static/js/dictation_editor_modal.js) — редактор диктанта

### Модальные окна на новом рабочем столе (`/desktop`)

Слои (z-index) — по возрастанию:

Принцип:

- Слои (иерархия `z-index`) должны быть собраны рядом и централизованы в `static/css/desktop.css`, чтобы в одном месте было видно «кто над кем» на странице `/desktop`.
- Визуальные стили конкретных модалок (размеры, отступы, цвета, overflow/scroll и т.п.) должны оставаться в их профильных файлах (например `static/css/book_modal.css`).

- `10000` — `#login-modal` (логин/регистрация)
- `10080` — `#user-profile-modal` (профиль пользователя, группа `user_profile_modal.*`)
- `10100` — `#user-profile-modal #groupModal`, `#user-profile-modal #groupRestoreModal`, `#user-profile-modal #groupEmailInviteModal` (внутренние модалки групп внутри профиля)
- `10150` — `#activity-tracker-modal` (Трекер активности / отчёты)
- `100200` — `#create-assignment-modal` (Задания → упражнения, группа `tasks_modal.*`)
- `100200` — `#plan-tasks-modal` (План, группа `plan_tasks_modal.*`)
- `100200` — `.desktop-right-menu` (палитра инструментов)
- `100220` — `#book-view-modal` (просмотр книги справа, группа `book_modal.*`)
- `100240` — `#book-edit-modal` (редактирование книги, группа `book_modal.*`)
- `100246` — `#section-edit-modal` (создание/редактирование раздела, группа `book_modal.*`)
- `100248` — `#move-dictation-modal` (перемещение диктанта, группа `book_modal.*`)
- `100249` — `#dictationModal` (диктант как модальное окно, группа `dictation_modal.*`)
- `100255` — `#dictationModal .modal` (внутренние модалки диктанта: `#start-modal`, `#pauseModal`, `#audioSettingsModal`, ...)
- `100250` — `#desktopConfirmModal` (общее «закрыть/сохранить» для desktop-модалок на `/desktop`)
- `100260` — `#exitModal` (универсальная модалка выхода/закрытия; должна быть выше всех)
- `100280` — `#crop-modal` (кроп обложки, используется `CoverManager`, группа `book_modal.*`)
- `100300` — `#dictationEditorModal` (редактор диктанта в модальном окне, группа `dictation_editor_modal.*`)
- `100310` — `#newDictationFillModal` (начальное заполнение нового диктанта, открывается поверх `#dictationEditorModal`)
- `200500` — `#auto-toast` (всплывающие уведомления)

### Высота шапки (topbar) и нижней строки (sw-status-bar)

Эти значения используются в CSS для расчёта отступов layout'а рабочего стола.

| Элемент | Высота | Где задаётся |
|---------|--------|-------------|
| **Шапка (topbar)** | `80px` | `static/css/style.css` — комментарий `/* 80px = высота header */`, используется в `.page-index .panel { min-height: calc(100vh - 80px) }` |
| **Нижняя строка (sw-status-bar)** | динамическая, `--sw-status-bar-height` (типично ~28px) | `static/js/sw_status_bar.js` — `position: fixed; bottom: 0; padding: 6px 10px; font-size: 12px; line-height: 1.2;`. Высота вычисляется через `getBoundingClientRect().height` и записывается в CSS-переменную `--sw-status-bar-height` на `document.documentElement`. |

**Важно**: Нижняя строка создаётся динамически скриптом `sw_status_bar.js`. Её высота не фиксирована, а вычисляется после рендера. Все CSS-расчёты должны использовать `var(--sw-status-bar-height, 28px)` с fallback 28px.

Эти две высоты используются в layout рабочего стола:
- `top: 80px` — для `position: fixed` элементов, которые должны начинаться после шапки (например, `.tool-palette.tool-palette--desk`)
- `height: calc(100vh - 80px - var(--sw-status-bar-height, 28px))` — для элементов, растянутых между шапкой и нижней строкой

## Редактор диктанта в модальном окне (`DictationEditorModal`)

### Файлы

| Файл | Роль |
|------|------|
| [`templates/partials/dictation_editor_modal.html`](templates/partials/dictation_editor_modal.html) | HTML-шаблон: структура модалки редактора + структура `#newDictationFillModal` |
| [`static/css/dictation_editor_modal.css`](static/css/dictation_editor_modal.css) | Стили редактора и fill modal |
| [`static/js/dictation_editor_modal.js`](static/js/dictation_editor_modal.js) | Вся логика: открытие/закрытие, таблица предложений, audio playback, save, fill modal |

### Глобальный API

```js
window.DictationEditorModal = {
  open(config),    // Открыть редактор с переданным конфигом
  close(),        // Закрыть редактор
  init(),         // Инициализация (вызывается автоматически при DOMContentLoaded)
};

window.NewDictationFillModal = {
  open(editorConfig),  // Открыть fill modal поверх редактора
  close(),             // Закрыть fill modal (если voice mode изменился — переключить закладку)
  create(),            // Спарсить текст, заполнить редактор, переключить закладку
};
```

### Конфиг `open(config)`

Параметр `config` — объект со следующими полями:

| Поле | Тип | Описание |
|------|-----|----------|
| `dictationId` | `string` | ID диктанта (например `"dict_123"`) |
| `originalLanguage` | `string` | Код языка оригинала (например `"en"`) |
| `translationLanguage` | `string` | Код языка перевода (например `"ru"`) |
| `title` | `string` | Название диктанта |
| `level` | `string` | Уровень сложности (`"A1"`, `"A2"`, ...) |
| `coverUrl` | `string` | URL обложки |
| `sentences` | `Array` | Массив предложений (см. формат ниже) |
| `audio_user_shared` | `string|null` | Имя файла shared audio |
| `audio_order` | `string` | Режим озвучки: `""` (авто), `"f"` (файл), `"m"` (сам) |
| `is_dialog` | `boolean` | Флаг диалога |
| `show_explanation` | `boolean` | Показывать колонку explanation |
| `isNewDictation` | `boolean` | Если `true` — после открытия редактора поверх показывается `#newDictationFillModal` |

Формат элемента `sentences`:

```js
{
  key: "000",           // строковый ключ предложения (3 цифры)
  position: 1,          // порядковый номер
  original: "Hello",    // текст оригинала
  translation: "Привет", // текст перевода
  audio: "",            // имя файла аудио (оригинал)
  audio_original: "",
  audio_translation: "",
  audio_file: null,     // имя файла для режима "файл"
  audio_mic: null,      // имя файла для режима "сам"
  start: "",            // время начала (для регионов waveform)
  end: "",              // время конца
  checked: false,
  explanation: "",
  speaker: "1",
}
```

### Жизненный цикл

1. **`open(config)`**:
   - Если модалка уже открыта — сначала закрывает (чистит состояние)
   - Сохраняет `config` в `state.config`
   - Сбрасывает shared/self audio состояние, waveform
   - Создаёт `DictationContent` (через `DictationRuntime.getOrCreateContent()` или `new DictationContent()`, или fallback-объект)
   - Показывает модалку (`modal.style.display = 'flex'`)
   - Инициализирует все подсистемы: `_setupUserSection()`, `_initLanguageFlags()`, `_initFormFields()`, `_initLevelSelector()`, `_initVoiceModeRadios()`, `_initCoverUpload()`, `_initHaveAudioTab()`, `_initAutoAudioTab()`, `_initSelfAudioTab()`, `_setupTabs()`, `_renderTable()`, `_renderTranslationsTable()`, `_updateAutoRegenerateAllBtnVisibility()`, `_bindAudioPlaybackHandlers()`, `_setupTableControls()`
   - Инициализирует `AudioManager`
   - Восстанавливает shared/self audio из данных предложений
   - Переключает закладку согласно `audio_order`
   - **Если `config.isNewDictation === true`** — через `setTimeout(100ms)` вызывает `window.NewDictationFillModal.open(config)`

2. **`close()`**:
   - Скрывает модалку
   - Разблокирует скролл body
   - Устанавливает `state.isOpen = false`

3. **`_handleSave()`**:
   - Проверяет dirty flags (`db`, `audio`, `cover`)
   - Собирает `saveData`:
     - `id`, `temp_id` — нормализованный ID диктанта
     - `language_original`, `language_translation` — из config
     - `title`, `level`, `is_dialog`
     - `audio_user_shared` — из `state._sharedAudioFilename`
     - `audio_order` — из выбранного radio
     - `sentences` — объект вида `{ [langCode]: { title, sentences: [...] } }`
     - **`book_id`** — читается из `sessionStorage['dictationTargetBook']` (устанавливается при создании нового диктанта через `setDictationTargetBook()`)
     - **`cover_b64`** — если cover dirty, получает blob через `CoverManager.getCroppedBlob()`, конвертирует в base64 через `_blobToBase64()` и добавляет в saveData
   - Этап 1: сохраняет текст/БД + cover через `POST /save_dictation_final` (cover передаётся как `cover_b64` в JSON)
   - Этап 2: сохраняет аудио через `_uploadDraftAudioToB2()` (загрузка из CacheStorage в B2)
   - После успешного save: сбрасывает dirty flags, обновляет `state.config.dictationId` из ответа сервера, вызывает `window.Desktop.loadDeskItems()` для обновления десктопа

### Внутреннее состояние (`state`)

```js
const state = {
  isOpen: false,
  config: null,           // конфиг, переданный в open()
  content: null,          // экземпляр DictationContent
  currentDictation: {},   // { is_dialog, show_explanation }
  dirtyFlags: { db: false, audio: false, cover: false },
  headerLangPairSelector: null,  // экземпляр LanguageSelector
  _sharedAudioFilename: null,
  _sharedAudioUrl: null,
  _sharedAudioDuration: null,
  _sharedAudioFile: null,
  _selfAudioFilename: null,
  _selfAudioUrl: null,
  _selfAudioDuration: null,
  _selfAudioFile: null,
  _micRecorder: null,     // экземпляр UnifiedSpeechRecognition
};
```

### Таблица предложений

- Рендерится функцией `_renderTable()` в `#editorModalSentencesTable`
- Колонки: позиция, play/audio, оригинал, перевод, audio_file, audio_mic, start, end, chain, checked, explanation, speaker
- Видимость колонок управляется `_applyTableViewForTab(tabName)`:
  - `general` — все колонки
  - `voice-original-auto` — скрыты audio_file, audio_mic
  - `voice-original-have` — показана audio_file, скрыта audio_mic
- Навигация: `_navigateToPreviousRow()`, `_navigateToNextRow()`, `_selectSentenceRow()`
- Добавление строк: `_addNewRow(position)` — открывает `#addRowModal` (модальное окно добавления строки)
- Удаление строк: `_deleteRow(row)` — через `DesktopConfirmModal`
- **Умный поиск ключа**: `_findFreeKey()` — находит наименьший незанятый числовой ключ (`s_0`, `s_1`, ...) среди существующих предложений

### Audio playback

- Использует `AudioManager` (глобальный синглтон, инициализируется через `_ensureAudioManager()`)
- Три режима (radio):
  - **auto** (закладка 2): TTS-генерация через `POST /generate_audio`, кнопки "Сгенерировать всё" и "Перегенерировать всё"
  - **have** (закладка 3): загрузка shared audio файла, waveform (wavesurfer), регионы (start/end), split/smart-split
  - **self** (закладка 4 — удалена): запись с микрофона через `UnifiedSpeechRecognition` — функциональность сохранена, но отдельной закладки больше нет
- Playback: `_handleAudioPlayback()` → `am.play(button, audioUrl, ...)`
- Cut audio: `_handleSelfCutAudio()` — получает `audio_mic` из текущего предложения, загружает blob через `AudioManager.loadDictationAudioBlob()` из CacheStorage, отправляет на `POST /cut-audio`, после cut перезагружает waveform через `_loadSelfAudioForRow()`

### Voice mode radios

- Три radio: `auto` (значение `""`), `have` (значение `"f"`), `self` (значение `"m"`)
- **Радио больше не управляет видимостью закладок** — все закладки (1, 2, 3, 5) всегда видны
- При смене radio:
  - Вызывается `_applyTableViewForTab()` для переключения колонок таблицы
  - Показывается/скрывается кнопка "Перезаполнить все авто" (`#editorModalAutoRegenerateAllBtn`) через `_updateAutoRegenerateAllBtnVisibility()`
  - Устанавливается dirty flag
- Закладка 4 ("Озвучка оригинала (сам)") **удалена** — функциональность self audio сохранена, но отдельной закладки больше нет

### LanguageSelector

- Инициализируется в `_initLanguageFlags()` через `window.initLanguageSelector('editorModalLangPair', { mode: ... })`
- Использует `window.LanguageManager` для получения данных о языках
- Режим зависит от количества языков перевода:
  - **0 языков перевода** (только оригинал): `flag-single` — только флаг оригинала
  - **1 язык перевода**: `flag-pair-fixed` — два флага (оригинал и перевод) без выпадающих списков
  - **2+ языков перевода**: `flag-pair-dropdown` с `rightDropdown: true` — левый флаг фиксирован (оригинал), правый — выпадающий список для выбора языка перевода

### DictationContent

Абстракция для хранения предложений диктанта. Может быть:
- Экземпляром `DictationRuntime.getOrCreateContent()` (если DictationRuntime доступен)
- Экземпляром `new DictationContent()` (если класс определён)
- Fallback-объектом с методами `getAllSentenceCores()`, `getSentence(key)`, `getAllKeys()`, `setSentences()`

### Dirty flags (система сохранения)

- `state.dirtyFlags = { db: false, audio: false, cover: false }`
- `_setDirtyFlags(next)` — устанавливает флаги и обновляет звёздочку
- `_hasUnsavedChanges()` — проверяет, есть ли хотя бы один dirty флаг
- `_updateUnsavedStar()` — обновляет визуальный индикатор (звёздочка у кнопки сохранения)
- При сохранении:
  1. Если `db` dirty → `POST /save_dictation_final` (включая `cover_b64` в JSON)
  2. Если `audio` dirty → `_uploadDraftAudioToB2()`
  3. Если `cover` dirty → cover передаётся как `cover_b64` внутри `save_dictation_final` (отдельного endpoint для cover нет)
- **Флоу cover**:
  1. Пользователь выбирает файл → `CoverManager.handleCoverSelect()` → открывается crop modal
  2. После подтверждения crop → `CoverManager.handleCropConfirm()` → вызывает `onConfirm(blob)` и `onDirty()`
  3. `onDirty()` устанавливает `dirtyFlags.cover = true`
  4. При сохранении: `CoverManager.getCroppedBlob()` → `_blobToBase64()` → `cover_b64` в `saveData`
  5. Сервер (`save_dictation_final`) декодирует `cover_b64` и сохраняет как `cover.webp` в temp-папку
  6. Существующая логика копирует `cover.webp` из temp в финальную папку (`static/data/dictations/<dictation_id>/cover.webp`) и в B2 (`dictations_covers/<numeric_id>.webp`)

### SaveQueueBatcher — очередь сохранения при нестабильном интернете

**Файлы**: [`static/js/save_queue_batcher.js`](../static/js/save_queue_batcher.js) (новый модуль, создан 2026-07-26)

**Назначение**: При нестабильном интернете данные не теряются, а сохраняются в IndexedDB и отправляются на сервер при первой возможности.

**Store в IndexedDB**: `draft_save_queue` (ключ: `save:{dictationId}:{timestamp}`)

**Структура записи:**
```javascript
{
 key: 'save:dict_123:1712345678000',
 type: 'draft_save',
 dictationId: 'dict_123',
 payload: { /* полный saveData как в _handleSave */ },
 status: 'pending',  // 'pending' | 'sending' | 'failed'
 createdAt: 1712345678000,
 updatedAt: 1712345678000,
 retryCount: 0,
 lastError: null,
}
```

**Поток выполнения:**
1. `_handleSave()` → `SaveQueueBatcher.enqueueSave(dictationId, saveData)` — пишет в IndexedDB
2. `SaveQueueBatcher.flushAll()` — читает все pending-записи и отправляет на сервер (`POST /save_dictation_final`)
3. При успехе — запись удаляется из очереди
4. При ошибке — запись остаётся, `retryCount++`, повтор через 15 секунд
5. После `MAX_RETRY_COUNT` (20) попыток — статус меняется на `failed`

**Автоматические триггеры отправки:**
- Периодический таймер (каждые 15 секунд проверяет очередь)
- `window.online` — при появлении интернета
- Явный вызов `SaveQueueBatcher.flushAll()` из `_handleSave()`

**Интеграция с `_handleSave()`** ([`static/js/dictation_editor_modal.js:3404`](../static/js/dictation_editor_modal.js:3404)):
- Если `SaveQueueBatcher` доступен — сохранение идёт через очередь
- Сначала `enqueueSave()` (всегда в IndexedDB)
- Потом `flushAll()` — если сеть есть, запись уходит сразу
- Если `queueInfo.pending === 0` — всё сохранено, обновляем десктоп
- Если `queueInfo.pending > 0` — данные в очереди, показываем тост "Дані збережено локально"
- Если `flags.audio && navigator.onLine` — аудио загружается на B2 отдельно

**Отличие от OutboxBatcher:**
- `OutboxBatcher` — очередь для статистики (звёзды, монеты, успехи), работает с `history_by_day`
- `SaveQueueBatcher` — очередь для сохранения самих диктантов (текст, метаданные, обложка)

### Управление языками перевода (вкладка 5)

**Вкладка 5 "Озвучка перевода (авто)"** — таблица языков перевода с кнопками +/−.

**`_renderTranslationsTable()`** — рендерит таблицу `#editorModalTranslationsTable`:
- Каждая строка: название языка + кнопка удаления (мусорник)
- Кнопка `+` (`#editorModalAddTranslationBtn`) — открывает `#addTranslationModal`

**`_openAddTranslationModal()`** — открывает модальное окно добавления языка:
- LanguageSelector с фильтром: только языки, которых ещё нет в `state.content.langBlocks`
- Кнопка "Добавить" → `_handleAddTranslationConfirm()`

**`_handleAddTranslationConfirm()`** — асинхронный процесс:
1. Добавляет новый `langBlock` в `state.content.langBlocks`
2. Для каждого существующего предложения (оригинал) делает автоперевод через `POST /translate`
3. Для каждого перевода генерирует TTS-аудио через `POST /generate_audio`
4. Сохраняет blob URL через `AudioManager._setObjectUrlForCanonical()`
5. Обновляет таблицу языков (`_renderTranslationsTable()`) и флаги (`_initLanguageFlags()`)

**`_openRemoveTranslationModal(langCode)`** — подтверждение удаления через `DesktopConfirmModal`

**`_removeTranslationLanguage(langCode)`** — удаляет `langBlock` из `state.content.langBlocks`, обновляет таблицу и флаги

### Модальное окно добавления строки (`#addRowModal`)

Открывается при нажатии `+` в панели управления таблицей (вместо старого `DesktopConfirmModal`).

**Структура:**
- Поле ввода для текста оригинала
- Enter в поле оригинала → автоперевод для всех языков перевода через `POST /translate`
- Таблица `#addRowModalTranslationsTable` — строки для каждого языка перевода с полями ввода
- Кнопка "Создать" → `_handleAddRowCreate()`

**`_handleAddRowCreate()`**:
1. Находит свободный ключ через `_findFreeKey()`
2. Создаёт `sentence` для оригинала и для каждого языка перевода
3. Если выбран режим `auto` — генерирует TTS-аудио через `_generateAudioForSentence()`
4. Добавляет строку в таблицу через `_renderTable()`
5. Закрывает модалку

**`_generateAudioForSentence(key, lang, text, dictationId)`** — асинхронная генерация TTS:
1. Вызывает `POST /generate_audio` с `{ dictation_id, lang, text, filename: "tts_{key}_{timestamp}.mp3" }`
2. Сохраняет blob через `AudioManager.saveDictationAudioBlob()`
3. Устанавливает blob URL через `AudioManager._setObjectUrlForCanonical()`

### NewDictationFillModal (начальное заполнение)

Открывается поверх `#dictationEditorModal` при создании нового диктанта (`isNewDictation: true`).

**Структура HTML** (`#newDictationFillModal`):

```
┌─────────────────────────────────────────────────┐
│ Row 1: Header                                   │
│ [ID: новий] [Назва диктанту...] [Створити] [X] │
├─────────────────────────────────────────────────┤
│ Row 2: Two panels                               │
│ ┌─ Left panel ───────────┐ ┌─ Right panel ───┐ │
│ │ [🇺🇸 ▼] ↔ [🇷🇺 ▼]       │ │ Режим озвучки:  │ │
│ │ Префікс перекладу: [//] │ │ ○ Авто          │ │
│ └─────────────────────────┘ │ ○ Є файл        │ │
│                              │ ○ Запишу сам    │ │
│                              └─────────────────┘ │
├─────────────────────────────────────────────────┤
│ Row 4: Text section                             │
│ Текст диктанту:                                 │
│ ┌─────────────────────────────────────────────┐ │
│ │ Hello world                                 │ │
│ │ //Привіт світ                               │ │
│ │ How are you?                                │ │
│ │ //Як справи?                                │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

**Методы `NewDictationFillModal`:**

| Метод | Описание |
|-------|----------|
| `open(editorConfig)` | Сбрасывает поля, инициализирует LanguageSelector, включает подсветку строк перевода, показывает модалку |
| `close()` | Скрывает модалку. Если voice mode изменился относительно `_initialVoiceMode` — вызывает `_refillAndApply()` |
| `create()` | Парсит текст, заполняет `editorConfig`, вызывает `_updateEditorFromFillConfig()`, переключает закладку через `_switchTabByVoiceMode()` |
| `_switchTabByVoiceMode(mode)` | Переключает закладку редактора: `auto` → general, `file` → voice-original-have, `self` → voice-original-self |
| `_refillAndApply(newMode)` | Обновляет `audio_order` в config, переключает закладку, синхронизирует radio в редакторе |
| `_getSelectedLanguages()` | Возвращает `{ original, translation }` из LanguageSelector |
| `_initLanguageSelector()` | Инициализирует `window.initLanguageSelector('newDictationFillLangPair', { mode: 'flag-pair-dropdown-both', ... })` с языками по умолчанию из профиля пользователя |
| `_setupTextareaHighlighting()` | Подсвечивает строки, начинающиеся с делимитера (например `//`), зелёным цветом (класс `.line-translation`) |

**Алгоритм `create()`:**

1. Получить текст из `#newDictationFillText`
2. Получить делимитер из `#newDictationFillDelimiter`
3. Получить языки из LanguageSelector
4. Получить название из `#newDictationFillTitle`
5. Получить voice mode из radio
6. Разбить текст на строки, пропуская пустые
7. Для каждой строки:
   - Если строка начинается с делимитера — это перевод без оригинала (пропустить)
   - Иначе — оригинал. Проверить следующую строку: если она начинается с делимитера — это перевод
   - Создать объекты `origSentence` и `trSentence` с одинаковым key
8. Определить `audio_order` по voice mode
9. Обновить `editorConfig` (title, languages, sentences, audio_order)
10. Вызвать `_updateEditorFromFillConfig(config)` — обновить заголовок, языки, radio, перерисовать таблицу
11. Вызвать `_switchTabByVoiceMode(voiceMode)` — переключить закладку

**`_updateEditorFromFillConfig(config)`:**

- Обновляет `state.config`
- Устанавливает текст заголовка в `#dictation-editor-modal-name`
- Заполняет поле ввода названия
- Обновляет LanguageSelector через `state.headerLangPairSelector.setValues()`
- Устанавливает radio voice mode и триггерит `change` event
- Вызывает `_renderTable()` и `_updateUnsavedStar()`

### Точки входа для создания нового диктанта

1. **Кнопка "+" на рабочем столе** (`data-action="desktop-new"`):
   - [`static/js/desktop.js`](static/js/desktop.js:493) → `stubAction('desktop-new')`
   - Находит workbook пользователя через `GET /library/api/user-books`
   - Сохраняет `{ book_id: wbId }` в `sessionStorage['dictationTargetBook']`
   - Вызывает `DictationEditorModal.open({ isNewDictation: true, ... })`

2. **Модалка книги → "..." → "Додати диктант"**:
   - [`static/js/book_modal.js`](static/js/book_modal.js:1257) → обработчик `add-dictation`
   - Вызывает `setDictationTargetBook(bookId)` (сохраняет в `sessionStorage`)
   - Вызывает `DictationEditorModal.open({ isNewDictation: true, ... })`

3. **Модалка книги → разделы → "..." → "Новий диктант"**:
   - [`static/js/book_modal.js`](static/js/book_modal.js:1351) → `buildSectionNode()` с меню
   - Вызывает `setDictationTargetBook(sectionId)` (диктант добавляется в раздел)
   - Вызывает `DictationEditorModal.open({ isNewDictation: true, ... })`

### Механизм workbook (робочий зошит)

- `setDictationTargetBook(bookId)` — сохраняет `{ book_id: Number(bookId) }` в `sessionStorage['dictationTargetBook']`
- При сохранении диктанта (`_handleSave()`) — `book_id` читается из `sessionStorage` и добавляется в `saveData`
- Сервер (`POST /save_dictation_final`) обрабатывает `book_id` и добавляет диктант в указанную книгу/раздел
- После сохранения `sessionStorage['dictationTargetBook']` **не очищается** — может быть переиспользован при следующем создании

### Z-index иерархия

- `#dictationEditorModal`: `z-index: 100249` (в `static/css/desktop.css`)
- `#dictationEditorModal.dictation-editor-modal`: `z-index: 100249` (в `static/css/dictation_editor_modal.css`)
- `#newDictationFillModal`: `z-index: 100310` (в `static/css/dictation_editor_modal.css`)
- Fill modal открывается **поверх** редактора, но **ниже** `#auto-toast` (200500)

## Service Worker

### `sw.js`

Роль:

- контроль актуальности версии фронтенда (обновление закэшированных страниц/скриптов при смене BUILD/VERSION)
- (опционально) кэширование «app shell» (html/js/css) по выбранной стратегии
- (опционально) фоновая доставка результатов на сервер (если сеть недоступна — отправить позже)
- кэширование обложек/аватаров через `/api/dictations_covers/...` (и аналогичные URL для аватаров), если это включено в стратегию SW

### `static/js/cover_manager.js`

Роль:

- единая точка правды для UI-операций с обложками (выбор файла, crop modal, формирование `Blob` для upload, preview).

**API `window.CoverManager`:**

| Метод | Описание |
|-------|----------|
| `bind(config)` | Привязывает обработчики к элементам UI: file input, upload button, preview img, crop modal. Возвращает `{ unbind() }` |
| `getCroppedBlob()` | Возвращает `Blob` обрезанного изображения (или `null`, если crop не выполнялся) |
| `handleCoverSelect(event)` | Обработчик выбора файла — читает файл как data URL и открывает crop modal |
| `openCropModal(imageSrc)` | Открывает crop modal с Cropper.js |
| `handleCropConfirm()` | Подтверждает crop — создаёт canvas, формирует blob, вызывает `onConfirm(blob)` и `onDirty()` |
| `closeCropModal(clearBlob)` | Закрывает crop modal |
| `getCoverUrl(dictationId, languageCode)` | Строит URL обложки: `/api/dictations_covers/<id>.webp` |
| `prefetchUrls(urls)` | Prefetch массивов URL через `fetch()` + CacheStorage |

**Параметры `bind(config)`:**

| Поле | Тип | Описание |
|------|-----|----------|
| `fileInputId` | `string` | ID `<input type="file">` |
| `uploadBtnId` | `string` | ID кнопки загрузки |
| `previewImgId` | `string` | ID `<img>` для preview |
| `modalId` | `string` | ID crop modal |
| `cropImageId` | `string` | ID `<img>` внутри crop modal |
| `closeBtnId` | `string` | ID кнопки закрытия |
| `cancelBtnId` | `string` | ID кнопки отмены |
| `confirmBtnId` | `string` | ID кнопки подтверждения |
| `aspectRatio` | `number` | Соотношение сторон (например `1` для квадрата) |
| `outputWidth` | `number` | Ширина выходного изображения в px |
| `outputHeight` | `number` | Высота выходного изображения в px |
| `outputType` | `string` | MIME-тип (например `'image/webp'`) |
| `outputQuality` | `number` | Качество (0-1) |
| `onConfirm(blob)` | `function` | Колбэк при подтверждении crop |
| `onDirty()` | `function` | Колбэк при изменении (устанавливает dirty flag) |

**Важно:**

- `CoverManager` **не загружает** обложку на сервер. Он только crops и предоставляет `Blob`.
- Загрузка на сервер происходит внутри `_handleSave()` редактора: blob → base64 → `cover_b64` в `save_dictation_final`.
- Page-код не должен дублировать логику crop/preview.
- Экспортируемый глобальный объект: `window.CoverManager`.

### `static/js/idb_manager.js`

Роль:

- единая точка правды для работы с `IndexedDB` (открытие базы, схема stores, `idbGet/idbPut/idbDelete/...`).

Важно:

- Page-код (private library / dictation / editor) не должен копировать boilerplate IndexedDB.
- Экспортируемый глобальный объект: `window.IdbManager`.

Важно:

- Аудио (чтение/кэширование/удаление) — зона ответственности `AudioManager`, а не SW.
- SW может хранить metadata/JSON, но это нужно минимизировать и стандартизировать.

# Поток данных: создание/редактирование текста и переводов

Редактор диктанта работает в модальном окне [`static/js/dictation_editor_modal.js`](static/js/dictation_editor_modal.js). Данные передаются через `config` при вызове `open(config)`. Внутреннее состояние хранится в локальном `state` (не в глобальных переменных страницы).

**Важно**: старого page-кода с `workingData`/`currentDictation` больше нет. Все данные живут в `state.config` и `state.content` (экземпляр `DictationContent`).

# Жизненный цикл данных диктанта: как двигаются данные

Этот раздел описывает полный путь данных диктанта от момента загрузки до упражнения ученика — через все слои: IndexedDB, CacheStorage, B2, сервер.

## Уровень 1: Контент диктанта (`DictationContent`)

**Где**: [`static/js/dictation_runtime/dictation_store.js`](static/js/dictation_runtime/dictation_store.js) — класс `DictationContent`.

**Что хранит**: «Паспорт» диктанта — все предложения, переводы, ссылки на аудио. Это **неизменяемые** данные конкретного диктанта (текст не меняется во время упражнения).

**Структура `langBlocks`**:
```javascript
[
  {
    lang: "en",          // код языка
    sentences: [         // массив предложений на этом языке
      {
        key: "000",      // строковый ключ (3 цифры)
        position: 1,     // порядковый номер
        text: "Hello",   // текст предложения
        audio: "",       // basename аудиофайла (или "")
        explanation: "", // пояснение
        speaker: "1",    // номер говорящего (для диалогов)
      },
      // ...
    ]
  },
  {
    lang: "uk",          // язык перевода
    sentences: [ /* переводы тех же предложений */ ]
  },
  // ...
]
```

**Нормализация**: `langBlocks[0]` — всегда язык оригинала. `langBlocks[1..n]` — языки перевода в порядке добавления.

**Как создаётся**:
1. При открытии редактора (`open(config)`) — `config.sentences` конвертируется в `langBlocks`:
   - Группировка по `langCode` внутри каждого предложения
   - Для каждого языка создаётся блок `{ lang, sentences: [...] }`
2. При открытии диктанта для выполнения (`dictation_modal.js`) — данные загружаются из IndexedDB или с сервера, затем `content.setSentences(sentences, originalLanguage)`.

**Как хранится в IndexedDB**:
- Store: `dictations`
- Ключ: `sentences:{dictationId}:{langOrig}:{langTr}`
- Значение: `{ sentences: [...], audio_user_shared, cachedAt }`
- Запись через [`dictation_kart.js`](static/js/dictation_kart.js) → `prefetchDictationToCache()`

**Как загружается при открытии редактора** (стратегия «кеш первый»):
1. Параллельно запускаются: чтение из IndexedDB + запрос к серверу
2. Если кеш есть → данные отдаются мгновенно, редактор открывается без задержки
3. Серверный ответ приходит в фоне → если данные изменились, редактор переоткрывается с новыми данными
4. Если кеша нет → ждём сервер

**Как загружается при открытии диктанта для выполнения**:
1. `dictation_modal.js` → `loadSentencesFromIndexedDb()` — пытается прочитать из IndexedDB
2. Если нет → `fetchSentencesFromServerAndCache()` — запрос к серверу + запись в IndexedDB
3. Затем `content.setSentences()` → `DictationContent` готов к использованию

## Уровень 2: Сессия выполнения (`DictationSession`)

**Где**: [`static/js/dictation_runtime/dictation_store.js`](static/js/dictation_runtime/dictation_store.js) — класс `DictationSession`.

**Что хранит**: Прогресс конкретного прохождения диктанта — состояние каждого предложения, выбор предложений, таймер.

**Структура состояния по ключу предложения**:
```javascript
{
  _textAttemptCount: 0,         // счётчик проверок с ошибками в текущем подходе
  number_of_perfect: 0,         // 1 если есть звезда
  number_of_corrected: 0,       // 1 если есть полузвезда
  number_of_audio: 0,           // 1 если выполнено аудио
  text_activity_count: 0,       // счётчик текстовых активностей
  audio_activity50_count: 0,    // счётчик аудио-активностей (≥80%)
  money_count: 0,               // монеты, заработанные на этом предложении
  checked: false,               // выбрано ли предложение в поднаборе
  completed: false,             // завершено ли (звезда/полузвезда)
  // для completed=true: предложение больше не редактируется
}
```

**Жизненный цикл сессии**:
1. **Создание**: `DictationSessionsStore.getOrCreateSession({ dictationId, exerciseId, subsetPositions })`
   - Если exerciseId задан — загружаются конкретные позиции из упражнения
   - Если нет — используется весь диктант или переданный subsetPositions
   - `ensureDefaultSelection()` — выбирает предложения (все, если нет поднабора)
2. **Выполнение**: пользователь вводит текст, проверяет, записывает аудио
   - Каждое действие обновляет состояние через `session.getState(key)` → мутация полей
   - `_textAttemptCount` растёт при ошибках, сбрасывается при повторе/навигации
3. **Завершение**: `_isDictationFullyCompleted(session)` → `showCompletionModal()`
   - Данные отправляются через `OutboxBatcher` → `POST /api/statistics/success`
4. **Сохранение в IndexedDB**: `DictationSessionsStore.persistToIdb()`
   - Store: `sessions`, ключ: `session:{dictationId}:{langTr}:{exerciseId}:{subsetSignature}`
   - Сохраняется полный JSON сессии для восстановления после перезагрузки страницы
5. **Восстановление**: `DictationSessionsStore.restoreFromIdb()` при старте

**Связь с `DictationContent`**:
- Сессия **ссылается** на контент (хранит `content` внутри)
- Один контент может использоваться несколькими сессиями (разные упражнения одного диктанта)
- `DictationSessionsStore` управляет и контентами, и сессиями
- LRU-эвикция: максимум 5 контентов в памяти, старые вытесняются

## Уровень 3: Хранилище сессий (`DictationSessionsStore`)

**Где**: [`static/js/dictation_runtime/dictation_store.js`](static/js/dictation_runtime/dictation_store.js) — класс `DictationSessionsStore`.

**Роль**: Центральный диспетчер — управляет жизненным циклом контентов и сессий в памяти.

```javascript
// Внутреннее состояние (в замыкании модуля)
const _contents = new Map();   // dictationId → DictationContent
const _sessions = new Map();   // sessionKey → DictationSession
```

**Ключевые методы**:
| Метод | Описание |
|-------|----------|
| `getOrCreateContent({ dictationId })` | Возвращает существующий или создаёт новый контент. Проверяет LRU-лимит. |
| `setContentSentences({ dictationId, sentences, originalLanguage })` | Устанавливает предложения в контент (вызывает `content.setSentences()`) |
| `getOrCreateSession({ dictationId, exerciseId, subsetPositions, ... })` | Создаёт или возвращает существующую сессию по ключу |
| `getSession({ dictationId, exerciseId, subsetSignature })` | Получить сессию без создания |
| `removeSession(...)` | Удалить сессию из памяти |
| `removeSessionFromIdb(...)` | Удалить сессию из памяти и IndexedDB |
| `persistToIdb()` | Сохранить все сессии в IndexedDB (вызывается при `pagehide`/`beforeunload`) |
| `restoreFromIdb()` | Восстановить все сессии из IndexedDB (вызывается при старте) |
| `closeAll()` | Закрыть все сессии и контенты |

**Схема sessionKey**: `session:{dictationId}:{langTr}:{exerciseId}:{subsetSignature}`

Где `subsetSignature` = `normalizeSubsetPositions(subsetPositions).join(',')` — уникальная подпись набора предложений.

## Полная схема движения данных

```
┌──────────────────────────────────────────────────────────────────────┐
│                     ОТКРЫТИЕ РЕДАКТОРА                                │
│                                                                      │
│  dictation_kart.js                                                   │
│  ┌─────────────────────────────────────────────┐                    │
│  │ 1. IndexedDB (dictations store)              │                    │
│  │    ключ: sentences:{id}:{orig}:{tr}          │                    │
│  │    └─ ЕСТЬ? → отдаём мгновенно (кеш первый) │                    │
│  │ 2. Сервер GET /api/dictation/{id}/{o}/{t}/sentences               │
│  │    └─ фоном обновляем кеш (если изменилось) │                    │
│  └─────────────────────────────────────────────┘                    │
│                       ↓                                              │
│  DictationEditorModal.open(config)                                    │
│  ┌─────────────────────────────────────────────┐                    │
│  │ state.config = config                        │                    │
│  │ state.content = new DictationContent(...)    │                    │
│  │   └─ config.sentences → langBlocks          │                    │
│  │ _renderTable() — рендер таблицы             │                    │
│  │ _initLanguageFlags() — флаги в шапке        │                    │
│  └─────────────────────────────────────────────┘                    │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                     СОХРАНЕНИЕ (кнопка Save)                          │
│                                                                      │
│  _handleSave() в dictation_editor_modal.js                            │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ ЭТАП 1: Сохранение текста и метаданных                         │  │
│  │   SaveQueueBatcher.enqueueSave(dictationId, saveData)          │  │
│  │   └─ пишет в IndexedDB (draft_save_queue)                     │  │
│  │   └─ flushAll() → POST /save_dictation_final                  │  │
│  │       сервер: сохраняет текст, переводы, audio basename       │  │
│  │       сервер: сохраняет обложку (cover_b64 → cover.webp)      │  │
│  │                                                                │  │
│  │ ЭТАП 2: Загрузка аудио в B2 (только если audio dirty)          │  │
│  │   _uploadDraftAudioToB2(dictationId, token)                    │  │
│  │   └─ AudioManager.uploadDictationAudioFromCacheToB2({...)     │  │
│  │       1. GET /api/b2/get_upload_url → { uploadUrl, token }    │  │
│  │       2. Для каждого файла в CacheStorage:                    │  │
│  │          - строим canonical URL                                │  │
│  │          - проверяем b2_upload_ledger (SHA256 в IndexedDB)    │  │
│  │          - если нет в ledger → читаем blob из CacheStorage    │  │
│  │          - PUT blob на B2 uploadUrl                            │  │
│  │          - сохраняем SHA256 в b2_upload_ledger                │  │
│  │       3. Cleanup: POST /api/b2/cleanup_dictation_audio        │  │
│  │          - удаляет из B2 файлы, которых нет в keep_remote_paths│  │
│  └───────────────────────────────────────────────────────────────┘  │
│                       ↓                                              │
│  После успеха:                                                       │
│  - dirtyFlags сбрасываются                                           │
│  - state.config.dictationId обновляется (если был temp)              │
│  - window.Desktop.loadDeskItems() — обновление карточек на десктопе  │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│                  ОТКРЫТИЕ ДИКТАНТА ДЛЯ ВЫПОЛНЕНИЯ                     │
│                                                                      │
│  dictation_modal.js → ensureDictationContentLoadedToRuntime()        │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ 1. IndexedDB (dictations store)                                │  │
│  │    ключ: sentences:{id}:{orig}:{tr}                            │  │
│  │    └─ ЕСТЬ? → loadSentencesFromIndexedDb()                    │  │
│  │ 2. НЕТ? → fetchSentencesFromServerAndCache()                   │  │
│  │    └─ GET /api/dictation/{id}/{orig}/{tr}/sentences            │  │
│  │    └─ сохраняем в IndexedDB                                    │  │
│  │                                                                │  │
│  │ 3. DictationSessionsStore.setContentSentences(...)             │  │
│  │    └─ content.setSentences(sentences, originalLanguage)        │  │
│  │                                                                │  │
│  │ 4. DictationSessionsStore.getOrCreateSession({...})            │  │
│  │    └─ new DictationSession({ content, ... })                  │  │
│  │    └─ session.ensureDefaultSelection()                         │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                       ↓                                              │
│  Пользователь выполняет упражнение                                    │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │ Каждое действие → handleActivity() → OutboxBatcher            │  │
│  │   └─ IndexedDB (outbox store)                                 │  │
│  │   └─ периодически flushAll() → POST /api/statistics/success   │  │
│  │       → history_by_day (UPSERT)                               │  │
│  │       → user_money_ledger (INSERT dt)                         │  │
│  │                                                                │  │
│  │ При pagehide/beforeunload:                                     │  │
│  │   └─ DictationSessionsStore.persistToIdb()                    │  │
│  │      → IndexedDB (sessions store)                             │  │
│  └───────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

# Поток данных: аудио

## A) До Save (черновик)

- Несохранённое аудио существует в двух формах:
  - **`blob:` URL** в памяти вкладки (для только что сгенерированного/записанного аудио)
  - **CacheStorage** — после вызова `AudioManager.saveDictationAudioBlob()` blob сохраняется в CacheStorage под каноническим ключом
- Оно может проигрываться через `AudioManager.play()` → `resolvePlayableUrl()` → blob из CacheStorage или `blob:` URL
- Оно **не должно** записываться в БД как URL

## B) После Save (финальная сущность)

Полный флоу сохранения аудио при нажатии кнопки Save в редакторе:

### Этап 1: Сохранение текста (`_handleSave()` → SaveQueueBatcher)

1. [`dictation_editor_modal.js:_handleSave()`](static/js/dictation_editor_modal.js:3333) собирает `saveData`:
   - `id` / `temp_id` — нормализованный ID диктанта
   - `language_original`, `language_translation`
   - `title`, `level`, `is_dialog`, `audio_order`, `show_explanation`
   - `audio_user_shared` — basename общего аудиофайла
   - `sentences` — объект `{ [langCode]: { title, sentences: [...] } }`, где каждое предложение содержит поля `audio`, `audio_avto`, `audio_mic`, `audio_user` (только basename)
   - `book_id` — из `sessionStorage['dictationTargetBook']`
   - `cover_b64` — если cover dirty (base64-строка)

2. `SaveQueueBatcher.enqueueSave(dictationId, saveData)` — пишет в IndexedDB (store `draft_save_queue`)
3. `SaveQueueBatcher.flushAll()` — отправляет `POST /save_dictation_final`
4. Сервер (`routes/dictation_editor.py`) сохраняет:
   - текст/переводы в таблицы `dictation_sentences`
   - метаданные в `dictations`
   - аудио-поля как **basename-only** (например `000_en_avto.mp3`)
   - обложку как `cover.webp` в `static/data/dictations/<id>/`

### Этап 2: Загрузка аудио в B2 (`_uploadDraftAudioToB2()`)

**Условие запуска**: `flags.audio === true` (были изменения аудио) И `navigator.onLine === true`.

**Функция**: [`dictation_editor_modal.js:_uploadDraftAudioToB2()`](static/js/dictation_editor_modal.js:973)

1. Получает `uploadUrl` и `authorizationToken` через `GET /api/b2/get_upload_url`
2. Вызывает `AudioManager.uploadDictationAudioFromCacheToB2({ dictationId, token, urls, ... })`

**Функция**: [`audio_manager.js:uploadDictationAudioFromCacheToB2()`](static/js/audio_manager.js:1495)

1. Собирает список URL аудиофайлов из `state.content` (все `audio*` поля всех предложений)
2. Для каждого URL строит канонический путь: `dictations/<dictation_id>/<lang>/<filename>`
3. Для каждого файла проверяет `b2_upload_ledger` в IndexedDB:
   - Читает blob из CacheStorage
   - Считает SHA256 от blob
   - Если SHA256 совпадает с записью в ledger → **пропускает** (уже загружен)
   - Если нет → загружает blob на B2 через `PUT <uploadUrl>` с заголовками B2
   - После успешной загрузки сохраняет `{ sha256, size, uploadedAt }` в ledger
4. Возвращает результат: `{ ok, total, uploaded, skipped, failed, cacheMiss, errors }`

### Этап 3: Очистка лишних файлов из B2

После успешной загрузки аудио вызывается `AudioManager.cleanupStaleB2DictationAudio()`:

1. Собирает `keepRemotePaths` — все канонические пути, которые **должны** существовать
2. Вызывает `POST /api/b2/cleanup_dictation_audio` с `{ dictation_id, keep_remote_paths }`
3. Сервер:
   - Проверяет ownership диктанта
   - Получает список файлов из B2 по префиксу `dictations/<dictation_id>/`
   - Удаляет все файлы, которых нет в `keep_remote_paths`
   - Защита: отказывается удалять, если keep-list пустой

### Как аудио попадает в CacheStorage до Save

Аудио-файлы (TTS, загруженные, записанные с микрофона) сохраняются в CacheStorage через `AudioManager`:

1. **TTS-генерация** (`_handleGenerateTtsForSentence()`):
   - `POST /generate_audio` → сервер возвращает MP3
   - `AudioManager.saveDictationAudioBlob(dictationId, lang, filename, blob, 'audio/mpeg')`
   - Сохраняется в CacheStorage под ключом: канонический URL `/api/dictations/<dictation_id>/<lang>/<filename>`

2. **Загрузка файла** (`_uploadSharedAudioFile()` / `_cacheSharedAudioFile()`):
   - Файл выбран пользователем через `<input type="file">`
   - `AudioManager.saveDictationAudioBlob(dictationId, lang, filename, blob, mime)`

3. **Запись с микрофона** (`_applySelfMicFile()`):
   - `MediaRecorder` → blob
   - `AudioManager.saveDictationAudioBlob(dictationId, lang, filename, blob, mime)`

### Ключи CacheStorage для аудио

Формат: канонический URL `/api/dictations/<dictation_id>/<lang>/<filename>`

Нормализация dictationId: `buildDictationAudioUrl()` в `AudioManager` принимает как `"123"`, так и `"dict_123"` — всегда приводит к `dict_<id>`.

### Как клиент загружает аудио в B2 без дублирования

Реализовано в [`static/js/dictation_editor_modal.js`](static/js/dictation_editor_modal.js) (функция `_uploadDraftAudioToB2()`) и в [`static/js/audio_manager.js`](static/js/audio_manager.js) (метод `uploadDictationAudioFromCacheToB2()`).

Алгоритм:

1) Клиент получает `uploadUrl` / `uploadAuthToken` у backend:

- `POST /api/b2/get_upload_url` (JWT required)

2) Для каждого файла, который должен существовать в B2, клиент строит `remotePath`:

- `dictations/<dictation_id>/<lang>/<filename>`

3) Чтобы не перезаливать один и тот же бинарь повторно, клиент ведёт локальный ledger в `IndexedDB`:

- store: `b2_upload_ledger`
- key: `b2_ledger:<remotePath>`
- value: `{ sha256, size, uploadedAt }`

Перед upload:

- считается `sha256` от `Blob` (через `crypto.subtle.digest('SHA-256', ...)`)
- сравниваются `sha256` и `size` с записью в ledger
- если совпало: upload пропускается (считаем, что файл уже загружен в B2)

Важно:

- Это **не** серверная дедупликация и не проверка B2 — это оптимизация на клиенте.

### Как удаляются «лишние» аудиофайлы из B2 после Save

Требование: если пользователь удалил строку/аудио в редакторе и нажал Save, то соответствующие файлы должны исчезнуть из B2.

Реализация:

1) После успешного `save_dictation_final` клиент собирает `keep_remote_paths` из текущих данных редактора (`state.content`):

- берутся поля `audio`, `audio_avto`, `audio_mic`, `audio_user` (и `audio_user_shared` если используется)
- значения нормализуются до `filename` (basename)
- затем строится `dictations/<dictation_id>/<lang>/<filename>`

2) Клиент вызывает backend cleanup endpoint:

- `POST /api/b2/cleanup_dictation_audio` (JWT required)
- payload: `{ dictation_id: 'dict_<id>', keep_remote_paths: [...] }`

3) Backend делает реальную очистку в B2:

- проверяет ownership (удалять может только владелец диктанта)
- формирует `prefix = dictations/<dictation_id>/`
- получает список файлов из B2 по префиксу (`list_files(prefix)`)
- удаляет всё, чего **нет** в `keep_remote_paths`
- guardrail: backend откажется удалять, если keep-list пустой (чтобы не допустить "удалить всё" по ошибке)

### Как файл попадает в B2

Целевое правило:

- Клиент (JS) отвечает за upload/delete бинаря в B2 через `AudioManager`.
- Backend участвует только в:
  - генерации аудио (если генерация на сервере)

Стандарт зафиксирован (нужно проверить и обеспечить применение в коде/настройках):

- Права на чтение/запись обеспечиваются настройками B2: корзина **публичная**.

# Хранилища на клиенте

## 1) Локальное состояние модуля (редактор)

В [`dictation_editor_modal.js`](static/js/dictation_editor_modal.js) состояние хранится в замыкании модуля (`state`):

- `state.config` — конфиг, переданный в `open()`
- `state.content` — экземпляр `DictationContent` (предложения)
- `state.dirtyFlags` — флаги несохранённых изменений
- `state._sharedAudioFilename`, `state._sharedAudioUrl`, `state._selfAudioFilename`, `state._selfAudioUrl` — аудио-состояние

**Важно**: глобальных переменных страницы (`workingData`, `currentDictation`) больше нет. Всё состояние инкапсулировано в модуле.

Плюсы:

- изоляция: разные экземпляры не конфликтуют
- нет риска случайного перезатирания из другого скрипта

Минусы:

- всё теряется при reload (но редактор — модальное окно, не страница)

## 2) CacheStorage (Service Worker)

Используется для:

- хранения обложек/аватаров (если есть)

Риски:

- если класть слишком много JSON в CacheStorage, можно получить overhead на парсинг/копирование.

Рекомендация:

- бинарные данные (аудио/картинки) — `CacheStorage`
- структурированные данные и метаданные — лучше `IndexedDB`

Важно:

- Аудио может храниться в `CacheStorage`, но управляет этим `AudioManager` (ключи, актуальность, удаление), а не `sw.js`.

## 3) IndexedDB (если используем/будем использовать)

Подход:

- держать небольшие JSON (metadata, индексы)
- хранить маппинги и state для SW/page

# Версионизация (BUILD/VERSION) и обновление страниц

Проблема сейчас:

- BUILD-номер меняется «по файлам» (например в `dictation_editor_modal.js`, `dictation_modal.js` и т.д.).
- Это приводит к:
  - дублированию
  - риску забыть обновить где-то
  - невозможности централизованно управлять cache-bust

Цель:

- один источник правды `APP_BUILD`.

Предлагаемое решение (архитектурно):

- создать общий модуль (например `static/js/app_build.js`), который выставляет:

```js
window.__APP_BUILD = 'YYYY-MM-DD_hhmm';
```

- и подключать его:
  - во всех templates перед остальными скриптами
  - (опционально) использовать в SW для именования cache

Правило:

- меняешь код — меняешь **только `__APP_BUILD`** в одном месте.

# TODO (продуктовый план на рефактор)

## 1) Документация (этот файл)

- расширить список endpoints
- описать payload `save_dictation_final`
- описать точные ключи кеша для аудио

## 2) JS слой доступа к данным (HTTP/DB abstraction)

Сделать `DictationApi` (или аналог):

- `loadDictation(id)`
- `saveDictation(payload)`
- `getAudioUrl(dictId, lang, filename)`

## 3) Централизация аудио

Перенести всё в `AudioManager`:

- `setDraftBlob(lang, kind, blob)`
- `getPlayableSrc(lang, kind)`
- `ensureUploadedAfterSave(dictId)`

## 4) Стандартизировать кэш-форматы

- перечислить что хранится в CacheStorage
- что хранится в IndexedDB (если нужно)
- минимизировать JSON в CacheStorage

## 5) ~~Исправить рассинхрон шапки языков~~ **ИСПРАВЛЕНО** (Bug #23, 2026-07-28)

- `_initLanguageFlags()` в [`dictation_editor_modal.js`](static/js/dictation_editor_modal.js:2086) теперь проверяет `state.config.translationLanguage` перед fallback на `translationLangs[0]`
- При смене языка через dropdown вызывается `_updateTranslationDisplay()` и синхронизируется `state.config.translationLanguage`

# Учитель – Группа – Ученик (планируемая система)

Цель: дать учителю инструмент **организовать учеников в группы**, **назначать диктанты как задания** (с дедлайнами/правилами повторения) и получать **отчёты/уведомления**; ученику — удобный список заданий и прогресс по ним.

Принцип: в проекте уже есть сильная часть «диктант → прохождения → звёзды/полузвёзды/история». Нужен слой **планирования и контроля выполнения** поверх текущих сущностей.

## Актуальная реализация (как работает сейчас)

Ниже — описание **текущей работающей схемы** в коде (backend + frontend), без "как планировалось".

### Сущности (БД)

- `groups` — группы (включая персональные группы, если включено `is_personal`).
- `group_teachers` — привязка учителей к группам.
- `group_students` — привязка учеников к группам.
  - важный флаг: `notify_teacher_on_success` (если включён, учителю приходят Telegram-уведомления при успешном завершении)
- `group_invites` — инвайты:
  - `mode='link'` — инвайт-ссылка (`/join-group/<token>`)
  - `mode='email'` — инвайт по email (ученик видит приглашение после логина)
- `assignments` — назначение диктанта группе.
  - поле `selected_sentence_positions` (если задано) ограничивает, какие предложения считаются в задании
- `assignments_by_date` — план по дням (на каждый день: `required_completions`)
- `history_by_day` — факты выполнения диктантов (медали) через поле `successes`. Это источник факта выполнения.

### Backend API (группы)

Файл: `routes/groups.py`.

- `GET /groups/api/my`
  - список групп, где пользователь — учитель
- `GET /groups/api/memberships`
  - список групп, где пользователь — ученик
- `POST /groups/api/group`
  - создание группы (учитель)
- `GET /groups/api/group/<group_id>` / `PUT /groups/api/group/<group_id>`
  - детали/обновление группы (учитель)
- `DELETE /groups/api/group/<group_id>`
  - полное удаление группы и всех связанных данных (CASCADE)
  - защита: нельзя удалить личную группу (`is_personal = TRUE`)
  - только для учителя-владельца группы

Инвайты:

- `POST /groups/api/group/<group_id>/invite`
  - создать/обновить инвайт-ссылку
- `GET /groups/api/group/<group_id>/invite/latest`
  - получить последний активный инвайт (чтобы показывать ссылку в UI)
- `GET /groups/api/join/<token>/preview`
  - preview (ученик видит что за группа)
- `POST /groups/api/join/<token>`
  - вступление по ссылке

Email-инвайты:

- `POST /groups/api/group/<group_id>/invite/email` `{ email }`
  - учитель создаёт email-инвайт
- `GET /groups/api/my-invites`
  - ученик получает список pending инвайтов
- `POST /groups/api/invite/<invite_id>/accept`
- `POST /groups/api/invite/<invite_id>/decline`

Управление учениками группы:

- `GET /groups/api/group/<group_id>/students`
- `POST /groups/api/group/<group_id>/students/<student_user_id>/remove`
- `POST /groups/api/group/<group_id>/students/<student_user_id>/notify_teacher_on_success`
- `POST /groups/api/memberships/<group_id>/notify_teacher_on_success`

### Backend API (задания)

Файл: `routes/assignments.py`.

Учитель:

- `GET /api/assignments/teacher/group/<group_id>`
  - список назначений для группы
- `POST /api/assignments/teacher/create`
  - создание задания в режиме "days" (план по датам), + опционально `selected_sentence_positions`
- `POST /api/assignments/teacher/delete` `{ ids: [...] }`
- `GET /api/assignments/teacher/assignment/<assignment_id>`
- `PUT /api/assignments/teacher/assignment/<assignment_id>`
- `GET /api/assignments/teacher/assignment/<assignment_id>/students`
  - прогресс по ученикам для задания

Ученик:

- `GET /api/assignments/student/my?date=YYYY-MM-DD`
  - задания на дату (используется модалкой "План")

### Как ученик видит "План" (frontend)

UI показывает задания на выбранную дату (реализовано в модалке "План").
- Данные берутся из `GET /api/assignments/student/my?date=...`.
- В ответе приходит список заданий, включающий:
  - `dictation_id`, `dictation_title`, `dictation_level`, `dictation_cover_url`
  - `required_completions` на дату
  - `done` / `done_unique` (сколько завершений на дату/в окне задания)

### Как попытка засчитывается в задание

Источник факта выполнения: `history_by_day.successes` (медаль).

- При полном завершении диктанта frontend вызывает `POST /api/statistics/success`.
- Backend увеличивает счётчик `successes` в `history_by_day` через `_upsert_history_by_day()`.
- Прогресс заданий считается через запросы в `helpers/db_assignments.py` (на основе дат/диктанта/групп и суммы `hbd.successes`).

Инвариант (MVP): в задание засчитываются только **полные завершения**, т.е. ровно те случаи, когда выдаётся медаль.

### Telegram уведомления и отчёты

Файл: `routes/statistics.py`, помощник: `helpers/db_telegram.py`.

Событие: успешное завершение диктанта (`/api/statistics/success`).

1) Уведомление учителю (если включено):

- выбираются учителя через `list_teacher_chat_ids_for_student_success(...)`:
  - ученик состоит в группе, статус `active`
  - `group_students.notify_teacher_on_success = TRUE`
  - у группы есть активный teacher
  - у учителя есть `telegram_chat_id`
  - существует активное assignment для этого `dictation_id` и дня

Ручная отправка отчёта учителю (когда прохождение было вне плана):

- на фронте есть кнопка в модалке успеха «Отправить отчет учителю»
- кнопка показывается **только если** на текущую дату авто-отчёт учителю **не будет отправлен** (нет активного assignment на сегодня), но есть подходящие учителя
- backend:
  - `POST /api/statistics/teacher_report/recipients` — вернуть `auto_would_send` и список учителей, которым *в принципе* можно отправить ручной отчёт
  - `POST /api/statistics/teacher_report/send` — отправить Telegram-отчёт выбранным учителям (с повторной проверкой условий)

Фильтры/проверки для ручного отчёта:

- ученик должен состоять в группе (`group_students.status='active'`, `removed_at IS NULL`)
- требуется согласие ученика на уведомления: `COALESCE(group_students.notify_teacher_on_success, TRUE) = TRUE`
- у учителя должен быть Telegram: `telegram_chat_id IS NOT NULL`
- учитель фильтруется по языку диктанта (язык оригинала):
  - `users.current_learning == dictation.language_code` или
  - `user_learning_languages.language_code == dictation.language_code`

2) Self-report ученику (если включено):

- если у пользователя есть `telegram_chat_id` и включён флаг `telegram_self_reports_enabled`.

В тексте self-report дополнительно выводится:

- количество медалей по диктанту (🥇N)
- схема аудио из `settings_json` (например `Схема аудио: oto - o - ot`)

### Инварианты / важные ограничения (реализация)

- факт выполнения = запись в `history_by_day` с `successes > 0` (медаль). Именно это учитывается как «completion»
- Telegram-уведомление учителю по умолчанию привязано к наличию задания на текущую дату (без задания — авто-уведомления нет)
- ручной отчёт допускается только если на текущую дату авто-уведомления не будет (backend возвращает `409 auto_report_available`, если всё же есть assignment)
- язык для фильтра учителей берётся из `dictations.language_code` (язык оригинала)
- согласие ученика на уведомления хранится в `group_students.notify_teacher_on_success` и применяется и к авто-, и к ручным отчётам

## Запланированная модель (актуальная: упражнения + план + дневная история)

## Роли и терминология

- **User**: существующая учетная запись (email/имя и т.п.).
- **Teacher**: user, который управляет хотя бы одной группой.
- **Student**: user, который состоит в одной или нескольких группах.
- **Group**: группа учеников, принадлежащая одному учителю.
- **Exercise (Упражнение)**: список позиций предложений внутри одного диктанта.
- **Plan task (Задание в плане)**: запись в календаре на конкретную дату, которая ссылается на упражнение и задаёт число повторений.

Одна учётка может быть одновременно teacher и student.

## Модель данных (актуальная)

### 1) `groups`

Минимальные поля:

- `id` (uuid/int)
- `teacher_id` (FK на `users.id`) — владелец/учитель группы
- `title`
- `description` (опционально)
- `created_at`, `updated_at`

Примечание: таблица `group_teachers` (Учитель ↔ Группа) считается устаревшей для текущей модели (один учитель на группу) и подлежит удалению после миграции данных в `groups.teacher_id`.

#### Две стратегии удаления группы

У пользователя есть две причины удалить группу, и для каждой — своя стратегия:

1. **Архивация** (soft-delete) — учебный год закончился, дети ушли.
   - Группа помечается `archived_at = NOW()` и скрывается из активного списка.
   - Все данные (ученики, задания, история) **сохраняются**.
   - Группу можно восстановить (снять `archived_at`).
   - Отчёты по группе остаются доступны.
   - Кнопка в UI: `sticky-notes` (Lucide) — «Архив».
   - В строке архивной группы: `sticky-note-off` — восстановить.

2. **Полное удаление** (hard-delete) — учитель ошибочно создал группу.
   - Группа и все связанные записи удаляются из БД (CASCADE).
   - `DELETE FROM groups WHERE id = ... AND teacher_id = ...`
   - Восстановление невозможно (только из бэкапа).
   - Защита: нельзя удалить личную группу (`is_personal = TRUE`).
   - Перед удалением — модальное окно подтверждения (стилизованное, не `confirm()` браузера).
   - Кнопка в UI: `trash-2` (Lucide) — «Удалить навсегда» — только в тулбаре (над таблицей), не в строке группы.
   - В строке архивной группы — только кнопка восстановления `sticky-note-off`.

Backend: `DELETE /groups/api/group/<group_id>` → [`helpers/db_groups.py`](helpers/db_groups.py) → `delete_group()`.
Frontend: [`static/js/user_profile_modal.js`](static/js/user_profile_modal.js) → `deleteSelectedGroup()` → открывает `#groupDeleteConfirmModal` → `confirmDeleteGroupFromModal()`.
HTML: [`templates/partials/user_profile_modal.html`](templates/partials/user_profile_modal.html) → `#groupDeleteConfirmModal`.

### 2) `group_students` (Группа ↔ Ученик)

Many-to-many: ученик может быть в нескольких группах.

- `group_id`
- `student_user_id`
- `status` (`active`, `pending`, `removed`) — удобно для инвайтов
- `joined_at`, `removed_at`

### 3) `group_invites` (Приглашения/заявки)

Чтобы сделать «учитель приглашает → ученик подтверждает» и не требовать мессенджера внутри сайта.

Используется таблица `group_invites` с режимами:

- `mode = 'link'` — инвайт-ссылка
- `mode = 'email'` — приглашение по email

### 4) `dictation_exercises` (Упражнения диктанта)

Связь: один диктант → много упражнений.

- `id`
- `dictation_id`
- `positions` (int[]) — список позиций предложений (например: `[1,2,3,10,11,12]`)
- `title` (text) — человекочитаемое имя упражнения для UI (по умолчанию формируется из `positions`, например: `s 1,2,6-10`)
- `created_at`, `updated_at`

Инвариант: при создании нового диктанта создаётся минимум одно упражнение `Full` (весь диктант).

### 5) `plan_tasks` (Задания в плане)

Назначение: календарное планирование.

- `id`
- `groups_id` — кому назначено (группа учителя)
- `exercise_id`
- `date_plan` (дата в календаре)
- `repeat_count` (int, по умолчанию 1)
- `created_at`, `updated_at`

Примечание: существующие таблицы `assignments` / `assignments_by_date` относятся к старой структуре и подлежат удалению после переходного периода.

### 6) `history_by_day` (Дневная история активности)

Назначение: дневная статистика активности и выполнения планов.

**Поля таблицы:**

- `id` — SERIAL PRIMARY KEY
- `user_id` — FK → users(id)
- `teacher_id` — кто назначил план:
  - если назначил учитель: `teacher_id = groups.teacher_id`
  - если пользователь назначил сам себе: `teacher_id = user_id`
- `dictation_language_code` — код языка диктанта
- `dictation_id` — FK → dictations(id)
- `positions` — `INTEGER[]` — выбранные позиции предложений (пустой массив = весь диктант)
- `date_plan` — дата задания/плана, или дата старта (если прохождение без плана)
- `date_fact` — дата фактической активности/завершения (в таймзоне пользователя)
- `date_start` — дата старта диктанта (для расчёта длительности)
- `perfect_count` — количество звёзд (perfect) за день
- `corrected_count` — количество полузвёзд (corrected) за день
- `audio_count` — количество микрофонов (audio) за день
- `lead_time` — суммарное время выполнения в ms
- `mistake_count` — количество ошибок за день
- `monenumber_of_characters` — количество набранных символов за день
- `simbols` — (устаревшее, дубль `monenumber_of_characters`)
- `successes` — количество полных завершений диктанта за день
- `activity_count` — количество действий (perfect + corrected + audio) за день
- `money_dt_count` — сколько монет заработано (dt) за день
- `money_kt_count` — сколько монет потрачено (kt) за день
- `created_at`, `updated_at` (UTC)

Уникальность строки истории: `(user_id, teacher_id, dictation_id, positions, date_plan, date_fact)`.

Правило: если пользователь в один `date_fact` закрывает упражнение за разные `date_plan` (например, «за вчера» и «за сегодня»), это две отдельные строки истории.

**Как данные попадают в `history_by_day` (цепочка):**

Все данные (звёзды, полузвёзды, аудио, success) отправляются через **единый endpoint** `POST /api/statistics/success` и **единую очередь** в IndexedDB с одним hbd-ключом.

### Единый endpoint: `POST /api/statistics/success`

Назначение: сохранить все данные диктанта — активность (звёзды, полузвёзды, микрофоны) и успешное завершение.

**Клиент → Сервер:**
- Клиент вызывает `OutboxBatcher.enqueueActivity()` при каждом действии (звезда, полузвезда, аудио)
- `OutboxBatcher` накапливает данные в IndexedDB (store `outbox`, ключ: `hbd:${userId}:${dictationId}:${positions}:${datePlan}:${dateFact}:${dateStart}`)
- При каждом вызове `enqueueActivity()` данные **мержатся** (суммируются дельты) в существующую запись по тому же ключу
- Отправляется `fetch POST /api/statistics/success` с payload:
  ```json
  {
    "dictation_id": 123,
    "date": "2026-07-24",
    "date_start": "2026-07-24T10:22:48",
    "date_plan": "2026-07-24",
    "perfect_count": 1,
    "corrected_count": 0,
    "audio_count": 0,
    "money_earned": 3,
    "mistake_count": 2,
    "monenumber_of_characters": 58,
    "lead_time_ms": 45000,
    "attempts_total": 0,
    "completion_count": 0,
    "success_number": 0,
    "dictation_language_code": "en",
    "selected_sentence_positions": null,
    "source_group_id": null
  }
  ```

**Сервер (`routes/statistics.py`):**
- `POST /api/statistics/success` → функция `save_success()`
- Вызывает `add_success()` из `helpers/db_history.py`
- `add_success()`:
  1. Начисляет деньги: `INSERT INTO user_money_ledger (user_id, dt, ...)` за каждое действие
  2. Вызывает `_upsert_history_by_day()` — UPSERT в `history_by_day` со всеми дельтами

### Внутренняя функция `_upsert_history_by_day()`

Находится в `helpers/db_history.py`. Это UPSERT:
```sql
INSERT INTO history_by_day (user_id, teacher_id, dictation_language_code, dictation_id, positions, date_plan, date_fact, date_start, perfect_count, corrected_count, audio_count, lead_time, mistake_count, monenumber_of_characters, successes, activity_count, money_dt_count, ...)
VALUES (...)
ON CONFLICT (user_id, teacher_id, dictation_id, positions, date_plan, date_fact)
DO UPDATE SET
    perfect_count = COALESCE(history_by_day.perfect_count, 0) + EXCLUDED.perfect_count,
    corrected_count = COALESCE(history_by_day.corrected_count, 0) + EXCLUDED.corrected_count,
    audio_count = COALESCE(history_by_day.audio_count, 0) + EXCLUDED.audio_count,
    lead_time = COALESCE(history_by_day.lead_time, 0) + EXCLUDED.lead_time,
    mistake_count = COALESCE(history_by_day.mistake_count, 0) + EXCLUDED.mistake_count,
    monenumber_of_characters = COALESCE(history_by_day.monenumber_of_characters, 0) + EXCLUDED.monenumber_of_characters,
    successes = COALESCE(history_by_day.successes, 0) + EXCLUDED.successes,
    activity_count = COALESCE(history_by_day.activity_count, 0) + EXCLUDED.activity_count,
    money_dt_count = COALESCE(history_by_day.money_dt_count, 0) + EXCLUDED.money_dt_count,
    ...
```
Если `successes_delta != 0`, дополнительно вызывается `_recalc_number_successes()` — пересчитывает `number_successes` (порядковый номер успеха) во всех строках `history_by_day` для данного `(user_id, dictation_id, positions)`.

### Клиентский модуль `OutboxBatcher` (`static/js/outbox_batcher.js`)

**Единая очередь в IndexedDB (store `outbox`):**
- Единственный тип записей с ключом `hbd:${userId}:${dictationId}:${positions}:${datePlan}:${dateFact}:${dateStart}`
- Ключ соответствует уникальному ключу `history_by_day` (см. выше)
- Записи накапливаются (мержатся при повторном вызове `enqueueActivity()`): суммируются все дельты

**Структура записи в IndexedDB:**
```javascript
{
  key: "hbd:1:70:[]:2026-07-24:2026-07-24:2026-07-24T10:22:48",
  payload: {
    userId, dictationId, positions, datePlan, dateFact, dateStart,
    dictationLanguageCode, sourceGroupId,
    perfect_count, corrected_count, audio_count,
    money_earned, mistake_count, monenumber_of_characters,
    lead_time_ms_total, attempts_total,
    successes, success_number,
    // synced_* — дельта-трекинг (что уже отправлено на сервер)
    synced_perfect_count, synced_corrected_count, synced_audio_count,
    synced_money_earned, synced_mistake_count, synced_monenumber_of_characters,
    synced_lead_time_ms_total, synced_attempts_total, synced_successes
  }
}
```

**Дельта-трекинг:** Поля `synced_*` хранят последнее отправленное значение. При `_flushOutbox()` вычисляется разница между текущим значением и synced — это дельта, которая отправляется на сервер. После успешной отправки synced обновляется.

**Режим отправки:**
- Единый таймер `BATCH_INTERVAL_MS` (по умолчанию 300000 мс = 5 минут для отладки, 1800000 = 30 минут в проде)
- При срабатывании таймера отправляются **все** накопленные записи
- После успешной отправки synced-поля обновляются, запись НЕ удаляется (остаётся для последующих дельт)

**Триггеры отправки:**
- Таймер (каждые `BATCH_INTERVAL_MS`)
- Событие `window.online` (появилась сеть)
- Явный вызов `OutboxBatcher.flushAll()` (при завершении диктанта)
- Сигнал от Service Worker (`syncOutbox`)

**Отображение в UI:**
- Статус-бар (`sw_status_bar.js`) показывает `queue: N (M:M:S)` где N — количество записей в IndexedDB, а M:M:S — время до следующей отправки

### Поток данных: от действия пользователя до БД

1. **Пользователь нажимает Enter** (проверка текста) или **записывает аудио**
2. **`dictation_modal.js`** → `checkText()` или `onRecognitionComplete`:
   - Вычисляет награду (монеты) через `getPricingValue()`
   - Определяет `typeActivity`: `'perfect'` (звезда), `'corrected'` (полузвезда), `'audio'` (микрофон)
   - Проверяет, завершён ли диктант полностью через `_isDictationFullyCompleted(session)`
   - Если да — устанавливает `compCount=1` и `succNumber = completionCount + 1`
   - Вызывает `handleActivity(type, st, key, session, moneyCount, mistakeCount, charsCount, compCount, succNumber)`
3. **`handleActivity()`** → вызывает `ob.enqueueActivity({...})`
4. **`OutboxBatcher.enqueueActivity()`**:
   - Строит hbd-ключ
   - Читает существующую запись из IndexedDB (или создаёт новую)
   - Суммирует дельты: `perfect_count += 1`, `money_earned += reward`, `mistake_count += mistakes`, и т.д.
   - Если `compCount > 0`: `successes += compCount`, `success_number = succNumber`
   - Сохраняет запись в IndexedDB
   - Если `compCount > 0`: вызывает `flushAll()` для немедленной отправки
5. **`OutboxBatcher._flushOutbox()`**:
   - Читает все записи из IndexedDB
   - Для каждой вычисляет дельты: `perfectDelta = current - synced`
   - Отправляет `fetch POST /api/statistics/success` с дельтами
   - После успеха обновляет synced-поля в IndexedDB
6. **Сервер `save_success()`** → `add_success()`:
   - Начисляет деньги в `user_money_ledger`
   - Вызывает `_upsert_history_by_day()` с дельтами
   - Если `successes_delta > 0`: вызывает `_recalc_number_successes()` и `_update_history_current_successes_only()`

### Деньги: `user_money_ledger` и баланс

**Начисление (dt):**
- Происходит в `add_activity_bulk()` при каждом действии пользователя (звезда/полузвезда/микрофон)
- `INSERT INTO user_money_ledger (user_id, dt, kt, description) VALUES (userId, moneyCount, 0, 'dictation_activity:{dictationId}')`
- Деньги **не начисляются** в `save_success()` — это устраняет дублирование

**Списание (kt):**
- Через API `POST /api/statistics/money/spend` (покупка полузвезды или микрофона)
- `INSERT INTO user_money_ledger (user_id, kt, reason, dictation_id, positions)`

**Баланс:**
- Рассчитывается на лету: `SELECT COALESCE(SUM(dt), 0) - COALESCE(SUM(kt), 0) AS balance FROM user_money_ledger WHERE user_id = %s`
- Поле `users.money_balance` **удалено** (миграция `add_history_by_day_activity_money_columns_and_drop_user_balance.sql`)
- API возвращает `money_balance` в JSON-ответе (вычисленное значение, ключ сохранён для совместимости)

### Текущее состояние (известные проблемы)

1. ~~**OutboxBatcher не интегрирован в `dictation_modal.js`** — модуль загружается, но его методы `enqueueActivity()` и `enqueueSuccess()` нигде не вызываются. Данные не попадают в `history_by_day`.~~ **ИСПРАВЛЕНО**: вызовы добавлены в `dictation_modal.js`.
2. ~~**Не хватает вызовов** при начислении звезды/полузвезды/активности — нужно добавить `OutboxBatcher.enqueueActivity()` в момент начисления награды.~~ **ИСПРАВЛЕНО**.
3. ~~**Не хватает вызова** `OutboxBatcher.enqueueSuccess()` при завершении диктанта — нужно добавить в `showCompletionModal()`.~~ **ИСПРАВЛЕНО**.
4. ~~**Дублирование данных в `history_by_day`**: `add_success()` повторно обновляла `perfect_count`, `corrected_count`, `audio_count`, которые уже были обновлены в `add_activity_bulk()`.~~ **ИСПРАВЛЕНО**: `add_success()` теперь обновляет только `successes_delta=1`, `mistake_delta`, `monenumber_of_characters_delta`, `lead_time_delta`. Все остальные счётчики двигаются только в `add_activity_bulk()`.
5. ~~**`money_balance` в `users` дублирует данные из `user_money_ledger`**.~~ **ИСПРАВЛЕНО**: поле удалено, баланс считается из `user_money_ledger` на лету.
6. ~~**Деньги начислялись дважды**: в `add_activity_bulk()` и в `save_success()`.~~ **ИСПРАВЛЕНО**: начисление только в `add_activity_bulk()`.

### Распознавание речи: выбор режима (speech_recognition_mode)

**Архитектурное решение (рефакторинг):** выбор режима распознавания речи — это **настройка устройства/браузера**, а не настройка пользователя. Поэтому:

- Режим **не хранится на сервере** (не в `users.settings_json`).
- Режим **не сохраняется через `saveProfile()`**.
- Режим хранится в **`localStorage`** под ключом `dictafan_speech_rec_mode`.
- Радио-кнопки выбора режима **убраны из профиля** (из таблицы моделей в `user_profile_modal.html`).
- Радио-кнопки **перенесены в модальное окно настроек диктанта** (`#audioSettingsModal` внутри `#dictationModal`).

#### Доступные режимы (5 значений)

| Значение | Иконка lucide | Описание |
|----------|---------------|----------|
| `route` | `route` | Google Сервіси (WebSpeech API браузера) |
| `server` | `server` | На сервері Whisper Tiny |
| `route-off\|tiny` | `house-heart` | На пристрої Whisper Tiny · 75 MB |
| `route-off\|base` | `house` | На пристрої Whisper Base · 145 MB |
| `route-off\|small` | `house-plus` | На пристрої Whisper Small · 480 MB |

Режимы с префиксом `route-off|` — это device-режимы (локальный Whisper через Transformers.js). Они **отображаются только если соответствующая модель скачана** в кеш браузера.

#### Где живёт код

1. **`templates/partials/dictation_modal.html`** — HTML радио-кнопок внутри `#audioSettingsModal`:
   - 5 `<label>` с `<input type="radio" name="modal-speechRecMode">`
   - Device-режимы имеют класс `dictation-settings-speech-rec-mode-device` и атрибуты `data-role="device-mode-tiny/base/small"`
   - Видимость device-режимов управляется через JS (скрыты, если модель не скачана)

2. **`static/css/dictation_modal.css`** — стили для карточки `.dictation-settings-card-speech-rec`:
   - `grid-area: speech-rec` в `dictation-settings-grid`
   - Кастомные радио-кнопки с иконками lucide
   - Device-режимы с отступом слева (вложенность)

3. **`static/js/dictation_modal.js`** — логика чтения/записи в `initAudioSettingsModal()`:
   - `LS_SPEECH_REC_MODE_KEY = 'dictafan_speech_rec_mode'`
   - `_readSpeechRecModeFromLS()` — читает из localStorage, fallback `'route'`
   - `_writeSpeechRecModeToLS(mode)` — пишет в localStorage
   - `_getDownloadedWhisperSizes()` — читает `dictafan_downloaded_models_v2` из localStorage
   - `_updateDeviceModeVisibility()` — показывает/скрывает device-радио
   - `applySpeechRecModeToUI()` — устанавливает радио из localStorage
   - При сохранении настроек (`__dictafanSaveAudioSettingsModal`) режим пишется в localStorage
   - При открытии диктанта (`applyToUI`) — режим читается из localStorage

4. **`static/js/dictation_modal.js`** — в `ensureSpeechPanel()`:
   - Режим читается из `localStorage.getItem('dictafan_speech_rec_mode')`
   - Нормализация: `route-off|tiny` → `route-off` (для `speech_recognition_unified.js`)

5. **`static/js/dictation_runtime/speech_recognition_panel.js`** — в `_updateRecognitionModeIcon(mode)`:
   - Маппинг 5 режимов на 5 иконок lucide
   - Для `route-off` читает `dictafan_speech_rec_mode` из localStorage, чтобы определить, какая именно device-модель выбрана

6. **`static/js/audio_settings_panel.js`** — методы `getSpeechRecognitionIcon(mode)` и `getSpeechRecognitionLabel(mode)`:
   - Используются в профиле для отображения текущего режима (только иконка + текст, без радио)

#### Что было удалено из профиля

- `templates/partials/user_profile_modal.html` — удалены все `<tr>` с радио-кнопками (`data-method="route"`, `data-method="route-server"`, `data-method="route-off"`)
- `static/js/language_selector.js`:
  - `hydrateModelsCentricUI()` — удалена вся логика радио (рендеринг, `__PROFILE_SPEECH_REC_MODE`, `anyChecked`)
  - `bindModelsCentricEvents()` — удалены обработчики `change` для `models-centric-method-radio` и `click` для `models-centric-radio-btn`
- `static/js/user_profile_modal.js`:
  - Удалена функция `getProfileSpeechRecognitionModeFromModelsTable()`
  - Удалён `speech_recognition_mode` из: `getAudioSettingsFromDom()`, `checkForChanges()`, `getCurrentFormValues()`, `loadUserData()`, `saveProfile()` (hasAudioChanges, settings_json, updateData, originalData, UM.userData, audioSettingsPanel.setSettings)

#### Защита от кеш-коллизий

Если пользователь скачал модель, выбрал device-режим, а затем кеш был очищен (или сайт открыт в другом браузере/устройстве):

1. `_updateDeviceModeVisibility()` проверяет `dictafan_downloaded_models_v2` в localStorage
2. Если device-модели нет в кеше — соответствующие радио скрываются
3. `applySpeechRecModeToUI()` проверяет, доступен ли выбранный режим; если нет — сбрасывает на `'route'`
4. В `ensureSpeechPanel()` — если режим `route-off`, но модель не найдена — панель не создаётся (безопасное падение)

#### Иконки возле кнопки записи

Иконка режима распознавания отображается:
- В панели диктанта (рядом с кнопкой записи) — через `_updateRecognitionModeIcon()` в `speech_recognition_panel.js`
- В профиле (в карточке аудионастроек) — через `getSpeechRecognitionIcon()` в `audio_settings_panel.js`

Иконки обновляются при каждом открытии диктанта (читают текущее значение из localStorage).

## Механизм наполнения группы (UX)

### Рекомендуемый основной сценарий: инвайт-ссылка

Терминология (чтобы не путаться):

- **Инвайт-ссылка (multi-use)** — одна и та же ссылка может быть использована несколькими учениками (как “код группы”). Это удобно, когда у учеников ещё нет аккаунтов: учитель один раз рассылает ссылку, ученики регистрируются/логинятся и подтверждают вступление.
- **Персональный инвайт (one-to-one)** — приглашение адресовано конкретному `student_user_id` и требует подтверждения учеником (видно в интерфейсе ученика как входящее приглашение). Это удобно, когда у всех уже есть аккаунты.

1) Учитель создаёт группу.
2) Внутри группы жмёт `Пригласить`.
3) Система генерирует ссылку вида:

`/join-group/<token>`

4) Учитель отправляет ссылку где угодно (Telegram/WhatsApp/Viber/email).
5) Ученик открывает ссылку:
   - если не залогинен: логин/регистрация
   - затем видит экран подтверждения: «Учитель X приглашает в группу Y» + кнопка `Принять`.
6) После принятия ученик появляется в списке группы.

Плюсы:

- учителю не нужно искать пользователей заранее
- не раскрываются номера телефонов
- не нужен внутренний чат

### Доп. сценарий (реализовано): «Новый ученик (email)» (email-инвайт)

Задача: дать учителю **второй параллельный способ** приглашения ученика, когда учитель знает email ученика. При этом:

- инвайт-ссылка остаётся основным массовым сценарием
- email-инвайт — это one-to-one приглашение, адресованное конкретному email
- на MVP **не отправляем письмо автоматически**; создаём запись инвайта в БД, а ученик видит её после логина

#### Данные / БД

Используется таблица `group_invites` с режимами:

- `mode = 'link'` — инвайт-ссылка
- `mode = 'email'` — приглашение по email

Для `mode = 'email'` используются поля:

- `target_email`
- `accepted_at`, `declined_at`
- `accepted_by_student_user_id`

#### API

- Teacher создаёт приглашение:
  - `POST /groups/api/group/<group_id>/invite/email` `{ email }`
- Student видит входящие:
  - `GET /groups/api/my-invites`
- Student принимает/отклоняет:
  - `POST /groups/api/invite/<invite_id>/accept`
  - `POST /groups/api/invite/<invite_id>/decline`

#### UX (учитель)

1) Учитель выбирает группу.
2) В секции «Ученики» жмёт `Новый ученик (email)`.
3) Вводит email ученика.
4) Система создаёт `group_invites(mode='email', target_email=...)`.

#### UX (ученик)

1) Ученик логинится/регистрируется.
2) Система запрашивает `GET /groups/api/my-invites`.
3) Если есть pending приглашение — показывает модалку:
   - «Учитель X приглашает тебя в группу Y»
   - кнопки `Принять` / `Отклонить`
4) При `Принять` — вызываем `/accept` и добавляем ученика в `group_students`.
5) При `Отклонить` — вызываем `/decline`.

### Доп. сценарий: поиск пользователей учителем (если нужно)

Для продвинутого UX можно добавить «найти по email/имени» и отправить direct invite.

Важная оговорка по приватности:

- показывать учителю email полностью только если пользователь сам разрешил (или если это условие продукта)
- иначе показывать маску (например `t***@gmail.com`) и подтверждать через инвайт

## Интерфейс управления группой (Teacher)

### Список групп

- создать группу
- открыть группу
- удалять группу

### Страница группы

- название/описание (редактирование)
- учитель группы
- список учеников:
  - статус (active/pending)
  - удалить из группы
  - отметка получать от ученика отчеты в телеграм
- кнопка `Пригласить` (инвайт-ссылка + управление токеном)

### Модальное окно План
- текущая дата
- нопки вперед/назад и кнопка "текущая дата"
- Список заданий на выбранную дату
 - дата
 - название 
 - ковер 
 - кнопки удалить/выполнить
 - отображение прогресса выполнения



### Модальное окно Список заданий
- вкладка `Задания`:
  - Список заданий 
    - даты действия задания
    - ковер 
    - описание 
    - кнопка реадктирования задания
    - кнопка показать подробно по пользователям
       - список пользователей и их прогреса


## Назначение задания (Teacher)

Поток:

1) Teacher выбирает группу (или конкретных учеников).
2) Выбирает диктант из глобальной библиотеки.
3) Настраивает правило:
   - «N раз в день в указанные даты»
4) Публикует.

Важно: назначение должно ссылаться на **глобальный dictation_id**, без копирования диктанта.

## Интерфейс заданий (Student)

### “Мои задания”

Списки:

- активные (с дедлайном и прогрессом)
- выполненные
- просроченные

Карточка задания:

- группа + учитель
- диктант (название)

- прогресс (например: `3/5`)
- статус (успевает/просрочено)
- CTA: `Пройти диктант` (переход на страницу диктанта)

### Как привязать попытку к заданию

Правило (простое и надёжное): попытки считаются автоматически, если:

- `dictation_id` совпадает
- время попытки `attempt_at` попадает в окно задания (`start_at`..`due_at`)

Решение для “скелета” (MVP):

- Попытка засчитывается в прогресс задания только если выполнены **критерии получения медали** (т.е. «законченный диктант»: все звёзды + всё аудио).

Расширение (позже): учитель может выбирать/настраивать критерий «какая попытка считается выполнением»:

- по медали (текущий критерий «законченный диктант»: все звёзды + всё аудио)
- порог по звёздам/полузвёздам (и настройка количества)
- порог по количеству повторов аудио

Дополнительно можно позволить ученику “выполнять” конкретное задание явным выбором, но это усложнение.

## Уведомления учителю (без раскрытия номеров)

Цель: учитель получает итог выполнения, но:

- ученики не видят номер учителя
- учитель не видит номера учеников

Рекомендуемая архитектура уведомлений:

### 1) Telegram Bot (первый кандидат)

- учитель привязывает свой Telegram через deep link `/start <token>`
- в системе хранится `teacher_user_id -> telegram_chat_id`
- при событии (completion) сервер шлёт сообщение в Telegram

Плюсы:

- нет обмена телефонами
- быстро и привычно

### 2) WhatsApp/Viber

Почти всегда требуют внешний провайдер (официальный API/платный шлюз).

Рекомендация: сделать это как расширение позже, через единый интерфейс `NotificationProvider`.

События для уведомлений:

- `assignment_completed`
- (опционально) `daily_digest` (сводка за день)

## Отчёты (Teacher)

Нужно два уровня:

### 1) По группе

- список заданий
- по каждому заданию: прогресс по ученикам (сколько выполнено/в процессе/просрочено)

### 2) По ученику

- выполненные задания
- дисциплина: сколько дней пропущено в `per_day`
- качество: звёзды/полузвёзды/лучший результат (используем то, что уже есть в истории)

## Открытые вопросы (нужно решить до реализации)

- Инвайт-ссылка (multi-use): нужен ли лимит использований (например до 30) и срок жизни?
- Нужны ли персональные инвайты (one-to-one) как обязательный механизм или как дополнительный?
- Может ли ученик сам подать заявку в группу, или только через инвайт?
- Нужны ли co-teacher прямо сейчас?
- Какая минимальная метрика «успешного прохождения» засчитывается в задание: любое прохождение (MVP) или по порогу качества?
- Дедлайн: строго по времени (`due_at`) или “до конца дня по локали”?
- Для правил “раз в день”: считаем день по **локальному дню ученика**.

# Приложение: карта файлов (минимальная)

- Backend:
  - [`routes/dictation_editor.py`](routes/dictation_editor.py) — API редактора: save, translate, generate_audio, cut-audio, split-audio, reserve_id
  - [`routes/dictation.py`](routes/dictation.py) — API диктанта: получение данных, аудио, транскрибация
  - [`helpers/db_dictations.py`](helpers/db_dictations.py) — CRUD для диктантов/предложений
  - [`helpers/b2_storage.py`](helpers/b2_storage.py) — B2 storage (может быть удалён в будущем)
- Frontend (редактор):
  - [`static/js/dictation_editor_modal.js`](static/js/dictation_editor_modal.js) — редактор диктанта в модальном окне (замена `script_dictation_editor.js`)
  - [`static/js/audio_manager.js`](static/js/audio_manager.js) — управление аудио (воспроизведение, кэш, B2 upload)
  - [`static/js/cover_manager.js`](static/js/cover_manager.js) — crop обложек
  - [`static/js/idb_manager.js`](static/js/idb_manager.js) — IndexedDB abstraction
- Frontend (desktop):
  - [`static/js/desktop.js`](static/js/desktop.js) — рабочий стол (замена `private_library.js`)
  - [`static/js/book_modal.js`](static/js/book_modal.js) — модалка книги
  - [`static/js/dictation_modal.js`](static/js/dictation_modal.js) — модалка выполнения диктанта
- Service Worker:
  - [`sw.js`](sw.js)
