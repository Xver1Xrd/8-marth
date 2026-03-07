"use strict";

// Quiz, compliments, reset logic and shared storage helpers.

  function normalizeBackup(data) {
    if (!data || typeof data !== "object") {
      return null;
    }

    const photos = Array.isArray(data.photos)
      ? data.photos.map((item) => normalizePhoto(item)).filter(Boolean).slice(0, 24)
      : [];

    const letterText =
      typeof data.letterText === "string" && data.letterText.trim()
        ? data.letterText.trim()
        : DEFAULT_LETTER_TEXT;
    const letterSig =
      typeof data.letterSig === "string" && data.letterSig.trim()
        ? data.letterSig.trim()
        : DEFAULT_LETTER_SIG;

    return { photos, letterText, letterSig };
  }

  // Quiz interactions and result calculation.
  function pickQuizAnswer(button) {
    const block = button.closest(".q");
    const questionId = block?.dataset.q;
    if (!questionId) {
      return;
    }

    const score = Number(button.dataset.score || 0);
    state.picked.set(questionId, score);

    block.querySelectorAll(".answers button").forEach((item) => {
      item.classList.toggle("is-selected", item === button);
    });

    updateQuizProgress();
    spawnHearts(3);
  }

  function finishQuiz() {
    if (state.picked.size < 3) {
      els.result.classList.add("show");
      els.result.textContent = "Выбери ответы на все 3 вопроса 😉";
      spawnHearts(5);
      return;
    }

    els.result.classList.add("show");
    els.result.innerHTML = `
      <div class="result-title">Бля зачем тебе ловить настроение, оно должно быть пиздатым всегда💋</div>
    `;
    burstConfetti(160);
    spawnHearts(12);
  }

  function resetQuiz() {
    state.picked.clear();
    $$(".q .answers button").forEach((button) => {
      button.classList.remove("is-selected");
    });
    els.result.classList.remove("show");
    els.result.textContent = "";
    updateQuizProgress();
    showToast("Игра сброшена", "success");
  }

  function updateQuizProgress() {
    els.quizProgress.textContent = `Ответов выбрано: ${state.picked.size}/3`;
  }

  function calcMood(sum) {
    if (sum <= 4) {
      return {
        title: "Нежность 💗",
        text: "Сегодня хочется тепла, заботы и мягких объятий. Пусть этот день будет спокойным и уютным.",
      };
    }

    if (sum <= 6) {
      return {
        title: "Сладкое счастье 🍓",
        text: "Настроение - улыбаться, баловаться и ловить легкие радостные моменты вместе.",
      };
    }

    if (sum <= 8) {
      return {
        title: "Праздник и танцы 💃",
        text: "Энергия яркая, живая и красивая. Сегодня день для смеха, музыки и красивых взглядов.",
      };
    }

    return {
      title: "Космическая любовь 🌌",
      text: "Ты - настоящее чудо. Пусть мечты сбываются быстрее, чем падают звезды.",
    };
  }

  // Small decorative UI widgets.
  function showRandomCompliment(initial) {
    let next = COMPLIMENTS[Math.floor(Math.random() * COMPLIMENTS.length)];
    if (COMPLIMENTS.length > 1) {
      while (next === state.lastCompliment) {
        next = COMPLIMENTS[Math.floor(Math.random() * COMPLIMENTS.length)];
      }
    }

    state.lastCompliment = next;
    els.complimentText.classList.remove("is-visible");
    els.complimentText.textContent = next;
    requestAnimationFrame(() => {
      els.complimentText.classList.add("is-visible");
    });

    if (!initial) {
      spawnHearts(4);
    }
  }

  function rotateBadge() {
    setInterval(() => {
      if (document.hidden) {
        return;
      }
      state.badgeIndex = (state.badgeIndex + 1) % BADGE_PHRASES.length;
      updateBadge(BADGE_PHRASES[state.badgeIndex]);
    }, 5200);
  }

  function updateBadge(text) {
    els.badge.classList.remove("is-pulse");
    els.badge.textContent = text;
    requestAnimationFrame(() => {
      els.badge.classList.add("is-pulse");
    });
  }

  // Full reset clears UI state and local persisted data.
  async function resetSite() {
    if (
      !confirm(
        "Сбросить фото, подписи, текст конверта и прогресс игры? Это очистит сохраненные данные в браузере."
      )
    ) {
      return;
    }

    removeStorage(STORAGE_KEYS.photos);
    removeStorage(STORAGE_KEYS.letterText);
    removeStorage(STORAGE_KEYS.letterSig);
    removeStorage(STORAGE_KEYS.theme);
    if (supportsPhotoDb()) {
      void clearPhotoMediaStore();
    }

    state.photos = await loadFolderPhotos();
    renderGallery();

    els.letterText.textContent = DEFAULT_LETTER_TEXT;
    els.sig.textContent = DEFAULT_LETTER_SIG;
    els.envelope.classList.remove("open");
    els.envState.textContent = "Состояние: закрыто";

    resetQuiz();
    toggleHearts(false);
    closePongModal();
    resetPongGame();
    drawPongScene();
    applyTheme("light");
    burstConfetti(100);
    showToast("Сайт сброшен", "success");
  }

  function showToast(message, kind = "info") {
    const toast = document.createElement("div");
    const className = `toast toast-${kind}`;
    toast.className = className;
    toast.textContent = message;
    els.toastStack.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add("show");
    });

    setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.remove(), 220);
    }, 3000);
  }

  function isTypingTarget(target) {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    if (target.isContentEditable) {
      return true;
    }
    const tag = target.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select";
  }

  // Shared localStorage helpers used across feature files.
  function loadStorage(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : value;
    } catch {
      return fallback;
    }
  }

  function saveStorage(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      showToast("Не удалось сохранить данные", "error");
      return false;
    }
  }

  function removeStorage(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      // no-op
    }
  }

  function parseJson(raw, fallback) {
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

// Start the app only after all feature files are loaded.
void init();
