# План удаления таблицы dictation_records

## Анализ

**`history_current`** — кэш-таблица:
- `number_successes` — количество успешных завершений (агрегат из `history_by_day`)
- `mistake_count`, `lead_time`, `id_record` — данные рекорда
- `id_record` → ссылка на `dictation_records.id`

**`dictation_records`** — полные данные рекорда:
- `perfect_count`, `corrected_count`, `audio_count`, `activity_count`
- `lead_time`, `mistake_count`, `monenumber_of_characters`, `money_dt_count`
- `date_of_victory`

**Вывод:** Таблицы дублируются. `dictation_records` хранит те же поля рекорда + детальные. При пересчёте `history_current` из `history_by_day` — LEFT JOIN с `dictation_records` создаёт лишнюю зависимость.

**Решение:** Удалить `dictation_records`, убрать `id_record` из `history_current`. Поля рекорда (`mistake_count`, `lead_time`) остаются в `history_current` и заполняются при прохождении диктанта через `check_and_save_dictation_record()`. При пересчёте из `history_by_day` поля рекорда не заполняются (будут заполнены при следующем прохождении).

## План

### Шаг 1: Обновить серверный код (helpers/db_history.py)

**a) `recalc_history_current_for_user()`** — убрать LEFT JOIN с `dictation_records`:
- Убрать `LEFT JOIN dictation_records dr ON ...`
- Убрать поля `mistake_count`, `lead_time`, `id_record` из SELECT (оставить NULL или 0)
- Эти поля будут заполнены при следующем прохождении диктанта

**b) `check_and_save_dictation_record()`** — убрать запись в `dictation_records`:
- Убрать `INSERT INTO dictation_records ...`
- Писать только в `history_current` через `_upsert_history_current()`
- Убрать `id_record` из вызова `_upsert_history_current()`

**c) `_upsert_history_current()`** — убрать параметр `id_record`:
- Убрать `id_record` из INSERT/UPDATE
- Оставить только `mistake_count`, `lead_time`, `number_successes`

**d) `get_dictation_record()`** — читать из `history_current` без JOIN:
- Убрать чтение `id_record` из `history_current`
- Убрать второй запрос в `dictation_records`
- Вернуть данные прямо из `history_current` (mistake_count, lead_time)

**e) `get_all_dictation_records()`** — читать из `history_current` без JOIN:
- Убрать JOIN с `dictation_records`
- Читать `dictation_id`, `positions`, `mistake_count`, `lead_time` из `history_current`

### Шаг 2: Обновить API (routes/statistics.py)

- `api_get_dictation_record()` — без изменений (вызывает `get_dictation_record()`)
- `api_save_dictation_record()` — без изменений (вызывает `check_and_save_dictation_record()`)
- `api_get_all_dictation_records()` — без изменений (вызывает `get_all_dictation_records()`)
- Убрать импорты `get_dictation_record`, `get_all_dictation_records` если не используются

### Шаг 3: Обновить клиентский код

**a) `static/js/outbox_batcher.js`:**
- `_checkRecordLocally()` — убрать проверку рекорда (она была для `dictation_records`)
- `_enqueueRecord()` — убрать отправку рекорда на сервер
- Убрать загрузку `/api/statistics/dictation-records/all`

**b) `static/js/dictation_modal.js`:**
- Убрать слушатель события `dictation-record`
- Убрать показ уведомления о новом рекорде

### Шаг 4: Миграция БД

```sql
-- 1) Удаляем колонку id_record из history_current
ALTER TABLE history_current DROP COLUMN IF EXISTS id_record;

-- 2) Удаляем таблицу dictation_records
DROP TABLE IF EXISTS dictation_records CASCADE;
```

### Риски

1. **Потеря истории рекордов**: После удаления `dictation_records` пропадёт история о том, какой был рекорд (perfect_count, corrected_count и т.д.). В `history_current` останутся только `mistake_count` и `lead_time`. Если нужны детальные данные рекорда — их можно получить из `history_by_day` (агрегация по `dictation_id + positions`).

2. **Клиентский кэш**: В IndexedDB у клиентов могут быть старые структуры. После деплоя нужно очистить кэш или обновить service worker.

3. **Обратная совместимость API**: Endpoint `/api/statistics/dictation-record` после изменений будет возвращать только `mistake_count` и `lead_time` (без `perfect_count` и т.д.). Клиенты должны быть готовы к этому.
