# Рефакторинг: единая функция обработки активностей + отказ от money_kt

## Проблема

Сейчас код размазан по 2+ местам, каждое собирает данные вручную:

1. **`checkText()`** (строки ~1384–1420) — для perfect/corrected/activity
2. **`onRecognitionComplete`** (строки ~3076–3137) — для audio

**Проблема**: дублирование логики, легко ошибиться. Плюс колонка `money_kt_count` в `history_by_day` и `money_spent` в сессии больше не нужны — обмен стал бесплатным.

## Изменение алгоритма обмена

**Было**: покупка за монеты (fetch POST /money/spend, money_spent += cost)
**Стало**: бесплатный обмен накопленных попыток (3 активности → полузвезда, 3 попытки 50-80% → микрофон)

## Полный список изменений

### 1. SQL миграция: удалить `money_kt_count` из `history_by_day`

Создать файл: `migrations/drop_money_kt_from_history_by_day.sql`

```sql
ALTER TABLE history_by_day DROP COLUMN IF EXISTS money_kt_count;
```

И файл запуска: `migrations/run_drop_money_kt_from_history_by_day.py`

### 2. `helpers/db_history.py` — убрать `money_kt_delta`

- `_upsert_history_by_day()`: убрать параметр `money_kt_delta`, убрать из INSERT и UPDATE
- `add_activity_bulk()`: убрать передачу `money_kt_delta`
- `add_success()`: убрать передачу `money_kt_delta`
- `get_history_by_day_totals()`: убрать `money_kt_count` из SELECT
- `get_history_by_day_totals_for_date()`: убрать `money_kt_count` из SELECT

### 3. `routes/statistics.py` — убрать `money_spent`

- `save_activity()`: убрать `money_spent` из чтения данных
- `save_success()`: убрать `money_spent` из чтения данных

### 4. `static/js/outbox_batcher.js` — убрать `money_spent`

- `enqueueActivity()`: убрать поле `money_spent` из параметров и из merging
- `_flushOutbox()`: убрать `money_spent` из отправки

### 5. `static/js/dictation_modal.js` — главные изменения

#### 5a. Создать функцию `handleActivity()`

Функция делает ВСЁ в одном месте:
1. Обновляет state предложения (`st`) — счётчики + деньги
2. Отправляет активность в `OutboxBatcher.enqueueActivity()` → БД
3. Сохраняет сессию в IndexedDB (`persistToIdb`)
4. Обновляет UI:
   - `updateStartModalSentenceRow()` — строка в таблице модального окна (звёздочка, микрофон, деньги)
   - `updateSentenceTabloFromSession()` — табло диктанта (звезда, микрофон, счётчики активностей, кнопки обмена)
   - `updateTaskProgressFromSession()` — **прогресс заданий + точность (accuracy) + счётчик ошибок `tablo_result_bug_count`** — эта функция собирает `mistakesTotal` и `charsTotal` по всем предложениям, вычисляет `accuracyPct` и обновляет панель прогресса
   - `updateNextButtonVisibilityFromSession()` — кнопка "Далее"
5. Играет звук монет

```js
function handleActivity({ type, session, sentenceKey, reward, extras }) {
  const st = session.getState(sentenceKey);
  if (!st) return;

  // 1. Обновить state
  if (type === 'perfect') st.number_of_perfect = (Number(st.number_of_perfect) || 0) + 1;
  else if (type === 'corrected') st.number_of_corrected = (Number(st.number_of_corrected) || 0) + 1;
  else if (type === 'activity') st.text_activity_count = (Number(st.text_activity_count) || 0) + 1;
  else if (type === 'audio') {
    st.number_of_audio = (Number(st.number_of_audio) || 0) + 1;
    st.audio_activity50_count = (Number(st.audio_activity50_count) || 0) + 1;
  }
  st.money_count = (Number(st.money_count) || 0) + reward;
  st.money_earned = (Number(st.money_earned) || 0) + reward;

  // 2. Отправить в outbox
  try {
    const ob = window.OutboxBatcher;
    if (ob && typeof ob.enqueueActivity === 'function') {
      const dictationId = getCurrentDictationIdForDb();
      const dictationLanguageCode = _getDictationLanguageCode();
      const selectedSentencePositions = _getSelectedSentencePositions(session);
      const mistakeCount = type === 'audio'
        ? Number(st && st.mistake_count) || 0
        : (extras && extras.mistakeCount) || 0;
      const numberOfCharacters = type === 'audio'
        ? Number(st && st.number_of_characters) || 0
        : (extras && extras.numberOfCharacters) || 0;
      ob.enqueueActivity({
        type,
        count: 1,
        leadTimeMs: _getSessionLeadTimeMs(session),
        dictationId,
        date: null,
        dictationLanguageCode,
        selectedSentencePositions,
        mistakeCount,
        numberOfCharacters,
        moneyCount: reward,
      });
    }
  } catch (e) {
    console.warn('[DM] handleActivity enqueueActivity error', e);
  }

  // 3. Сохранить сессию
  try {
    const store = getRuntimeStore();
    if (store && typeof store.persistToIdb === 'function') store.persistToIdb();
  } catch (e) {}

  // 4. Обновить UI (включая табло, прогресс заданий, точность accuracy, ошибки, кнопку Далее)
  try { updateStartModalSentenceRow(session, sentenceKey); } catch (e) {}
  try { updateSentenceTabloFromSession(session, sentenceKey); } catch (e) {}
  try { updateTaskProgressFromSession(session); } catch (e) {}  // ← здесь и точность accuracy, и tablo_result_bug_count
  try { updateNextButtonVisibilityFromSession(session); } catch (e) {}

  // 5. Звук
  try { playUiSound('coins_plus_audio'); } catch (e) {}
}
```

#### 5b. Заменить код в `checkText()` (строки ~1372-1420)

**Было** (внутри `if (reward > 0 && cycleId > 0 && paidCycleId !== cycleId)`):
```js
st.money_count = (Number(st.money_count) || 0) + reward;
st.money_earned = (Number(st.money_earned) || 0) + reward;
st._paidTextRewardCycleId = cycleId;
playUiSound('coins_plus_audio');
// ... enqueueActivity + persistToIdb (строки 1384-1420) ...
```

**Стало**:
```js
st.money_count = (Number(st.money_count) || 0) + reward;
st.money_earned = (Number(st.money_earned) || 0) + reward;
st._paidTextRewardCycleId = cycleId;

handleActivity({
  type: typeActivity,
  session,
  sentenceKey: key,
  reward,
  extras: {
    mistakeCount: Number(st && st.mistake_count) || 0,
    numberOfCharacters: Number(st && st.number_of_characters) || 0,
  },
});
```

#### 5c. Удалить дублированные UI-вызовы после блока reward (строки ~1430-1500)

Удалить из `checkText()` после блока с reward:
- `updateStartModalSentenceRow(session, key);` — теперь внутри handleActivity
- `updateNextButtonVisibilityFromSession(session);` — теперь внутри handleActivity
- `updateSentenceTabloFromSession(session, key);` — теперь внутри handleActivity
- `updateTaskProgressFromSession(session);` — теперь внутри handleActivity

Оставить:
- `st.mistake_count = view.mistake_count;` и подобные присваивания
- Логику фокуса

#### 5d. Заменить код в `onRecognitionComplete()` (строки ~3076-3137)

**Было** (внутри `if (ok)`):
```js
st.number_of_audio = next;
st.audio_activity50_count = ...;
st.money_count += add;
st.money_earned += add;
playUiSound('coins_plus_audio');
// ... enqueueActivity + persistToIdb (строки 3086-3119) ...
```

**Стало**:
```js
st.number_of_audio = next;
st.audio_activity50_count = ...;
st.money_count += add;
st.money_earned += add;

handleActivity({
  type: 'audio',
  session,
  sentenceKey: _key,
  reward: add,
  extras: {},
});
```

#### 5e. Удалить дублированные UI-вызовы после блока ok (строки ~3129-3137)

Удалить:
- `updateStartModalSentenceRow(session, _key);`
- `updateSentenceTabloFromSession(session, _key);`
- `updateTaskProgressFromSession(session);`
- `updateNextButtonVisibilityFromSession(session);`

#### 5f. Ветка `else if (pct >= 50)` — убрать деньги

Строки 3120-3124:
```js
} else if (pct >= 50) {
  const add = getPricingValue('audio_activity_reward', 1);
  st.audio_activity50_count = (Number(st.audio_activity50_count) || 0) + 1;
  // УБРАТЬ: st.money_count = (Number(st.money_count) || 0) + add;
  // УБРАТЬ: st.money_earned = (Number(st.money_earned) || 0) + add;
}
```

#### 5g. `bindCoinExchangeModal()` — убрать деньги из обмена

В `spendAndApply()` (строки 2569-2662):

```js
const spendAndApply = async () => {
  const st = getCurrentSentenceStateFromSession(session);
  if (!st) return;
  const mode = String(state._coinExchangeMode || '');
  if (mode !== 'text' && mode !== 'audio') return;

  const cost = mode === 'text'
    ? getPricingValue('half_star_purchase_cost', 3)
    : getPricingValue('audio_purchase_cost', 3);

  // УДАЛЕНО: fetch('/api/statistics/money/spend')
  // УДАЛЕНО: playUiSound('coins_minus')

  if (mode === 'text') {
    st.text_activity_count = Math.max(0, (Number(st.text_activity_count) || 0) - cost);
    // УДАЛЕНО: st.money_spent = (Number(st.money_spent) || 0) + cost;
    st.number_of_corrected = Math.max(Number(st.number_of_corrected) || 0, 1);
    st.text_exchange_half_star = true;
    setCheckButtonState('half');
  } else {
    st.audio_activity50_count = Math.max(0, (Number(st.audio_activity50_count) || 0) - cost);
    // УДАЛЕНО: st.money_spent = (Number(st.money_spent) || 0) + cost;
    const req = getRequiredAudioRepeatsValue();
    st.number_of_audio = Math.max(Number(st.number_of_audio) || 0, req);
    st.audio_exchange_mic = true;
  }

  // Обновляем UI
  updateStartModalSentenceRow(session, curKey);
  updateSentenceTabloFromSession(session, curKey);
  updateTaskProgressFromSession(session);
  updateNextButtonVisibilityFromSession(session);
  // ... фокус ...
  close();
};
```

#### 5h. Поменять текст в модалке обмена

Строки 2526-2529:
```js
// Было:
title.textContent = `Покупешь полузвезду за ${cost} монеты?`;
// Стало:
title.textContent = `Обменять ${cost} активности на полузвезду?`;

// Было:
title.textContent = `Покупешь микрофон за ${cost} монеты?`;
// Стало:
title.textContent = `Обменять ${cost} попытки на микрофон?`;
```

#### 5i. Поменять title кнопок обмена

В `dictation_modal.html` строки 109, 160:
```html
<!-- Было -->
<button id="btn_coin_exchange_text" title="Купить пол звезды" ...>
<button id="btn_coin_exchange_audio" title="Купить пол звезды" ...>

<!-- Стало -->
<button id="btn_coin_exchange_text" title="Обменять на полузвезду" ...>
<button id="btn_coin_exchange_audio" title="Обменять на микрофон" ...>
```

#### 5j. Убрать `money_spent` из `updateTaskProgressFromSession()` (строка 2746-2748)

```js
// УДАЛИТЬ блок:
try {
  moneySpent += (Number(st.money_spent) || 0);
} catch (e2) {
}
```

И в вызове `p.update(...)` убрать `moneySpent`.

#### 5k. Убрать колонку Кт из таблицы модального окна

В `updateStartModalSentenceRow()` (строки 3563-3568): удалить блок с `tdMoneyKt`
В `renderStartModalSentencesTable()` (строки 4279-4283): удалить блок с `tdMoneyKt`
В `dictation_modal.html` (строки 312, 348-349): удалить `<col class="col-money-kt">` и `<th class="col-money-kt">`

#### 5l. Убрать `money_spent` из `resetDictationProgressForSession()` (строка 5184)

```js
// st.money_spent = 0;  // УДАЛИТЬ
```

### 6. `static/js/progress_panel.js` — убрать `moneySpent` из отображения

Строка 645-648:
```js
// Было:
if (this.elements.money) {
  const earned = safe(this.stats.moneyEarned);
  const spent = safe(this.stats.moneySpent);
  this.elements.money.textContent = `+${earned} / -${spent}`;
}

// Стало:
if (this.elements.money) {
  const earned = safe(this.stats.moneyEarned);
  this.elements.money.textContent = `+${earned}`;
}
```

### 7. `static/js/outbox_batcher.js` — убрать `money_spent`

- `enqueueActivity()`: убрать параметр `money_spent` из деструктуризации и из merging
- `_flushOutbox()`: убрать `money_spent` из JSON

### 8. `routes/statistics.py` — убрать `money_spent`

- `save_activity()`: убрать чтение `money_spent` из `data.get()`
- `save_success()`: убрать `money_spent` из параметров

### 9. `helpers/db_history.py` — убрать `money_kt_delta`

- `_upsert_history_by_day()`: убрать параметр `money_kt_delta`
- `add_activity_bulk()`: убрать передачу `money_kt_delta`
- `add_success()`: убрать передачу `money_kt_delta`
- `get_history_by_day_totals()`: убрать `money_kt_count` из SELECT
- `get_history_by_day_totals_for_date()`: убрать `money_kt_count` из SELECT

## План выполнения (порядок)

| № | Действие | Файлы |
|---|----------|-------|
| 1 | SQL миграция: DROP money_kt_count | `migrations/drop_money_kt_from_history_by_day.sql` + `.py` |
| 2 | Python: убрать money_kt_delta | `helpers/db_history.py` |
| 3 | Python: убрать money_spent | `routes/statistics.py` |
| 4 | JS: убрать money_spent из outbox_batcher | `static/js/outbox_batcher.js` |
| 5 | JS: создать handleActivity() | `static/js/dictation_modal.js` |
| 6 | JS: заменить код в checkText() | `static/js/dictation_modal.js` |
| 7 | JS: заменить код в onRecognitionComplete() | `static/js/dictation_modal.js` |
| 8 | JS: убрать деньги из else if (pct >= 50) | `static/js/dictation_modal.js` |
| 9 | JS: убрать деньги из bindCoinExchangeModal() | `static/js/dictation_modal.js` |
| 10 | JS: поменять текст модалки обмена | `static/js/dictation_modal.js` |
| 11 | JS: убрать money_spent из updateTaskProgressFromSession() | `static/js/dictation_modal.js` |
| 12 | JS: убрать колонку Кт из таблицы модального окна | `static/js/dictation_modal.js` + `.html` |
| 13 | JS: убрать money_spent из resetDictationProgress | `static/js/dictation_modal.js` |
| 14 | JS: убрать moneySpent из progress_panel.js | `static/js/progress_panel.js` |
| 15 | HTML: поменять title кнопок, убрать col-money-kt | `templates/partials/dictation_modal.html` |
| 16 | Протестировать | — |
