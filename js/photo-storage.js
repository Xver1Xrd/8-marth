"use strict";

// Photo processing, IndexedDB/localStorage persistence and backup import/export.
  const PHOTO_FOLDER_PATH = "./foto/";
  const PHOTO_MANIFEST_PATH = `${PHOTO_FOLDER_PATH}manifest.json`;
  const PHOTO_FILE_RE = /\.(avif|bmp|gif|jpe?g|png|webp|svg)$/i;

  // Convert images to compressed data URLs before local persistence.
  async function fileToDataUrl(file) {
    if (file.size <= 1_500_000) {
      return readAsDataUrl(file);
    }

    const objectUrl = URL.createObjectURL(file);
    try {
      const image = await loadImage(objectUrl);
      const maxSide = 1600;
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");
      if (!context) {
        return readAsDataUrl(file);
      }

      context.drawImage(image, 0, 0, width, height);
      return canvas.toDataURL("image/jpeg", 0.87);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("read_error"));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("image_load_error"));
      img.src = src;
    });
  }

  // Photo binaries are stored in IndexedDB; captions/metadata stay in localStorage.
  function supportsPhotoDb() {
    return typeof indexedDB !== "undefined";
  }

  function createPhotoId() {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid) {
      return `p_${uuid}`;
    }
    return `p_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function ensurePhotoId(photo) {
    if (!photo || typeof photo !== "object") {
      return null;
    }
    if (typeof photo.id === "string" && photo.id.trim()) {
      return photo.id;
    }
    const id = createPhotoId();
    photo.id = id;
    return id;
  }

  function normalizePhotoMeta(item) {
    if (!item || typeof item.id !== "string" || !item.id.trim()) {
      return null;
    }

    return {
      id: item.id,
      caption: typeof item.caption === "string" ? item.caption : "",
      ts: Number.isFinite(Number(item.ts)) ? Number(item.ts) : Date.now(),
    };
  }

  function toPhotoMeta(item) {
    const normalized = normalizePhoto(item);
    if (!normalized) {
      return null;
    }

    return {
      id: normalized.id,
      caption: normalized.caption,
      ts: normalized.ts,
    };
  }

  function isPhotoFileName(fileName) {
    return typeof fileName === "string" && PHOTO_FILE_RE.test(fileName.trim());
  }

  function cleanFolderFileName(rawValue) {
    if (typeof rawValue !== "string" || !rawValue) {
      return "";
    }

    const withoutQuery = rawValue.split("?")[0];
    const tail = withoutQuery.split("/").pop() || "";
    if (!tail || tail === "." || tail === "..") {
      return "";
    }

    try {
      return decodeURIComponent(tail).trim();
    } catch {
      return tail.trim();
    }
  }

  function createFolderPhotoId(fileName) {
    return `folder:${fileName}`;
  }

  function buildFolderPhotoUrl(fileName) {
    return `${PHOTO_FOLDER_PATH}${encodeURIComponent(fileName)}`;
  }

  function readSavedPhotoMetaMap() {
    const raw = loadStorage(STORAGE_KEYS.photos, "[]");
    const parsed = parseJson(raw, []);
    if (!Array.isArray(parsed)) {
      return new Map();
    }

    const map = new Map();
    parsed
      .map((item) => normalizePhotoMeta(item))
      .filter(Boolean)
      .forEach((item) => {
        map.set(item.id, item);
      });
    return map;
  }

  async function loadFolderPhotoNamesFromManifest() {
    try {
      const response = await fetch(PHOTO_MANIFEST_PATH, { cache: "no-store" });
      if (!response.ok) {
        return [];
      }

      const payload = await response.json();
      const source = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.photos)
          ? payload.photos
          : [];
      const names = source
        .map((item) => cleanFolderFileName(String(item)))
        .filter((name) => isPhotoFileName(name));
      const unique = Array.from(new Set(names));
      unique.sort((a, b) => a.localeCompare(b, "ru", { numeric: true, sensitivity: "base" }));
      return unique;
    } catch {
      return [];
    }
  }

  async function loadFolderPhotoNamesFromDirectory() {
    try {
      const response = await fetch(PHOTO_FOLDER_PATH, { cache: "no-store" });
      if (!response.ok) {
        return [];
      }

      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const names = Array.from(doc.querySelectorAll("a"))
        .map((link) => cleanFolderFileName(link.getAttribute("href") || ""))
        .filter((name) => isPhotoFileName(name));
      const unique = Array.from(new Set(names));
      unique.sort((a, b) => a.localeCompare(b, "ru", { numeric: true, sensitivity: "base" }));
      return unique;
    } catch {
      return [];
    }
  }

  async function listFolderPhotoNames() {
    const fromManifest = await loadFolderPhotoNamesFromManifest();
    if (fromManifest.length > 0) {
      return fromManifest;
    }
    return loadFolderPhotoNamesFromDirectory();
  }

  async function loadFolderPhotos() {
    const fileNames = await listFolderPhotoNames();
    const savedMeta = readSavedPhotoMetaMap();
    return fileNames.slice(0, 24).map((fileName, index) => {
      const id = createFolderPhotoId(fileName);
      const restored = savedMeta.get(id);
      return {
        id,
        dataUrl: buildFolderPhotoUrl(fileName),
        caption: restored?.caption || "",
        ts: restored?.ts ?? Date.now() + index,
      };
    });
  }

  function wrapIdbRequest(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("idb_request_error"));
    });
  }

  function waitForIdbTransaction(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error || new Error("idb_tx_abort"));
      transaction.onerror = () => reject(transaction.error || new Error("idb_tx_error"));
    });
  }

  async function getPhotoDb() {
    if (!supportsPhotoDb()) {
      return null;
    }
    if (photoDbPromise) {
      return photoDbPromise;
    }

    photoDbPromise = new Promise((resolve) => {
      try {
        const request = indexedDB.open(PHOTO_DB.name, PHOTO_DB.version);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(PHOTO_DB.store)) {
            db.createObjectStore(PHOTO_DB.store, { keyPath: "id" });
          }
        };
        request.onsuccess = () => {
          const db = request.result;
          db.onversionchange = () => db.close();
          resolve(db);
        };
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });

    return photoDbPromise;
  }

  async function savePhotoMediaBatch(photos) {
    const items = Array.isArray(photos)
      ? photos.map((item) => normalizePhoto(item)).filter(Boolean)
      : [];
    if (items.length === 0) {
      return true;
    }

    const db = await getPhotoDb();
    if (!db) {
      return false;
    }

    try {
      const transaction = db.transaction(PHOTO_DB.store, "readwrite");
      const store = transaction.objectStore(PHOTO_DB.store);
      const now = Date.now();
      items.forEach((photo) => {
        store.put({
          id: photo.id,
          dataUrl: photo.dataUrl,
          updatedAt: now,
        });
      });
      await waitForIdbTransaction(transaction);
      return true;
    } catch {
      return false;
    }
  }

  async function getPhotoMedia(id) {
    if (typeof id !== "string" || !id) {
      return null;
    }
    const db = await getPhotoDb();
    if (!db) {
      return null;
    }

    try {
      const transaction = db.transaction(PHOTO_DB.store, "readonly");
      const store = transaction.objectStore(PHOTO_DB.store);
      const record = await wrapIdbRequest(store.get(id));
      return record && typeof record.dataUrl === "string" ? record.dataUrl : null;
    } catch {
      return null;
    }
  }

  async function deletePhotoMedia(id) {
    if (typeof id !== "string" || !id) {
      return false;
    }
    const db = await getPhotoDb();
    if (!db) {
      return false;
    }

    try {
      const transaction = db.transaction(PHOTO_DB.store, "readwrite");
      transaction.objectStore(PHOTO_DB.store).delete(id);
      await waitForIdbTransaction(transaction);
      return true;
    } catch {
      return false;
    }
  }

  async function clearPhotoMediaStore() {
    const db = await getPhotoDb();
    if (!db) {
      return false;
    }

    try {
      const transaction = db.transaction(PHOTO_DB.store, "readwrite");
      transaction.objectStore(PHOTO_DB.store).clear();
      await waitForIdbTransaction(transaction);
      return true;
    } catch {
      return false;
    }
  }

  async function replacePhotoMediaStore(photos) {
    const items = Array.isArray(photos)
      ? photos.map((item) => normalizePhoto(item)).filter(Boolean).slice(0, 24)
      : [];
    const db = await getPhotoDb();
    if (!db) {
      return false;
    }

    try {
      const transaction = db.transaction(PHOTO_DB.store, "readwrite");
      const store = transaction.objectStore(PHOTO_DB.store);
      const now = Date.now();
      store.clear();
      items.forEach((photo) => {
        store.put({
          id: photo.id,
          dataUrl: photo.dataUrl,
          updatedAt: now,
        });
      });
      await waitForIdbTransaction(transaction);
      return true;
    } catch {
      return false;
    }
  }

  async function prunePhotoMediaStore(keepIds) {
    const keepSet = new Set((keepIds || []).filter((id) => typeof id === "string" && id));
    const db = await getPhotoDb();
    if (!db) {
      return false;
    }

    try {
      const transaction = db.transaction(PHOTO_DB.store, "readwrite");
      const store = transaction.objectStore(PHOTO_DB.store);
      const keys = await wrapIdbRequest(store.getAllKeys());
      keys.forEach((key) => {
        const value = String(key);
        if (!keepSet.has(value)) {
          store.delete(key);
        }
      });
      await waitForIdbTransaction(transaction);
      return true;
    } catch {
      return false;
    }
  }

  // Restore photo list and migrate legacy localStorage-only format when needed.
  async function loadPhotos() {
    const raw = loadStorage(STORAGE_KEYS.photos, "[]");
    const parsed = parseJson(raw, []);
    if (!Array.isArray(parsed)) {
      return [];
    }

    if (!supportsPhotoDb()) {
      return parsed
        .map((item) => normalizePhoto(item))
        .filter(Boolean)
        .slice(0, 24);
    }

    const hasLegacyDataUrls = parsed.some((item) => item && typeof item.dataUrl === "string");
    if (hasLegacyDataUrls) {
      const legacyPhotos = parsed
        .map((item) => normalizePhoto(item))
        .filter(Boolean)
        .slice(0, 24);

      if (legacyPhotos.length > 0) {
        const migrated = await savePhotoMediaBatch(legacyPhotos);
        if (migrated) {
          try {
            localStorage.setItem(
              STORAGE_KEYS.photos,
              JSON.stringify(legacyPhotos.map((item) => toPhotoMeta(item)).filter(Boolean))
            );
          } catch {
            // no-op
          }
        }
      }

      return legacyPhotos;
    }

    const metaItems = parsed.map((item) => normalizePhotoMeta(item)).filter(Boolean).slice(0, 24);
    const loaded = [];
    let missing = 0;

    for (const meta of metaItems) {
      const dataUrl = await getPhotoMedia(meta.id);
      if (!dataUrl) {
        missing += 1;
        continue;
      }

      loaded.push({
        id: meta.id,
        dataUrl,
        caption: meta.caption,
        ts: meta.ts,
      });
    }

    if (missing > 0) {
      try {
        localStorage.setItem(
          STORAGE_KEYS.photos,
          JSON.stringify(loaded.map((item) => toPhotoMeta(item)).filter(Boolean))
        );
      } catch {
        // no-op
      }
      showToast("Часть фото не найдена в локальном хранилище и была пропущена", "warn");
    }

    return loaded;
  }

  function normalizePhoto(item) {
    if (!item || typeof item.dataUrl !== "string") {
      return null;
    }

    const id = ensurePhotoId(item);
    if (!id) {
      return null;
    }

    return {
      id,
      dataUrl: item.dataUrl,
      caption: typeof item.caption === "string" ? item.caption : "",
      ts: Number.isFinite(Number(item.ts)) ? Number(item.ts) : Date.now(),
    };
  }

  // Save only metadata in localStorage (images are kept in IndexedDB).
  function savePhotos() {
    if (!supportsPhotoDb()) {
      return savePhotosLegacy();
    }

    const normalized = state.photos
      .map((item) => normalizePhoto(item))
      .filter(Boolean)
      .slice(0, 24);
    const metadata = normalized.map((item) => toPhotoMeta(item)).filter(Boolean);

    try {
      localStorage.setItem(STORAGE_KEYS.photos, JSON.stringify(metadata));
      state.photos = normalized;
      return true;
    } catch {
      showToast("Не удалось сохранить подписи к фото в памяти браузера", "error");
      return false;
      while (normalized.length > 0) {
        normalized.pop();
        try {
          localStorage.setItem(STORAGE_KEYS.photos, JSON.stringify(normalized));
          state.photos = normalized;
          showToast("Память браузера заполнена, часть фото удалена", "warn");
          return true;
        } catch {
          continue;
        }
      }

      state.photos = [];
      showToast("Не удалось сохранить фото в браузере", "error");
      return false;
    }
  }

  function savePhotosLegacy() {
    const normalized = state.photos
      .map((item) => normalizePhoto(item))
      .filter(Boolean)
      .slice(0, 24);

    try {
      localStorage.setItem(STORAGE_KEYS.photos, JSON.stringify(normalized));
      state.photos = normalized;
      return true;
    } catch {
      while (normalized.length > 0) {
        normalized.pop();
        try {
          localStorage.setItem(STORAGE_KEYS.photos, JSON.stringify(normalized));
          state.photos = normalized;
          showToast("Память браузера заполнена, часть фото удалена", "warn");
          return true;
        } catch {
          continue;
        }
      }

      state.photos = [];
      showToast("Не удалось сохранить фото в браузере", "error");
      return false;
    }
  }

  function exportBackup() {
    const payload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      letterText: els.letterText.textContent.trim(),
      letterSig: els.sig.textContent.trim(),
      photos: state.photos,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);

    link.href = url;
    link.download = `veronika-card-backup-${stamp}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("Резервная копия сохранена", "success");
  }

  async function importBackup(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = parseJson(text, null);
      const restored = normalizeBackup(parsed);
      if (!restored) {
        showToast("Неверный файл резервной копии", "error");
        return;
      }

      if (!confirm("Заменить текущие фото и текст данными из файла?")) {
        return;
      }

      state.photos = restored.photos;
      els.letterText.textContent = restored.letterText;
      els.sig.textContent = restored.letterSig;

      if (supportsPhotoDb()) {
        const replaced = await replacePhotoMediaStore(state.photos);
        if (!replaced) {
          showToast("Не удалось сохранить фото локально после импорта", "warn");
        }
      }

      saveStorage(STORAGE_KEYS.letterText, restored.letterText);
      saveStorage(STORAGE_KEYS.letterSig, restored.letterSig);
      savePhotos();
      renderGallery();
      closeModal();
      showToast("Резервная копия восстановлена", "success");
    } catch {
      showToast("Не удалось прочитать файл", "error");
    }
  }

