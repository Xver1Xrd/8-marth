"use strict";

// Envelope, theme, hearts and confetti UI effects.

  // Letter and theme state restoration.
  function loadLetter() {
    const savedText = loadStorage(STORAGE_KEYS.letterText, "");
    const savedSig = loadStorage(STORAGE_KEYS.letterSig, "");
    els.letterText.textContent = savedText?.trim() ? savedText : DEFAULT_LETTER_TEXT;
    els.sig.textContent = savedSig?.trim() ? savedSig : DEFAULT_LETTER_SIG;
  }

  function loadTheme() {
    const savedTheme = loadStorage(STORAGE_KEYS.theme, "light");
    applyTheme(savedTheme === "dark" ? "dark" : "light");
  }

  function toggleTheme() {
    const current = document.body.dataset.theme === "dark" ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";
    applyTheme(next);
    saveStorage(STORAGE_KEYS.theme, next);
    showToast(next === "dark" ? "Dark theme enabled" : "Light theme enabled", "success");
  }

  function applyTheme(theme) {
    const isDark = theme === "dark";
    document.body.dataset.theme = isDark ? "dark" : "light";
    if (els.themeBtn) {
      els.themeBtn.setAttribute("aria-pressed", String(isDark));
      els.themeBtn.textContent = isDark ? "\u2600\uFE0F" : "\uD83C\uDF19";
      els.themeBtn.setAttribute(
        "aria-label",
        isDark ? "Switch to light theme" : "Switch to dark theme"
      );
      els.themeBtn.title = isDark ? "Switch to light theme" : "Switch to dark theme";
    }
  }

  function editLetter() {
    const currentText = els.letterText.textContent.trim();
    const nextText = prompt("💌", currentText);
    if (nextText !== null) {
      const value = nextText.trim() || currentText;
      els.letterText.textContent = value;
      saveStorage(STORAGE_KEYS.letterText, value);
    }

    const currentSig = els.sig.textContent.trim();
    const nextSig = prompt("Подпись", currentSig);
    if (nextSig !== null) {
      const value = nextSig.trim() || currentSig;
      els.sig.textContent = value;
      saveStorage(STORAGE_KEYS.letterSig, value);
    }

    showToast("Текст конверта обновлен", "success");
  }

  function toggleEnvelope(forceOpen = null) {
    const isOpen = els.envelope.classList.contains("open");
    const shouldOpen = typeof forceOpen === "boolean" ? forceOpen : !isOpen;
    els.envelope.classList.toggle("open", shouldOpen);
    els.envState.textContent = `Состояние: ${shouldOpen ? "открыто 💌" : "закрыто"}`;

    if (shouldOpen && !isOpen) {
      burstConfetti(130);
      spawnHearts(10);
    }
  }

  // Quick visual effects (magic mode, floating hearts, confetti).
  function activateMagic() {
    toggleEnvelope(true);
    spawnHearts(20);
    burstConfetti(220);
    updateBadge("конфети ✨");
    showRandomCompliment(false);
    showToast("конфети активированы", "success");
  }

  function toggleHearts(force = null) {
    const shouldRun = typeof force === "boolean" ? force : state.heartsTimer === null;

    if (shouldRun) {
      if (state.heartsTimer !== null) {
        return;
      }
      spawnHearts(16);
      state.heartsTimer = window.setInterval(() => spawnHearts(6), 2200);
      els.heartsBtn.textContent = "Остановить сердечки 💖";
      return;
    }

    if (state.heartsTimer !== null) {
      clearInterval(state.heartsTimer);
      state.heartsTimer = null;
    }
    els.heartsBtn.textContent = "Запустить сердечки 💖";
  }

  function spawnHearts(count = 12) {
    for (let i = 0; i < count; i += 1) {
      setTimeout(spawnHeart, i * 90);
    }
  }

  function spawnHeart() {
    const heart = document.createElement("div");
    heart.className = "heart";
    heart.textContent = HEART_SYMBOLS[Math.floor(Math.random() * HEART_SYMBOLS.length)];

    const left = `${Math.random() * 100}vw`;
    const dx = `${Math.round(Math.random() * 260 - 130)}px`;
    const scale = (0.82 + Math.random() * 1.2).toFixed(2);
    const rotation = `${Math.round(Math.random() * 80 - 40)}deg`;
    const duration = `${(5 + Math.random() * 4).toFixed(2)}s`;

    heart.style.left = left;
    heart.style.setProperty("--dx", dx);
    heart.style.setProperty("--s", scale);
    heart.style.setProperty("--rot", rotation);
    heart.style.animationDuration = duration;

    document.body.appendChild(heart);
    setTimeout(() => heart.remove(), parseFloat(duration) * 1000 + 250);
  }

  function resizeConfettiCanvas() {
    const ratio = window.devicePixelRatio || 1;
    els.confettiCanvas.width = Math.floor(window.innerWidth * ratio);
    els.confettiCanvas.height = Math.floor(window.innerHeight * ratio);
    els.confettiCanvas.style.width = `${window.innerWidth}px`;
    els.confettiCanvas.style.height = `${window.innerHeight}px`;
    confettiCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function burstConfetti(count = 120) {
    const colors = ["#ef4f8e", "#8f67d8", "#2bbf9b", "#ffd166", "#ffffff"];
    const originX = window.innerWidth / 2;
    const originY = window.innerHeight * 0.32;

    for (let i = 0; i < count; i += 1) {
      state.confetti.push({
        x: originX + (Math.random() * 140 - 70),
        y: originY + (Math.random() * 80 - 40),
        vx: Math.random() * 6 - 3,
        vy: Math.random() * -7 - 3,
        gravity: 0.18 + Math.random() * 0.12,
        size: 3 + Math.random() * 4,
        rot: Math.random() * Math.PI,
        vr: Math.random() * 0.25 - 0.12,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 120 + Math.random() * 60,
      });
    }

    if (!state.confettiRunning) {
      runConfetti();
    }
  }

  function runConfetti() {
    state.confettiRunning = true;

    const tick = () => {
      confettiCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      state.confetti = state.confetti.filter((particle) => particle.life > 0);
      for (const particle of state.confetti) {
        particle.life -= 1;
        particle.vy += particle.gravity;
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.rot += particle.vr;

        confettiCtx.save();
        confettiCtx.translate(particle.x, particle.y);
        confettiCtx.rotate(particle.rot);
        confettiCtx.fillStyle = particle.color;
        confettiCtx.globalAlpha = clamp(particle.life / 180, 0, 1);
        confettiCtx.fillRect(
          -particle.size / 2,
          -particle.size / 2,
          particle.size,
          particle.size * 1.6
        );
        confettiCtx.restore();
      }

      if (state.confetti.length > 0) {
        requestAnimationFrame(tick);
      } else {
        state.confettiRunning = false;
        confettiCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      }
    };

    requestAnimationFrame(tick);
  }

