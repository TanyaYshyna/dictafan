  const MODAL_ID = 'dictationModal';
  const BODY_ID = 'dictationModalBody';

  const DICTATION_SCRIPT_DEPS = [
    '/static/js/idb_manager.js',
    '/static/js/desktop_confirm_modal.js',
    '/static/js/language_manager.js',
    '/static/js/language_selector.js',
    '/static/js/cover_manager.js',
    '/static/js/audio_manager.js',
    '/static/js/audio_player_visual.js',
    '/static/js/user_activity_history.js',
    '/static/js/dictation_statistics.js',
    '/static/js/progress_panel.js',
    '/static/js/dictation_runtime/dictation_store.js',
    '/static/js/dictation_runtime/proverka_na_oshibki.js',
    '/static/js/dictation_runtime/proverka_renderer.js',
    '/static/js/dictation_runtime/speech_recognition_panel.js',
    '/static/js/outbox_batcher.js',
  ];

  const state = {
    isOpen: false,
    currentUrl: null,
    depsLoaded: false,
    opening: false,
    dictationStarted: false,
    rewardCycleId: 0,
  };

  function startNewRewardCycle() {
    try {
      state.rewardCycleId = (Number(state.rewardCycleId) || 0) + 1;
    } catch (e) {
    }
  }

  // --- Вспомогательные функции, перенесённые из script_dictation.js ---

  /** Получить язык оригинала диктанта из текущего URL */
  function _getDictationLanguageCode() {
    try {
      const url = state.currentUrl;
      if (!url) return null;
      const parsed = parseDictationHref(url);
      return parsed ? parsed.langOriginal : null;
    } catch (e) {
      return null;
    }
  }

  /** Получить выбранные позиции предложений из активной сессии */
  function _getSelectedSentencePositions(session) {
    try {
      if (!session) return null;
      const activeKeys = Array.isArray(session.activeKeys) ? session.activeKeys : [];
      const content = session.content;
      if (!content || typeof content.getSentence !== 'function') return null;
      const positions = [];
      for (const key of activeKeys) {
        const sentence = content.getSentence(key);
        if (sentence && sentence.position != null) {
          positions.push(Number(sentence.position));
        }
      }
      return positions.length > 0 ? positions : null;
    } catch (e) {
      return null;
    }
  }

  /** Получить время выполнения из сессии в миллисекундах */
  function _getSessionLeadTimeMs(session) {
    try {
      if (!session) return 0;
      if (typeof session.getElapsedMs === 'function') {
        return Math.floor(session.getElapsedMs());
      }
      if (session.timer && session.timer.accumulatedMs) {
        return Math.floor(Number(session.timer.accumulatedMs) || 0);
      }
      return 0;
    } catch (e) {
      return 0;
    }
  }

  function getCurrentDictationIdForDb() {
    try {
      const session = window.__dictationModalActiveSession;
      if (session && session.dictationId) {
        const parsed = parseInt(String(session.dictationId).replace(/^dict_/, ''), 10);
        if (Number.isFinite(parsed)) return parsed;
      }
    } catch (e) {
    }
    return null;
  }

  function escapeHtml(str) {
    const s = String(str || '');
    return s
      .replaceAll('&', '&')
      .replaceAll('<', '<')
      .replaceAll('>', '>')
      .replaceAll('"', '"')
      .replaceAll("'", '&#39;');
  }

  function dictationT(key, fallback, params) {
    try {
      if (!window.I18n || typeof window.I18n.t !== 'function') return fallback;
      const fullKey = key.startsWith('dictation.') ? key : `dictation.${key}`;
      const translated = window.I18n.t(fullKey, params);
      if (typeof translated === 'string' && translated !== fullKey) return translated;
      if (fallback == null) return fullKey;
      const text = String(fallback);
      if (!params) return text;
      return text.replace(/\{(\w+)\}/g, (m, name) => {
        if (Object.prototype.hasOwnProperty.call(params, name)) return String(params[name]);
        return m;
      });
    } catch (e) {
      return fallback;
    }
  }

  async function hasLocalPendingDraft() {
    return false;
  }

  async function showExitModal(action) {
    const exitModal = document.getElementById('exitModal');
    if (!exitModal) return;

    const panel = getProgressPanelInstance();
    const hasPanelPending = panel && typeof panel.hasPending === 'function' ? panel.hasPending() : false;
    const hasLocalPending = await hasLocalPendingDraft();
    const hasPending = hasPanelPending || hasLocalPending;

    window.pendingExitAction = typeof action === 'function' ? action : () => {
      try { close(); } catch (e) {}
    };

    const messageEl = document.getElementById('exitModalMessage');
    if (messageEl) {
      messageEl.textContent = hasPending
        ? dictationT('exit_modal.unsaved_progress_confirm', messageEl.textContent || '')
        : dictationT('exit_modal.saved_progress_next', messageEl.textContent || '');
    }

    try {
      const exitWithoutLabel = document.getElementById('exitWithoutSavingBtnLabel');
      if (exitWithoutLabel) {
        exitWithoutLabel.textContent = dictationT('exit_modal.exit', exitWithoutLabel.textContent || '');
      }
    } catch (e) {
    }

    try {
      const exitWithLabel = document.getElementById('exitWithSavingBtnLabel');
      if (exitWithLabel) {
        exitWithLabel.textContent = dictationT('exit_modal.exit', exitWithLabel.textContent || '');
      }
    } catch (e) {
    }

    const exitWithBtn = document.getElementById('exitWithSavingBtn');
    if (exitWithBtn) {
      if (hasPending) {
        exitWithBtn.style.display = '';
        exitWithBtn.disabled = false;
        exitWithBtn.classList.remove('disabled');
      } else {
        exitWithBtn.style.display = 'none';
      }
    }

    exitModal.style.display = 'flex';
    const stayBtn = document.getElementById('exitStayBtn');
    if (stayBtn) stayBtn.focus();
  }

  function hideExitModal() {
    const exitModal = document.getElementById('exitModal');
    if (exitModal) {
      exitModal.style.display = 'none';
    }
    window.pendingExitAction = null;
  }

  async function autoSendTeacherReportAfterSuccess({
    completionCountAfter,
    errorWords,
    perfectCount,
    correctedCount,
    audioCount,
    attemptsTotal,
    errorCount,
    timeMs,
    completedAtMs,
    completedAtTzOffsetMin,
    sentencesData,
    settingsJson,
    reportHeaderMode,
  }) {
    const token = window.UM?.token || localStorage.getItem('jwt_token');
    if (!token) return;

    const dictationIdForDb = getCurrentDictationIdForDb();
    if (!dictationIdForDb) return;

    // Если параметры не переданы (промежуточный отчёт), собираем снапшот из сессии
    let snapshot = null;
    try {
      const needSnapshot = (
        perfectCount == null || correctedCount == null || audioCount == null ||
        attemptsTotal == null || errorCount == null || timeMs == null ||
        completedAtMs == null || completedAtTzOffsetMin == null ||
        sentencesData == null || settingsJson == null || errorWords == null ||
        completionCountAfter === undefined
      );

      if (needSnapshot) {
        let totalPerfect = 0;
        let totalCorrected = 0;
        let totalAudio = 0;
        let totalAttempts = 0;
        let totalErrors = 0;

        const sentences_data = [];
        try {
          const session = window.__dictationModalActiveSession;
          if (session) {
            const allKeys = session.content ? session.content.getAllKeys() : [];
            for (const key of allKeys) {
              const st = session.getState(key);
              const p = Number(st.number_of_perfect) || 0;
              const c = Number(st.number_of_corrected) || 0;
              const a = Number(st.number_of_audio) || 0;
              const at = Number(st.attempts_total) || 0;
              const er = Number(st.mistake_count) || 0;

              totalPerfect += p;
              totalCorrected += c;
              totalAudio += a;
              totalAttempts += at;
              totalErrors += er;

              if (p > 0 || c > 0 || a > 0) {
                sentences_data.push({
                  sentence_key: key,
                  perfect_count: p,
                  corrected_count: c,
                  audio_count: a,
                  attempts_total: at,
                  mistake_count: er,
                  selection_state: st.selection_state || 'unchecked',
                });
              }
            }
          }
        } catch (e2) {
        }

        const timerSnapshot = getProgressTimerSnapshot();
        const totalTimeMs = timerSnapshot.accumulatedMs || 0;
        const nowMs = Date.now();
        const tzOffsetMin = -new Date().getTimezoneOffset();

        // Собираем настройки из DOM модального окна
        let settings_json = null;
        try {
          const seq = typeof getPlaySequenceStartValue === 'function' ? getPlaySequenceStartValue() : 'oto';
          const repeatsEl = document.getElementById('modal-audioRepeatsInput');
          const repeats = repeatsEl && repeatsEl.value != null && String(repeatsEl.value).trim() ? String(repeatsEl.value).trim() : '3';
          settings_json = JSON.stringify({
            audio: {
              start: seq,
              repeats: repeats,
            },
          });
        } catch (e3) {
          settings_json = null;
        }

        snapshot = {
          completionCountAfter: null,
          errorWords: null,
          perfectCount: totalPerfect,
          correctedCount: totalCorrected,
          audioCount: totalAudio,
          attemptsTotal: totalAttempts,
          errorCount: totalErrors,
          timeMs: totalTimeMs,
          completedAtMs: nowMs,
          completedAtTzOffsetMin: tzOffsetMin,
          sentencesData: sentences_data,
          settingsJson: settings_json,
        };
      }
    } catch (e1) {
      snapshot = null;
    }

    try {
      const finalCompletionCountAfter = completionCountAfter != null ? completionCountAfter : (snapshot ? snapshot.completionCountAfter : null);
      const finalErrorWords = (typeof errorWords === 'object' && errorWords) ? errorWords : (snapshot ? snapshot.errorWords : null);
      const finalPerfect = perfectCount != null ? perfectCount : (snapshot ? snapshot.perfectCount : null);
      const finalCorrected = correctedCount != null ? correctedCount : (snapshot ? snapshot.correctedCount : null);
      const finalAudio = audioCount != null ? audioCount : (snapshot ? snapshot.audioCount : null);
      const finalAttempts = attemptsTotal != null ? attemptsTotal : (snapshot ? snapshot.attemptsTotal : null);
      const finalErrors = errorCount != null ? errorCount : (snapshot ? snapshot.errorCount : null);
      const finalTimeMs = timeMs != null ? timeMs : (snapshot ? snapshot.timeMs : null);
      const finalCompletedAtMs = completedAtMs != null ? completedAtMs : (snapshot ? snapshot.completedAtMs : null);
      const finalCompletedAtTzOffsetMin = completedAtTzOffsetMin != null ? completedAtTzOffsetMin : (snapshot ? snapshot.completedAtTzOffsetMin : null);
      const finalSentencesData = Array.isArray(sentencesData) ? sentencesData : (snapshot ? snapshot.sentencesData : null);
      const finalSettingsJson = settingsJson != null ? settingsJson : (snapshot ? snapshot.settingsJson : null);

      // Отправляем авто-отчёт только текущему учителю
      let teacher_user_ids = [];
      try {
        const session = window.__dictationModalActiveSession;
        const teacherUserId = session && session.teacherUserId ? Number(session.teacherUserId) : 0;
        if (Number.isFinite(teacherUserId) && teacherUserId > 0) teacher_user_ids = [teacherUserId];
      } catch (e) {
        teacher_user_ids = [];
      }

      if (!teacher_user_ids.length) return;
      const send_to_self = false;

      await fetch('/api/statistics/teacher_report/send_auto', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dictation_id: dictationIdForDb,
          teacher_user_ids,
          send_to_self,
          report_header_mode: (reportHeaderMode != null ? String(reportHeaderMode) : 'success'),
          completion_count_after: finalCompletionCountAfter,
          perfect_count: finalPerfect,
          corrected_count: finalCorrected,
          audio_count: finalAudio,
          attempts_total: finalAttempts,
          mistake_count: finalErrors,
          time_ms: finalTimeMs,
          completed_at_ms: finalCompletedAtMs,
          completed_at_tz_offset_min: finalCompletedAtTzOffsetMin,
          sentences_data: finalSentencesData,
          settings_json: finalSettingsJson,
          error_words: finalErrorWords,
        }),
      });
    } catch (e) {
    }
  }

  // --- Конец вспомогательных функций ---

  function positionsToLabel(positions) {

    try {
      const arr = Array.isArray(positions) ? positions : [];
      const uniq = Array.from(new Set(arr.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)));
      uniq.sort((a, b) => a - b);
      if (!uniq.length) return '';
      const ranges = [];
      let start = uniq[0];
      let prev = uniq[0];
      for (let i = 1; i < uniq.length; i++) {
        const cur = uniq[i];
        if (cur === prev + 1) {
          prev = cur;
          continue;
        }
        ranges.push(start === prev ? String(start) : `${start}-${prev}`);
        start = cur;
        prev = cur;
      }
      ranges.push(start === prev ? String(start) : `${start}-${prev}`);
      return ranges.join(', ');
    } catch (e) {
      return '';
    }
  }

  try {
    if (!window.DictafanPricing) {
      window.DictafanPricing = {
        values: {
          star_reward: 3,
          half_star_reward: 2,
          text_activity_reward: 1,
          audio_activity_reward: 1,
          half_star_purchase_cost: 3,
          audio_purchase_cost: 3,
        },
      };
    }
  } catch (e) {
  }

  function getPricingValue(key, fallback) {
    try {
      const v = window.DictafanPricing && window.DictafanPricing.values ? window.DictafanPricing.values[key] : undefined;
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    } catch (e) {
    }
    return Number(fallback);
  }

  const INACTIVITY_TIMEOUT_DEFAULT = 60000; // 1 минута
  const INACTIVITY_TIMEOUT_RECORDING = 10 * 60 * 1000; // 10 минут

  function getExerciseMode() {
    try {
      const mode = window.audioExerciseMode || '';
      if (mode === 'record' || mode === 'no-record' || mode === 'audio-only-no-hint' || mode === 'audio-only-hint') {
        return mode;
      }
    } catch (e) {
    }
    return 'record';
  }

  function applyExerciseMode(session) {
    try {
      const mode = getExerciseMode();
      const textBlock = document.querySelector('#dictationModal .result-panel');
      const audioPanel = document.querySelector('#dictationModal .audio-user-panel');
      const input = document.getElementById('userInput');
      const correctAnswer = document.getElementById('correctAnswer');
      const checkBtn = document.getElementById('checkBtn');
      const checkGroup = document.querySelector('#dictationModal .check-group');

      if (mode === 'record') {
        // p1: стандартный режим — аудио по необходимости, текст доступен
        if (textBlock) textBlock.style.display = '';
        if (checkGroup) checkGroup.style.display = '';
        updateAudioUserPanelVisibilityFromSession(session);
        // НЕ очищаем input/correctAnswer — они могут содержать результаты проверки
        return;
      }

      if (mode === 'no-record') {
        // p2: аудио скрыто, только текст
        if (audioPanel) {
          audioPanel.style.visibility = 'hidden';
          audioPanel.style.pointerEvents = 'none';
        }
        if (textBlock) textBlock.style.display = '';
        if (checkGroup) checkGroup.style.display = '';
        // НЕ очищаем input/correctAnswer — они могут содержать результаты проверки
        return;
      }

      if (mode === 'audio-only-no-hint') {
        // p3: только аудио, без подсказки — текст скрыт
        if (audioPanel) {
          audioPanel.style.visibility = 'visible';
          audioPanel.style.pointerEvents = 'auto';
        }
        if (textBlock) textBlock.style.display = 'none';
        if (input) {
          input.setAttribute('contenteditable', 'false');
          input.textContent = '';
        }
        if (correctAnswer) {
          correctAnswer.textContent = '';
          correctAnswer.style.display = 'none';
        }
        return;
      }

      if (mode === 'audio-only-hint') {
        // p4: только аудио, с подсказкой — текст показан, но кнопка проверки скрыта
        if (audioPanel) {
          audioPanel.style.visibility = 'visible';
          audioPanel.style.pointerEvents = 'auto';
        }
        if (textBlock) textBlock.style.display = '';
        if (checkGroup) checkGroup.style.display = 'none';

        const view = getCurrentSentenceViewFromSession(session);
        const originalText = String(view && view.text_original != null ? view.text_original : (view && view.text != null ? view.text : ''));
        const translationText = String(view && view.text_translation != null ? view.text_translation : (view && view.translation != null ? view.translation : ''));

        if (input) {
          input.setAttribute('contenteditable', 'false');
          input.textContent = originalText;
        }
        if (correctAnswer) {
          correctAnswer.textContent = translationText;
          correctAnswer.style.display = 'block';
          try {
            correctAnswer.style.color = 'var(--color-button-text-gray)';
          } catch (e) {
          }
        }
        return;
      }
    } catch (e) {
    }
  }

  function updateAudioUserPanelVisibilityFromSession(session) {
    try {
      const panel = document.querySelector('#dictationModal .audio-user-panel');
      if (!panel) return;
      const mode = getExerciseMode();
      // В режимах p3 и p4 аудио-панель всегда видна
      if (mode === 'audio-only-no-hint' || mode === 'audio-only-hint') {
        panel.style.visibility = 'visible';
        panel.style.pointerEvents = 'auto';
        return;
      }
      // В режиме p2 аудио-панель всегда скрыта
      if (mode === 'no-record') {
        panel.style.visibility = 'hidden';
        panel.style.pointerEvents = 'none';
        return;
      }
      const st = getCurrentSentenceStateFromSession(session);
      if (!st) {
        panel.style.visibility = 'hidden';
        panel.style.pointerEvents = 'none';
        return;
      }
      const requiresAudio = getRequiredAudioRepeatsValue();
      const audioDone = Number(st && st.number_of_audio) || 0;
      const shouldShow = (requiresAudio > 0) && (audioDone < requiresAudio);
      panel.style.visibility = shouldShow ? 'visible' : 'hidden';
      panel.style.pointerEvents = shouldShow ? 'auto' : 'none';
    } catch (e) {
    }
  }

  function hideCompletionModal() {
    try {
      const completionModal = document.getElementById('completionModal');
      if (completionModal) completionModal.style.display = 'none';
    } catch (e) {
    }
  }

  function showCompletionModal() {
    const completionModal = document.getElementById('completionModal');
    if (!completionModal) return;

    // Сохраняем время текущего предложения перед показом completion modal,
    // т.к. showCompletionModal может быть вызвана из updateTaskProgressFromSession
    // (через checkText или onRecognitionComplete) до того, как пользователь нажмёт "Далее",
    // и _saveSentenceTime не будет вызвана для последнего предложения.
    try {
      const session = window.__dictationModalActiveSession;
      if (session && typeof _saveSentenceTime === 'function') {
        _saveSentenceTime(session);
      }
    } catch (e0save) {
    }

    try {
      clearInactivityTimer();
    } catch (e0) {
    }

    try {
      stopAllAudios();
    } catch (e1) {
    }

    try {
      state._pauseDisabled = true;
    } catch (e1b) {
    }

    try {
      const pp = window.progressPanel;
      if (pp && typeof pp.stopTimer === 'function') pp.stopTimer();
    } catch (e1c) {
    }

    try {
      const rewardIcon = document.getElementById('completionRewardIcon');
      if (rewardIcon) rewardIcon.setAttribute('data-lucide', 'award');
    } catch (e2) {
    }

    try {
      const medalCount = document.getElementById('completionMedalCount');
      if (medalCount) {
        medalCount.textContent = '0';
        medalCount.style.display = '';
      }
    } catch (e3) {
    }

    try {
      completionModal.style.display = 'flex';
      renderLucide(completionModal);
    } catch (e4) {
    }

    try {
      const resultsBtn = document.getElementById('completionResultsBtn');
      if (resultsBtn && typeof resultsBtn.focus === 'function') resultsBtn.focus();
    } catch (e5) {
    }

    // Автоматическая отправка отчёта в Telegram при успешном завершении диктанта
    try {
      const session = window.__dictationModalActiveSession;
      if (session && typeof autoSendTeacherReportAfterSuccess === 'function') {
        const allKeys = session.content ? session.content.getAllKeys() : [];
        let totalPerfect = 0;
        let totalCorrected = 0;
        let totalAudio = 0;
        let totalErrors = 0;
        const sentencesData = [];

        for (const key of allKeys) {
          const st = session.getState(key);
          const p = Number(st.number_of_perfect) || 0;
          const c = Number(st.number_of_corrected) || 0;
          const a = Number(st.number_of_audio) || 0;
          const er = Number(st.mistake_count) || 0;

          totalPerfect += p;
          totalCorrected += c;
          totalAudio += a;
          totalErrors += er;

          if (p > 0 || c > 0 || a > 0) {
            sentencesData.push({
              sentence_key: key,
              perfect_count: p,
              corrected_count: c,
              audio_count: a,
              attempts_total: 0,
              mistake_count: er,
              selection_state: st.selection_state || 'unchecked',
            });
          }
        }

        const totalTimeMs = session.timer ? (session.timer.accumulatedMs || 0) : 0;
        const nowMs = Date.now();
        const tzOffsetMin = -new Date().getTimezoneOffset();

        // Собираем settingsJson из данных, доступных в контексте модального окна
        let modalSettingsJson = null;
        try {
          const seq = typeof getPlaySequenceStartValue === 'function' ? getPlaySequenceStartValue() : (window.playSequenceStart || 'oto');
          const repeatsEl = document.getElementById('modal-audioRepeatsInput');
          const repeats = repeatsEl && repeatsEl.value != null && String(repeatsEl.value).trim() ? String(repeatsEl.value).trim() : '3';
          modalSettingsJson = JSON.stringify({
            audio: {
              start: seq,
              repeats: repeats,
            },
          });
        } catch (eSettings) {
          modalSettingsJson = null;
        }

        autoSendTeacherReportAfterSuccess({
          completionCountAfter: undefined,
          errorWords: null,
          perfectCount: totalPerfect,
          correctedCount: totalCorrected,
          audioCount: totalAudio,
          attemptsTotal: 0,
          errorCount: totalErrors,
          timeMs: totalTimeMs,
          completedAtMs: nowMs,
          completedAtTzOffsetMin: tzOffsetMin,
          sentencesData: sentencesData,
          settingsJson: modalSettingsJson,
        });
      }
    } catch (e6) {
    }

    // Отправляем success в outbox_batcher (завершение диктанта)
    try {
      const ob = window.OutboxBatcher;
      if (ob && typeof ob.enqueueSuccessUrgent === 'function') {
        const session = window.__dictationModalActiveSession;
        if (session) {
          const allKeys = session.content ? session.content.getAllKeys() : [];
          let totalPerfect = 0;
          let totalCorrected = 0;
          let totalAudio = 0;
          let totalErrors = 0;
          let totalAttempts = 0;
          let totalChars = 0;
          let totalMoneyEarned = 0;
          const sentencesData = [];

          for (const key of allKeys) {
            const st = session.getState(key);
            const p = Number(st.number_of_perfect) || 0;
            const c = Number(st.number_of_corrected) || 0;
            const a = Number(st.number_of_audio) || 0;
            const er = Number(st.mistake_count) || 0;
            const at = Number(st.attempts_total) || 0;
            const ch = Number(st.number_of_characters) || 0;

            totalPerfect += p;
            totalCorrected += c;
            totalAudio += a;
            totalErrors += er;
            totalAttempts += at;
            totalChars += ch;
            totalMoneyEarned += (Number(st.money_earned) || 0);

            if (p > 0 || c > 0 || a > 0) {
              sentencesData.push({
                sentence_key: key,
                perfect_count: p,
                corrected_count: c,
                audio_count: a,
                attempts_total: at,
                mistake_count: er,
                selection_state: st.selection_state || 'unchecked',
              });
            }
          }

          const totalTimeMs = session.timer ? (session.timer.accumulatedMs || 0) : 0;
          const nowMs = Date.now();
          const tzOffsetMin = -new Date().getTimezoneOffset();
          const dictationId = getCurrentDictationIdForDb();
          const dictationLanguageCode = _getDictationLanguageCode();
          const selectedSentencePositions = _getSelectedSentencePositions(session);

          ob.enqueueSuccessUrgent({
            dictation_id: dictationId,
            perfect_count: totalPerfect,
            corrected_count: totalCorrected,
            audio_count: totalAudio,
            attempts_total: totalAttempts,
            mistake_count: totalErrors,
            monenumber_of_characters: totalChars,
            money_earned: totalMoneyEarned,
            time_ms: totalTimeMs,
            dictation_language_code: dictationLanguageCode,
            sentences_data: sentencesData,
            completed_at_ms: nowMs,
            completed_at_tz_offset_min: tzOffsetMin,
            selected_sentence_positions: selectedSentencePositions,
            date_start: session.dateStart,
          });
        }
      }
    } catch (e7) {
    }

  }

  function setupCompletionModalHandlers() {
    const completionModal = document.getElementById('completionModal');
    const exitBtn = document.getElementById('completionExitBtn');
    const resultsBtn = document.getElementById('completionResultsBtn');
    if (!completionModal || !exitBtn) return;

    try {
      if (completionModal.dataset.boundDictafanCompletionModal !== '1') {
        completionModal.dataset.boundDictafanCompletionModal = '1';
        completionModal.addEventListener('click', (e) => {
          try {
            if (e && e.target === completionModal) {
              return;
            }
          } catch (e2) {
          }
        });
      }
    } catch (e) {
    }

    try {
      if (resultsBtn && resultsBtn.dataset.boundDictafanCompletionModal !== '1') {
        resultsBtn.dataset.boundDictafanCompletionModal = '1';
        resultsBtn.addEventListener('click', () => {
          hideCompletionModal();
          try {
            const session = window.__dictationModalActiveSession;
            if (session) {
              renderStartModalSentencesTable(session);
              showStartModal();
              updateNavigatorFromSession(session);
            }
          } catch (e1) {
          }
        });
      }
    } catch (e) {
    }

    try {
      if (exitBtn.dataset.boundDictafanCompletionModal !== '1') {
        exitBtn.dataset.boundDictafanCompletionModal = '1';
        exitBtn.addEventListener('click', () => {
          hideCompletionModal();
          try {
            // clearSession=true — удаляем сессию из store и IDB,
            // чтобы при повторном открытии не подхватывалась старая
            close(true);
          } catch (e0) {
          }
        });
      }
    } catch (e) {
    }
  }

  function resetSentenceUiFromSession(session) {
    try {
      // If user navigates to an already completed sentence, show it as completed instead of
      // wiping the input/state. (Repeat button starts a new attempt and will reset anyway.)
      const view = getCurrentSentenceViewFromSession(session);
      const st0 = getCurrentSentenceStateFromSession(session);
      const perfect0 = Number(st0 && st0.number_of_perfect) || 0;
      const corrected0 = Number(st0 && st0.number_of_corrected) || 0;
      const isCompletedText = (perfect0 >= 1);
      if (view && isCompletedText) {
        const originalText = String(view.text_original != null ? view.text_original : (view.text != null ? view.text : ''));
        const translationText = String(view.text_translation != null ? view.text_translation : (view.translation != null ? view.translation : ''));

        try {
          const input = document.getElementById('userInput');
          if (input) {
            input.textContent = originalText;
            input.setAttribute('contenteditable', 'false');
          }
        } catch (e0c0) {
        }

        try {
          const correct = document.getElementById('correctAnswer');
          if (correct) {
            correct.textContent = translationText;
            correct.style.display = 'block';
            try {
              correct.style.color = 'var(--color-button-text-gray)';
            } catch (e0c1) {
            }
          }
        } catch (e0c2) {
        }

        try {
          setCheckButtonState('star');
        } catch (e0c3) {
        }

        try {
          updateAudioUserPanelVisibilityFromSession(session);
        } catch (e0c4) {
        }

        try {
          applyExerciseMode(session);
        } catch (e0c5) {
        }

        // Если предложение полностью выполнено (звезда + аудио в зависимости от режима),
        // останавливаем таймер — пользователь больше ничего не может сделать в этом предложении.
        try {
          const completion = computeSentenceCompletionState(st0);
          if (completion.textOk && completion.audioOk) {
            _pauseDictationTimer();
          }
        } catch (e0comp) {
        }

        return;
      }
    } catch (e0completed) {
    }

    try {
      const st = getCurrentSentenceStateFromSession(session);
      if (st) st.mistake_count_current = 0;
    } catch (e0) {
    }

    try {
      const view = getCurrentSentenceViewFromSession(session);
      if (view) view._textAllCorrect = false;
    } catch (e0x) {
    }

    try {
      const st = getCurrentSentenceStateFromSession(session);
      if (st) st._textAllCorrect = false;
    } catch (e0y) {
    }

    try {
      const view = getCurrentSentenceViewFromSession(session);
      if (view) view._textAttemptCount = 0;
    } catch (e0a) {
    }

    try {
      const st = getCurrentSentenceStateFromSession(session);
      if (st) st._textAttemptCount = 0;
    } catch (e0b) {
    }

    try {
      const view = getCurrentSentenceViewFromSession(session);
      if (view) view._charsAddedThisAttempt = false;
    } catch (e0c) {
    }
    try {
      const st = getCurrentSentenceStateFromSession(session);
      if (st) st._charsAddedThisAttempt = false;
    } catch (e0d) {
    }

    try {
      const input = document.getElementById('userInput');
      if (input) input.setAttribute('contenteditable', 'true');
    } catch (e0x) {
    }

    try {
      const el = document.getElementById('errorCountLabel');
      const len = _ensureExpectedCharsLen(session);
      if (el) el.textContent = len > 0 ? `0/${len}` : '';
    } catch (e1) {
    }

    try {
      setCheckButtonState('ready');
    } catch (e2) {
    }

    try {
      const input = document.getElementById('userInput');
      if (input) input.textContent = '';
    } catch (e3) {
    }

    try {
      const correct = document.getElementById('correctAnswer');
      if (correct) {
        correct.textContent = '';
        correct.style.display = 'none';
      }
    } catch (e4) {
    }

    try {
      // Сбрасываем кнопку "Проверить-повторить" в исходное состояние (ready)
      setCheckButtonState('ready');
    } catch (e5a) {
    }

    try {
      updateAudioUserPanelVisibilityFromSession(session);
    } catch (e5) {
    }

    try {
      applyExerciseMode(session);
    } catch (e6) {
    }

  }

  try {
    // Wrap existing global navigation functions (if any) so reward cycles work even when
    // legacy scripts define startGame/nextSentence/previousSentence before this file.
    {
      const prevStartGame = typeof window.startGame === 'function' ? window.startGame : null;
      window.startGame = () => {
        try { startNewRewardCycle(); } catch (e00c) {}
        if (prevStartGame) {
          try { return prevStartGame(); } catch (e0) { return; }
        }
        try {
          const session = window.__dictationModalActiveSession;
          if (session) {
            try { state.dictationStarted = true; } catch (e0) {}
            // Устанавливаем дату начала диктанта (локальная дата, без времени)
            if (!session.dateStart) {
              const d = new Date();
              session.dateStart = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
            }
            try {
              const p = getProgressPanelInstance();
              if (p && typeof p.startTimer === 'function') p.startTimer();
            } catch (e1) {}
            try { resetInactivityTimer(); } catch (e2) {}
            try {
              const m = document.getElementById('start-modal');
              if (m) m.style.display = 'none';
            } catch (e3) {}
            // Возобновляем таймер при старте игры (кнопка Start)
            _resumeDictationTimer();
            session.ensureDefaultSelection();
            session.currentSelectedIndex = 0;
            try { resetSentenceUiFromSession(session); } catch (e00) {}
            // Запоминаем время старта первого предложения
            try { _initSentenceTime(session); } catch (e0t) {}
            updateNavigatorFromSession(session);
          }
        } catch (e0) {
        }
      };

      const prevNextSentence = typeof window.nextSentence === 'function' ? window.nextSentence : null;
      window.nextSentence = () => {
        try { startNewRewardCycle(); } catch (e00c) {}
        if (prevNextSentence) {
          try { return prevNextSentence(); } catch (e0) { return; }
        }
        try {
          const session = window.__dictationModalActiveSession;
          if (!session) return;
          // Сохраняем время текущего предложения перед уходом
          try { _saveSentenceTime(session); } catch (e0st) {}
          session.goNext();
          try { resetSentenceUiFromSession(session); } catch (e00) {}
          // Запоминаем время старта нового предложения
          try { _initSentenceTime(session); } catch (e0it) {}
          updateNavigatorFromSession(session);
        } catch (e) {
        }
      };

      const prevPrevSentence = typeof window.previousSentence === 'function' ? window.previousSentence : null;
      window.previousSentence = () => {
        try { startNewRewardCycle(); } catch (e00c) {}
        if (prevPrevSentence) {
          try { return prevPrevSentence(); } catch (e0) { return; }
        }
        try {
          const session = window.__dictationModalActiveSession;
          if (!session) return;
          // Сохраняем время текущего предложения перед уходом
          try { _saveSentenceTime(session); } catch (e0st) {}
          session.goPrev();
          try { resetSentenceUiFromSession(session); } catch (e00) {}
          // Запоминаем время старта нового предложения
          try { _initSentenceTime(session); } catch (e0it) {}
          updateNavigatorFromSession(session);
        } catch (e) {
        }
      };
    }
    if (typeof window.checkText !== 'function') {
      window.checkText = () => {
        try {
          if (!state.dictationStarted) return;
        } catch (e0) {
        }

        // В режимах p3 и p4 проверка текста не используется
        try {
          const mode = getExerciseMode();
          if (mode === 'audio-only-no-hint' || mode === 'audio-only-hint') return;
        } catch (e0mode) {
        }

        const session = window.__dictationModalActiveSession;
        if (!session) return;

        const view = getCurrentSentenceViewFromSession(session);
        if (!view) return;

        // Если текст уже засчитан как правильный (allCorrect), не даём
        // повторно запускать проверку — это предотвращает дублирование
        // кружков активности (text_activity_count) при повторном нажатии Enter.
        try {
          const st = getCurrentSentenceStateFromSession(session);
          if (st && st._textAllCorrect) return;
        } catch (e0pre) {
        }
        try {
          if (view._textAllCorrect) return;
        } catch (e0pre2) {
        }

        const originalText = String(view.text_original != null ? view.text_original : (view.text != null ? view.text : ''));
        const userInputEl = document.getElementById('userInput');
        const userText = userInputEl ? String(userInputEl.textContent || '') : '';

        let langOrig = '';
        try {
          const dictationData = document.getElementById('dictation-data');
          langOrig = dictationData ? String(dictationData.getAttribute('data-language-original') || '').trim() : '';
        } catch (e1) {
        }

        let checker = null;
        try {
          checker = state._typoChecker;
        } catch (e2) {
        }
        if (!checker) {
          try {
            if (window.ПроверкаНаОшибки) {
              checker = new window.ПроверкаНаОшибки();
              state._typoChecker = checker;
            }
          } catch (e3) {
          }
        }
        if (!checker || typeof checker.analyze !== 'function') return;

        let renderer = null;
        try {
          renderer = state._typoRenderer;
        } catch (e10) {
        }
        if (!renderer) {
          try {
            if (window.РендерПроверки) {
              renderer = new window.РендерПроверки(checker);
              state._typoRenderer = renderer;
            }
          } catch (e11) {
          }
        }

        const prevPerfect = Number(view.number_of_perfect) || 0;
        const prevCorrected = Number(view.number_of_corrected) || 0;

        let requiredPassedStarHalf = null;
        try {
          const el = document.getElementById('modal-requiredPassedStarHalfInput');
          if (el && el.value != null && String(el.value).trim()) {
            requiredPassedStarHalf = Number(el.value);
          }
        } catch (e4) {
        }

        let totalMistakeCount = 0;
        try {
          const st = getCurrentSentenceStateFromSession(session);
          if (st) totalMistakeCount = Number(st.mistake_count) || 0;
        } catch (eMC) {
        }

        const res = checker.analyze({
          originalText,
          userText,
          langOriginal: langOrig,
          textAttemptCount: Number(view._textAttemptCount) || 0,
          prevPerfect,
          prevCorrected,
          requiredPassedStarHalf,
          totalMistakeCount,
        });

        try {
          const notice = document.getElementById('userInputNotice');
          if (notice) {
            if (res && res.okToCheck === false && res.noticeMessage) {
              notice.textContent = String(res.noticeMessage);
              notice.style.display = 'block';
            } else {
              notice.textContent = '';
              notice.style.display = 'none';
            }
          }
        } catch (e5) {
        }

        if (!res || res.okToCheck === false) return;

        try {
          const expectedLen = _ensureExpectedCharsLen(session);
          if (expectedLen > 0) {
            const stForChars = session && view && view.key != null ? session.getState(String(view.key)) : null;
            const already = !!(view && view._charsAddedThisAttempt);
            if (!already) {
              view._charsAddedThisAttempt = true;
              if (stForChars) stForChars._charsAddedThisAttempt = true;
              if (stForChars) {
                stForChars.number_of_characters = (Number(stForChars.number_of_characters) || 0) + expectedLen;
              }
            }
          }
        } catch (eChars) {
        }

        try {
          const inputField = document.getElementById('userInput');
          if (
            renderer &&
            typeof renderer.renderToEditable === 'function' &&
            inputField &&
            Array.isArray(res.verified) &&
            res.verified.length
          ) {
            renderer.renderToEditable(res.verified, inputField);
          }
        } catch (e12) {
        }

        try {
          const correctAnswerDiv = document.getElementById('correctAnswer');
          if (renderer && typeof renderer.renderResult === 'function' && correctAnswerDiv) {
            renderer.renderResult(originalText, res.verified, correctAnswerDiv);
            if (!res.allCorrect) {
              correctAnswerDiv.style.display = 'block';
              try {
                state._hideCorrectAnswerOnNextUserInput = true;
              } catch (e0h) {
              }
            }
          }
        } catch (e13) {
        }

        try {
          const inputField = document.getElementById('userInput');
          if (inputField) {
            if (res && res.allCorrect) {
              inputField.setAttribute('contenteditable', 'false');
            } else {
              inputField.setAttribute('contenteditable', 'true');
            }
          }
        } catch (e13b) {
        }

        try {
          if (res && !res.allCorrect) {
            const stForErr = session && view && view.key != null ? session.getState(String(view.key)) : null;
            const prevAttemptsWithErrors = Number(stForErr && stForErr.mistake_count_current) || 0;
            const nextAttemptsWithErrors = prevAttemptsWithErrors + 1;
            if (stForErr) stForErr.mistake_count_current = nextAttemptsWithErrors;
            const el = document.getElementById('errorCountLabel');
            const expectedLen = _ensureExpectedCharsLen(session);
            if (el) {
              if (expectedLen > 0) el.textContent = `${nextAttemptsWithErrors}/${expectedLen}`;
              else el.textContent = nextAttemptsWithErrors > 0 ? String(nextAttemptsWithErrors) : '';
            }
          }
        } catch (e6) {
        }

        try {
          if (!res.allCorrect) {
            view._textAttemptCount = (Number(view._textAttemptCount) || 0) + 1;
          }
        } catch (e14) {
        }

        try {
          view.number_of_perfect = res.nextPerfect;
          view.number_of_corrected = res.nextCorrected;
        } catch (e7) {
        }

        try {
          if (res && res.allCorrect) {
            if (res.starOutcome === 'perfect') {
              setCheckButtonState('star');
            } else if (res.starOutcome === 'half' || res.starOutcome === 'corrected') {
              setCheckButtonState('half');
            } else {
              setCheckButtonState('ready');
            }
          } else {
            setCheckButtonState('ready');
          }
        } catch (e7b) {
        }

        try {
          const key = view && view.key != null ? String(view.key) : '';
          if (key && session && typeof session.getState === 'function') {
            const st = session.getState(key);
            const prevAllCorrect = !!(st && st._textAllCorrect);
            const prevPerfectSt = Number(st && st.number_of_perfect) || 0;
            const prevCorrectedSt = Number(st && st.number_of_corrected) || 0;
            st.number_of_perfect = res.nextPerfect;
            st.number_of_corrected = res.nextCorrected;

            try {
              st._textAllCorrect = !!(res && res.allCorrect);
              view._textAllCorrect = !!(res && res.allCorrect);
            } catch (e0ac) {
            }

            try {
              if (res && res.allCorrect) {
                const prevOutcome = st && st._lastStarOutcome != null ? String(st._lastStarOutcome) : '';
                const nextOutcome = res.starOutcome != null ? String(res.starOutcome) : '';

                const cycleId = Number(state.rewardCycleId) || 0;
                const paidCycleId = Number(st && st._paidTextRewardCycleId) || 0;

                let reward = 0;
                const perfectNow = Number(st && st.number_of_perfect) || 0;
                const correctedNow = Number(st && st.number_of_corrected) || 0;
                if (perfectNow >= 1) {
                  reward = getPricingValue('star_reward', 3);
                } else if (correctedNow > 0) {
                  reward = getPricingValue('half_star_reward', 2);
                } else {
                  // Активность — больше 1 ошибки, текст исправлен
                  reward = getPricingValue('text_activity_reward', 1);
                  try {
                    st.text_activity_count = (Number(st.text_activity_count) || 0) + 1;
                  } catch (e0ac0) {
                  }
                }

                if (reward > 0 && cycleId > 0 && paidCycleId !== cycleId) {
                  try {
                    st.money_count = (Number(st.money_count) || 0) + reward;
                    st.money_earned = (Number(st.money_earned) || 0) + reward;
                  } catch (e0ac1) {
                  }
                  st._paidTextRewardCycleId = cycleId;
                  try {
                    playUiSound('coins_plus_audio');
                  } catch (e0sa) {
                  }

                  // Отправляем активность в outbox_batcher (только perfect/corrected — значимые для статистики)
                  try {
                    const ob = window.OutboxBatcher;
                    if (ob && typeof ob.enqueueActivity === 'function') {
                      const dictationId = getCurrentDictationIdForDb();
                      const dictationLanguageCode = _getDictationLanguageCode();
                      const selectedSentencePositions = _getSelectedSentencePositions(session);
                      const typeActivity = perfectNow >= 1 ? 'perfect' : (correctedNow > 0 ? 'corrected' : null);
                      if (typeActivity) {
                        ob.enqueueActivity({
                          type: typeActivity,
                          count: 1,
                          leadTimeMs: _getSessionLeadTimeMs(session),
                          dictationId,
                          date: null,
                          dictationLanguageCode,
                          selectedSentencePositions,
                        });
                      }
                    }
                  } catch (e0ob) {
                  }
                }

                if (nextOutcome && nextOutcome !== prevOutcome) {
                  st._lastStarOutcome = nextOutcome;
                }
              }
            } catch (e0star) {
            }

            // Обновляем строку в таблице стартового модального окна (ПОСЛЕ обновления всех полей st)
            try {
              updateStartModalSentenceRow(session, key);
            } catch (eRow) {
            }
            try {
              if (view && view.mistake_count != null) st.mistake_count = view.mistake_count;
            } catch (e0) {
            }

            try {
              if (res && !res.allCorrect) {
                if (st && st.mistake_count_current != null) {
                  st.mistake_count_current = (Number(st.mistake_count_current) || 0);
                }
              }
            } catch (e0b) {
            }
            try {
              if (view && view._textAttemptCount != null) st._textAttemptCount = view._textAttemptCount;
            } catch (e1) {
            }

            try {
              // Rewards are paid in the block above (res.allCorrect), once per reward cycle.
            } catch (e2) {
            }

            try {
              if (res && !res.allCorrect) {
                st.mistake_count = (Number(st.mistake_count) || 0) + 1;
                view.mistake_count = st.mistake_count;
              }
            } catch (e3) {
            }

            try {
              if (res && res.allCorrect) {
              }
            } catch (e3b) {
            }
          }
        } catch (e15) {
        }

        try {
          if (res.allCorrect) {
            const correctAnswerDiv = document.getElementById('correctAnswer');
            if (correctAnswerDiv) {
              correctAnswerDiv.style.display = 'block';
              correctAnswerDiv.textContent = String(view.text_translation != null ? view.text_translation : (view.translation != null ? view.translation : ''));
              try {
                correctAnswerDiv.style.color = 'var(--color-button-text-gray)';
              } catch (e0) {
              }
            }
          }
        } catch (e8) {
        }

        try {
          updateNextButtonVisibilityFromSession(session);
        } catch (e10) {
        }

        try {
          // Передаём ключ предложения напрямую, чтобы tablo обновилось для правильного предложения
          updateSentenceTabloFromSession(session, key);
          updateTaskProgressFromSession(session);
        } catch (e10b) {
        }

        try {
          // Фокус после проверки (новый алгоритм):
          // 1) если есть ошибки (!allCorrect) — фокус на userInput (поле ввода), чтобы сразу исправить
          // 2) если текст исправлен (allCorrect), но нет звезды/полузвезды (textOk=false) — фокус на checkBtn (кнопка повтора)
          // 3) если есть полузвезда (textOk, corrected>0, perfect<1) — фокус на checkBtn (кнопка повтора в режиме half)
          // 4) если есть звезда (textOk, perfect>=1) и требуется микрофон, но он ещё не выполнен — фокус на запись.
          // 5) если текст + микрофон выполнены — фокус на "Далее" (resultNextBtn)
          {
            const st = getCurrentSentenceStateFromSession(session);
            const { textOk, audioOk, requiresAudio } = computeSentenceCompletionState(st);
            const allCorrect = !!(res && res.allCorrect);
            const perfect = Number(st && st.number_of_perfect) || 0;
            const corrected = Number(st && st.number_of_corrected) || 0;

            // Случай: есть ошибки — фокус на поле ввода, чтобы пользователь мог сразу исправить
            if (!allCorrect) {
              const input = document.getElementById('userInput');
              if (input && typeof input.focus === 'function') {
                try {
                  state._skipNavigatorFocusOnce = true;
                } catch (e0skip) {
                }
                input.focus();
              }
            } else if (allCorrect && !textOk) {
              // Случай: текст исправлен, но звезды/полузвезды нет — фокус на checkBtn (кнопка повтора)
              const checkBtn = document.getElementById('checkBtn');
              if (checkBtn && !checkBtn.disabled && typeof checkBtn.focus === 'function') {
                try {
                  state._skipNavigatorFocusOnce = true;
                } catch (e0skip) {
                }
                checkBtn.focus();
              }
            } else if (textOk && corrected > 0 && perfect < 1) {
              // Полузвезда — фокус на checkBtn (кнопка повтора в режиме half)
              const checkBtn = document.getElementById('checkBtn');
              if (checkBtn && !checkBtn.disabled && typeof checkBtn.focus === 'function') {
                try {
                  state._skipNavigatorFocusOnce = true;
                } catch (e0skip) {
                }
                checkBtn.focus();
              }
            } else if (textOk && !audioOk && requiresAudio > 0) {
              try {
                updateAudioUserPanelVisibilityFromSession(session);
              } catch (e00) {
              }
              const rb = document.getElementById('recordButton');
              if (rb && typeof rb.focus === 'function') {
                try {
                  state._skipNavigatorFocusOnce = true;
                } catch (e0x) {
                }
                rb.focus();
              }
            } else if (textOk && audioOk) {
              const nb = document.getElementById('resultNextBtn');
              if (nb && !nb.disabled && typeof nb.focus === 'function') {
                try {
                  state._skipNavigatorFocusOnce = true;
                } catch (e0y) {
                }
                nb.focus();
              }
            }
          }
        } catch (e11) {
        }

        try {
          updateNavigatorFromSession(session);
        } catch (e9) {
        }
      };
    }
  } catch (e) {
  }

  function getProgressPanelInstance() {
    try {
      const p = window.progressPanel;
      if (p && typeof p.getTimerSnapshot === 'function') return p;
    } catch (e) {
    }
    return null;
  }

  function getProgressTimerSnapshot() {
    try {
      const p = getProgressPanelInstance();
      if (p) return p.getTimerSnapshot();
    } catch (e) {
    }
    return { mode: 'clock', isRunning: false, elapsedMs: 0, countdownRemainingMs: 0, accumulatedMs: 0 };
  }

  function formatHhMmSs(ms) {
    try {
      const totalSec = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
      const h = Math.floor(totalSec / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    } catch (e) {
      return '00:00:00';
    }
  }

  function formatMmSs(ms) {
    try {
      const totalSec = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    } catch (e) {
      return '00:00';
    }
  }

  function getTimerDisplayMs(snapshot = getProgressTimerSnapshot()) {
    try {
      if (snapshot && snapshot.mode === 'countdown') {
        return Number(snapshot.countdownRemainingMs) || 0;
      }
      return Number(snapshot.elapsedMs) || 0;
    } catch (e) {
      return 0;
    }
  }

  function stopAllAudios() {
    try {
      const am = window.AudioManager;
      if (am && typeof am.stop === 'function') {
        am.stop();
      } else if (am && typeof am.pause === 'function') {
        am.pause();
      }
    } catch (e) {
    }
  }

  function preloadUiSounds() {
    try {
      if (window.__dictafanUiSounds && typeof window.__dictafanUiSounds === 'object') return;
      window.__dictafanUiSounds = {
        coins_minus: '/static/data/sounds/coins/coins_minus.wav',
        coins_plus_text: '/static/data/sounds/coins/coins_plus_text.wav',
        coins_plus_audio: '/static/data/sounds/coins/coins_plus_audio.wav',
      };
      for (const k of Object.keys(window.__dictafanUiSounds)) {
        try {
          const url = window.__dictafanUiSounds[k];
          const a = new Audio(url);
          a.preload = 'auto';
          a.load();
        } catch (e0) {
        }
      }
    } catch (e) {
    }
  }

  function playUiSound(key) {
    try {
      const map = window.__dictafanUiSounds;
      const url = map && map[key] ? String(map[key]) : '';
      if (!url) return;
      const a = new Audio(url);
      a.volume = 1;
      a.play().catch(() => {});
    } catch (e) {
    }
  }

  function bindUserInputScriptGuards() {
    let input = null;
    try {
      input = document.getElementById('userInput');
    } catch (e0) {
    }
    if (!input) return;

    const saveCursorPosition = (containerEl) => {
      try {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return null;
        const range = sel.getRangeAt(0);
        const preRange = range.cloneRange();
        preRange.selectNodeContents(containerEl);
        preRange.setEnd(range.startContainer, range.startOffset);
        return preRange.toString().length;
      } catch (e) {
        return null;
      }
    };

    const restoreCursorPosition = (containerEl, offset) => {
      try {
        if (offset === null || offset === undefined) return;
        const range = document.createRange();
        const sel = window.getSelection();
        if (!sel) return;
        let currentOffset = 0;
        const walk = (node) => {
          if (!node) return false;
          if (node.nodeType === Node.TEXT_NODE) {
            const nextOffset = currentOffset + node.length;
            if (offset <= nextOffset) {
              range.setStart(node, Math.max(0, offset - currentOffset));
              range.collapse(true);
              sel.removeAllRanges();
              sel.addRange(range);
              return true;
            }
            currentOffset = nextOffset;
            return false;
          }
          const kids = node.childNodes || [];
          for (let i = 0; i < kids.length; i++) {
            if (walk(kids[i])) return true;
          }
          return false;
        };
        walk(containerEl);
      } catch (e) {
      }
    };

    try {
      if (input.dataset.boundDictationModalScriptGuards === '1') return;
      input.dataset.boundDictationModalScriptGuards = '1';
    } catch (e1) {
    }

    const showInputScriptNoticeOnce = (script) => {
      try {
        const now = Date.now();
        const last = Number(state._lastScriptHintAt || 0) || 0;
        if (now - last < 1500) return;
        state._lastScriptHintAt = now;
      } catch (e0) {
      }
      try {
        const notice = document.getElementById('userInputNotice');
        if (!notice) return;
        const hint = script === 'cyrillic' ? 'RU/UK' : (script === 'arabic' ? 'AR' : 'EN');
        notice.textContent = `Для этого диктанта включи раскладку ${hint}`;
        notice.style.display = 'block';
      } catch (e1) {
      }
    };

    const getChecker = () => {
      try {
        if (state._typoChecker) return state._typoChecker;
      } catch (e0) {
      }
      try {
        if (window.ПроверкаНаОшибки) {
          state._typoChecker = new window.ПроверкаНаОшибки();
          return state._typoChecker;
        }
      } catch (e1) {
      }
      return null;
    };

    const getScript = () => {
      let langOrig = '';
      try {
        const dictationData = document.getElementById('dictation-data');
        langOrig = dictationData ? String(dictationData.getAttribute('data-language-original') || '').trim() : '';
      } catch (e0) {
      }
      const checker = getChecker();
      if (!checker || typeof checker.getDictationScript !== 'function') return 'latin';
      return checker.getDictationScript(langOrig);
    };

    const hasDisallowedChars = (text, script) => {
      const checker = getChecker();
      if (!checker || typeof checker.hasDisallowedChars !== 'function') return false;
      return checker.hasDisallowedChars(text, script);
    };

    const stripDisallowedChars = (text, script) => {
      const checker = getChecker();
      if (!checker || typeof checker.stripDisallowedChars !== 'function') return String(text || '');
      return checker.stripDisallowedChars(text, script);
    };

    input.addEventListener('input', () => {
      try {
        resetInactivityTimer();
      } catch (e0) {
      }

      try {
        if (state._hideCorrectAnswerOnNextUserInput) {
          state._hideCorrectAnswerOnNextUserInput = false;
          const correct = document.getElementById('correctAnswer');
          if (correct) {
            correct.textContent = '';
            correct.style.display = 'none';
          }
        }
      } catch (e0h) {
      }

      try {
        const html = input.innerHTML;
        if (typeof html === 'string' && html.indexOf('<') !== -1) {
          const plainText = input.textContent || '';
          const cursorPos = saveCursorPosition(input);
          input.textContent = plainText;
          restoreCursorPosition(input, cursorPos);
        }

        const currentText = String(input.textContent || '');
        const script = getScript();
        if (hasDisallowedChars(currentText, script)) {
          const sanitized = stripDisallowedChars(currentText, script);
          const cursorPos = saveCursorPosition(input);
          input.textContent = sanitized;
          restoreCursorPosition(input, cursorPos);
          showInputScriptNoticeOnce(script);
        }
      } catch (e1) {
      }
    });

    input.addEventListener('beforeinput', (event) => {
      try {
        const t = event && typeof event.data === 'string' ? event.data : '';
        if (!t) return;
        const script = getScript();
        if (hasDisallowedChars(t, script)) {
          event.preventDefault();
          showInputScriptNoticeOnce(script);
        }
      } catch (e) {
      }
    });

    input.addEventListener('paste', (event) => {
      try {
        if (!state.dictationStarted) return;
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }
      } catch (e) {
      }
    }, true);
  }

  function isStartModalOpen() {
    try {
      const m = document.getElementById('start-modal');
      return !!(m && (m.style.display === 'flex' || m.style.display === 'block'));
    } catch (e) {
      return false;
    }
  }

  function isPauseModalOpen() {
    try {
      const m = document.getElementById('pauseModal');
      return !!(m && (m.style.display === 'flex' || m.style.display === 'block'));
    } catch (e) {
      return false;
    }
  }

  function clearInactivityTimer() {
    try {
      if (state._inactivityTimer) clearTimeout(state._inactivityTimer);
    } catch (e) {
    }
    state._inactivityTimer = null;
  }

  function resetInactivityTimer() {
    try {
      if (!state.dictationStarted) return;
      const snap = getProgressTimerSnapshot();
      if (!snap || !snap.isRunning) {
        clearInactivityTimer();
        return;
      }
      clearInactivityTimer();
      if (isPauseModalOpen() || isStartModalOpen()) return;
      const timeout = Number(state._currentInactivityTimeout || 0) || INACTIVITY_TIMEOUT_DEFAULT;
      state._inactivityTimer = setTimeout(() => {
        try {
          pauseGame(true);
        } catch (e) {
        }
      }, timeout);
    } catch (e) {
    }
  }

  function pauseGame(isInactivityPause = false) {
    try {
      if (!state.dictationStarted) return;
      if (state._pauseDisabled) return;
      const pauseModal = document.getElementById('pauseModal');
      if (!pauseModal) return;
      if (pauseModal.style.display === 'flex') return;

      const snap = getProgressTimerSnapshot();
      if (!snap || !snap.isRunning) return;

      // Останавливаем таймер через общую процедуру
      _pauseDictationTimer();

      if (isInactivityPause) {
        try {
          const p = getProgressPanelInstance();
          const inactivityTime = Number(state._currentInactivityTimeout || 0) || INACTIVITY_TIMEOUT_DEFAULT;
          if (p && p.timerState) {
            p.timerState.dictationAccumulatedMs = Math.max(0, (Number(p.timerState.dictationAccumulatedMs) || 0) - inactivityTime);
          }
        } catch (e) {
        }
      }

      clearInactivityTimer();
      stopAllAudios();

      try {
        const el = document.getElementById('pauseTimer');
        if (el) el.textContent = formatHhMmSs(getTimerDisplayMs(getProgressTimerSnapshot()));
      } catch (e) {
      }

      pauseModal.style.display = 'flex';
      try {
        const resumeBtn = document.getElementById('resumeBtn');
        if (resumeBtn) resumeBtn.focus();
      } catch (e) {
      }
    } catch (e) {
    }
  }

  function resumeGame() {
    try {
      const pauseModal = document.getElementById('pauseModal');
      if (pauseModal) pauseModal.style.display = 'none';
    } catch (e) {
    }

    // Возобновляем таймер через общую процедуру
    _resumeDictationTimer();

    try {
      resetInactivityTimer();
    } catch (e) {
    }

    try {
      const input = document.getElementById('userInput');
      if (input && typeof input.focus === 'function') input.focus();
    } catch (e) {
    }
  }

  try {
    if (typeof window.pauseGame !== 'function') window.pauseGame = pauseGame;
    if (typeof window.resumeGame !== 'function') window.resumeGame = resumeGame;
  } catch (e) {
  }

  function bindDictationModalHotkeys() {
    try {
      if (document.body.dataset.boundDictationModalHotkeys === '1') return;
      document.body.dataset.boundDictationModalHotkeys = '1';
    } catch (e0) {
    }

    document.addEventListener('keydown', (event) => {
      try {
        if (!state.isOpen) return;
        if (!event) return;

        if ((event.ctrlKey || event.metaKey) && (event.key === 'v' || event.key === 'V' || event.code === 'KeyV')) {
          const active = document.activeElement;
          const isUserInput = active && (active.id === 'userInput' || (active.closest && active.closest('#userInput')));
          if (isUserInput && state.dictationStarted) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
        }

        if (!event.ctrlKey) return;

        switch (event.code) {
          case 'Escape': {
            if (!state.dictationStarted) return;
            pauseGame(false);
            event.preventDefault();
            break;
          }
          case 'Digit1': {
            if (!state.dictationStarted) return;
            const visual = window.__dictationModalOriginalAudioVisual;
            if (visual && visual.playButton) visual.playButton.click();
            event.preventDefault();
            break;
          }
          case 'Digit2': {
            if (!state.dictationStarted) return;
            const btn = document.getElementById('translationPlayButton');
            if (btn) btn.click();
            event.preventDefault();
            break;
          }
          case 'Digit3': {
            if (typeof window.previousSentence === 'function') window.previousSentence();
            event.preventDefault();
            break;
          }
          case 'Digit4': {
            if (typeof window.nextSentence === 'function') window.nextSentence();
            event.preventDefault();
            break;
          }
          default:
            break;
        }
      } catch (e) {
      }
    });
  }

  function bindInactivityWatchers() {
    try {
      if (document.body.dataset.boundDictationModalInactivity === '1') return;
      document.body.dataset.boundDictationModalInactivity = '1';
    } catch (e) {
    }

    const bump = () => {
      try {
        resetInactivityTimer();
      } catch (e) {
      }
    };

    try {
      document.addEventListener('keydown', bump, true);
      document.addEventListener('mousemove', bump, true);
      document.addEventListener('mousedown', bump, true);
      document.addEventListener('touchstart', bump, true);
      document.addEventListener('scroll', bump, true);
    } catch (e) {
    }

    try {
      if (!window.__DICTATION_MODAL_VISIBILITY_PAUSE_BOUND) {
        window.__DICTATION_MODAL_VISIBILITY_PAUSE_BOUND = true;
        document.addEventListener('visibilitychange', () => {
          try {
            if (!state.dictationStarted) return;
            if (!document.hidden) return;
            if (isPauseModalOpen() || isStartModalOpen()) return;
            pauseGame(true);
          } catch (e) {
          }
        }, true);
      }
    } catch (e) {
    }
  }

  function getCurrentSentenceViewFromSession(session) {
    try {
      if (!session || !Array.isArray(session.selectedKeys) || session.selectedKeys.length === 0) return null;
      const idx = Number(session.currentSelectedIndex) || 0;
      const key = session.selectedKeys[Math.max(0, Math.min(session.selectedKeys.length - 1, idx))];
      return session.getSentenceView ? session.getSentenceView(key) : null;
    } catch (e) {
      return null;
    }
  }

  function getCurrentSentenceStateFromSession(session) {
    try {
      if (!session || !Array.isArray(session.selectedKeys) || session.selectedKeys.length === 0) return null;
      const idx = Number(session.currentSelectedIndex) || 0;
      const key = session.selectedKeys[Math.max(0, Math.min(session.selectedKeys.length - 1, idx))];
      return session.getState ? session.getState(key) : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Сохраняет время, проведённое в текущем предложении, в st.time_count (накопительно).
   * Вызывается ПЕРЕД уходом с предложения (nextSentence, previousSentence).
   */
  function _saveSentenceTime(session) {
    try {
      if (!session) return;
      const key = session.getCurrentKey();
      if (key == null) return;
      const st = session.getState(key);
      if (!st) return;
      const elapsed = session.getElapsedMs();
      const prevAcc = Number(state._sentenceTimeAccumulatedAtStart) || 0;
      if (elapsed > prevAcc) {
        const delta = elapsed - prevAcc;
        st.time_count = (Number(st.time_count) || 0) + delta;
      }
      // Обновляем время в строке таблицы модального окна выбора предложений
      try { updateStartModalSentenceRow(session, key); } catch (e0row) {}
    } catch (e) {
    }
  }

  /**
   * Запоминает учтённое время диктанта на момент входа в предложение.
   * Вызывается ПОСЛЕ входа в новое предложение (startGame, nextSentence, previousSentence).
   */
  function _initSentenceTime(session) {
    try {
      if (!session) return;
      state._sentenceTimeAccumulatedAtStart = session.getElapsedMs();
    } catch (e) {
    }
  }

  /**
   * Останавливает таймер диктанта (сессия + прогресс-панель) без показа модалки паузы.
   * Используется при открытии модалок (start-modal, audio settings) и в pauseGame().
   */
  function _pauseDictationTimer() {
    try {
      const session = window.__dictationModalActiveSession;
      if (session && typeof session.stopTimer === 'function') {
        session.stopTimer();
      }
    } catch (e) {
    }
    try {
      const p = getProgressPanelInstance();
      if (p && typeof p.pauseTimer === 'function') {
        p.pauseTimer();
      }
    } catch (e) {
    }
  }

  /**
   * Возобновляет таймер диктанта (сессия + прогресс-панель) без скрытия модалки паузы.
   * Используется при закрытии модалок (start-modal, audio settings) и в resumeGame().
   */
  function _resumeDictationTimer() {
    try {
      const session = window.__dictationModalActiveSession;
      if (session && typeof session.startTimer === 'function') {
        session.startTimer();
      }
    } catch (e) {
    }
    try {
      const p = getProgressPanelInstance();
      if (p && typeof p.resumeTimer === 'function') {
        p.resumeTimer();
      }
    } catch (e) {
    }
  }

  function getRequiredPassedStarHalfValue() {
    try {
      const el = document.getElementById('modal-requiredPassedStarHalfInput');
      if (el && el.value != null && String(el.value).trim()) {
        const n = Number(el.value);
        if (Number.isFinite(n) && n > 0) return n;
      }
    } catch (e) {
    }
    return 3;
  }

  function getRequiredAudioRepeatsValue() {
    try {
      const el = document.getElementById('modal-audioRepeatsInput');
      if (el && el.value != null && String(el.value).trim()) {
        const n = Number(el.value);
        if (Number.isFinite(n) && n >= 0) return n;
      }
    } catch (e) {
    }
    return 1;
  }

  function focusUserInput() {
    try {
      const input = document.getElementById('userInput');
      if (input && typeof input.focus === 'function') input.focus();
    } catch (e) {
    }
  }

  function _computeComparableTextForChars(raw, langOrig = '') {
    try {
      let s = String(raw || '');
      // Keep spaces as characters; remove punctuation/diacritics/invisible.
      try {
        const checker = state && state._typoChecker;
        if (checker && typeof checker.normalizeDictationInvisibleChars === 'function') {
          s = checker.normalizeDictationInvisibleChars(s);
        }
      } catch (e0) {
      }

      // Arabic: remove harakat/diacritics
      s = s.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '');

      // Remove common punctuation (keep spaces)
      s = s.replace(/[.,!?:;"«»()\[\]{}—–\-]/g, '');

      // Normalize whitespace but keep single spaces
      s = s.replace(/\s+/g, ' ').trim();
      return s;
    } catch (e) {
      return String(raw || '').replace(/\s+/g, ' ').trim();
    }
  }

  function _ensureExpectedCharsLen(session) {
    try {
      const view = getCurrentSentenceViewFromSession(session);
      if (!view) return 0;
      if (Number.isFinite(Number(view._expectedCharsLen)) && Number(view._expectedCharsLen) > 0) {
        return Number(view._expectedCharsLen) || 0;
      }
      const originalText = String(view.text_original != null ? view.text_original : (view.text != null ? view.text : ''));
      const len = _computeComparableTextForChars(originalText).length;
      view._expectedCharsLen = len;
      try {
        const st = view.key != null && session && typeof session.getState === 'function' ? session.getState(String(view.key)) : null;
        if (st) st._expectedCharsLen = len;
      } catch (e1) {
      }
      return len;
    } catch (e) {
      return 0;
    }
  }

  function computeSentenceCompletionState(st) {
    const perfect = Number(st && st.number_of_perfect) || 0;
    const corrected = Number(st && st.number_of_corrected) || 0;
    const audioDone = Number(st && st.number_of_audio) || 0;
    const requiresAudio = getRequiredAudioRepeatsValue();
    const mode = getExerciseMode();
    // В режимах p3 и p4 текст не проверяется, поэтому textOk всегда true
    const textOk = (mode === 'audio-only-no-hint' || mode === 'audio-only-hint') ? true : (perfect >= 1 || corrected > 0);
    const audioOk = requiresAudio <= 0 || audioDone >= requiresAudio;
    return { textOk, audioOk, requiresAudio };
  }

  function _renderCoins(container, count, colorVar) {
    try {
      if (!container) return;
      const n = Math.max(0, Math.min(9, Number(count) || 0));
      const parts = [];
      for (let i = 0; i < n; i++) parts.push('<i data-lucide="circle-small"></i>');
      container.innerHTML = parts.join('');
      if (colorVar) {
        container.style.color = `var(${colorVar})`;
      }
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
      }
    } catch (e) {
    }
  }

  function _setIcon(wrap, iconName, colorVar, opacity = null) {
    try {
      if (!wrap) return;
      wrap.innerHTML = `<i data-lucide="${iconName}"></i>`;
      if (colorVar) {
        wrap.style.color = `var(${colorVar})`;
      }
      if (opacity != null) {
        wrap.style.opacity = String(opacity);
      }
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
      }
    } catch (e) {
    }
  }

  function setCheckButtonState(mode) {
    try {
      const checkBtn = document.getElementById('checkBtn');
      if (!checkBtn) return;

      checkBtn.classList.value = '';
      if (mode === 'ready') {
        checkBtn.disabled = false;
        checkBtn.innerHTML = `<i data-lucide="corner-down-left"></i>`;
        checkBtn.classList.add('button-color-yellow');
      } else if (mode === 'star') {
        checkBtn.disabled = true;
        checkBtn.innerHTML = `<i data-lucide="star" class="check-btn-icon"></i>`;
        checkBtn.classList.add('button-color-mint');
      } else if (mode === 'half') {
        // Полузвезда — кнопка зелёная, enabled, с иконками star-half + refresh-cw (повторить)
        checkBtn.disabled = false;
        checkBtn.innerHTML = `<i data-lucide="star-half" class="check-btn-icon"></i><i data-lucide="refresh-cw"></i>`;
        checkBtn.classList.add('button-color-lightgreen');
      } else if (mode === 'repeat_activity') {
        // Активность (кружочек) — кнопка оранжевая, enabled, с иконкой refresh-cw (повторить)
        checkBtn.disabled = false;
        checkBtn.innerHTML = `<i data-lucide="refresh-cw"></i>`;
        checkBtn.classList.add('button-color-orange');
      }

      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
      }
    } catch (e) {
    }
  }

  function updateNextButtonVisibilityFromSession(session) {
    try {
      const btn = document.getElementById('resultNextBtn');
      if (!btn) return;
      let st = null;
      try {
        const view = getCurrentSentenceViewFromSession(session);
        if (view && view.key != null && session && typeof session.getState === 'function') {
          st = session.getState(String(view.key));
        }
      } catch (e0s) {
      }
      if (!st) st = getCurrentSentenceStateFromSession(session);
      if (!st) {
        btn.disabled = true;
        btn.classList.remove('button-color-yellow');
        btn.classList.add('button-color-gray');
        return;
      }
      const { textOk, audioOk, requiresAudio } = computeSentenceCompletionState(st);

      // Кнопка "Далее" всегда видна, но доступна только когда textOk && audioOk
      const canNext = !!(textOk && audioOk);

      btn.disabled = !canNext;
      btn.classList.remove('button-color-yellow', 'button-color-gray');
      if (canNext) {
        btn.classList.add('button-color-yellow');
      } else {
        btn.classList.add('button-color-gray');
      }
    } catch (e) {
    }
  }

  function updateSentenceTabloFromSession(session, optKey) {
    let st = null;
    // Если передан конкретный ключ — используем его, иначе получаем текущее предложение
    if (optKey != null && session && typeof session.getState === 'function') {
      st = session.getState(String(optKey));
    }
    if (!st) {
      try {
        const view = getCurrentSentenceViewFromSession(session);
        if (view && view.key != null && session && typeof session.getState === 'function') {
          st = session.getState(String(view.key));
        }
      } catch (e0s) {
      }
    }
    if (!st) st = getCurrentSentenceStateFromSession(session);
    if (!st) return;

    const mode = getExerciseMode();
    const requiredHalf = getRequiredPassedStarHalfValue();
    const perfect = Number(st.number_of_perfect) || 0;
    const corrected = Number(st.number_of_corrected) || 0;
    const audio = Number(st.number_of_audio) || 0;

    const textCoins = Number(st.text_activity_count) || 0;
    const audioCoins = Number(st.audio_activity50_count) || 0;

    try {
      const starWrap = document.getElementById('tablo_result_star');
      if (starWrap) {
        // В режимах p3 и p4 текст не проверяется — показываем звезду как выполненную
        if (mode === 'audio-only-no-hint' || mode === 'audio-only-hint') {
          _setIcon(starWrap, 'star', '--color-button-mint', 1);
        } else if (perfect >= 1) {
          _setIcon(starWrap, 'star', '--color-button-mint', 1);
        } else if (corrected > 0) {
          _setIcon(starWrap, 'star-half', '--color-button-lightgreen', 1);
        } else {
          _setIcon(starWrap, 'star-off', null, 0.25);
        }
      }
    } catch (e) {
    }

    try {
      const micWrap = document.getElementById('tablo_result_mic');
      if (micWrap) {
        // Если audio > 0 — микрофон выполнен, иначе — не выполнен
        if (audio > 0) {
          _setIcon(micWrap, 'mic', '--color-button-purple', 1);
        } else {
          _setIcon(micWrap, 'mic-off', null, 0.25);
        }
      }
    } catch (e) {
    }

    try {
      const wrap = document.getElementById('tablo_result_text_coins');
      if (wrap) {
        // Показываем: маленький кружочек слева, справа число (как ошибки)
        const n = Math.max(0, Number(textCoins) || 0);
        wrap.innerHTML = '<i data-lucide="circle-small"></i>' + String(n);
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons();
        }
      }
      const btn = document.getElementById('btn_coin_exchange_text');
      const cost = getPricingValue('half_star_purchase_cost', 3);
      // Показываем кнопку покупки, если активностей >= cost и ещё не покупали
      const alreadyBought = !!(st && st.text_exchange_half_star);
      if (btn) btn.style.display = (textCoins >= cost && !alreadyBought) ? 'inline-flex' : 'none';
    } catch (e) {
    }

    try {
      const wrap = document.getElementById('audio_result_coins');
      const alreadyBoughtAudio = !!(st && st.audio_exchange_mic);
      if (wrap) {
        if (alreadyBoughtAudio) {
          // После покупки микрофона кружочки не имеют смысла — скрываем
          wrap.innerHTML = '';
        } else {
          const n = Math.max(0, Number(audioCoins) || 0);
          if (n > 0) {
            wrap.innerHTML = '<i data-lucide="circle-small"></i>' + String(n);
          } else {
            wrap.innerHTML = '';
          }
        }
        wrap.style.color = 'var(--color-button-purple)';
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons();
        }
      }
      const btn = document.getElementById('btn_coin_exchange_audio');
      const cost = getPricingValue('audio_purchase_cost', 3);
      // Показываем кнопку покупки, если активностей >= cost и ещё не покупали
      if (btn) btn.style.display = (audioCoins >= cost && !alreadyBoughtAudio) ? 'inline-flex' : 'none';
    } catch (e) {
    }

    // Обновляем состояние кнопки "Проверить-повторить" при навигации
    try {
      // В режимах p3 и p4 кнопка проверки скрыта, не обновляем её состояние
      if (mode !== 'audio-only-no-hint' && mode !== 'audio-only-hint') {
        const lastAllCorrect = !!(st && st._textAllCorrect);
        if (perfect >= 1) {
          setCheckButtonState('star');
        } else if (corrected > 0 && lastAllCorrect) {
          setCheckButtonState('half');
        } else if (corrected > 0 && !lastAllCorrect) {
          // corrected > 0, но текст сброшен (повтор) — показываем ready
          setCheckButtonState('ready');
        } else if (textCoins > 0 && lastAllCorrect) {
          setCheckButtonState('repeat_activity');
        } else {
          setCheckButtonState('ready');
        }
      }
    } catch (e) {
    }

    try {
      updateNextButtonVisibilityFromSession(session);
    } catch (e1) {
    }
  }

  function bindCoinExchangeModal(session) {
    try {
      if (state._coinExchangeBound) return;
      state._coinExchangeBound = true;
    } catch (e0) {
    }

    const modal = document.getElementById('coinExchangeModal');
    const title = document.getElementById('coinExchangeTitle');
    const closeBtn = document.getElementById('coinExchangeCloseBtn');
    const confirmBtn = document.getElementById('coinExchangeConfirmBtn');
    const btnText = document.getElementById('btn_coin_exchange_text');
    const btnAudio = document.getElementById('btn_coin_exchange_audio');

    if (!modal || !title || !closeBtn || !confirmBtn) return;

    const open = (mode) => {
      try {
        state._coinExchangeMode = mode;
        const cost = mode === 'text'
          ? getPricingValue('half_star_purchase_cost', 3)
          : getPricingValue('audio_purchase_cost', 3);
        if (mode === 'text') {
          title.textContent = `Покупешь полузвезду за ${cost} монеты?`;
        } else {
          title.textContent = `Покупешь микрофон за ${cost} монеты?`;
        }
        modal.style.display = 'flex';
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons();
        }
      } catch (e) {
      }
    };

    const close = () => {
      try {
        modal.style.display = 'none';
      } catch (e) {
      }
    };

    try {
      modal.addEventListener('click', (e) => {
        try {
          e.preventDefault();
          e.stopPropagation();
        } catch (e0) {
        }
      });
    } catch (e) {
    }

    try {
      closeBtn.addEventListener('click', (e) => {
        try {
          e.preventDefault();
          e.stopPropagation();
        } catch (e0) {
        }
        close();
      });
    } catch (e) {
    }

    const spendAndApply = async () => {
      const st = getCurrentSentenceStateFromSession(session);
      if (!st) return;

      const mode = String(state._coinExchangeMode || '');
      if (mode !== 'text' && mode !== 'audio') return;

      const cost = mode === 'text'
        ? getPricingValue('half_star_purchase_cost', 3)
        : getPricingValue('audio_purchase_cost', 3);

      try {
        const payload = {
          cost,
          reason: mode === 'text' ? 'buy_half_star' : 'buy_mic',
          dictation_id: getCurrentDictationIdForDb(),
          positions: _getSelectedSentencePositions(session),
        };
        await fetch('/api/statistics/money/spend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        try {
          playUiSound('coins_minus');
        } catch (e0s) {
        }
      } catch (e) {
      }

      if (mode === 'text') {
        // Платим cost монет, но забираем только 1 активность,
        // чтобы общее число действий (звезда + полузвезды + активности) не нарушалось
        st.text_activity_count = Math.max(0, (Number(st.text_activity_count) || 0) - 1);
        st.money_spent = (Number(st.money_spent) || 0) + cost;
        st.number_of_corrected = Math.max(Number(st.number_of_corrected) || 0, 1);
        st.text_exchange_half_star = true;
        setCheckButtonState('half');
      } else {
        st.audio_activity50_count = Math.max(0, (Number(st.audio_activity50_count) || 0) - cost);
        st.money_spent = (Number(st.money_spent) || 0) + cost;
        const req = getRequiredAudioRepeatsValue();
        st.number_of_audio = Math.max(Number(st.number_of_audio) || 0, req);
        st.audio_exchange_mic = true;
      }

      // Обновляем строку в таблице стартового модального окна
      let curKey = null;
      try {
        curKey = session.getCurrentKey();
        if (curKey != null) {
          updateStartModalSentenceRow(session, curKey);
        }
      } catch (eRow) {
      }

      updateSentenceTabloFromSession(session, curKey);
      updateTaskProgressFromSession(session);
      updateNextButtonVisibilityFromSession(session);

      try {
        if (mode === 'audio') {
          const rb = document.getElementById('recordButton');
          if (rb) {
            rb.disabled = false;
            rb.classList.remove('disabled');
            const wrap = rb.querySelector('#recordStateIcon') || rb;
            try {
              wrap.innerHTML = '<i data-lucide="mic"></i>';
            } catch (e0) {
            }
            if (window.lucide && typeof window.lucide.createIcons === 'function') {
              window.lucide.createIcons({ root: wrap });
            }
          }

          const perfect = Number(st && st.number_of_perfect) || 0;
          const corrected = Number(st && st.number_of_corrected) || 0;
          const checkBtn = document.getElementById('checkBtn');
          const nextBtn = document.getElementById('resultNextBtn');
          const shouldPreferRepeat = (corrected > 0 && perfect < 1);
          if (shouldPreferRepeat && checkBtn && !checkBtn.disabled && typeof checkBtn.focus === 'function') {
            checkBtn.focus();
          } else if (nextBtn && !nextBtn.disabled && typeof nextBtn.focus === 'function') {
            nextBtn.focus();
          } else if (checkBtn && typeof checkBtn.focus === 'function') {
            checkBtn.focus();
          }
        }
      } catch (e99) {
      }
      close();
    };

    try {
      confirmBtn.addEventListener('click', async (e) => {
        try {
          e.preventDefault();
          e.stopPropagation();
        } catch (e0) {
        }
        await spendAndApply();
      });
    } catch (e) {
    }

    try {
      if (btnText) {
        btnText.addEventListener('click', (e) => {
          try {
            e.preventDefault();
            e.stopPropagation();
          } catch (e0) {
          }
          open('text');
        });
      }
    } catch (e) {
    }

    try {
      if (btnAudio) {
        btnAudio.addEventListener('click', (e) => {
          try {
            e.preventDefault();
            e.stopPropagation();
          } catch (e0) {
          }
          open('audio');
        });
      }
    } catch (e) {
    }
  }

  function updateTaskProgressFromSession(session) {
    try {
      if (!session || !Array.isArray(session.selectedKeys)) return;
      const keys = session.selectedKeys;
      const total = keys.length;
      let perfect = 0;
      let corrected = 0;
      let audio = 0;
      let passed = 0;
      let mistakesTotal = 0;
      let moneyEarned = 0;
      let moneySpent = 0;
      let charsTotal = 0;
      let allCompleted = (total > 0);
      for (const k of keys) {
        const st = session.getState ? session.getState(k) : null;
        if (!st) continue;
        const p = Number(st.number_of_perfect) || 0;
        const c = Number(st.number_of_corrected) || 0;
        const a = Number(st.number_of_audio) || 0;
        const m = Number(st.mistake_count) || 0;
        const ch = Number(st.number_of_characters) || 0;
        if (p >= 1) perfect += 1;
        if (c > 0) corrected += 1;
        if (a > 0) audio += 1;
        mistakesTotal += m;
        charsTotal += ch;

        try {
          const { textOk, audioOk } = computeSentenceCompletionState(st);
          if (textOk && audioOk) passed += 1;
          if (!textOk || !audioOk) allCompleted = false;
        } catch (e3c) {
          allCompleted = false;
        }

        try {
          moneyEarned += (Number(st.money_earned) || 0);
        } catch (e0) {
        }

        try {
          moneySpent += (Number(st.money_spent) || 0);
        } catch (e2) {
        }
      }

      try {
        const p = getProgressPanelInstance();
        if (p && typeof p.update === 'function') {
          const acc = charsTotal > 0 ? Math.max(0, Math.min(100, (1 - (mistakesTotal / charsTotal)) * 100)) : 100;
          p.update({
            perfect,
            corrected,
            audio,
            errors: mistakesTotal,
            chars: charsTotal,
            accuracyPct: acc,
            moneyEarned,
            moneySpent,
          });
        }
      } catch (e0) {
      }

      try {
        const fill = document.getElementById('dictationTaskProgressFill');
        const label = document.getElementById('dictationTaskProgressLabel');
        if (label) label.textContent = total > 0 ? `${passed}/${total}` : '';
        if (fill) fill.style.width = total > 0 ? `${Math.round((passed / total) * 100)}%` : '0%';
      } catch (e1) {
      }

      try {
        const el = document.getElementById('tablo_result_bug_count');
        if (el) el.textContent = mistakesTotal > 0 ? String(mistakesTotal) : '';
      } catch (e2) {
      }

      try {
        if (allCompleted && state.dictationStarted && !state._completionShown) {
          if (!isPauseModalOpen() && !isStartModalOpen()) {
            state._completionShown = true;
            showCompletionModal();
          }
        }
      } catch (e3) {
      }
    } catch (e) {
    }
  }

  function resolveAudioToUrl(rawValue, dictId, lang) {
    try {
      const am = window.AudioManager;
      const v = String(rawValue || '').trim();
      if (!v) return '';
      if (v.startsWith('blob:')) return v;
      if (v.startsWith('/api/') || v.startsWith('http://') || v.startsWith('https://')) {
        if (am && typeof am.normalizeMediaUrl === 'function') return am.normalizeMediaUrl(v);
        return v;
      }
      const name = v.split('?', 1)[0].split('/').pop();
      if (!name) return '';
      if (am && typeof am.buildDictationAudioUrl === 'function') {
        return am.buildDictationAudioUrl(dictId, String(lang), name);
      }
      return '';
    } catch (e) {
      return '';
    }
  }

  function getPlaySequenceStartValue() {
    try {
      const el = document.getElementById('playSequenceStart');
      const v = el && el.value != null ? String(el.value) : '';
      if (v.trim()) {
        return v.trim();
      }
    } catch (e) {
    }
    try {
      const v = window.playSequenceStart != null ? String(window.playSequenceStart) : '';
      if (v.trim()) {
       return v.trim();
      }
    } catch (e) {
    }
    return 'oto';
  }

  function loadPlaySequenceStartFromUser() {
    try {
      const um = window.UM;
      if (um && um.userData && um.userData.settings_json) {
        const raw = String(um.userData.settings_json || '');
        if (raw) {
          const parsed = JSON.parse(raw);
          const audio = parsed && parsed.audio && typeof parsed.audio === 'object' ? parsed.audio : {};
          if (audio.start != null && String(audio.start).trim()) {
            window.playSequenceStart = String(audio.start).trim();
          }
          // Загружаем режим упражнения из настроек пользователя
          if (audio.exercise_mode != null && String(audio.exercise_mode).trim()) {
            const mode = String(audio.exercise_mode).trim();
            if (mode === 'record' || mode === 'no-record' || mode === 'audio-only-no-hint' || mode === 'audio-only-hint') {
              window.audioExerciseMode = mode;
            }
          }
          return;
        }
      }
    } catch (e) {
    }
    // fallback: если settings_json нет, пробуем audio_start
    try {
      const um = window.UM;
      if (um && um.userData && um.userData.audio_start) {
        window.playSequenceStart = String(um.userData.audio_start).trim();
        return;
      }
    } catch (e) {
    }
    // если ничего не нашли, ставим oto
    window.playSequenceStart = 'oto';
  }

  function playAudioSequence(sequence, { originalUrl, translationUrl }) {
    try {
      const am = window.AudioManager;
      if (!am || typeof am.play !== 'function') return;
      const seq = String(sequence || '').trim().toLowerCase();
      if (!seq) {
         return;
      }


      let originalBtn = null;
      try {
        const v = window.__dictationModalOriginalAudioVisual;
        if (v && v.playButton) originalBtn = v.playButton;
      } catch (e0) {
      }

      const steps = [];
      for (const ch of seq) {
        if (ch === 'o' && originalUrl) steps.push({ url: originalUrl, button: originalBtn });
        if (ch === 't' && translationUrl) steps.push({ url: translationUrl, button: document.getElementById('translationPlayButton') });
      }
      if (!steps.length) {
        return;
      }

      let i = 0;
      const runNext = () => {
        try {
          const step = steps[i++];
          if (!step) return;
          am.play(step.button || null, step.url, () => {
            runNext();
          });
        } catch (e) {
        }
      };
      runNext();
    } catch (e) {
    }
  }

  function updateAudioPlayersFromSession(session) {
    const started = !!state.dictationStarted;
    try {
      const startModal = document.getElementById('start-modal');
      if (startModal && (startModal.style.display === 'flex' || startModal.style.display === 'block')) {
        return;
      }
    } catch (e0) {
    }

    // Если предложение полностью выполнено (звезда + аудио в зависимости от режима),
    // не проигрываем аудио — пользователь уже выполнил это задание.
    try {
      const st = getCurrentSentenceStateFromSession(session);
      if (st) {
        const completion = computeSentenceCompletionState(st);
        if (completion.textOk && completion.audioOk) {
          return;
        }
      }
    } catch (e0comp) {
    }

    const view = getCurrentSentenceViewFromSession(session);
    if (!view) return;

    const sentenceKey = (() => {
      try {
        if (view && view.key != null) return String(view.key);
      } catch (e) {
      }
      return '';
    })();

    let dictId = '';
    let langOrig = '';
    let langTr = '';
    try {
      const dictationData = document.getElementById('dictation-data');
      dictId = dictationData ? String(dictationData.getAttribute('data-dictation-id') || '').trim() : '';
      langOrig = dictationData ? String(dictationData.getAttribute('data-language-original') || '').trim() : '';
      langTr = dictationData ? String(dictationData.getAttribute('data-language-translation') || '').trim() : '';
    } catch (e1) {
    }

    const originalUrl = resolveAudioToUrl((view.audio_original != null ? view.audio_original : view.audio), dictId, langOrig);
    const translationUrl = resolveAudioToUrl((view.audio_translation != null ? view.audio_translation : view.audio_tr), dictId, langTr);

    try {
      const visual = window.__dictationModalOriginalAudioVisual;
      if (visual && typeof visual.setAudioPaths === 'function') {
        visual.setAudioPaths({ audio: originalUrl || null, audio_a: null, audio_f: null, audio_m: null });
      }
    } catch (e2) {
    }

    try {
      const btn = document.getElementById('translationPlayButton');
      if (btn) {
        btn.dataset.audioUrl = translationUrl || '';
        if (btn.dataset.boundDictationModal !== '1') {
          btn.dataset.boundDictationModal = '1';
          btn.addEventListener('click', (e) => {
            try {
              e.preventDefault();
              e.stopPropagation();
            } catch (e0) {
            }
            try {
              if (!state.dictationStarted) return;
              const u = String(btn.dataset.audioUrl || '').trim();
              if (!u) return;
              if (window.AudioManager && typeof window.AudioManager.play === 'function') {
                window.AudioManager.play(btn, u);
              }
            } catch (e1) {
            }
          });
        }
      }
    } catch (e3) {
    }

    try {
      clearTimeout(state._startSequenceTimer);
    } catch (e4) {
    }
    try {
      if (started) {
        const lastKey = (state && state._lastStartSequenceKey != null) ? String(state._lastStartSequenceKey) : '';
        // Защита от повторного запуска: если ключ предложения совпадает с предыдущим — пропускаем.
        // Если ключ пустой, используем fallback-защиту через _startSequencePlayed флаг.
        if (sentenceKey) {
          if (sentenceKey === lastKey) {
            return;
          }
          state._lastStartSequenceKey = sentenceKey;
          state._startSequencePlayed = false;
        } else {
          // Если ключ пустой, используем флаг _startSequencePlayed для защиты от повторного запуска
          if (state._startSequencePlayed) {
            return;
          }
          state._startSequencePlayed = true;
        }

        state._startSequenceTimer = setTimeout(() => {
          try {
            const seq = getPlaySequenceStartValue();
            playAudioSequence(seq, { originalUrl, translationUrl });
          } catch (e0) {
          }
        }, 300);
      }
    } catch (e5) {
    }
  }

  function ensureSpeechPanel(session, parsed) {
    try {
      if (!window.DictationSpeechRecognitionPanel) return null;
    } catch (e0) {
      return null;
    }

    let panel = null;
    try {
      panel = state._speechPanel;
    } catch (e1) {
    }
    if (panel) return panel;

    try {
      panel = new window.DictationSpeechRecognitionPanel({
        minMatchPercent: 80,
        onRecognitionComplete: async ({ ok, percent }) => {
          try {
            const view = getCurrentSentenceViewFromSession(session);
            if (!view || view.key == null) return;
            const st = session.getState(String(view.key));

            const pct = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
            if (ok) {
              const next = (Number(st.number_of_audio) || 0) + 1;
              st.number_of_audio = next;
              try {
                const add = getPricingValue('audio_activity_reward', 1);
                st.audio_activity50_count = (Number(st.audio_activity50_count) || 0) + 1;
                st.money_count = (Number(st.money_count) || 0) + add;
                st.money_earned = (Number(st.money_earned) || 0) + add;
                playUiSound('coins_plus_audio');
              } catch (e0s) {
              }
              // Отправляем аудио-активность в outbox_batcher
              try {
                const ob = window.OutboxBatcher;
                if (ob && typeof ob.enqueueActivity === 'function') {
                  const dictationId = getCurrentDictationIdForDb();
                  const dictationLanguageCode = _getDictationLanguageCode();
                  const selectedSentencePositions = _getSelectedSentencePositions(session);
                  ob.enqueueActivity({
                    type: 'audio',
                    count: 1,
                    leadTimeMs: _getSessionLeadTimeMs(session),
                    dictationId,
                    date: null,
                    dictationLanguageCode,
                    selectedSentencePositions,
                  });
                }
              } catch (e0ob) {
              }
            } else if (pct >= 50) {
              const add = getPricingValue('audio_activity_reward', 1);
              st.audio_activity50_count = (Number(st.audio_activity50_count) || 0) + 1;
              st.money_count = (Number(st.money_count) || 0) + add;
              st.money_earned = (Number(st.money_earned) || 0) + add;
            } else {
              try { window.__forceFocusRecordAfterRecognition = true; } catch (e00) { }
            }

            // Обновляем строку в таблице стартового модального окна
            try {
              updateStartModalSentenceRow(session, view.key);
            } catch (eRow) {
            }

            updateSentenceTabloFromSession(session, view.key);
            updateTaskProgressFromSession(session);
            updateNextButtonVisibilityFromSession(session);

            try {
              if (ok) {
                const checkBtn = document.getElementById('checkBtn');
                const nextBtn = document.getElementById('resultNextBtn');

                if (checkBtn && !checkBtn.disabled && typeof checkBtn.focus === 'function') {
                  checkBtn.focus();
                } else if (nextBtn && !nextBtn.disabled && typeof nextBtn.focus === 'function') {
                  nextBtn.focus();
                } else if (checkBtn && typeof checkBtn.focus === 'function') {
                  checkBtn.focus();
                }
              } else {
                const rb = document.getElementById('recordButton');
                if (rb && typeof rb.focus === 'function') rb.focus();
              }
            } catch (e0) {
            }
          } catch (e) {
          }
        },
      });
      state._speechPanel = panel;
    } catch (e2) {
      return null;
    }

    try {
      bindCoinExchangeModal(session);
    } catch (e00) {
    }

    try {
      let langOrig = '';
      if (parsed && parsed.langOriginal) {
        langOrig = String(parsed.langOriginal);
      } else {
        const dictationData = document.getElementById('dictation-data');
        langOrig = dictationData ? String(dictationData.getAttribute('data-language-original') || '') : '';
      }
      if (langOrig) panel.setLanguage(langOrig);
    } catch (e3) {
    }

    try {
      let speechRecMode = 'route';
      try {
        const lsVal = localStorage.getItem('dictafan_speech_rec_mode');
        if (lsVal) {
          speechRecMode = String(lsVal);
        }
      } catch (eLs) {
      }
      // Нормализуем: route-off|tiny → route-off (для speech_recognition_unified.js)
      const normalized = speechRecMode.startsWith('route-off') ? 'route-off' : speechRecMode;
      panel.setMode(normalized);
    } catch (eSm2) {
    }

    try {
      const view = getCurrentSentenceViewFromSession(session);
      if (view) panel.setExpectedText(String(view.text_original != null ? view.text_original : (view.text != null ? view.text : '')));
    } catch (e4) {
    }

    try {
      const enabled = getRequiredAudioRepeatsValue() > 0;
      panel.setEnabled(enabled);
    } catch (e5) {
    }

    return panel;
  }

  function initModalOriginalAudioPlayer(parsed) {
    try {
      const container = document.getElementById('originalAudioPlayer');
      if (!container) return;
      if (typeof AudioPlayerVisual === 'undefined') return;
      if (container.dataset.boundAudioVisual === '1') return;

      const visual = new AudioPlayerVisual(container);
      try {
        visual.setLanguage(String(parsed && parsed.langOriginal ? parsed.langOriginal : '').trim().toLowerCase());
      } catch (e0) {
      }

      visual.setOnPlayClick(() => {
        try {
          if (!state.dictationStarted) return;
          const audioPath = visual.getCurrentAudioPath();
          if (!audioPath) return;
          if (window.AudioManager && typeof window.AudioManager.play === 'function') {
            window.AudioManager.play(visual.playButton || null, audioPath);
          }
        } catch (e) {
        }
      });

      visual.setOnSpeedChange((rate) => {
        try {
          if (window.AudioManager && typeof window.AudioManager.setPlaybackRate === 'function') {
            window.AudioManager.setPlaybackRate(rate);
          }
        } catch (e) {
        }
      });

      visual.setOnProgressSeek((progressPercent) => {
        try {
          if (!window.AudioManager || typeof window.AudioManager.seekToPercent !== 'function') return;
          window.AudioManager.seekToPercent(progressPercent);
        } catch (e) {
        }
      });

      try {
        if (window.AudioManager && typeof window.AudioManager.setAudioPlayerVisual === 'function') {
          window.AudioManager.setAudioPlayerVisual(visual);
        }
      } catch (e1) {
      }

      try {
        window.__dictationModalOriginalAudioVisual = visual;
      } catch (e2) {
      }

      container.dataset.boundAudioVisual = '1';
    } catch (e) {
    }
  }

  function renderLucideCheckboxButton(btn, checked, disabled) {
    if (!btn) return;
    btn.dataset.checked = checked ? '1' : '0';
    btn.dataset.disabled = disabled ? '1' : '0';
    btn.setAttribute('aria-pressed', checked ? 'true' : 'false');
    btn.disabled = Boolean(disabled);
    btn.innerHTML = `<i data-lucide="${checked ? 'circle-check-big' : 'circle'}"></i>`;
    try {
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ root: btn });
      }
    } catch (e) {
    }
  }

  function renderModalLangPair(parsed) {
    try {
      const pairContainer = document.getElementById('dictationLangPair');
      if (!pairContainer) return;
      if (!window.LanguageManager || typeof window.initLanguageSelector !== 'function') {
        pairContainer.textContent = String(parsed && parsed.langOriginal ? parsed.langOriginal : '');
        return;
      }
      const languageData = window.LanguageManager.getLanguageData && window.LanguageManager.getLanguageData();
      if (!languageData) {
        pairContainer.textContent = String(parsed && parsed.langOriginal ? parsed.langOriginal : '');
        return;
      }
      pairContainer.innerHTML = '';
      window.initLanguageSelector('dictationLangPair', {
        mode: 'flag-pair-fixed',
        currentLearning: String(parsed && parsed.langOriginal ? parsed.langOriginal : '').trim().toLowerCase(),
        nativeLanguage: String(parsed && parsed.langTranslation ? parsed.langTranslation : '').trim().toLowerCase(),
        languageData,
      });
    } catch (e) {
    }
  }

  function bindCheckButtonAsRepeat() {
    try {
      const btn = document.getElementById('checkBtn');
      if (!btn || btn.dataset.boundCheckRepeat === '1') return;
      btn.dataset.boundCheckRepeat = '1';
      btn.addEventListener('click', (e) => {
        try {
          e.preventDefault();
          e.stopPropagation();
        } catch (e0) {
        }

        try {
          // Срабатываем только если кнопка не в режиме "ready" (проверка текста)
          // и не disabled (режим star). Режимы повтора: half, repeat_activity
          if (btn.disabled) return;
          const isRepeatMode = btn.classList.contains('button-color-lightgreen') || btn.classList.contains('button-color-orange');
          if (!isRepeatMode) return;

          const session = window.__dictationModalActiveSession;
          if (!session) return;

          try {
            startNewRewardCycle();
          } catch (e00c) {
          }

          resetSentenceUiFromSession(session);
          // Сбрасываем кнопку "Далее" в disabled-состояние
          try {
            const nb = document.getElementById('resultNextBtn');
            if (nb) {
              nb.disabled = true;
              nb.classList.remove('button-color-yellow');
              nb.classList.add('button-color-gray');
            }
          } catch (e1) {
          }
          updateNavigatorFromSession(session);

          try {
            if (!state.dictationStarted) return;
            const view = getCurrentSentenceViewFromSession(session);
            if (!view) return;

            const dictationData = document.getElementById('dictation-data');
            const dictId = dictationData ? String(dictationData.getAttribute('data-dictation-id') || '').trim() : '';
            const langOrig = dictationData ? String(dictationData.getAttribute('data-language-original') || '').trim() : '';
            const langTr = dictationData ? String(dictationData.getAttribute('data-language-translation') || '').trim() : '';

            const originalUrl = resolveAudioToUrl((view.audio_original != null ? view.audio_original : view.audio), dictId, langOrig);
            const translationUrl = resolveAudioToUrl((view.audio_translation != null ? view.audio_translation : view.audio_tr), dictId, langTr);
            const seq = getPlaySequenceStartValue();
            playAudioSequence(seq, { originalUrl, translationUrl });
          } catch (e2) {
          }
        } catch (e1) {
        }
      });
    } catch (e) {
    }
  }

  function renderModalCover(parsed) {

    try {
      const img = document.getElementById('dictationModalCover');
      if (!img) return;
      const dictId = parsed && parsed.dictationIdFormatted ? String(parsed.dictationIdFormatted) : '';
      const lang = parsed && parsed.langOriginal ? String(parsed.langOriginal) : '';
      let src = '';
      try {
        if (window.CoverManager && typeof window.CoverManager.getCoverUrl === 'function') {
          src = window.CoverManager.getCoverUrl(dictId, lang);
        } else if (window.ImageManager && typeof window.ImageManager.getCoverUrl === 'function') {
          src = window.ImageManager.getCoverUrl(dictId, lang);
        }
      } catch (e0) {
        src = '';
      }

      try {
        if (src && window.maybeCacheBustDictationCover) {
          src = window.maybeCacheBustDictationCover(src);
        }
      } catch (e1) {
      }
      img.src = src || '/static/data/covers/cover_en.webp';
      img.onerror = () => {
        try { img.onerror = null; } catch (e1) {}
        img.src = '/static/data/covers/cover_en.webp';
      };
    } catch (e) {
    }
  }

  function setColumnsVisibilityByClass({ className, visible }) {
    try {
      const table = document.getElementById('sentences-table');
      if (!table) return;
      const cls = String(className || '').trim();
      if (!cls) return;
      const map = {
        'col-star': 'hide-star',
        'col-mic': 'hide-mic',
        'col-half-stars': 'hide-half-stars',
        'col-activities': 'hide-activities',
        'col-text-original': 'hide-original',
        'col-text-translation': 'hide-translation',
      };
      const hideClass = map[cls];
      if (!hideClass) return;
      table.classList.toggle(hideClass, !visible);
    } catch (e) {
    }
  }

  function updateColumnToggleButtonIcon(buttonId, checked) {
    try {
      const btn = document.getElementById(buttonId);
      if (!btn) return;
      const icon = btn.querySelector('.sentence-col-flag-icon');
      if (!icon) return;
      icon.setAttribute('data-lucide', checked ? 'circle-check-big' : 'circle');
      try {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons({ root: btn });
        }
      } catch (e1) {
      }
    } catch (e) {
    }
  }

  /**
   * Обновляет одну строку в таблице стартового модального окна
   * для указанного ключа предложения: звезда, микрофон, полузвёзды, активности, время.
   * Если таблица не открыта — ничего не делает.
   */
  function updateStartModalSentenceRow(session, key) {
    try {
      if (!session || key == null) return;
      const table = document.getElementById('sentences-table');
      if (!table) return;
      const tbody = table.querySelector('tbody');
      if (!tbody) return;

      const tr = tbody.querySelector(`tr[data-sentence-key="${CSS.escape(String(key))}"]`);
      if (!tr) return;

      const st = session.getState(key);
      if (!st) return;

      // --- Звезда / Полузвезда ---
      const tdStar = tr.querySelector('td.col-star');
      if (tdStar) {
        const perfect = Number(st.number_of_perfect) || 0;
        const corrected = Number(st.number_of_corrected) || 0;
        let starWrap = tdStar.querySelector('.star-icon');
        if (!starWrap) {
          starWrap = document.createElement('span');
          starWrap.className = 'star-icon';
          tdStar.innerHTML = '';
          tdStar.appendChild(starWrap);
        }
        starWrap.className = 'star-icon';
        if (perfect >= 1) {
          starWrap.classList.add('star-icon--perfect');
          starWrap.innerHTML = '<i data-lucide="star"></i>';
        } else if (corrected > 0) {
          starWrap.classList.add('star-icon--half');
          starWrap.innerHTML = '<i data-lucide="star-half"></i>';
        } else {
          starWrap.classList.add('star-icon--none');
          starWrap.innerHTML = '<i data-lucide="star-off"></i>';
        }
      }

      // --- Микрофон ---
      const tdMic = tr.querySelector('td.col-mic');
      if (tdMic) {
        const audioDone = Number(st.number_of_audio) || 0;
        let micWrap = tdMic.querySelector('.mic-icon--done, .mic-icon--none');
        if (!micWrap) {
          micWrap = document.createElement('span');
          tdMic.innerHTML = '';
          tdMic.appendChild(micWrap);
        }
        if (audioDone > 0) {
          micWrap.className = 'mic-icon--done';
          micWrap.innerHTML = '<i data-lucide="mic"></i>';
        } else {
          micWrap.className = 'mic-icon--none';
          micWrap.innerHTML = '<i data-lucide="mic-off"></i>';
        }
      }

      // --- Полузвёзды (number_of_corrected) ---
      const tdHalfStars = tr.querySelector('td.col-half-stars');
      if (tdHalfStars) {
        const halfStarCount = Number(st.number_of_corrected) || 0;
        tdHalfStars.innerHTML = '';
        if (halfStarCount > 0) {
          const halfSpan = document.createElement('span');
          halfSpan.className = 'half-star-count';
          halfSpan.innerHTML = '<i data-lucide="star-half"></i>' + String(halfStarCount);
          tdHalfStars.appendChild(halfSpan);
        }
      }

      // --- Активности (text_activity_count) ---
      const tdActivities = tr.querySelector('td.col-activities');
      if (tdActivities) {
        const activityCount = Number(st.text_activity_count) || 0;
        tdActivities.innerHTML = '';
        if (activityCount > 0) {
          const actSpan = document.createElement('span');
          actSpan.className = 'activity-count';
          actSpan.innerHTML = '<i data-lucide="circle-small"></i>' + String(activityCount);
          tdActivities.appendChild(actSpan);
        }
      }

      // --- Время (накопительное, из time_count) ---
      const tdTime = tr.querySelector('td.col-time');
      if (tdTime) {
        const timeMs = Number(st.time_count) || 0;
        tdTime.textContent = timeMs > 0 ? formatMmSs(timeMs) : '';
      }

      // --- Символы (number_of_characters) ---
      const tdChars = tr.querySelector('td.col-characters');
      if (tdChars) {
        const charsCount = Number(st.number_of_characters) || 0;
        tdChars.textContent = charsCount > 0 ? String(charsCount) : '';
      }

      // --- Ошибки (mistake_count) ---
      const tdMistakes = tr.querySelector('td.col-mistakes');
      if (tdMistakes) {
        const mistakesCount = Number(st.mistake_count) || 0;
        tdMistakes.textContent = mistakesCount > 0 ? String(mistakesCount) : '';
      }

      // Обновляем lucide-иконки в этой строке
      try {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons({ root: tr });
        }
      } catch (e1) {
      }
    } catch (e) {
    }
  }

  function updateStartModalColumnsForMode() {
    try {
      const mode = getExerciseMode();
      // Режимы p1 (record) и p2 (no-record) — показываем колонку звезды, скрываем микрофон
      // Режимы p3 (audio-only-no-hint) и p4 (audio-only-hint) — показываем колонку микрофона, скрываем звезду
      const showStar = (mode === 'record' || mode === 'no-record');
      const showMic = (mode === 'audio-only-no-hint' || mode === 'audio-only-hint');
      setColumnsVisibilityByClass({ className: 'col-star', visible: showStar });
      setColumnsVisibilityByClass({ className: 'col-mic', visible: showMic });
    } catch (e) {
    }
  }

  function applyStartModalColumnsPreset(preset) {
    const p = preset && typeof preset === 'object' ? preset : {};
    const showProgress = Boolean(p.progress);
    const showOrig = Boolean(p.original);
    const showTr = Boolean(p.translation);

    // Колонки прогресса: star, mic, half-stars, activities
    setColumnsVisibilityByClass({ className: 'col-star', visible: showProgress });
    setColumnsVisibilityByClass({ className: 'col-mic', visible: showProgress });
    setColumnsVisibilityByClass({ className: 'col-half-stars', visible: showProgress });
    setColumnsVisibilityByClass({ className: 'col-activities', visible: showProgress });
    setColumnsVisibilityByClass({ className: 'col-text-original', visible: showOrig });
    setColumnsVisibilityByClass({ className: 'col-text-translation', visible: showTr });

    updateColumnToggleButtonIcon('toggleProgressColumnsBtn', showProgress);
    updateColumnToggleButtonIcon('toggleOriginalColumnBtn', showOrig);
    updateColumnToggleButtonIcon('toggleTranslationColumnBtn', showTr);

    try {
      window.__dictationStartModalColumnPrefs = { progress: showProgress, original: showOrig, translation: showTr };
    } catch (e) {
    }
  }

  function renderLucideTriStateCheckboxButton(btn, state, disabled) {
    if (!btn) return;
    const s = String(state || 'unchecked');
    const isChecked = s === 'checked';
    const isMixed = s === 'mixed';
    btn.dataset.checked = isChecked ? '1' : '0';
    btn.dataset.mixed = isMixed ? '1' : '0';
    btn.dataset.disabled = disabled ? '1' : '0';
    btn.setAttribute('aria-pressed', isChecked ? 'true' : 'false');
    btn.disabled = Boolean(disabled);
    const icon = isMixed ? 'circle-alert' : (isChecked ? 'circle-check-big' : 'circle');
    btn.innerHTML = `<i data-lucide="${icon}"></i>`;
    try {
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ root: btn });
      }
    } catch (e) {
    }
  }

  function getModal() {
    return document.getElementById(MODAL_ID);
  }

  function getBody() {
    return document.getElementById(BODY_ID);
  }

  function setUsername() {
    try {
      const target = document.getElementById('dictationModalUsername');
      if (!target) return;
      const source = document.querySelector('.username-text');
      target.textContent = source ? (source.textContent || '').trim() : '';
    } catch (e) {
    }
  }

  function bindAudioSettingsModalControls() {
    try {
      const m = document.getElementById('audioSettingsModal');
      if (!m) return;

      const getAudioSettingsDirty = () => {
        try {
          const star = document.getElementById('audioSettingsDirtyStar');
          if (!star) return false;
          const inline = (star.style && star.style.display) ? String(star.style.display) : '';
          if (inline) return inline !== 'none';
          // fallback: computed style
          const computed = window.getComputedStyle ? window.getComputedStyle(star) : null;
          if (!computed) return false;
          return String(computed.display || '') !== 'none';
        } catch (e) {
          return false;
        }
      };

      const closeAudioSettingsModalNow = () => {
        try {
          m.style.display = 'none';
        } catch (e1) {
        }
        try {
          if (typeof window.updateRecognitionModeIcon === 'function') {
            window.updateRecognitionModeIcon();
          }
        } catch (e2) {
        }
        // Возобновляем таймер при закрытии настроек (сохранено или без изменений)
        _resumeDictationTimer();
      };

      const closeAudioSettingsModalWithConfirm = () => {
        try {
          if (!getAudioSettingsDirty()) {
            closeAudioSettingsModalNow();
            return;
          }

          if (window.DesktopConfirmModal && typeof window.DesktopConfirmModal.open === 'function') {
            window.DesktopConfirmModal.open({
              showSave: true,
              onDiscard: () => {
                try {
                  if (typeof window.__dictafanRestoreAudioSettingsModalSnapshot === 'function') {
                    window.__dictafanRestoreAudioSettingsModalSnapshot();
                  }
                } catch (e0) {
                }
                closeAudioSettingsModalNow();
                // Таймер возобновляется внутри closeAudioSettingsModalNow
              },
              onSave: async () => {
                try {
                  if (typeof window.__dictafanSaveAudioSettingsModal === 'function') {
                    await window.__dictafanSaveAudioSettingsModal();
                  } else {
                    const saveBtn = document.getElementById('saveAudioSettingsModalBtn');
                    if (saveBtn) saveBtn.click();
                  }
                } catch (e) {
                }
                closeAudioSettingsModalNow();
                // Таймер возобновляется внутри closeAudioSettingsModalNow
              },
            });
            return;
          }

          // fallback без универсальной модалки
          const wantSave = window.confirm('Есть несохранённые изменения. Сохранить и выйти?');
          if (wantSave) {
            try {
              const saveBtn = document.getElementById('saveAudioSettingsModalBtn');
              if (saveBtn) saveBtn.click();
            } catch (e) {
            }
            return;
          }
          const wantDiscard = window.confirm('Выйти без сохранения?');
          if (wantDiscard) closeAudioSettingsModalNow();
        } catch (e) {
          closeAudioSettingsModalNow();
        }
      };

      const closeBtn = document.getElementById('closeAudioSettingsModal');
      if (closeBtn && closeBtn.dataset.boundDictationModal !== '1') {
        closeBtn.dataset.boundDictationModal = '1';
        closeBtn.addEventListener('click', (e) => {
          try {
            e.preventDefault();
            e.stopPropagation();
          } catch (e0) {
          }
          closeAudioSettingsModalWithConfirm();
        });
      }

      if (m.dataset.boundDictationModalBackdrop !== '1') {
        m.dataset.boundDictationModalBackdrop = '1';
        m.addEventListener('click', (e) => {
          try {
            if (e && e.target === m) {
              closeAudioSettingsModalWithConfirm();
            }
          } catch (e2) {
          }
        });
      }
    } catch (e) {
    }
  }

  function setAvatar() {
    try {
      const target = document.getElementById('dictationModalAvatar');
      if (!target) return;

      const source = document.querySelector('.user-avatar-small');
      if (!source) return;

      // Copy inline styles (background-image is usually there)
      target.style.cssText = source.style.cssText || '';

      // Copy classes that may affect avatar rendering
      target.className = source.className;
      target.id = 'dictationModalAvatar';
    } catch (e) {
    }
  }

  function renderLucide(root) {
    try {
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons({ root: root || document });
      }
    } catch (e) {
    }
  }

  function parseDictationHref(href) {
    // expected: /dictation/dict_123/en/uk
    try {
      const s = String(href || '').trim();
      const u = new URL(s, window.location.origin);
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length < 4) return null;
      if (parts[0] !== 'dictation') return null;
      return {
        dictationIdFormatted: parts[1],
        langOriginal: parts[2],
        langTranslation: parts[3],
      };
    } catch (e) {
      return null;
    }
  }

  function getDraftUserIdForKey() {
    try {
      const um = window.UM;
      const id = um?.userData?.id;
      if (id != null && String(id).trim()) return String(id).trim();
    } catch (e) {
    }
    return 'anon';
  }

  function getRuntimeStore() {
    try {
      if (window.__dictationRuntimeStore) return window.__dictationRuntimeStore;
      if (!window.DictationRuntime || !window.DictationRuntime.DictationSessionsStore) return null;
      window.__dictationRuntimeStore = new window.DictationRuntime.DictationSessionsStore({
        maxSessions: window.DictationRuntime.MAX_OPEN_SESSIONS || 5,
      });
      // Восстанавливаем сохранённые сессии из IndexedDB
      window.__dictationRuntimeStore.restoreFromIdb().catch(function(e){});
      return window.__dictationRuntimeStore;
    } catch (e) {
      return null;
    }
  }

  async function loadSentencesFromIndexedDb({ dictationId, langOrig, langTr }) {
    try {
      const idb = window.IdbManager;
      if (!idb || typeof idb.idbGet !== 'function' || typeof idb.openDraftDb !== 'function') return null;

      const dictId = String(dictationId || '').trim();
      const lo = String(langOrig || '').trim();
      const lt = String(langTr || '').trim();
      if (!dictId || !lo || !lt) return null;

      const rawUserId = String(getDraftUserIdForKey());
      const candidateKeys = [];
      candidateKeys.push(`${rawUserId}:${dictId}:${lo}:${lt}`);
      try {
        const numericId = parseInt(dictId.replace(/^dict_/, ''), 10);
        if (Number.isFinite(numericId)) {
          candidateKeys.push(`${rawUserId}:${numericId}:${lo}:${lt}`);
          candidateKeys.push(`${rawUserId}:dict_${numericId}:${lo}:${lt}`);
          candidateKeys.push(`anon:dict_${numericId}:${lo}:${lt}`);
        }
      } catch (e) {
      }

      let cached = null;
      for (const key of candidateKeys) {
        cached = await idb.idbGet('dictations', key);
        const sentences = cached && Array.isArray(cached.sentences) ? cached.sentences : [];
        if (sentences.length) break;
        cached = null;
      }

      if (!cached) {
        const db = await idb.openDraftDb();
        try {
          cached = await new Promise((resolve) => {
            const tx = db.transaction('dictations', 'readonly');
            const store = tx.objectStore('dictations');
            const req = store.openCursor();
            req.onsuccess = () => {
              const cursor = req.result;
              if (!cursor) return resolve(null);
              const v = cursor.value;
              if (v && v.dictationId === dictId && v.langOrig === lo && v.langTr === lt) {
                return resolve(v);
              }
              cursor.continue();
            };
            req.onerror = () => resolve(null);
          });
        } finally {
          try {
            db.close();
          } catch (e) {
          }
        }
      }

      const sentences = cached && Array.isArray(cached.sentences) ? cached.sentences : [];
      if (!sentences.length) return null;
      return sentences;
    } catch (e) {
      return null;
    }
  }

  async function fetchSentencesFromServerAndCache({ dictationId, langOrig, langTr }) {
    const dictId = String(dictationId || '').trim();
    const lo = String(langOrig || '').trim();
    const lt = String(langTr || '').trim();
    if (!dictId || !lo || !lt) {
      throw new Error('missing_dictation_params');
    }

    const url = `/api/dictation/${encodeURIComponent(dictId)}/${encodeURIComponent(lo)}/${encodeURIComponent(lt)}/sentences`;
    const response = await fetch(url, { method: 'GET', cache: 'no-store' });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`fetch_sentences_failed_${response.status}_${text}`);
    }
    const data = await response.json();
    const sentences = (data && Array.isArray(data.sentences)) ? data.sentences : [];
    if (!sentences.length) {
      throw new Error('empty_sentences');
    }

    sentences.sort((a, b) => {
      const ap = (a && a.position !== undefined && a.position !== null && isFinite(Number(a.position))) ? Number(a.position) : null;
      const bp = (b && b.position !== undefined && b.position !== null && isFinite(Number(b.position))) ? Number(b.position) : null;
      if (ap !== null && bp !== null) return ap - bp;
      if (ap !== null) return -1;
      if (bp !== null) return 1;
      const ak = a && a.key ? String(a.key) : '';
      const bk = b && b.key ? String(b.key) : '';
      return ak.localeCompare(bk);
    });

    const idb = window.IdbManager;
    if (idb && typeof idb.idbPut === 'function') {
      const userId = String(getDraftUserIdForKey());
      const key = `${userId}:${dictId}:${lo}:${lt}`;
      await idb.idbPut('dictations', {
        key,
        dictationId: dictId,
        langOrig: lo,
        langTr: lt,
        sentences,
        updatedAt: Date.now(),
      });
    }

    try {
      setTimeout(() => {
        try {
          const am = window.AudioManager;
          if (!am || typeof am.normalizeMediaUrl !== 'function' || typeof am.buildDictationAudioUrl !== 'function' || typeof am.prefetchMediaUrls !== 'function') return;
          const audioUrls = [];
          const resolveAudioToUrl = (rawValue, lang) => {
            const v = String(rawValue || '').trim();
            if (!v) return null;
            if (v.startsWith('blob:')) return v;
            if (v.startsWith('/api/')) return am.normalizeMediaUrl(v);
            if (v.startsWith('http://') || v.startsWith('https://')) return am.normalizeMediaUrl(v);
            const name = v.split('?', 1)[0].split('/').pop();
            if (!name) return null;
            return am.buildDictationAudioUrl(dictId, String(lang), name);
          };
          for (const s of sentences) {
            if (!s || typeof s !== 'object') continue;
            const u1 = resolveAudioToUrl(s.audio, lo);
            const u2 = resolveAudioToUrl(s.audio_tr, lt);
            if (u1) audioUrls.push(u1);
            if (u2) audioUrls.push(u2);
          }
          const unique = Array.from(new Set(audioUrls.filter(Boolean)));
          if (unique.length) {
            am.prefetchMediaUrls(unique, { concurrency: 4 }).catch(() => {});
          }
        } catch (e) {
        }
      }, 0);
    } catch (e) {
    }

    return sentences;
  }

  async function ensureDictationContentLoadedToRuntime({ dictationIdFormatted, langOriginal, langTranslation }) {
    const store = getRuntimeStore();
    if (!store) throw new Error('DictationRuntime_not_loaded');

    const dictationId = String(dictationIdFormatted || '').trim();
    const langOrig = String(langOriginal || '').trim();
    const langTr = String(langTranslation || '').trim();
    if (!dictationId || !langOrig || !langTr) throw new Error('missing_dictation_params');

    let sentences = await loadSentencesFromIndexedDb({ dictationId, langOrig, langTr });
    if (!Array.isArray(sentences) || sentences.length === 0) {
      try {
        if (window.DesktopToast && typeof window.DesktopToast.show === 'function') {
          window.DesktopToast.show('Данных нет в кеше. Загружаю из интернета…', 'info', 2500);
        } else if (typeof window.showSaveToast === 'function') {
          window.showSaveToast('Данных нет в кеше. Загружаю из интернета…', 'info', 2500);
        }
      } catch (e) {
      }

      try {
        if (window.DesktopLoadingModal && typeof window.DesktopLoadingModal.show === 'function') {
          window.DesktopLoadingModal.show('Загрузка диктанта в кеш…');
        } else if (typeof window.showDictationCacheFetchOverlay === 'function') {
          window.showDictationCacheFetchOverlay('Загрузка диктанта в кеш…');
        }
      } catch (e) {
      }

      try {
        await fetchSentencesFromServerAndCache({ dictationId, langOrig, langTr });
      } catch (e) {
        try {
          if (window.DesktopLoadingModal && typeof window.DesktopLoadingModal.hide === 'function') {
            window.DesktopLoadingModal.hide();
          } else if (typeof window.hideDictationCacheFetchOverlay === 'function') {
            window.hideDictationCacheFetchOverlay();
          }
        } catch (e0) {
        }

        try {
          const raw = e && e.message ? String(e.message) : String(e);
          const isStorage = raw.includes('fetch_sentences_failed_503')
            || raw.includes('fetch_sentences_failed_502')
            || raw.includes('_503_')
            || raw.includes('_502_');
          if (typeof window.showNoSelectionModal === 'function') {
            if (isStorage) {
              window.showNoSelectionModal('Хранилище временно недоступно. Попробуй ещё раз позже.');
            } else {
              window.showNoSelectionModal('Не удалось загрузить диктант. Проверь интернет и обнови страницу.');
            }
          }
        } catch (e1) {
        }

        throw e;
      }

      sentences = await loadSentencesFromIndexedDb({ dictationId, langOrig, langTr });
      try {
        if (window.DesktopLoadingModal && typeof window.DesktopLoadingModal.hide === 'function') {
          window.DesktopLoadingModal.hide();
        } else if (typeof window.hideDictationCacheFetchOverlay === 'function') {
          window.hideDictationCacheFetchOverlay();
        }
      } catch (e) {
      }
    }
    if (!Array.isArray(sentences) || sentences.length === 0) {
      try {
        if (typeof window.showNoSelectionModal === 'function') {
          window.showNoSelectionModal('Не удалось сохранить диктант в кеш. Обнови страницу.');
        }
      } catch (e) {
      }
      throw new Error('empty_sentences');
    }

    store.setContentSentences({ dictationId, langTr, sentences });
    return true;
  }

  function getOrCreateDefaultSessionFromParsed(parsed, subsetPositions = null) {
    const store = getRuntimeStore();
    if (!store) return null;

    const dictationId = String(parsed?.dictationIdFormatted || '').trim();
    const langTr = String(parsed?.langTranslation || '').trim();
    if (!dictationId || !langTr) return null;

    const session = store.getOrCreateSession({
      dictationId,
      langTr,
      exerciseId: null,
      subsetPositions,
      subsetSignature: null,
    });

    try {
      const content = store.getContent({ dictationId, langTr });
      const allKeys = content ? content.getAllKeys() : [];
      const hasSubset = Array.isArray(subsetPositions) && subsetPositions.length > 0;
      if (!hasSubset) {
        session.setActiveSubsetByKeys(allKeys);
        session.ensureDefaultSelection();
      } else {
        const wanted = new Set(subsetPositions.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0));
        const cores = content && typeof content.getAllSentenceCores === 'function' ? content.getAllSentenceCores() : [];
        let subsetKeys = Array.isArray(cores)
          ? cores
            .filter((c) => c && wanted.has(Number(c.position)))
            .map((c) => String(c.key))
            .filter(Boolean)
          : [];

        // Если ни одно предложение не имеет position (все position === null),
        // используем порядковые номера (index + 1) для фильтрации
        if (subsetKeys.length === 0 && cores.length > 0) {
          const hasAnyPosition = cores.some((c) => c && c.position != null);
          if (!hasAnyPosition) {
            subsetKeys = cores
              .filter((c, idx) => c && wanted.has(idx + 1))
              .map((c) => String(c.key))
              .filter(Boolean);
          }
        }

        session.setActiveSubsetByKeys(subsetKeys);
        for (const k of subsetKeys) {
          try { session.setSelectionState(k, 'checked'); } catch (e0) { }
        }
        session.ensureDefaultSelection();
      }
    } catch (e) {
    }

    return session;
  }

  function renderStartModalSentencesTable(session) {
    try {
      const table = document.getElementById('sentences-table');
      if (!table) return;
      const tbody = table.querySelector('tbody');
      if (!tbody) return;
      tbody.innerHTML = '';

      // activeKeys === null означает "весь диктант", используем все ключи
      // activeKeys === [] означает "пустой subset" — показываем все ключи как fallback
      const activeKeys = session && session.activeKeys;
      const keys = (activeKeys && activeKeys.length > 0) ? activeKeys : (session && session.content ? session.content.getAllKeys() : []);
      const list = Array.isArray(keys) ? keys : [];

      list.forEach((key, idx) => {
        const view = session.getSentenceView(key);
        if (!view) return;

        const tr = document.createElement('tr');
        tr.dataset.sentenceKey = String(view.key);

        const tdNum = document.createElement('td');
        const position = Number.isFinite(view.position) ? view.position : '';
        tdNum.textContent = position ? ((idx + 1) === position ? String(idx + 1) : (String(idx + 1) + '/' + String(position))) : String(idx + 1);

        const tdChoice = document.createElement('td');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'all-checkbox-btn';
        btn.setAttribute('aria-label', 'Выбрать предложение');

        // selection_state хранится в сессии, а не в view (getSentenceView возвращает сырой объект предложения)
        const initialState = session.getState(key);
        renderLucideCheckboxButton(btn, initialState && initialState.selection_state === 'checked', false);

        btn.addEventListener('click', (e) => {
          try {
            e.preventDefault();
            e.stopPropagation();
          } catch (e0) {
          }

          try {
            const st = session.getState(view.key);
            const cur = st && st.selection_state ? String(st.selection_state) : 'unchecked';
            const next = (cur === 'checked') ? 'unchecked' : 'checked';
            session.setSelectionState(view.key, next);
            session.ensureDefaultSelection();
            const updatedState = session.getState(view.key);
            renderLucideCheckboxButton(btn, updatedState && updatedState.selection_state === 'checked', false);
            try {
              updateAllCheckboxButtonFromSession(session);
            } catch (e2) {
            }
            updateNavigatorFromSession(session);
          } catch (e1) {
          }
        });

        tdChoice.appendChild(btn);

        const st = session.getState(view.key);

        // --- Колонка: Звезда / Полузвезда ---
        const tdStar = document.createElement('td');
        tdStar.className = 'col-star';
        const perfect = Number(st && st.number_of_perfect) || 0;
        const corrected = Number(st && st.number_of_corrected) || 0;
        const starWrap = document.createElement('span');
        starWrap.className = 'star-icon';
        if (perfect >= 1) {
          starWrap.classList.add('star-icon--perfect');
          starWrap.innerHTML = '<i data-lucide="star"></i>';
        } else if (corrected > 0) {
          starWrap.classList.add('star-icon--half');
          starWrap.innerHTML = '<i data-lucide="star-half"></i>';
        } else {
          starWrap.classList.add('star-icon--none');
          starWrap.innerHTML = '<i data-lucide="star-off"></i>';
        }
        tdStar.appendChild(starWrap);

        // --- Колонка: Микрофон ---
        const tdMic = document.createElement('td');
        tdMic.className = 'col-mic';
        const audioDone = Number(st && st.number_of_audio) || 0;
        const micWrap = document.createElement('span');
        if (audioDone > 0) {
          micWrap.className = 'mic-icon--done';
          micWrap.innerHTML = '<i data-lucide="mic"></i>';
        } else {
          micWrap.className = 'mic-icon--none';
          micWrap.innerHTML = '<i data-lucide="mic-off"></i>';
        }
        tdMic.appendChild(micWrap);

        // --- Колонка: Полузвёзды (number_of_corrected) ---
        const tdHalfStars = document.createElement('td');
        tdHalfStars.className = 'col-half-stars';
        const halfStarCount = Number(st && st.number_of_corrected) || 0;
        if (halfStarCount > 0) {
          const halfSpan = document.createElement('span');
          halfSpan.className = 'half-star-count';
          halfSpan.innerHTML = '<i data-lucide="star-half"></i>' + String(halfStarCount);
          tdHalfStars.appendChild(halfSpan);
        }

        // --- Колонка: Активности (text_activity_count) ---
        const tdActivities = document.createElement('td');
        tdActivities.className = 'col-activities';
        const activityCount = Number(st && st.text_activity_count) || 0;
        if (activityCount > 0) {
          const actSpan = document.createElement('span');
          actSpan.className = 'activity-count';
          actSpan.innerHTML = '<i data-lucide="circle-small"></i>' + String(activityCount);
          tdActivities.appendChild(actSpan);
        }

        // --- Колонка: Время (накопительное, из time_count) ---
        const tdTime = document.createElement('td');
        tdTime.className = 'col-time';
        const timeMs = st && Number(st.time_count) || 0;
        tdTime.textContent = timeMs > 0 ? formatMmSs(timeMs) : '';

        // --- Колонка: Символы (number_of_characters) ---
        const tdChars = document.createElement('td');
        tdChars.className = 'col-characters';
        const charsCount = Number(st && st.number_of_characters) || 0;
        tdChars.textContent = charsCount > 0 ? String(charsCount) : '';

        // --- Колонка: Ошибки (mistake_count) ---
        const tdMistakes = document.createElement('td');
        tdMistakes.className = 'col-mistakes';
        const mistakesCount = Number(st && st.mistake_count) || 0;
        tdMistakes.textContent = mistakesCount > 0 ? String(mistakesCount) : '';

        const tdOrig = document.createElement('td');
        tdOrig.className = 'col-text-original';
        tdOrig.textContent = String(view.text_original || '');

        const tdTr = document.createElement('td');
        tdTr.className = 'col-text-translation';
        tdTr.textContent = String(view.text_translation || '');

        tr.appendChild(tdNum);
        tr.appendChild(tdChoice);
        tr.appendChild(tdStar);
        tr.appendChild(tdMic);
        tr.appendChild(tdHalfStars);
        tr.appendChild(tdActivities);
        tr.appendChild(tdTime);
        tr.appendChild(tdChars);
        tr.appendChild(tdMistakes);
        tr.appendChild(tdOrig);
        tr.appendChild(tdTr);

        tbody.appendChild(tr);
      });

      renderLucide(table);

      try {
        updateAllCheckboxButtonFromSession(session);
      } catch (e1) {
      }
    } catch (e) {
    }
  }

  function isHeaderToggleProtectedState(state) {
    try {
      const s = state && state.selection_state ? String(state.selection_state) : '';
      return s === 'completed';
    } catch (e) {
      return false;
    }
  }

  function computeAllCheckboxCheckedState(session) {
    try {
      // activeKeys === null означает "весь диктант", используем все ключи контента
      const activeKeys = session && session.activeKeys;
      const keys = (activeKeys && activeKeys.length > 0) ? activeKeys : (session && session.content ? session.content.getAllKeys() : []);
      const list = Array.isArray(keys) ? keys : [];
      let eligible = 0;
      let checked = 0;
      for (const k of list) {
        const st = session.getState(k);
        if (isHeaderToggleProtectedState(st)) continue;
        eligible += 1;
        if (st && String(st.selection_state) === 'checked') checked += 1;
      }
      if (!eligible) return false;
      return checked === eligible;
    } catch (e) {
      return false;
    }
  }

  function computeAllCheckboxTriState(session) {
    try {
      // activeKeys === null означает "весь диктант", используем все ключи контента
      const activeKeys = session && session.activeKeys;
      const keys = (activeKeys && activeKeys.length > 0) ? activeKeys : (session && session.content ? session.content.getAllKeys() : []);
      const list = Array.isArray(keys) ? keys : [];
      let eligible = 0;
      let checked = 0;
      let unchecked = 0;
      for (const k of list) {
        const st = session.getState(k);
        if (isHeaderToggleProtectedState(st)) continue;
        eligible += 1;
        const cur = st && st.selection_state ? String(st.selection_state) : 'unchecked';
        if (cur === 'checked') checked += 1;
        else unchecked += 1;
      }
      if (!eligible) return 'unchecked';
      if (checked === eligible) return 'checked';
      if (unchecked === eligible) return 'unchecked';
      return 'mixed';
    } catch (e) {
      return 'unchecked';
    }
  }

  function updateAllCheckboxButtonFromSession(session) {
    try {
      const btn = document.getElementById('allCheckbox');
      if (!btn) return;
      const state = computeAllCheckboxTriState(session);
      renderLucideTriStateCheckboxButton(btn, state, false);
    } catch (e) {
    }
  }

  function applyHeaderToggleToRows(session, targetState) {
    try {
      const table = document.getElementById('sentences-table');
      if (!table) return;
      const tbody = table.querySelector('tbody');
      if (!tbody) return;
      const rows = Array.from(tbody.querySelectorAll('tr'));

      for (const tr of rows) {
        const key = tr && tr.dataset ? String(tr.dataset.sentenceKey || '') : '';
        if (!key) continue;
        const st = session.getState(key);
        if (isHeaderToggleProtectedState(st)) continue;
        session.setSelectionState(key, targetState);
      }

      for (const tr of rows) {
        const key = tr && tr.dataset ? String(tr.dataset.sentenceKey || '') : '';
        if (!key) continue;
        const btn = tr.querySelector('button.all-checkbox-btn');
        if (!btn) continue;
        const st = session.getState(key);
        const isCompleted = isHeaderToggleProtectedState(st);
        const isChecked = st && String(st.selection_state) === 'checked';
        renderLucideCheckboxButton(btn, isChecked, false);
        try {
          if (isCompleted) {
            btn.title = 'Выполнено';
          } else {
            btn.title = 'Выбрать предложение';
          }
        } catch (e0) {
        }
      }

      updateAllCheckboxButtonFromSession(session);
      updateNavigatorFromSession(session);
    } catch (e) {
    }
  }

  function refreshSelectedCounters(session) {
    try {
      const totalEl = document.getElementById('sentenceTotalNumber');
      if (totalEl) totalEl.textContent = `/ ${session && Array.isArray(session.selectedKeys) ? session.selectedKeys.length : 0}`;
    } catch (e) {
    }
    try {
      const curEl = document.getElementById('sentenceCurrentNumber');
      if (curEl) curEl.textContent = '1';
    } catch (e) {
    }
  }

  function updateNavigatorFromSession(session) {
    try {
      const totalEl = document.getElementById('sentenceTotalNumber');
      if (totalEl) totalEl.textContent = `/ ${session && Array.isArray(session.selectedKeys) ? session.selectedKeys.length : 0}`;
    } catch (e) {
    }
    try {
      const curEl = document.getElementById('sentenceCurrentNumber');
      const cur = session && session.selectedKeys && session.selectedKeys.length ? (session.currentSelectedIndex + 1) : 0;
      if (curEl) curEl.textContent = String(cur || 0);
    } catch (e) {
    }

    try {
      updateAudioPlayersFromSession(session);
    } catch (e) {
    }

    try {
      const panel = ensureSpeechPanel(session);
      const view = getCurrentSentenceViewFromSession(session);
      if (panel && view) {
        panel.setExpectedText(String(view.text_original != null ? view.text_original : (view.text != null ? view.text : '')));
        panel.setEnabled(getRequiredAudioRepeatsValue() > 0);
      }
    } catch (e00) {
    }

    try {
      updateTaskProgressFromSession(session);
    } catch (e0) {
    }
    try {
      updateSentenceTabloFromSession(session);
    } catch (e1) {
    }

    try {
      updateNextButtonVisibilityFromSession(session);
    } catch (e2) {
    }

    try {
      applyExerciseMode(session);
    } catch (e2b) {
    }

    try {
      if (state.dictationStarted && !isPauseModalOpen() && !isStartModalOpen()) {
        try {
          if (state._skipNavigatorFocusOnce) {
            state._skipNavigatorFocusOnce = false;
            return;
          }
        } catch (e0x) {
        }

        // В режимах p3 и p4 фокус на кнопку записи аудио
        const mode = getExerciseMode();
        if (mode === 'audio-only-no-hint' || mode === 'audio-only-hint') {
          const rb = document.getElementById('recordButton');
          if (rb && typeof rb.focus === 'function') {
            rb.focus();
          }
        } else {
          focusUserInput();
        }
      }
    } catch (e3) {
    }
  }

  function bindEnterToCheck() {
    try {
      const input = document.getElementById('userInput');
      if (!input || input.dataset.boundEnterToCheck === '1') return;
      input.dataset.boundEnterToCheck = '1';
      input.addEventListener('keydown', (e) => {
        try {
          if (!state.isOpen) return;
          if (!state.dictationStarted) return;
          if (!e) return;
          if (e.key !== 'Enter') return;
          if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
          // В режимах p3 и p4 Enter не запускает проверку текста
          const mode = getExerciseMode();
          if (mode === 'audio-only-no-hint' || mode === 'audio-only-hint') return;
          e.preventDefault();
          e.stopPropagation();
          if (typeof window.checkText === 'function') window.checkText();
        } catch (e0) {
        }
      }, true);
    } catch (e) {
    }
  }

  function bindNextButton() {
    try {
      const btn = document.getElementById('resultNextBtn');
      if (!btn || btn.dataset.boundDictationModal === '1') return;
      btn.dataset.boundDictationModal = '1';
      btn.addEventListener('click', (e) => {
        try {
          e.preventDefault();
          e.stopPropagation();
        } catch (e0) {
        }
        try {
          try {
            startNewRewardCycle();
          } catch (e00c) {
          }
          if (typeof window.nextSentence === 'function') window.nextSentence();
        } catch (e1) {
        }
      });
    } catch (e) {
    }
  }

  function applyDictationMetaFromCard({ href, cardEl }) {
    const parsed = parseDictationHref(href);
    if (!parsed) return;

    const dictationData = document.getElementById('dictation-data');
    if (dictationData) {
      dictationData.setAttribute('data-language-original', parsed.langOriginal);
      dictationData.setAttribute('data-language-translation', parsed.langTranslation);
      dictationData.setAttribute('data-dictation-id', parsed.dictationIdFormatted);
      dictationData.setAttribute('data-lang-notice', '');
      dictationData.setAttribute('data-is-dialog', 'false');
      dictationData.setAttribute('data-speakers', '[]');

      try {
        let title = '';
        if (cardEl) {
          const t = cardEl.querySelector('[data-slot="title"], .short-title');
          if (t) title = String(t.textContent || '').trim();
        }
        dictationData.setAttribute('data-title-orig', title);
      } catch (e) {
      }
    }

    try {
      const title = dictationData ? String(dictationData.getAttribute('data-title-orig') || '') : '';
      const titleEl = document.getElementById('dictationTitle');
      if (titleEl) titleEl.textContent = title;
      const titleModalEl = document.getElementById('title-diktation');
      if (titleModalEl) titleModalEl.textContent = title;
    } catch (e) {
    }

    try {
      const langPair = document.getElementById('dictationLangPair');
      if (langPair) langPair.textContent = '';
      const tr = document.getElementById('dictationTranslationLanguage');
      if (tr) tr.textContent = parsed.langTranslation;
    } catch (e) {
    }

    try {
      const idDisplay = document.getElementById('dictationIdDisplay');
      if (idDisplay) idDisplay.textContent = parsed.dictationIdFormatted;
    } catch (e) {
    }

    try {
      const badge = document.getElementById('startModalDiktNumber');
      if (badge) {
        const num = String(parsed.dictationIdFormatted || '').replace(/^dict_/, '');
        badge.textContent = num;
      }
    } catch (e) {
    }
  }

  function ensureScript(src) {
    return new Promise((resolve, reject) => {
      try {
        if (document.querySelector('script[data-dictation-dep="' + src + '"]')) {
          resolve();
          return;
        }

        try {
          const scripts = Array.from(document.scripts || []);
          for (const s of scripts) {
            const raw = s && s.src ? String(s.src) : '';
            if (!raw) continue;
            try {
              const u = new URL(raw, window.location.origin);
              if (u && u.pathname === src) {
                resolve();
                return;
              }
            } catch (e0) {
              // ignore
            }
          }
        } catch (e1) {
          // ignore
        }

        const s = document.createElement('script');
        s.src = src + (window.__APP_CACHE_REVISION ? ('?v=' + window.__APP_CACHE_REVISION) : '');
        s.async = false;
        s.defer = true;
        s.dataset.dictationDep = src;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Failed loading ' + src));
        document.head.appendChild(s);
      } catch (e) {
        reject(e);
      }
    });
  }

  function showStartModal() {
    try {
      const startModal = document.getElementById('start-modal');
      if (!startModal) return;
      startModal.style.display = 'flex';
      renderLucide(startModal);

      try {
        const prefs = window.__dictationStartModalColumnPrefs;
        if (prefs && typeof prefs === 'object') {
          applyStartModalColumnsPreset(prefs);
        } else {
          applyStartModalColumnsPreset({ progress: true, original: false, translation: false });
        }
      } catch (e1) {
      }
    } catch (e) {
    }

    // Останавливаем таймер при открытии start-modal
    _pauseDictationTimer();
  }

  function hideStartModal() {
    try {
      const startModal = document.getElementById('start-modal');
      if (!startModal) return;
      startModal.style.display = 'none';
    } catch (e) {
    }

    // Возобновляем таймер при закрытии start-modal (X кнопка)
    _resumeDictationTimer();
  }

  try {
    if (typeof window.showStartModal !== 'function') window.showStartModal = showStartModal;
    if (typeof window.hideStartModal !== 'function') window.hideStartModal = hideStartModal;
  } catch (e) {
  }

  async function hasUnsavedProgress() {
    try {
      const panel = window.progressPanel;
      const hasPanelPending = panel && typeof panel.hasPending === 'function' ? !!panel.hasPending() : false;
      if (hasPanelPending) return true;
    } catch (e) {
    }

    try {
      if (typeof hasLocalPendingDraft === 'function') {
        return !!(await hasLocalPendingDraft());
      }
    } catch (e) {
    }

    return false;
  }

  async function exitDictationFromStartModal() {
    const doClose = () => {
      try { hideStartModal(); } catch (e0) {}
      try { close(); } catch (e1) {}
    };

    try {
      const pending = await hasUnsavedProgress();
      if (!pending) {
        doClose();
        return;
      }
    } catch (e) {
    }

    try {
      if (typeof showExitModal === 'function') {
        await showExitModal(() => doClose());
        return;
      }
    } catch (e) {
    }

    // Fallback: close without confirmation
    doClose();
  }

  const LS_SPEECH_REC_MODE_KEY = 'dictafan_speech_rec_mode';

  function _readSpeechRecModeFromLS() {
    try {
      const v = localStorage.getItem(LS_SPEECH_REC_MODE_KEY);
      if (v) return String(v);
    } catch (e) {}
    return 'route';
  }

  function _writeSpeechRecModeToLS(mode) {
    try {
      localStorage.setItem(LS_SPEECH_REC_MODE_KEY, String(mode || 'route'));
    } catch (e) {}
  }

  function _getDownloadedWhisperSizes() {
    try {
      // LanguageSelector хранит downloaded_models_v2, а не dictafan_downloaded_models_v2
      const raw = localStorage.getItem('downloaded_models_v2');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const sizes = [];
      for (const key of Object.keys(parsed || {})) {
        if (key.includes('whisper-tiny')) sizes.push('tiny');
        if (key.includes('whisper-base')) sizes.push('base');
        if (key.includes('whisper-small')) sizes.push('small');
      }
      return sizes;
    } catch (e) {
      return [];
    }
  }

  // Конфигурация device-режимов: размер → { icon, label }
  var DEVICE_MODE_CONFIG = {
    tiny:  { icon: 'house-heart', label: 'Whisper Tiny · 75 MB' },
    base:  { icon: 'house',       label: 'Whisper Base · 145 MB' },
    small: { icon: 'house-plus',  label: 'Whisper Small · 480 MB' },
  };

  function _renderDeviceModes() {
    try {
      var container = document.querySelector('#audioSettingsModal [data-role="device-modes-container"]');
      if (!container) return;
      var downloaded = _getDownloadedWhisperSizes();
      var html = '';
      for (var i = 0; i < downloaded.length; i++) {
        var size = downloaded[i];
        var cfg = DEVICE_MODE_CONFIG[size];
        if (!cfg) continue;
        var value = 'route-off|' + size;
        html += '<label class="dictation-settings-speech-rec-mode dictation-settings-speech-rec-mode-device" data-mode="route-off" data-model-size="' + size + '">';
        html += '<input type="radio" name="modal-speechRecMode" value="' + value + '" />';
        html += '<span class="dictation-settings-inline"><i data-lucide="' + cfg.icon + '"></i><span>На пристрої ' + cfg.label + '</span></span>';
        html += '</label>';
      }
      container.innerHTML = html;
    } catch (e) {}
  }

  function _getSelectedSpeechRecMode() {
    try {
      const m = document.getElementById('audioSettingsModal');
      if (!m) return 'route';
      const checked = m.querySelector('input[name="modal-speechRecMode"]:checked');
      return checked ? String(checked.value || 'route') : 'route';
    } catch (e) {
      return 'route';
    }
  }

  function initAudioSettingsModal() {
    try {
      const m = document.getElementById('audioSettingsModal');
      if (!m) return;

      if (m.dataset.dictafanInitAudioSettingsModal === '1') {
        return;
      }
      m.dataset.dictafanInitAudioSettingsModal = '1';

      const startInput = document.getElementById('modal-playSequenceStart');
      const rbRecord = document.getElementById('modal-audioExerciseModeRecord');
      const rbNoRecord = document.getElementById('modal-audioExerciseModeNoRecord');
      const rbOnlyNoHint = document.getElementById('modal-audioExerciseModeOnlyNoHint');
      const rbOnlyHint = document.getElementById('modal-audioExerciseModeOnlyHint');
      const star = document.getElementById('audioSettingsDirtyStar');
      const saveBtn = document.getElementById('saveAudioSettingsModalBtn');

      const defaults = {
        start: 'oto',
        exercise_mode: 'record',
      };

      const readFromUser = () => {
        try {
          const um = window.UM;
          const raw = um && um.userData && um.userData.settings_json ? String(um.userData.settings_json || '') : '';
          if (raw) {
            const parsed = JSON.parse(raw);
            const audio = parsed && parsed.audio && typeof parsed.audio === 'object' ? parsed.audio : {};
            return {
              start: audio.start != null ? String(audio.start || '') : defaults.start,
              exercise_mode: audio.exercise_mode != null ? String(audio.exercise_mode || '') : defaults.exercise_mode,
            };
          }
        } catch (e) {
        }
        return {
          start: defaults.start,
          exercise_mode: defaults.exercise_mode,
        };
      };

      const settingsState = {
        snapshot: readFromUser(),
        dirty: false,
      };

      const setDirty = (isDirty) => {
        settingsState.dirty = !!isDirty;
        try {
          if (star) star.style.display = settingsState.dirty ? 'inline-flex' : 'none';
        } catch (e) {
        }
        try {
          if (saveBtn) saveBtn.disabled = !settingsState.dirty;
        } catch (e2) {
        }
      };

      const getSelectedExerciseMode = () => {
        try {
          const el = m.querySelector('input[name="modal-audioExerciseMode"]:checked');
          const v = el ? String(el.value || '') : '';
          return v || defaults.exercise_mode;
        } catch (e) {
          return defaults.exercise_mode;
        }
      };

      const applySpeechRecModeToUI = () => {
        try {
          const mode = _readSpeechRecModeFromLS();
          const radios = m.querySelectorAll('input[name="modal-speechRecMode"]');
          let found = false;
          radios.forEach((r) => {
            if (String(r.value) === mode) {
              r.checked = true;
              found = true;
            }
          });
          if (!found) {
            // Fallback: если сохранённый режим не найден (например, модель удалена из кеша), ставим 'route'
            const first = m.querySelector('input[name="modal-speechRecMode"][value="route"]');
            if (first) first.checked = true;
            _writeSpeechRecModeToLS('route');
          }
        } catch (e) {}
      };

      const applyToUI = (settings) => {
        try {
          if (startInput) startInput.value = (settings && settings.start != null) ? String(settings.start || '') : defaults.start;
        } catch (e) {
        }

        const mode = (settings && settings.exercise_mode) ? String(settings.exercise_mode || '') : defaults.exercise_mode;
        try {
          if (rbRecord) rbRecord.checked = mode === 'record';
          if (rbNoRecord) rbNoRecord.checked = mode === 'no-record';
          if (rbOnlyNoHint) rbOnlyNoHint.checked = mode === 'audio-only-no-hint';
          if (rbOnlyHint) rbOnlyHint.checked = mode === 'audio-only-hint';
        } catch (e2) {
        }

        // Применяем режим распознавания из localStorage
        _renderDeviceModes();
        applySpeechRecModeToUI();
      };

      const applyToRuntime = () => {
        try {
          const start = startInput ? String(startInput.value || '') : defaults.start;
          window.playSequenceStart = start || defaults.start;
        } catch (e) {
        }
        try {
          window.audioExerciseMode = getSelectedExerciseMode();
        } catch (e2) {
        }
        // Применяем режим упражнения к текущему UI
        try {
          const session = window.__dictationModalActiveSession;
          if (session) {
            applyExerciseMode(session);
          }
        } catch (e3) {
        }
      };

      const restoreSnapshot = () => {
        try {
          applyToUI(settingsState.snapshot);
        } catch (e) {
        }
        try {
          applyToRuntime();
        } catch (e2) {
        }
        setDirty(false);
      };

      window.__dictafanRestoreAudioSettingsModalSnapshot = restoreSnapshot;

      window.__dictafanSaveAudioSettingsModal = async () => {
        try {
          // Сохраняем speech_recognition_mode в localStorage
          const speechRecMode = _getSelectedSpeechRecMode();
          _writeSpeechRecModeToLS(speechRecMode);

          // Обновляем иконку режима распознавания в панели диктанта
          try {
            const panel = state._speechPanel;
            if (panel && typeof panel.setMode === 'function') {
              const normalized = speechRecMode.startsWith('route-off') ? 'route-off' : speechRecMode;
              panel.setMode(normalized);
            }
          } catch (ePanel) {
          }

          // Сохраняем остальные настройки на сервер
          const um = window.UM;
          if (!um || !um.userData || typeof um.updateProfile !== 'function') return;

          const settings = {
            start: startInput ? String(startInput.value || '') : defaults.start,
            exercise_mode: getSelectedExerciseMode(),
          };

          let merged = {};
          try {
            const raw = um.userData.settings_json ? String(um.userData.settings_json || '') : '';
            if (raw) {
              const parsed = JSON.parse(raw);
              if (parsed && typeof parsed === 'object') merged = parsed;
            }
          } catch (e0) {
          }

          if (!merged.audio || typeof merged.audio !== 'object') merged.audio = {};
          merged.audio.start = settings.start || defaults.start;
          merged.audio.exercise_mode = settings.exercise_mode || defaults.exercise_mode;

          await um.updateProfile({
            settings_json: JSON.stringify(merged),
            audio_start: merged.audio.start,
            audio_exercise_mode: merged.audio.exercise_mode,
          });

          try {
            settingsState.snapshot = { start: merged.audio.start, exercise_mode: merged.audio.exercise_mode };
          } catch (e1) {
          }
          setDirty(false);
        } catch (e) {
        }
      };

      applyToUI(settingsState.snapshot);
      applyToRuntime();
      setDirty(false);

      const filterSeq = (v) => {
        try {
          const value = String(v || '').toLowerCase();
          return value.split('').filter((ch) => ch === 't' || ch === 'o').join('');
        } catch (e) {
          return '';
        }
      };

      const onAnyChange = () => {
        try {
          applyToRuntime();
        } catch (e) {
        }
        setDirty(true);
      };

      try {
        if (startInput) {
          startInput.addEventListener('input', (e) => {
            try {
              const filtered = filterSeq(e && e.target ? e.target.value : '');
              if (e && e.target && filtered !== e.target.value) e.target.value = filtered;
            } catch (e0) {
            }
            onAnyChange();
          });
          startInput.addEventListener('change', () => onAnyChange());
        }
      } catch (e) {
      }

      try {
        [rbRecord, rbNoRecord, rbOnlyNoHint, rbOnlyHint].forEach((rb) => {
          if (!rb) return;
          rb.addEventListener('change', () => onAnyChange());
        });
      } catch (e) {
      }

      // Слушаем изменения радио для speech_recognition_mode
      try {
        const speechRecRadios = m.querySelectorAll('input[name="modal-speechRecMode"]');
        speechRecRadios.forEach((r) => {
          r.addEventListener('change', () => {
            setDirty(true);
          });
        });
      } catch (e) {
      }

      try {
        if (saveBtn && saveBtn.dataset.boundDictafanAudioSettingsSave !== '1') {
          saveBtn.dataset.boundDictafanAudioSettingsSave = '1';
          saveBtn.addEventListener('click', async () => {
            try {
              if (typeof window.__dictafanSaveAudioSettingsModal === 'function') {
                await window.__dictafanSaveAudioSettingsModal();
              }
            } catch (e) {
            }
          });
        }
      } catch (e) {
      }
    } catch (e) {
    }
  }

  try {
    window.initAudioSettingsModal = initAudioSettingsModal;
  } catch (e) {
  }

  function openAudioSettingsModal(sourceLabel = 'unknown') {
    try {
      bindAudioSettingsModalControls();
    } catch (e) {
    }

    try {
      if (typeof window.initAudioSettingsModal === 'function') {
        window.initAudioSettingsModal();
      }
    } catch (e) {
    }

    try {
      const m = document.getElementById('audioSettingsModal');
      if (!m) return;
      // Перерендериваем device-режимы при каждом открытии (модели могли измениться)
      _renderDeviceModes();
      applySpeechRecModeToUI();
      m.style.display = 'flex';
      renderLucide(m);
    } catch (e) {
    }

    // Останавливаем таймер при открытии настроек аудио
    _pauseDictationTimer();
  }

  function resetDictationProgressForSession(session) {
    try {
      if (!session) return;
      const keys = session.content ? session.content.getAllKeys() : [];
      for (const key of keys) {
        const st = session.getState(key);
        if (!st) continue;
        st.number_of_perfect = 0;
        st.number_of_corrected = 0;
        st.number_of_audio = 0;
        st.number_of_time = 0;
        st.mistake_count = 0;
        st.mistake_count_current = 0;
        st.text_activity_count = 0;
        st.audio_activity50_count = 0;
        st.money_count = 0;
        st.money_earned = 0;
        st.money_spent = 0;
        st.text_exchange_half_star = false;
        st.audio_exchange_mic = false;
        st.all_audio_completed = false;
        st.time_count = 0;
        st.number_of_characters = 0;
        // Ставим галочку на ВСЕ строки (кроме completed — их тоже сбрасываем в checked)
        st.selection_state = 'checked';
      }
      // Сбрасываем таймер сессии
      try {
        if (session.timer) {
          session.stopTimer();
          session.timer.accumulatedMs = 0;
        }
      } catch (e) {
      }
      // Сбрасываем currentSelectedIndex
      try {
        session.currentSelectedIndex = 0;
      } catch (e) {
      }
      // Перестраиваем selectedKeys
      try {
        session._rebuildSelectedKeysFromStates();
      } catch (e) {
      }
      // Обновляем таблицу
      try {
        renderStartModalSentencesTable(session);
      } catch (e) {
      }
      // Обновляем навигатор
      try {
        updateNavigatorFromSession(session);
      } catch (e) {
      }
      // Явно обновляем all-checkbox
      try {
        updateAllCheckboxButtonFromSession(session);
      } catch (e) {
      }
    } catch (e) {
    }
  }

  function bindStartModalControls() {
    try {
      const closeBtn = document.getElementById('btnBackToList');
      if (closeBtn && closeBtn.dataset.boundDictationModal !== '1') {
        closeBtn.dataset.boundDictationModal = '1';
        closeBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          hideStartModal();
        });
      }
    } catch (e) {
    }

    try {
      const allBtn = document.getElementById('allCheckbox');
      if (allBtn && allBtn.dataset.boundDictationModal !== '1') {
        allBtn.dataset.boundDictationModal = '1';
        allBtn.addEventListener('click', (e) => {
          try {
            e.preventDefault();
            e.stopPropagation();
          } catch (e0) {
          }

          try {
            const session = window.__dictationModalActiveSession;
            if (!session) return;
            const curState = computeAllCheckboxTriState(session);
            const next = (curState === 'checked') ? 'unchecked' : 'checked';
            applyHeaderToggleToRows(session, next);
          } catch (e1) {
          }
        });
      }
    } catch (e) {
    }

    try {
      const btn = document.getElementById('toggleProgressColumnsBtn');
      if (btn && btn.dataset.boundDictationModal !== '1') {
        btn.dataset.boundDictationModal = '1';
        btn.addEventListener('click', (e) => {
          try {
            e.preventDefault();
            e.stopPropagation();
          } catch (e0) {
          }
          try {
            const prefs = window.__dictationStartModalColumnPrefs || { progress: true, original: false, translation: false };
            applyStartModalColumnsPreset({ ...prefs, progress: !prefs.progress });
          } catch (e1) {
          }
        });
      }
    } catch (e) {
    }

    try {
      const btn = document.getElementById('toggleOriginalColumnBtn');
      if (btn && btn.dataset.boundDictationModal !== '1') {
        btn.dataset.boundDictationModal = '1';
        btn.addEventListener('click', (e) => {
          try {
            e.preventDefault();
            e.stopPropagation();
          } catch (e0) {
          }
          try {
            const prefs = window.__dictationStartModalColumnPrefs || { progress: true, original: false, translation: false };
            applyStartModalColumnsPreset({ ...prefs, original: !prefs.original });
          } catch (e1) {
          }
        });
      }
    } catch (e) {
    }

    try {
      const btn = document.getElementById('toggleTranslationColumnBtn');
      if (btn && btn.dataset.boundDictationModal !== '1') {
        btn.dataset.boundDictationModal = '1';
        btn.addEventListener('click', (e) => {
          try {
            e.preventDefault();
            e.stopPropagation();
          } catch (e0) {
          }
          try {
            const prefs = window.__dictationStartModalColumnPrefs || { progress: true, original: false, translation: false };
            applyStartModalColumnsPreset({ ...prefs, translation: !prefs.translation });
          } catch (e1) {
          }
        });
      }
    } catch (e) {
    }

    try {
      const doorBtn = document.getElementById('startModalExitToIndexBtn');
      if (doorBtn && doorBtn.dataset.boundDictationModal !== '1') {
        doorBtn.dataset.boundDictationModal = '1';
        doorBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          await exitDictationFromStartModal();
        });
      }
    } catch (e) {
    }

    try {
      const settingsBtn = document.getElementById('startModalOpenSettingsBtn');
      if (settingsBtn && settingsBtn.dataset.boundDictationModal !== '1') {
        settingsBtn.dataset.boundDictationModal = '1';
        settingsBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          openAudioSettingsModal('start-modal-gear');
        });
      }
    } catch (e) {
    }

    try {
      const startModal = document.getElementById('start-modal');
      if (startModal && startModal.dataset.boundDictationModalBackdrop !== '1') {
        startModal.dataset.boundDictationModalBackdrop = '1';
        startModal.addEventListener('click', (e) => {
          try {
            if (e && e.target === startModal) {
              return;
            }
          } catch (e2) {
          }
        });
      }
    } catch (e) {
    }

    // btn-new-circle — открытие модалки выбора предложений
    try {
      const newCircleBtn = document.getElementById('btn-new-circle');
      if (newCircleBtn && newCircleBtn.dataset.boundDictationModal !== '1') {
        newCircleBtn.dataset.boundDictationModal = '1';
        newCircleBtn.addEventListener('click', (e) => {
          try {
            e.preventDefault();
            e.stopPropagation();
          } catch (e0) {
          }
          try {
            const session = window.__dictationModalActiveSession;
            if (!session) return;
            // Сохраняем время текущего предложения перед открытием таблицы
            // (updateStartModalSentenceRow вызывается внутри _saveSentenceTime)
            if (state.dictationStarted) {
              _saveSentenceTime(session);
            }
            // Показываем модалку (она сама остановит таймер)
            showStartModal();
          } catch (e1) {
          }
        });
      }
    } catch (e) {
    }

    // mixControl — перемешивание порядка предложений
    try {
      const mixBtn = document.getElementById('mixControl');
      if (mixBtn && mixBtn.dataset.boundDictationModal !== '1') {
        mixBtn.dataset.boundDictationModal = '1';
        // Устанавливаем начальное состояние, если ещё не установлено
        if (!mixBtn.dataset.checked) {
          mixBtn.dataset.checked = 'false';
        }
        mixBtn.addEventListener('click', (e) => {
          try {
            e.preventDefault();
            e.stopPropagation();
          } catch (e0) {
          }
          try {
            const session = window.__dictationModalActiveSession;
            if (!session) return;
            const currentState = mixBtn.dataset.checked;
            const newState = currentState === 'true' ? 'false' : 'true';
            mixBtn.dataset.checked = newState;

            // Меняем иконку и подсказку (title)
            const iconName = newState === 'true' ? 'shuffle' : 'move-right';
            const textName = newState === 'true'
              ? 'Перемешать предложения'
              : 'Прямой порядок';
            mixBtn.innerHTML = '<i data-lucide="' + iconName + '"></i>';
            mixBtn.title = textName;
            mixBtn.setAttribute('aria-label', textName);

            // Перемешиваем или восстанавливаем порядок предложений
            const allKeys = session.content ? session.content.getAllKeys() : [];
            if (newState === 'true') {
              // Сохраняем оригинальный порядок при первом перемешивании
              if (!session._originalActiveKeys) {
                session._originalActiveKeys = session.activeKeys ? Array.from(session.activeKeys) : Array.from(allKeys);
              }
              // Перемешиваем activeKeys (алгоритм Фишера-Йетса)
              const shuffled = session.activeKeys ? Array.from(session.activeKeys) : Array.from(allKeys);
              for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
              }
              session.activeKeys = shuffled;
            } else {
              // Восстанавливаем оригинальный порядок
              if (session._originalActiveKeys) {
                session.activeKeys = Array.from(session._originalActiveKeys);
              } else {
                session.activeKeys = Array.from(allKeys);
              }
              session._originalActiveKeys = null;
            }

            // Перестраиваем selectedKeys в том же порядке, что и activeKeys
            // (оставляем только checked, но сохраняем порядок из activeKeys)
            try {
              const newSelected = [];
              for (const k of session.activeKeys) {
                const st = session.getState(k);
                if (st && st.selection_state === 'checked') {
                  newSelected.push(k);
                }
              }
              session.selectedKeys = newSelected;
              if (session.currentSelectedIndex >= session.selectedKeys.length) {
                session.currentSelectedIndex = Math.max(0, session.selectedKeys.length - 1);
              }
            } catch (eRebuild) {
            }

            // Перерисовываем таблицу
            try {
              renderStartModalSentencesTable(session);
            } catch (e1) {
            }

            try {
              if (window.lucide && typeof window.lucide.createIcons === 'function') {
                window.lucide.createIcons({ root: mixBtn });
              }
            } catch (e1) {
            }
          } catch (e1) {
          }
        });
      }
    } catch (e) {
    }

    // resetProgressBtn — сброс прогресса диктанта
    try {
      const resetBtn = document.getElementById('resetProgressBtn');
      if (resetBtn && resetBtn.dataset.boundDictationModal !== '1') {
        resetBtn.dataset.boundDictationModal = '1';
        resetBtn.addEventListener('click', (e) => {
          try {
            e.preventDefault();
            e.stopPropagation();
          } catch (e0) {
          }
          try {
            const session = window.__dictationModalActiveSession;
            if (!session) return;
            resetDictationProgressForSession(session);
          } catch (e1) {
          }
        });
      }
    } catch (e) {
    }
  }

  async function ensureDictationDepsLoaded() {
    if (state.depsLoaded) return;
    for (const src of DICTATION_SCRIPT_DEPS) {
      await ensureScript(src);
    }
    state.depsLoaded = true;
  }

  function cleanupPreviousDictationState() {
    // Keep DOM static; just drop runtime state markers.
    try {
      const dictationData = document.getElementById('dictation-data');
      if (dictationData) {
        dictationData.setAttribute('data-language-original', '');
        dictationData.setAttribute('data-language-translation', '');
        dictationData.setAttribute('data-dictation-id', '');
        dictationData.setAttribute('data-title-orig', '');
      }
    } catch (e) {
    }
  }

  function bindHeaderButtons() {
    const closeBtn = document.getElementById('dictationModalCloseBtn');
    if (closeBtn && closeBtn.dataset.bound !== '1') {
      closeBtn.dataset.bound = '1';
      closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        close();
      });
    }
  }

  function bindOverlayClose() {
    const modal = getModal();
    if (!modal || modal.dataset.boundOverlay === '1') return;
    modal.dataset.boundOverlay = '1';

    modal.addEventListener('click', (e) => {
      try {
        if (e && e.target === modal) {
          close();
        }
      } catch (e2) {
      }
    });

    document.addEventListener('keydown', (e) => {
      try {
        if (!state.isOpen) return;
        if (e && e.key === 'Escape') close();
      } catch (e2) {
      }
    });
  }

  async function open(dictationUrl, opts = {}) {
    if (state.opening) return;
    state.opening = true;

    try {
      const modal = getModal();
      if (!modal) return;

      try {
        const prev = getProgressPanelInstance();
        if (prev && typeof prev.stopTimer === 'function') {
          prev.stopTimer();
        }
      } catch (e00) {
      }
      try {
        window.progressPanel = null;
      } catch (e01) {
      }

      try {
        state.dictationStarted = false;
      } catch (e0) {
      }

      try {
        state._pauseDisabled = false;
      } catch (e0b) {
      }

      const parsed = parseDictationHref(dictationUrl);

      setUsername();
      setAvatar();
      bindHeaderButtons();
      bindOverlayClose();

      modal.style.display = 'flex';
      modal.classList.add('show');
      state.isOpen = true;

      cleanupPreviousDictationState();
      state.currentUrl = dictationUrl;

      try {
        applyDictationMetaFromCard({ href: dictationUrl, cardEl: opts.cardEl || null });
      } catch (e) {
      }

      try {
        const subsetPositions = opts && Array.isArray(opts.subsetPositions) ? opts.subsetPositions : null;
        const label = positionsToLabel(subsetPositions);
        if (label) {
          const dictationData = document.getElementById('dictation-data');
          const baseTitle = dictationData ? String(dictationData.getAttribute('data-title-orig') || '') : '';
          const decorated = baseTitle ? `${baseTitle} (${label})` : `(${label})`;
          const titleEl = document.getElementById('dictationTitle');
          if (titleEl) titleEl.textContent = decorated;
          const titleModalEl = document.getElementById('title-diktation');
          if (titleModalEl) titleModalEl.textContent = decorated;
        }
      } catch (e) {
      }

      await ensureDictationDepsLoaded();

      // Загружаем настройки схемы пользователя при открытии модалки диктанта
      try {
        loadPlaySequenceStartFromUser();
      } catch (e) {
      }

      try {
        if (parsed) {
          renderModalLangPair(parsed);
          renderModalCover(parsed);
          initModalOriginalAudioPlayer(parsed);
        }
      } catch (e) {
      }

      try {
        if (parsed) {
          await ensureDictationContentLoadedToRuntime(parsed);
        }
      } catch (e) {
      }

      try {
        const subsetPositions = opts && Array.isArray(opts.subsetPositions) ? opts.subsetPositions : null;
        const session = parsed ? getOrCreateDefaultSessionFromParsed(parsed, subsetPositions) : null;
        if (session) {
          try {
            window.__dictationModalActiveSession = session;
          } catch (e0) {
          }
          renderStartModalSentencesTable(session);
          showStartModal();
          updateNavigatorFromSession(session);

          try {
            ensureSpeechPanel(session, parsed);
          } catch (e0) {
          }

          try {
            bindCoinExchangeModal(session);
          } catch (e0b) {
          }

          const startBtn = document.getElementById('confirmStartBtn');
          if (startBtn && startBtn.dataset.boundDictationRuntime !== '1') {
            startBtn.dataset.boundDictationRuntime = '1';
            startBtn.addEventListener('click', (e) => {
              try {
                e.preventDefault();
                e.stopPropagation();
              } catch (e0) {
              }
              try {
                try {
                  startNewRewardCycle();
                } catch (e00c) {
                }
                hideStartModal();
              } catch (e1) {
              }
            });
          }
        }
      } catch (e) {
      }

      try {
        bindStartModalControls();
      } catch (e) {
      }

      // Legacy dictation runtime (script_dictation.js) intentionally not used here.

      try {
        const topSettings = document.getElementById('openDictationSettingsBtn');
        if (topSettings && topSettings.dataset.boundDictationModal !== '1') {
          topSettings.dataset.boundDictationModal = '1';
          topSettings.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openAudioSettingsModal('topbar-gear');
          });
        }
      } catch (e) {
      }

      // Some dictation UI bits are usually set in inline script in dictation.html.
      // We replicate the minimal critical part: create ProgressPanel if needed.
      try {
        if (typeof ProgressPanel !== 'undefined' && typeof UserActivityHistory !== 'undefined') {
          try {
            if (!window.activityHistory) {
              window.activityHistory = new UserActivityHistory('/user/api');
            }
          } catch (e0) {
          }

          const history = window.activityHistory;
          window.progressPanel = new ProgressPanel(history, { saveInterval: 5 });
          const inlineContainer = document.getElementById('progressPanelContainer');
          const modalContainer = document.getElementById('progressPanelModalContainer');
          if (inlineContainer) {
            window.progressPanel.render(inlineContainer, 'inline');
          }
          if (modalContainer) {
            window.progressPanel.render(modalContainer, 'modal');
          }
        }
      } catch (e) {
      }

      renderLucide(modal);
    } finally {
      state.opening = false;
    }
  }

  function close(clearSession = false) {
    const modal = getModal();
    if (!modal) return;

    try {
      modal.style.display = 'none';
    } catch (e) {
    }

    try {
      state._pauseDisabled = false;
    } catch (e0) {
    }
    try {
      modal.classList.remove('show');
    } catch (e) {
    }

    try {
      const p = getProgressPanelInstance();
      if (p && typeof p.stopTimer === 'function') {
        p.stopTimer();
      } else if (p && typeof p.pauseTimer === 'function') {
        p.pauseTimer();
      }
    } catch (e00) {
    }
    try {
      window.progressPanel = null;
    } catch (e01) {
    }

    try {
      clearInactivityTimer();
    } catch (e0) {
    }
    try {
      const pm = document.getElementById('pauseModal');
      if (pm) pm.style.display = 'none';
    } catch (e1) {
    }

    if (clearSession) {
      // При выходе из завершённого диктанта удаляем сессию из store и из IDB,
      // чтобы при повторном открытии не подхватывалась старая сессия
      try {
        const session = window.__dictationModalActiveSession;
        if (session) {
          const store = getRuntimeStore();
          if (store) {
            const dictationId = session.dictationId;
            const langTr = session.content ? session.content.langTr : '';
            const exerciseId = session.exerciseId;
            const subsetSignature = session.subsetSignature;
            store.removeSession({ dictationId, langTr, exerciseId, subsetSignature });
            store.removeSessionFromIdb({ dictationId, langTr, exerciseId, subsetSignature }).catch(function(e){});
          }
        }
      } catch (e) {
      }
      try {
        window.__dictationModalActiveSession = null;
      } catch (e) {
      }
    } else {
      // Сохраняем сессию в IndexedDB перед закрытием (если не чистим)
      try {
        const store = getRuntimeStore();
        if (store && typeof store.persistToIdb === 'function') {
          store.persistToIdb().catch(function(e){});
        }
      } catch (e2) {
      }
    }

    state.isOpen = false;
  }

  function patchDictationCardOpenHandler() {
    if (document.body.dataset.dictationModalCardPatch === '1') return;
    document.body.dataset.dictationModalCardPatch = '1';

    document.addEventListener('click', (e) => {
      try {
        const thumb = e.target && e.target.closest ? e.target.closest('.short-thumb[data-href]') : null;
        if (!thumb) return;

        // Only for desk cards for now
        const card = thumb.closest('.desk-card');
        if (!card) return;

        const href = thumb.getAttribute('data-href');
        if (!href) return;

        e.preventDefault();
        e.stopPropagation();
        open(href, { cardEl: card });
      } catch (e2) {
      }
    }, true);

    document.addEventListener('keydown', (e) => {
      try {
        const el = document.activeElement;
        if (!el) return;
        if (e && (e.key === 'Enter' || e.key === ' ')) {
          const thumb = el.closest ? el.closest('.short-thumb[data-href]') : null;
          if (!thumb) return;
          const card = thumb.closest('.desk-card');
          if (!card) return;
          const href = thumb.getAttribute('data-href');
          if (!href) return;
          e.preventDefault();
          e.stopPropagation();
          open(href, { cardEl: card });
        }
      } catch (e2) {
      }
    }, true);
  }

  function init() {
    patchDictationCardOpenHandler();
    preloadUiSounds();
    bindHeaderButtons();
    bindOverlayClose();
    bindAudioSettingsModalControls();
    setupCompletionModalHandlers();
    bindDictationModalHotkeys();
    bindInactivityWatchers();
    bindUserInputScriptGuards();
    bindEnterToCheck();
    bindCheckButtonAsRepeat();
    bindNextButton();
  }

  try {
    if (typeof window.showCompletionModal !== 'function') {
      window.showCompletionModal = showCompletionModal;
    }
  } catch (e) {
  }

  window.DictationModal = { open, close, init };

  try {
    document.addEventListener('DOMContentLoaded', () => init());
  } catch (e) {
  }

