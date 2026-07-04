/**
 * Trip Itin — organize iD90 & travel screenshots into trip folders.
 */
(() => {
  const EMOJIS = ['✈️', '🏔️', '🌋', '🏝️', '🗼', '🏨', '🌆', '🎿', '🚢', '🌴', '🍜', '🎫'];
  const COLORS = ['#38bdf8', '#a78bfa', '#34d399', '#fb923c', '#f472b6', '#facc15', '#94a3b8', '#ef4444'];

  const state = {
    view: 'home',
    currentTripId: null,
    editingTripId: null,
    selectedEmoji: '✈️',
    selectedColor: COLORS[0],
    lightboxPhotoId: null,
    pendingUploadTripId: null,
    createTripThenUpload: false,
    objectUrls: new Map(),
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // --- DOM refs ---
  const views = {
    home: $('#view-home'),
    trip: $('#view-trip'),
    inbox: $('#view-inbox'),
  };
  const tripList = $('#trip-list');
  const photoGrid = $('#photo-grid');
  const inboxGrid = $('#inbox-grid');
  const fileInput = $('#file-input');
  const fab = $('#fab');
  const lightbox = $('#lightbox');
  const modalBackdrop = $('#modal-backdrop');

  // --- Helpers ---
  function uid() {
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function showToast(msg) {
    let toast = $('.toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  function blobUrl(photo) {
    if (!photo?.blob) return '';
    if (!state.objectUrls.has(photo.id)) {
      state.objectUrls.set(photo.id, URL.createObjectURL(photo.blob));
    }
    return state.objectUrls.get(photo.id);
  }

  function revokeUrl(photoId) {
    const url = state.objectUrls.get(photoId);
    if (url) {
      URL.revokeObjectURL(url);
      state.objectUrls.delete(photoId);
    }
  }

  function showView(name) {
    state.view = name;
    Object.entries(views).forEach(([key, el]) => el.classList.toggle('active', key === name));
    fab.classList.toggle('hidden', name === 'inbox');
    render();
  }

  function openModal(dialog) {
    modalBackdrop.classList.remove('hidden');
    dialog.showModal();
  }

  function closeModal(dialog) {
    dialog.close();
    if (!document.querySelector('dialog[open]')) {
      modalBackdrop.classList.add('hidden');
    }
  }

  function closeAllModals() {
    $$('dialog[open]').forEach((d) => d.close());
    modalBackdrop.classList.add('hidden');
  }

  // --- Render ---
  async function renderHome() {
    const trips = await DB.getAllTrips();
    const inboxPhotos = await DB.getInboxPhotos();
    const inboxBanner = $('#inbox-banner');
    const emptyHome = $('#empty-home');

    inboxBanner.classList.toggle('hidden', inboxPhotos.length === 0);
    $('#inbox-count').textContent = `${inboxPhotos.length} screenshot${inboxPhotos.length !== 1 ? 's' : ''}`;

    if (trips.length === 0 && inboxPhotos.length === 0) {
      tripList.innerHTML = '';
      emptyHome.classList.remove('hidden');
      return;
    }

    emptyHome.classList.add('hidden');
    tripList.innerHTML = '';

    for (const trip of trips) {
      const count = (await DB.getPhotosByTrip(trip.id)).length;
      const previews = await DB.getPreviewPhotos(trip.id, 3);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'trip-card';
      card.style.setProperty('--trip-color', trip.color);
      card.dataset.tripId = trip.id;

      const previewHtml = previews.length
        ? previews.map((p) => `<img src="${blobUrl(p)}" alt="" loading="lazy">`).join('')
        : '';

      card.innerHTML = `
        <span class="trip-card-emoji">${trip.emoji}</span>
        <div class="trip-card-body">
          <div class="trip-card-name">${escapeHtml(trip.name)}</div>
          <div class="trip-card-meta">${count} screenshot${count !== 1 ? 's' : ''}</div>
        </div>
        ${previewHtml ? `<div class="trip-card-preview">${previewHtml}</div>` : ''}
        <svg class="trip-card-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
      `;
      card.addEventListener('click', () => openTrip(trip.id));
      tripList.appendChild(card);
    }
  }

  async function renderTrip() {
    const trip = await DB.getTrip(state.currentTripId);
    if (!trip) { showView('home'); return; }

    $('#trip-emoji').textContent = trip.emoji;
    $('#trip-name').textContent = trip.name;

    const photos = await DB.getPhotosByTrip(trip.id);
    $('#trip-photo-count').textContent = `${photos.length} screenshot${photos.length !== 1 ? 's' : ''}`;

    const emptyTrip = $('#empty-trip');
    emptyTrip.classList.toggle('hidden', photos.length > 0);
    photoGrid.innerHTML = '';

    for (const photo of photos) {
      photoGrid.appendChild(createPhotoCell(photo));
    }
  }

  async function renderInbox() {
    const photos = await DB.getInboxPhotos();
    $('#inbox-header-count').textContent = `${photos.length} screenshot${photos.length !== 1 ? 's' : ''}`;
    inboxGrid.innerHTML = '';
    for (const photo of photos) {
      inboxGrid.appendChild(createPhotoCell(photo, true));
    }
  }

  function createPhotoCell(photo, showMoveHint = false) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'photo-cell';
    btn.dataset.photoId = photo.id;
    btn.innerHTML = `
      <img src="${blobUrl(photo)}" alt="Screenshot" loading="lazy">
      ${showMoveHint ? '<span class="photo-badge">Tap to file</span>' : ''}
    `;
    btn.addEventListener('click', () => {
      if (state.view === 'inbox') {
        state.lightboxPhotoId = photo.id;
        openMoveModal(photo.id);
      } else {
        openLightbox(photo.id);
      }
    });
    return btn;
  }

  async function render() {
    if (state.view === 'home') await renderHome();
    else if (state.view === 'trip') await renderTrip();
    else if (state.view === 'inbox') await renderInbox();
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // --- Navigation ---
  function openTrip(tripId) {
    state.currentTripId = tripId;
    showView('trip');
  }

  function openInbox() {
    showView('inbox');
  }

  // --- Trip CRUD ---
  function openTripModal(editId = null) {
    state.editingTripId = editId;
    const modal = $('#modal-trip');
    const input = $('#input-trip-name');

    if (editId) {
      $('#modal-trip-title').textContent = 'Edit trip';
      DB.getTrip(editId).then((trip) => {
        input.value = trip.name;
        state.selectedEmoji = trip.emoji;
        state.selectedColor = trip.color;
        renderPickers();
      });
    } else {
      $('#modal-trip-title').textContent = 'New trip folder';
      input.value = '';
      state.selectedEmoji = '✈️';
      state.selectedColor = COLORS[0];
      renderPickers();
    }

    openModal(modal);
    setTimeout(() => input.focus(), 100);
  }

  function renderPickers() {
    const emojiPicker = $('#emoji-picker');
    emojiPicker.innerHTML = EMOJIS.map((e) =>
      `<button type="button" class="emoji-btn${e === state.selectedEmoji ? ' selected' : ''}" data-emoji="${e}">${e}</button>`
    ).join('');
    emojiPicker.querySelectorAll('.emoji-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.selectedEmoji = btn.dataset.emoji;
        renderPickers();
      });
    });

    const colorPicker = $('#color-picker');
    colorPicker.innerHTML = COLORS.map((c) =>
      `<button type="button" class="color-btn${c === state.selectedColor ? ' selected' : ''}" data-color="${c}" style="background:${c}"></button>`
    ).join('');
    colorPicker.querySelectorAll('.color-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.selectedColor = btn.dataset.color;
        renderPickers();
      });
    });
  }

  async function saveTrip() {
    const name = $('#input-trip-name').value.trim();
    if (!name) {
      showToast('Enter a trip name');
      return;
    }

    let trip;
    if (state.editingTripId) {
      trip = await DB.getTrip(state.editingTripId);
      trip.name = name;
      trip.emoji = state.selectedEmoji;
      trip.color = state.selectedColor;
    } else {
      trip = {
        id: uid(),
        name,
        emoji: state.selectedEmoji,
        color: state.selectedColor,
        sortOrder: await DB.nextTripSortOrder(),
        createdAt: Date.now(),
      };
    }

    await DB.saveTrip(trip);
    closeModal($('#modal-trip'));

    if (state.createTripThenUpload) {
      state.createTripThenUpload = false;
      state.pendingUploadTripId = trip.id;
      fileInput.click();
    } else if (!state.editingTripId) {
      openTrip(trip.id);
    } else {
      render();
    }

    showToast(state.editingTripId ? 'Trip updated' : `"${name}" created`);
    state.editingTripId = null;
  }

  async function deleteCurrentTrip() {
    const trip = await DB.getTrip(state.currentTripId);
    if (!trip) return;
    if (!confirm(`Delete "${trip.name}" and all its screenshots?`)) return;

    const photos = await DB.getPhotosByTrip(trip.id);
    photos.forEach((p) => revokeUrl(p.id));
    await DB.deleteTrip(trip.id);
    closeAllModals();
    showView('home');
    showToast('Trip deleted');
  }

  // --- Photos ---
  async function handleFiles(files) {
    const tripId = state.pendingUploadTripId;
    state.pendingUploadTripId = null;

    if (!files.length) return;

    let added = 0;
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      const sortOrder = await DB.nextPhotoSortOrder(tripId);
      await DB.savePhoto({
        id: uid(),
        tripId: tripId ?? null,
        blob: file,
        filename: file.name,
        addedAt: Date.now(),
        sortOrder,
      });
      added++;
    }

    if (added) {
      showToast(`Added ${added} screenshot${added !== 1 ? 's' : ''}`);
      render();
    }
  }

  function openLightbox(photoId) {
    state.lightboxPhotoId = photoId;
    DB.getPhoto(photoId).then((photo) => {
      if (!photo) return;
      $('#lightbox-img').src = blobUrl(photo);
      lightbox.classList.remove('hidden');
    });
  }

  function closeLightbox() {
    lightbox.classList.add('hidden');
    state.lightboxPhotoId = null;
  }

  async function deleteLightboxPhoto() {
    const id = state.lightboxPhotoId;
    if (!id) return;
    if (!confirm('Delete this screenshot?')) return;
    revokeUrl(id);
    await DB.deletePhoto(id);
    closeLightbox();
    render();
    showToast('Deleted');
  }

  function openMoveModal(photoId) {
    state.lightboxPhotoId = photoId;
    const list = $('#move-trip-list');
    list.innerHTML = '<p style="color:var(--text-muted);padding:8px">Loading…</p>';
    openModal($('#modal-move'));

    DB.getAllTrips().then(async (trips) => {
      list.innerHTML = '';
      if (!trips.length) {
        list.innerHTML = '<p style="color:var(--text-muted);padding:8px">Create a trip folder first.</p>';
        return;
      }
      for (const trip of trips) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'move-trip-btn';
        btn.innerHTML = `<span>${trip.emoji}</span><span>${escapeHtml(trip.name)}</span>`;
        btn.addEventListener('click', async () => {
          await DB.movePhoto(photoId, trip.id);
          closeModal($('#modal-move'));
          closeLightbox();
          render();
          showToast(`Moved to ${trip.name}`);
        });
        list.appendChild(btn);
      }
    });
  }

  // --- FAB / Add flow ---
  function handleFabClick() {
    if (state.view === 'home') {
      openAddSheet();
    } else if (state.view === 'trip') {
      state.pendingUploadTripId = state.currentTripId;
      fileInput.click();
    }
  }

  function openAddSheet() {
    const modal = $('#modal-add');
    $('#add-to-current').classList.add('hidden');
    openModal(modal);
  }

  // --- Init pickers once ---
  renderPickers();

  // --- Event listeners ---
  fab.addEventListener('click', handleFabClick);

  $('#btn-back').addEventListener('click', () => showView('home'));
  $('#btn-inbox-back').addEventListener('click', () => showView('home'));
  $('#btn-view-inbox').addEventListener('click', openInbox);
  $('#btn-empty-create').addEventListener('click', () => openTripModal());

  $('#btn-save-trip').addEventListener('click', saveTrip);
  $('#input-trip-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveTrip();
  });

  $$('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const dialog = btn.closest('dialog');
      if (dialog) closeModal(dialog);
    });
  });

  modalBackdrop.addEventListener('click', closeAllModals);

  $('#btn-trip-menu').addEventListener('click', () => {
    DB.getTrip(state.currentTripId).then((trip) => {
      $('#menu-trip-name').textContent = trip.name;
      openModal($('#modal-trip-menu'));
    });
  });

  $('#menu-edit').addEventListener('click', () => {
    closeModal($('#modal-trip-menu'));
    openTripModal(state.currentTripId);
  });

  $('#menu-add-photos').addEventListener('click', () => {
    closeModal($('#modal-trip-menu'));
    state.pendingUploadTripId = state.currentTripId;
    fileInput.click();
  });

  $('#menu-delete').addEventListener('click', () => {
    closeModal($('#modal-trip-menu'));
    deleteCurrentTrip();
  });

  $('#add-to-inbox').addEventListener('click', () => {
    closeModal($('#modal-add'));
    state.pendingUploadTripId = null;
    fileInput.click();
  });

  $('#add-new-trip-folder').addEventListener('click', () => {
    closeModal($('#modal-add'));
    openTripModal();
  });

  $('#add-new-trip').addEventListener('click', () => {
    closeModal($('#modal-add'));
    state.createTripThenUpload = true;
    openTripModal();
  });

  $('#btn-settings').addEventListener('click', () => openTripModal());

  fileInput.addEventListener('change', (e) => {
    handleFiles([...e.target.files]);
    e.target.value = '';
  });

  $('#lightbox-close').addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
  });
  $('#lightbox-delete').addEventListener('click', deleteLightboxPhoto);
  $('#lightbox-move').addEventListener('click', () => {
    if (state.lightboxPhotoId) openMoveModal(state.lightboxPhotoId);
  });

  // Long-press on home FAB area — quick create trip
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeLightbox();
      closeAllModals();
    }
  });

  // Boot
  DB.open().then(() => {
    showView('home');
  }).catch(() => {
    showToast('Storage unavailable — try Safari on iOS');
  });
})();
