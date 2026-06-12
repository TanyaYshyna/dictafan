# План: Видалення флагу `telegram_enabled` (глобальний "отримувати сповіщення від учнів у Telegram")

## Проблема

Зараз є два рівні контролю Telegram-сповіщень для вчителя:

1. **Глобальний** (`users.telegram_enabled`) — вчитель вмикає "отримувати сповіщення від учнів у Telegram" у профілі
2. **Пер-учень** (`group_students.notify_teacher_on_success`) — вчитель вмикає сповіщення для конкретного учня в секції груп

Це дублювання логіки. Якщо вчитель підключив Telegram (має `telegram_chat_id`), то він вже має намір отримувати сповіщення. Рішення про те, від кого саме отримувати, приймається на рівні кожного учня через `notify_teacher_on_success`.

## Що змінюється

- **Видаляється** глобальний флаг `telegram_enabled` з усієї кодової бази
- **Залишається** пер-учнівський флаг `group_students.notify_teacher_on_success`
- **Залишається** `telegram_self_reports_enabled` (самозвіти) — це окрема функціональність
- **Залишається** `telegram_chat_id` — він визначає, чи підключений Telegram взагалі

## Файли для змін (8 файлів)

### 1. HTML — Видалити кнопку-перемикач

#### `templates/partials/user_profile_modal.html` (рядки 322-329)
Видалити блок:
```html
<div class="form-row telegram-toggle-row">
    <div class="telegram-toggle-label">
        <button type="button" id="telegramEnabledToggleBtn" ...>
            <i data-lucide="circle"></i>
        </button>
        <span>{{ t('profile.telegram.teacher_notifications.label') }}</span>
    </div>
</div>
```

> `templates/user_profile_jwt.html` — НЕ чіпаємо, файл буде видалено окремим завданням.

### 2. JS — Видалити логіку перемикача

#### `static/js/script_user_profile.js`

**a) `renderTelegramSection()` (рядки 814-1077)**
- Видалити рядок 818: `const enabledToggleBtn = document.getElementById('telegramEnabledToggleBtn');`
- Видалити рядок 832: `const enabled = Boolean(user.telegram_enabled);`
- Видалити блок коду, який встановлює стан `enabledToggleBtn` (рядки ~835-870, де використовується `_setBtnState(enabledToggleBtn, enabled)`)
- Видалити обробник `enabledToggleBtn.onclick` (рядки ~996-1020), який викликає `POST /user/api/telegram/enabled`
- Видалити рядки 1007-1009, де оновлюється `UM.userData.telegram_enabled`

**b) `renderStudentsTable()` (рядки 1079-1219)**
- Залишити без змін — це пер-учнівський флаг `notify_teacher_on_success`, який ми зберігаємо

### 3. CSS — Видалити стилі для кнопки

#### `static/css/user_profile_modal.css`
- Знайти і видалити стилі для `#telegramEnabledToggleBtn` (якщо є окремі)

### 4. Backend — Видалити ендпоінт та функції

#### `routes/user_routes.py`

**a) Видалити ендпоінт (рядки 759-774):**
```python
@user_bp.route('/api/telegram/enabled', methods=['POST'])
@jwt_required()
def api_telegram_set_enabled():
    ...
```
Повністю видалити функцію `api_telegram_set_enabled()`.

**b) Видалити імпорт (рядок 41):**
```python
set_user_telegram_enabled,
```

**c) Прибрати `telegram_enabled` з API відповідей:**
- У `api_update_profile()` (рядки 633-634): видалити блок `if 'telegram_enabled' in updated_user:`
- У `api_get_profile()` (рядки 699-700): видалити блок `if 'telegram_enabled' in user_db:`

**d) Видалити перевірку `telegram_enabled` з `api_telegram_test_send()` (рядки 384-386):**
Змінити умову з:
```python
telegram_enabled = bool(user_db.get('telegram_enabled'))
if not chat_id or not telegram_enabled:
```
на:
```python
if not chat_id:
```

#### `helpers/db_telegram.py`

**a) Видалити функцію `set_user_telegram_enabled()` (рядки 93-109)**

**b) Видалити `telegram_enabled` з `_ensure_users_telegram_columns()` у `link_telegram_chat_by_code()` (рядок 60):**
Змінити:
```python
_ensure_users_telegram_columns(cur, ['telegram_link_code', 'telegram_chat_id', 'telegram_enabled'])
```
на:
```python
_ensure_users_telegram_columns(cur, ['telegram_link_code', 'telegram_chat_id'])
```

**c) У `link_telegram_chat_by_code()` (рядок 79):**
Змінити `telegram_enabled = TRUE` на просто видалити цей SET.

**d) У `list_teacher_chat_ids_for_student_success()` (рядок 139):**
Видалити умову `AND u.telegram_enabled = TRUE` — тепер достатньо `u.telegram_chat_id IS NOT NULL`.

**e) У `list_teacher_recipients_for_student_manual_report()` (рядок 208):**
Видалити умову `AND u.telegram_enabled = TRUE`.

**f) У `filter_manual_teacher_chat_ids()` (рядок 269):**
Видалити умову `AND u.telegram_enabled = TRUE`.

### 5. Backend — Логіка відправки звітів

#### `routes/statistics.py`

**a) У `api_statistics_telegram_send_self()` (рядки 129-131):**
Змінити:
```python
if not chat_id or not bool(user.get('telegram_enabled')):
```
на:
```python
if not chat_id:
```

**b) У `teacher_report_recipients_auto()` (рядок 711):**
Змінити:
```python
if user.get('telegram_chat_id') and bool(user.get('telegram_enabled')):
```
на:
```python
if user.get('telegram_chat_id'):
```

**c) У `teacher_report_send_auto()` (рядок 820):**
Змінити:
```python
if send_to_self and user.get('telegram_chat_id') and bool(user.get('telegram_enabled')):
```
на:
```python
if send_to_self and user.get('telegram_chat_id'):
```

**d) У `save_success()` (рядки 2094, 2163-2164):**
Ці блоки вже загорнуті в `if False and ...`, тому вони ніколи не виконуються. Можна видалити або залишити — вони не впливають на роботу.

### 6. Backend — Функція отримання користувача

#### `helpers/db_users.py`

**a) У `get_user_by_email()`:**
- Видалити `'telegram_enabled'` зі списку колонок для перевірки (рядок 319)
- Видалити `has_telegram_enabled` змінну та її присвоєння (рядок 332)
- Видалити `if has_telegram_enabled:` блок додавання поля в SELECT (рядки 362-363)
- Видалити блок збереження `telegram_enabled` в результат (рядки 424-425)

**b) У `create_user()` (рядки 116-137):**
- Видалити `'telegram_enabled'` зі списку колонок (рядок 121)
- Видалити блок `if 'telegram_enabled' in cols:` (рядки 126-130)

### 7. Міграції

#### `migrations/add_telegram_notifications.sql`
- Видалити рядок 11: `ADD COLUMN IF NOT EXISTS telegram_enabled BOOLEAN NOT NULL DEFAULT FALSE;`
- Видалити рядок 21: `COMMENT ON COLUMN users.telegram_enabled IS '...';`

**АБО** створити нову міграцію, яка видаляє колонку:
```sql
ALTER TABLE users DROP COLUMN IF EXISTS telegram_enabled;
```

### 8. Документація

#### `docs/dictafan_architecture.md`
- Оновити секцію "Telegram уведомления и отчёты" (рядки 674-714), прибравши згадки про `telegram_enabled`
- Оновити опис `list_teacher_chat_ids_for_student_success` — прибрати вимогу `teacher has telegram_enabled`

## Порядок виконання

1. **HTML** — видалити кнопку з `user_profile_modal.html`
2. **JS** — видалити логіку перемикача та оновлення `UM.userData`
3. **CSS** — прибрати стилі (якщо є)
4. **Backend: `helpers/db_telegram.py`** — видалити функцію та прибрати умови з SQL-запитів
5. **Backend: `routes/user_routes.py`** — видалити ендпоінт, імпорт, прибрати з API
6. **Backend: `routes/statistics.py`** — прибрати перевірки `telegram_enabled`
7. **Backend: `helpers/db_users.py`** — прибрати з отримання/створення користувача
8. **Міграція** — створити SQL для видалення колонки
9. **Документація** — оновити architecture.md

## Важливі зауваження

- `telegram_self_reports_enabled` **НЕ чіпаємо** — це окрема функція (самозвіти)
- `telegram_chat_id` **НЕ чіпаємо** — він визначає, чи підключений Telegram
- `group_students.notify_teacher_on_success` **НЕ чіпаємо** — це пер-учнівський флаг, який залишається
- `is_telegram_enabled()` у `helpers/telegram.py` **НЕ чіпаємо** — це перевірка наявності TELEGRAM_BOT_TOKEN, не пов'язана з users.telegram_enabled
- `templates/user_profile_jwt.html` **НЕ чіпаємо** — буде видалено окремим завданням
