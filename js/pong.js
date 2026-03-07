"use strict";

// Mini-game: pong mechanics, rendering and controls.

  // Pong mini-game modal lifecycle.
  function openPongModal() {
    if (!els.pongModal || !els.pongCanvas || !pongCtx) {
      showToast("Пинг-понг недоступен в этом браузере", "error");
      return;
    }
    if (isModalOpen()) {
      closeModal();
    }
    if (state.pong.bricks.length === 0 || !hasActivePongBricks()) {
      resetPongGame();
    }

    els.pongModal.classList.add("open");
    els.pongModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    hidePongWin();
    drawPongScene();
    showToast("Пинг-понг открыт. Нажми Старт ▶", "success");
  }

  function closePongModal() {
    if (!isPongOpen()) {
      return;
    }

    stopPongGame();
    state.pong.keys.left = false;
    state.pong.keys.right = false;
    state.pong.pointerX = null;
    hidePongWin();
    els.pongModal.classList.remove("open");
    els.pongModal.setAttribute("aria-hidden", "true");
    if (!isModalOpen()) {
      document.body.classList.remove("modal-open");
    }
  }

  function isPongOpen() {
    return Boolean(els.pongModal?.classList.contains("open"));
  }

  function startPongGame() {
    if (!pongCtx || !isPongOpen()) {
      return;
    }
    if (state.pong.running) {
      return;
    }
    hidePongWin();
    if (
      state.pong.bricks.length === 0 ||
      !hasActivePongBricks() ||
      state.pong.ball.y - state.pong.ball.r > PONG_CONFIG.height
    ) {
      resetPongGame();
    }

    state.pong.running = true;
    state.pong.lastTs = performance.now();
    setPongHint(
      "Игра запущена: платформа внизу, сердце 🩷 отбивай в блоки вверху."
    );
    state.pong.rafId = requestAnimationFrame(runPongFrame);
  }

  function stopPongGame() {
    state.pong.running = false;
    if (state.pong.rafId) {
      cancelAnimationFrame(state.pong.rafId);
      state.pong.rafId = 0;
    }
  }

  function resetPongGame() {
    if (!pongCtx) {
      return;
    }

    stopPongGame();
    state.pong.keys.left = false;
    state.pong.keys.right = false;
    state.pong.pointerX = null;
    state.pong.paddleX = (PONG_CONFIG.width - PONG_CONFIG.paddleWidth) / 2;
    state.pong.ball.r = PONG_CONFIG.ballRadius;
    state.pong.score = 0;
    const startSpeed = PONG_CONFIG.baseBallSpeed;
    state.pong.ball.x = PONG_CONFIG.width / 2;
    state.pong.ball.y = PONG_CONFIG.height * 0.74;
    state.pong.ball.vx = (Math.random() < 0.5 ? -1 : 1) * startSpeed;
    state.pong.ball.vy = -startSpeed;
    state.pong.bricks = buildPongBricks();
    hidePongWin();

    updatePongScore();
    setPongHint("Раунд 1/1. Нажми Старт ▶, чтобы начать пинг-понг.");
  }

  function buildPongBricks() {
    const bricks = [];
    const cols = PONG_CONFIG.brickCols;
    const rows = PONG_CONFIG.brickRows;
    const gap = PONG_CONFIG.brickGap;
    const totalGap = (cols - 1) * gap;
    const brickWidth =
      (PONG_CONFIG.width - PONG_CONFIG.brickPaddingX * 2 - totalGap) / cols;
    const palette = ["#ef4f8e", "#f37db0", "#b984ff", "#55d5b3"];

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        bricks.push({
          x: PONG_CONFIG.brickPaddingX + col * (brickWidth + gap),
          y: PONG_CONFIG.brickTop + row * (PONG_CONFIG.brickHeight + gap),
          w: brickWidth,
          h: PONG_CONFIG.brickHeight,
          active: true,
          color: palette[row % palette.length],
        });
      }
    }

    return bricks;
  }

  function runPongFrame(ts) {
    if (!state.pong.running) {
      return;
    }

    const dt = clamp((ts - state.pong.lastTs) / 16.667, 0.55, 1.7);
    state.pong.lastTs = ts;
    updatePong(dt);
    drawPongScene();

    if (state.pong.running) {
      state.pong.rafId = requestAnimationFrame(runPongFrame);
    }
  }

  // Core simulation step: movement, collisions, scoring and win/lose checks.
  function updatePong(dt) {
    const paddleY =
      PONG_CONFIG.height - PONG_CONFIG.paddleInsetBottom - PONG_CONFIG.paddleHeight;

    if (state.pong.pointerX !== null) {
      const target = state.pong.pointerX - PONG_CONFIG.paddleWidth / 2;
      state.pong.paddleX += (target - state.pong.paddleX) * Math.min(1, 0.38 * dt);
    } else {
      if (state.pong.keys.left) {
        state.pong.paddleX -= PONG_CONFIG.paddleSpeed * dt;
      }
      if (state.pong.keys.right) {
        state.pong.paddleX += PONG_CONFIG.paddleSpeed * dt;
      }
    }
    state.pong.paddleX = clamp(
      state.pong.paddleX,
      0,
      PONG_CONFIG.width - PONG_CONFIG.paddleWidth
    );

    const ball = state.pong.ball;
    const prevX = ball.x;
    const prevY = ball.y;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    if (ball.x - ball.r <= 0) {
      ball.x = ball.r;
      ball.vx = Math.abs(ball.vx);
    } else if (ball.x + ball.r >= PONG_CONFIG.width) {
      ball.x = PONG_CONFIG.width - ball.r;
      ball.vx = -Math.abs(ball.vx);
    }

    if (ball.y - ball.r <= 0) {
      ball.y = ball.r;
      ball.vy = Math.abs(ball.vy);
    }

    const paddle = {
      x: state.pong.paddleX,
      y: paddleY,
      w: PONG_CONFIG.paddleWidth,
      h: PONG_CONFIG.paddleHeight,
    };
    const crossedPaddleTop = prevY + ball.r <= paddle.y && ball.y + ball.r >= paddle.y;
    const withinPaddleX = ball.x >= paddle.x - ball.r && ball.x <= paddle.x + paddle.w + ball.r;
    if (ball.vy > 0 && crossedPaddleTop && withinPaddleX) {
      ball.y = paddle.y - ball.r - 0.12;
      const hitRaw = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
      const hit = clamp(hitRaw, -1, 1);
      const nextSpeed = Math.min(
        getPongSpeedCap(),
        Math.hypot(ball.vx, ball.vy) + PONG_CONFIG.paddleSpeedStep
      );
      const angle = hit * PONG_CONFIG.paddleBounceMaxAngle;
      ball.vx = nextSpeed * Math.sin(angle);
      if (Math.abs(ball.vx) < PONG_CONFIG.paddleMinHorizontal) {
        const dir = hit === 0 ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(hit);
        ball.vx = dir * PONG_CONFIG.paddleMinHorizontal;
      }
      ball.vy = -Math.max(
        PONG_CONFIG.paddleMinLift,
        Math.abs(nextSpeed * Math.cos(angle))
      );
      state.pong.score += 1;
      updatePongScore();
    }

    for (const brick of state.pong.bricks) {
      if (!brick.active || !intersectsBallRect(ball, brick)) {
        continue;
      }

      brick.active = false;
      state.pong.score += 10;
      updatePongScore();

      const fromLeft = prevX <= brick.x - ball.r;
      const fromRight = prevX >= brick.x + brick.w + ball.r;
      if (fromLeft || fromRight) {
        ball.vx *= -1;
      } else {
        ball.vy *= -1;
      }
      nudgeBallSpeed(PONG_CONFIG.brickSpeedStep);
      break;
    }

    if (ball.y - ball.r > PONG_CONFIG.height) {
      stopPongGame();
      setPongHint(`Игра окончена. Счёт: ${state.pong.score}. Нажми Старт ▶ для новой попытки.`);
      return;
    }

    if (state.pong.bricks.length > 0 && !hasActivePongBricks()) {
      finishPongWin();
    }
  }

  function drawPongScene() {
    if (!pongCtx || !els.pongCanvas) {
      return;
    }

    pongCtx.clearRect(0, 0, PONG_CONFIG.width, PONG_CONFIG.height);
    const isDark = document.body.dataset.theme === "dark";

    pongCtx.save();
    pongCtx.fillStyle = isDark ? "rgba(255, 245, 251, 0.9)" : "rgba(81, 43, 76, 0.75)";
    pongCtx.font = "600 14px Manrope, sans-serif";
    pongCtx.textAlign = "left";
    pongCtx.textBaseline = "top";
    pongCtx.fillText("Раунд: 1/1", 14, 12);
    pongCtx.restore();

    for (const brick of state.pong.bricks) {
      if (!brick.active) {
        continue;
      }
      drawRoundedRect(pongCtx, brick.x, brick.y, brick.w, brick.h, 7);
      pongCtx.fillStyle = brick.color;
      pongCtx.globalAlpha = 0.9;
      pongCtx.fill();
      pongCtx.globalAlpha = 1;
      pongCtx.lineWidth = 1;
      pongCtx.strokeStyle = isDark ? "rgba(255, 255, 255, 0.26)" : "rgba(255, 255, 255, 0.5)";
      pongCtx.stroke();
    }

    const paddleY =
      PONG_CONFIG.height - PONG_CONFIG.paddleInsetBottom - PONG_CONFIG.paddleHeight;
    const paddleGradient = pongCtx.createLinearGradient(
      0,
      paddleY,
      0,
      paddleY + PONG_CONFIG.paddleHeight
    );
    if (isDark) {
      paddleGradient.addColorStop(0, "rgba(255, 216, 237, 0.95)");
      paddleGradient.addColorStop(1, "rgba(233, 128, 185, 0.96)");
    } else {
      paddleGradient.addColorStop(0, "rgba(232, 77, 143, 0.95)");
      paddleGradient.addColorStop(1, "rgba(199, 45, 113, 0.95)");
    }

    drawRoundedRect(
      pongCtx,
      state.pong.paddleX,
      paddleY,
      PONG_CONFIG.paddleWidth,
      PONG_CONFIG.paddleHeight,
      7
    );
    pongCtx.fillStyle = paddleGradient;
    pongCtx.fill();

    const ball = state.pong.ball;
    pongCtx.beginPath();
    pongCtx.arc(ball.x, ball.y, ball.r * 0.72, 0, Math.PI * 2);
    pongCtx.fillStyle = isDark ? "rgba(255, 226, 240, 0.38)" : "rgba(255, 115, 173, 0.26)";
    pongCtx.fill();

    pongCtx.font =
      `${Math.round(ball.r * 1.95)}px "Segoe UI Emoji", "Apple Color Emoji", ` +
      `"Noto Color Emoji", sans-serif`;
    pongCtx.textAlign = "center";
    pongCtx.textBaseline = "middle";
    pongCtx.fillText("🩷", ball.x, ball.y + 0.5);
  }

  function getPongSpeedCap() {
    return Math.min(
      PONG_CONFIG.maxBallSpeed,
      PONG_CONFIG.baseBallSpeed + 1.8
    );
  }

  function hasActivePongBricks() {
    return state.pong.bricks.some((brick) => brick.active);
  }

  function finishPongWin() {
    stopPongGame();
    setPongHint(`Раунд пройден. Финальный счёт: ${state.pong.score}.`);
    if (els.pongWinText) {
      els.pongWinText.textContent =
        `Ты прошла раунд и набрала ${state.pong.score} очков. Ты супер!`;
    }
    showPongWin();
    burstConfetti(280);
    spawnHearts(26);
    showToast("Вероника, ты молодец! Раунд пройден идеально 💖", "success");
  }

  function showPongWin() {
    if (!els.pongWin) {
      return;
    }
    els.pongWin.classList.add("show");
    els.pongWin.setAttribute("aria-hidden", "false");
  }

  function hidePongWin() {
    if (!els.pongWin) {
      return;
    }
    els.pongWin.classList.remove("show");
    els.pongWin.setAttribute("aria-hidden", "true");
  }

  function nudgeBallSpeed(step) {
    const ball = state.pong.ball;
    const currentSpeed = Math.hypot(ball.vx, ball.vy);
    if (currentSpeed < 0.0001) {
      return;
    }

    const targetSpeed = Math.min(getPongSpeedCap(), currentSpeed + step);
    if (targetSpeed <= currentSpeed) {
      return;
    }

    const ratio = targetSpeed / currentSpeed;
    ball.vx *= ratio;
    ball.vy *= ratio;
  }

  function drawRoundedRect(context, x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.lineTo(x + w - r, y);
    context.quadraticCurveTo(x + w, y, x + w, y + r);
    context.lineTo(x + w, y + h - r);
    context.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    context.lineTo(x + r, y + h);
    context.quadraticCurveTo(x, y + h, x, y + h - r);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
    context.closePath();
  }

  function intersectsBallRect(ball, rect) {
    const nearestX = clamp(ball.x, rect.x, rect.x + rect.w);
    const nearestY = clamp(ball.y, rect.y, rect.y + rect.h);
    const dx = ball.x - nearestX;
    const dy = ball.y - nearestY;
    return dx * dx + dy * dy <= ball.r * ball.r;
  }

  function updatePongScore() {
    if (els.pongScore) {
      els.pongScore.textContent = String(state.pong.score);
    }
  }

  function setPongHint(text) {
    if (els.pongHint) {
      els.pongHint.textContent = text;
    }
  }

  function handlePongPointerMove(event) {
    if (!els.pongCanvas) {
      return;
    }
    const rect = els.pongCanvas.getBoundingClientRect();
    if (!rect.width) {
      return;
    }
    const canvasX = ((event.clientX - rect.left) / rect.width) * PONG_CONFIG.width;
    state.pong.pointerX = clamp(canvasX, 0, PONG_CONFIG.width);
  }

