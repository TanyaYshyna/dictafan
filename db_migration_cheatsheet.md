# DB / Migration cheatsheet (DictaFan)

## 0) One-time setup (на новом компе)

### Виртуальное окружение + зависимости

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### `.env`

Пример `.env`:

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DBNAME
```

Проверка, что переменная видна:

```bash
python3 -c "import os; print(os.getenv('DATABASE_URL'))"
```

---

## 1) Подключение к БД через raw `psql`

### Быстрый коннект (как ты делала)

```bash
PGPASSWORD='********' psql -h trolley.proxy.rlwy.net -U postgres -p 32906 -d DBNAME
```

Если хочешь не светить пароль в истории shell — лучше:

```bash
psql "postgresql://postgres:********@trolley.proxy.rlwy.net:32906/DBNAME"
```

### Полезные команды внутри `psql`

```sql
\dt                 -- список таблиц
\d dictations        -- структура таблицы
\d dictation_sentences
\x on               -- удобный вывод (expanded)

SELECT now();
SELECT count(*) FROM dictations;
SELECT count(*) FROM dictation_sentences;
```

---

## 2) Очистка таблиц (осторожно)

### Вариант A (самый быстрый): TRUNCATE

```sql
BEGIN;

TRUNCATE TABLE dictation_sentences RESTART IDENTITY;
TRUNCATE TABLE dictations RESTART IDENTITY;

COMMIT;
```

Если ругается на внешние ключи:

```sql
BEGIN;
TRUNCATE TABLE dictations RESTART IDENTITY CASCADE;
COMMIT;
```

### Вариант B (гибко): DELETE

```sql
BEGIN;
DELETE FROM dictation_sentences;
DELETE FROM dictations;
COMMIT;
```

### Безопасная проверка перед COMMIT

```sql
BEGIN;
TRUNCATE TABLE dictations RESTART IDENTITY CASCADE;
ROLLBACK;  -- если всё ок, повторить и сделать COMMIT
```

---

## 3) Миграции в этом проекте (только SQL)

Правило простое:

- **Истина — SQL файл миграции** (например `migrations/add_*.sql`)
- Миграцию применяешь либо:
  - вручную через `psql`, либо
  - через маленький python-скрипт (в проекте уже есть `migrations/run_*.py`)

В этом режиме нет автоматического учёта, какие миграции уже применялись.

#### Как работать с двумя базами (dev/prod) при одном virtualenv

Виртуальное окружение **одно** — это нормально. Баз может быть сколько угодно.
Ты просто переключаешь `DATABASE_URL` перед запуском.

Вариант 1 (самый простой): запускать команду с `DATABASE_URL` прямо в строке

```bash
DATABASE_URL="postgresql://...DEV..." python3 migrations/run_migration.py
DATABASE_URL="postgresql://...PROD..." python3 migrations/run_migration.py
```

Вариант 2: иметь 2 файла окружения и подгружать нужный

```bash
cp .env .env.dev
cp .env .env.prod

set -a; source .env.dev; set +a; python3 migrations/run_migration.py
set -a; source .env.prod; set +a; python3 migrations/run_migration.py
```

#### Как применить SQL миграцию через `psql`

1) Подключилась к нужной базе
2) Выполнила SQL

Если миграция у тебя лежит в файле, можно так:

```bash
PGPASSWORD='********' psql -h HOST -U postgres -p PORT -d DBNAME -f migrations/NAME.sql
```

### Канал 1: Alembic (основной, «правильный»)

- Конфиг: `alembic.ini`
- Env: `migrations/env.py` (берёт `DATABASE_URL` из `.env`)
- Ревизии: `migrations/versions/*.py`

#### Применить все миграции

```bash
alembic upgrade head
```

#### Посмотреть текущую версию и историю

```bash
alembic current
alembic history
```

#### Откатить последнюю

```bash
alembic downgrade -1
```

#### Создать новую миграцию

Автогенерация в этом проекте не настроена (`target_metadata = None`), поэтому делаем вручную:

```bash
alembic revision -m "add tr_* columns to dictations"
```

Дальше открываешь созданный файл в `migrations/versions/` и пишешь `op.add_column(...)`, `op.create_index(...)` и т.д.

---

### Канал 2: Python/SQL scripts (старый удобный способ «просто выполнить SQL»)

См. `docs/how_to_run_migration.md` и файлы в `migrations/`:

- `migrations/run_migration.py`
- `migrations/run_add_settings_json_migration.py`
- и т.п.

Запуск:

```bash
python3 migrations/run_migration.py
```

Этот способ НЕ является alembic-версией, он просто выполняет SQL через Python (по `DATABASE_URL`).

---

## 4) Рекомендуемый порядок: dev → prod

1) Сначала прогоняешь миграцию на dev DB (с dev `DATABASE_URL`)
2) Проверяешь через `psql` что колонки/индексы появились
3) Только потом переключаешь `.env` на prod `DATABASE_URL` и делаешь `alembic upgrade head`

---

## 5) Мини-памятка: где что лежит

- `docs/how_to_run_migration.md` — старые инструкции
- `migrations/versions/` — alembic миграции
- `migrations/*.sql` и `migrations/run_*.py` — «ручные» миграции
- `migrations/env.py` — подтягивает `DATABASE_URL` из `.env`
