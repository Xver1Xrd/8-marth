"use strict";

// Core app state, DOM references and bootstrap wiring.


  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const clamp = (num, min, max) => Math.max(min, Math.min(max, num));

  const STORAGE_KEYS = {
    photos: "v8m_photos_v2",
    letterText: "v8m_letter_text",
    letterSig: "v8m_letter_sig",
    theme: "v8m_theme",
  };
  const PHOTO_DB = {
    name: "v8m_photo_store",
    version: 1,
    store: "photos",
  };

  const DEFAULT_LETTER_TEXT =
    "Я хотел подарить что-то особенное - не просто цветы, а ощущение. Ты делаешь мой мир теплее и красивее. Пусть сегодня будет много улыбок, легкости и любви.";
  const DEFAULT_LETTER_SIG = "- от Ярика 💖";

  const BADGE_PHRASES = [
    "С 8 марта!",
    "Ты сияешь всегда ✨",
    "Ты очень прекрасна 💖",
    "Пусть мечты сбываются 🌸",
  ];

  const COMPLIMENTS = [
    "Ты сегодня особенно прекрасна.",
    "Твоя улыбка делает день лучше.",
    "С тобой мир становится мягче и теплее.",
    "Ты - вдохновение в самом нежном виде.",
    "Рядом с тобой хочется быть лучше.",
    "Ты умеешь превращать обычный день в волшебный.",
    "Ты неописуемо красивая и очень пиздатая.",
  ];

  const HEART_SYMBOLS = ["💖", "💗", "💘", "💞", "💕", "🌸", "✨"];
  const PONG_CONFIG = {
    width: 760,
    height: 500,
    paddleWidth: 132,
    paddleHeight: 14,
    paddleInsetBottom: 16,
    paddleSpeed: 8.2,
    ballRadius: 14,
    baseBallSpeed: 3.2,
    maxBallSpeed: 6.2,
    paddleSpeedStep: 0.035,
    brickSpeedStep: 0.018,
    paddleBounceMaxAngle: 1.06,
    paddleMinHorizontal: 0.18,
    paddleMinLift: 1.9,
    brickRows: 3,
    brickCols: 8,
    brickTop: 40,
    brickHeight: 22,
    brickGap: 10,
    brickPaddingX: 18,
  };

  const state = {
    photos: [],
    picked: new Map(),
    heartsTimer: null,
    confetti: [],
    confettiRunning: false,
    modalIndex: -1,
    badgeIndex: 0,
    lastCompliment: "",
    pong: {
      running: false,
      rafId: 0,
      lastTs: 0,
      score: 0,
      paddleX: 0,
      pointerX: null,
      keys: { left: false, right: false },
      ball: {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        r: PONG_CONFIG.ballRadius,
      },
      bricks: [],
    },
  };

  // Centralized DOM references used by all feature files.
  const els = {
    envelope: $("#envelope"),
    envState: $("#envState"),
    openLetterBtn: $("#openLetterBtn"),
    editLetterBtn: $("#editLetterBtn"),
    letterText: $("#letterText"),
    sig: $("#sig"),

    magicBtn: $("#magicBtn"),
    themeBtn: $("#themeBtn"),
    heartsBtn: $("#heartsBtn"),
    resetBtn: $("#resetBtn"),
    badge: $("#badge"),

    scrollToPhotosBtn: $("#scrollToPhotosBtn"),
    scrollToQuizBtn: $("#scrollToQuizBtn"),

    photosSection: $("#photosSection"),
    photoDrop: $("#photoDrop"),
    photoInput: $("#photoInput"),
    gallery: $("#gallery"),
    shuffleBtn: $("#shuffleBtn"),
    captionBtn: $("#captionBtn"),
    backupBtn: $("#backupBtn"),
    restoreBtn: $("#restoreBtn"),
    restoreInput: $("#restoreInput"),

    modal: $("#modal"),
    modalImg: $("#modalImg"),
    modalTitle: $("#modalTitle"),
    prevPhotoBtn: $("#prevPhotoBtn"),
    nextPhotoBtn: $("#nextPhotoBtn"),
    removePhotoBtn: $("#removePhotoBtn"),
    closeModalBtn: $("#closeModalBtn"),
    modalCaptionInput: $("#modalCaptionInput"),

    finishBtn: $("#finishBtn"),
    retryBtn: $("#retryBtn"),
    result: $("#result"),
    quizProgress: $("#quizProgress"),
    pongTrigger: $("#pongTrigger"),
    pongModal: $("#pongModal"),
    pongCanvas: $("#pongCanvas"),
    pongStartBtn: $("#pongStartBtn"),
    pongCloseBtn: $("#pongCloseBtn"),
    pongScore: $("#pongScore"),
    pongHint: $("#pongHint"),
    pongWin: $("#pongWin"),
    pongWinText: $("#pongWinText"),
    pongReplayBtn: $("#pongReplayBtn"),
    pongWinCloseBtn: $("#pongWinCloseBtn"),

    complimentBtn: $("#complimentBtn"),
    complimentText: $("#complimentText"),
    toastBtn: $("#toastBtn"),

    toastStack: $("#toastStack"),
    confettiCanvas: $("#confetti"),
  };

  const requiredElements = [
    els.envelope,
    els.envState,
    els.letterText,
    els.sig,
    els.gallery,
    els.confettiCanvas,
  ];

  // Guard bootstrap: functions remain declared, but initialization will be skipped.
  const appBootReady = requiredElements.every(Boolean);
  const confettiCtx = appBootReady ? els.confettiCanvas.getContext("2d") : null;
  const pongCtx = els.pongCanvas?.getContext("2d") ?? null;
  let photoDbPromise = null;

  async function init() {
    if (!appBootReady || !confettiCtx) {
      return;
    }
    // Initial render restores persisted UI state before binding interactions.
    syncHeaderLabels();
    resetPongGame();
    hidePongWin();
    drawPongScene();
    loadTheme();
    loadLetter();
    state.photos = await loadFolderPhotos();
    renderGallery();
    updateQuizProgress();
    updateBadge(BADGE_PHRASES[0]);
    rotateBadge();
    showRandomCompliment(true);
    bindEvents();
    resizeConfettiCanvas();
    window.addEventListener("resize", resizeConfettiCanvas);
    requestAnimationFrame(() => document.body.classList.add("loaded"));
  }

  function syncHeaderLabels() {
    if (els.magicBtn) {
      els.magicBtn.textContent =
        "\u0412\u043a\u043b\u044e\u0447\u0438\u0442\u044c \u043c\u0430\u0433\u0438\u044e \u2728";
    }
  }

  // Wire UI events once initial state has been restored.
  function bindEvents() {
    els.envelope.addEventListener("click", () => toggleEnvelope());
    els.envelope.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleEnvelope();
      }
    });
    els.openLetterBtn.addEventListener("click", () => toggleEnvelope(true));
    els.editLetterBtn.addEventListener("click", editLetter);

    els.magicBtn.addEventListener("click", activateMagic);
    els.themeBtn?.addEventListener("click", toggleTheme);
    els.heartsBtn.addEventListener("click", () => toggleHearts());
    els.resetBtn.addEventListener("click", resetSite);

    els.scrollToPhotosBtn.addEventListener("click", () => {
      $("#photosSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    els.scrollToQuizBtn.addEventListener("click", () => {
      $("#quizAnchor")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    els.shuffleBtn?.addEventListener("click", shufflePhotos);
    els.captionBtn?.addEventListener("click", setRandomCaption);
    els.backupBtn?.addEventListener("click", exportBackup);
    els.restoreBtn?.addEventListener("click", () => els.restoreInput?.click());
    els.restoreInput?.addEventListener("change", importBackup);

    els.closeModalBtn.addEventListener("click", closeModal);
    els.prevPhotoBtn.addEventListener("click", () => shiftModalPhoto(-1));
    els.nextPhotoBtn.addEventListener("click", () => shiftModalPhoto(1));
    els.removePhotoBtn?.addEventListener("click", removeCurrentModalPhoto);
    els.modalCaptionInput?.addEventListener("input", handleModalCaptionInput);
    els.modal.addEventListener("click", (event) => {
      if (event.target === els.modal) {
        closeModal();
      }
    });
    els.pongTrigger?.addEventListener("click", openPongModal);
    els.pongStartBtn?.addEventListener("click", startPongGame);
    els.pongCloseBtn?.addEventListener("click", closePongModal);
    els.pongReplayBtn?.addEventListener("click", () => {
      resetPongGame();
      hidePongWin();
      drawPongScene();
      startPongGame();
    });
    els.pongWinCloseBtn?.addEventListener("click", closePongModal);
    els.pongModal?.addEventListener("click", (event) => {
      if (event.target === els.pongModal) {
        closePongModal();
      }
    });
    els.pongCanvas?.addEventListener("pointermove", handlePongPointerMove);
    els.pongCanvas?.addEventListener("pointerdown", (event) => {
      handlePongPointerMove(event);
      if (!state.pong.running) {
        startPongGame();
      }
    });
    els.pongCanvas?.addEventListener("pointerleave", () => {
      state.pong.pointerX = null;
    });

    $$(".q .answers button").forEach((button) => {
      button.addEventListener("click", () => pickQuizAnswer(button));
    });
    els.finishBtn.addEventListener("click", finishQuiz);
    els.retryBtn.addEventListener("click", resetQuiz);

    els.complimentBtn.addEventListener("click", () => showRandomCompliment(false));
    els.toastBtn.addEventListener("click", () => {
      spawnHearts(14);
      burstConfetti(120);
      showToast("Вероника, я тебя люблю. Очень. 💖", "success");
    });

    document.addEventListener("keydown", (event) => {
      const key = event.key.toLowerCase();
      if (isTypingTarget(event.target)) {
        return;
      }

      if (isPongOpen()) {
        if (key === "arrowleft" || key === "a") {
          state.pong.keys.left = true;
          event.preventDefault();
        }

        if (key === "arrowright" || key === "d") {
          state.pong.keys.right = true;
          event.preventDefault();
        }

        if (key === " " || key === "enter") {
          event.preventDefault();
          startPongGame();
        }

        if (event.key === "Escape") {
          event.preventDefault();
          closePongModal();
        }
        return;
      }

      if (key === "h") {
        event.preventDefault();
        toggleHearts();
      }

      if (key === "m") {
        event.preventDefault();
        activateMagic();
      }

      if (key === "t") {
        event.preventDefault();
        toggleTheme();
      }

      if (event.key === "Escape") {
        closeModal();
      }

      if (event.key === "ArrowLeft" && isModalOpen()) {
        event.preventDefault();
        shiftModalPhoto(-1);
      }

      if (event.key === "ArrowRight" && isModalOpen()) {
        event.preventDefault();
        shiftModalPhoto(1);
      }
    });

    document.addEventListener("keyup", (event) => {
      const key = event.key.toLowerCase();
      if (key === "arrowleft" || key === "a") {
        state.pong.keys.left = false;
      }
      if (key === "arrowright" || key === "d") {
        state.pong.keys.right = false;
      }
    });
  }

