"use strict";

// Gallery rendering, drag-and-drop and photo modal interactions.

  // Drag-and-drop works on the initial dropzone and on the gallery grid itself.
  function setupDropzone() {
    const dropEventsEnter = ["dragenter", "dragover"];
    const dropEventsLeave = ["dragleave", "dragend", "drop"];
    const dropTargets = [els.photoDrop, els.gallery].filter(Boolean);

    dropEventsEnter.forEach((name) => {
      dropTargets.forEach((target) => {
        target.addEventListener(name, (event) => {
          event.preventDefault();
          event.stopPropagation();
          els.photoDrop?.classList.add("is-dragover");
          els.gallery?.classList.add("is-dragover");
        });
      });
    });

    dropEventsLeave.forEach((name) => {
      dropTargets.forEach((target) => {
        target.addEventListener(name, (event) => {
          event.preventDefault();
          event.stopPropagation();
          els.photoDrop?.classList.remove("is-dragover");
          els.gallery?.classList.remove("is-dragover");
        });
      });
    });

    dropTargets.forEach((target) => {
      target.addEventListener("drop", async (event) => {
        const files = event.dataTransfer?.files;
        await handlePhotoFiles(files);
      });
    });
  }

  async function handlePhotoFiles(fileList) {
    const files = Array.from(fileList || [])
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, 12);

    if (files.length === 0) {
      showToast("Выбери изображения для загрузки", "warn");
      return;
    }

    let added = 0;
    const addedPhotos = [];
    for (const file of files) {
      try {
        const dataUrl = await fileToDataUrl(file);
        const photo = {
          id: createPhotoId(),
          dataUrl,
          caption: "",
          ts: Date.now() + Math.random(),
        };
        state.photos.unshift(photo);
        addedPhotos.push(photo);
        added += 1;
      } catch {
        showToast(`Не удалось обработать файл: ${file.name}`, "error");
      }
    }

    if (added === 0) {
      return;
    }

    state.photos = state.photos.slice(0, 24);
    if (supportsPhotoDb()) {
      const saved = await savePhotoMediaBatch(addedPhotos);
      if (!saved) {
        showToast("Не удалось локально сохранить фото. Они останутся до обновления страницы", "warn");
      }
      await prunePhotoMediaStore(state.photos.map((photo) => photo.id).filter(Boolean));
    }
    savePhotos();
    renderGallery();
    burstConfetti(100);
    spawnHearts(8);
    showToast(`Добавлено фото: ${added}`, "success");
  }

  // Gallery switches to compact mode after the first photo is added.
  function renderGallery() {
    els.gallery.innerHTML = "";
    els.photosSection?.classList.toggle("has-photos", state.photos.length > 0);
    if (state.photos.length === 0) {
      const empty = document.createElement("div");
      empty.className = "gallery-empty";
      empty.innerHTML =
        "<strong>Фото не найдены ✨</strong><span>Добавь изображения в папку foto и обнови страницу.</span>";
      els.gallery.appendChild(empty);
      return;
    }

    state.photos.forEach((photo, index) => {
      const card = document.createElement("article");
      card.className = "ph";
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", `Открыть фото ${index + 1}`);

      const img = document.createElement("img");
      img.src = photo.dataUrl;
      img.alt = `Фото ${index + 1}`;
      img.loading = "lazy";

      const caption = document.createElement("div");
      caption.className = "cap";
      caption.textContent = photo.caption || "Нажми, чтобы открыть 💗";

      card.appendChild(img);
      card.appendChild(caption);

      card.addEventListener("click", () => openModal(index));
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openModal(index);
        }
      });

      els.gallery.appendChild(card);
    });
  }

  function removePhoto(index) {
    if (!Number.isFinite(index) || index < 0 || index >= state.photos.length) {
      return;
    }
    if (!confirm("Удалить это фото?")) {
      return;
    }

    const [removed] = state.photos.splice(index, 1);
    if (removed?.id && supportsPhotoDb()) {
      void deletePhotoMedia(removed.id);
    }
    savePhotos();
    renderGallery();

    if (isModalOpen()) {
      if (state.modalIndex === index) {
        closeModal();
      } else if (state.modalIndex > index) {
        state.modalIndex -= 1;
      }
    }

    showToast("Фото удалено", "warn");
  }

  function shufflePhotos() {
    if (state.photos.length < 2) {
      showToast("Сначала добавь больше фото", "warn");
      return;
    }

    for (let i = state.photos.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [state.photos[i], state.photos[j]] = [state.photos[j], state.photos[i]];
    }

    savePhotos();
    renderGallery();
    spawnHearts(6);
    showToast("Порядок фото обновлен", "success");
  }

  function setRandomCaption() {
    if (state.photos.length === 0) {
      showToast("Сначала добавь фото", "warn");
      return;
    }

    const index = Math.floor(Math.random() * state.photos.length);
    const current = state.photos[index].caption || "";
    const next = prompt("Подпись для одного из ваших фото ✏️", current);
    if (next === null) {
      return;
    }

    state.photos[index].caption = next.trim();
    savePhotos();
    renderGallery();
    burstConfetti(60);
    showToast("Подпись обновлена", "success");
  }

  // Modal is the main place to browse and edit captions.
  function openModal(index) {
    if (!Number.isFinite(index) || index < 0 || index >= state.photos.length) {
      return;
    }
    if (isPongOpen()) {
      closePongModal();
    }

    state.modalIndex = index;
    const photo = state.photos[state.modalIndex];
    els.modalImg.src = photo.dataUrl;
    els.modalTitle.textContent = photo.caption || `Фото ${state.modalIndex + 1}`;
    els.modal.classList.add("open");
    els.modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    syncModalPhoto();
  }

  function closeModal() {
    if (!isModalOpen()) {
      return;
    }

    els.modal.classList.remove("open");
    els.modal.setAttribute("aria-hidden", "true");
    els.modalImg.src = "";
    if (els.modalCaptionInput) {
      els.modalCaptionInput.value = "";
    }
    if (!isPongOpen()) {
      document.body.classList.remove("modal-open");
    }
  }

  function syncModalPhoto() {
    if (state.modalIndex < 0 || state.modalIndex >= state.photos.length) {
      return;
    }

    const photo = state.photos[state.modalIndex];
    els.modalImg.src = photo.dataUrl;
    els.modalTitle.textContent = photo.caption?.trim() || `Фото ${state.modalIndex + 1}`;
    if (els.modalCaptionInput) {
      els.modalCaptionInput.value = photo.caption || "";
    }
  }

  function handleModalCaptionInput(event) {
    if (!isModalOpen()) {
      return;
    }
    const photo = state.photos[state.modalIndex];
    if (!photo) {
      return;
    }

    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }

    photo.caption = input.value;
    els.modalTitle.textContent = photo.caption.trim() || `Фото ${state.modalIndex + 1}`;
    savePhotos();
    renderGallery();
  }

  function removeCurrentModalPhoto() {
    if (!isModalOpen()) {
      return;
    }
    removePhoto(state.modalIndex);
  }

  function shiftModalPhoto(direction) {
    if (!isModalOpen() || state.photos.length === 0) {
      return;
    }

    const nextIndex =
      (state.modalIndex + direction + state.photos.length) % state.photos.length;
    openModal(nextIndex);
  }

  function isModalOpen() {
    return els.modal.classList.contains("open");
  }

