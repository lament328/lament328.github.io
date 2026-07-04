/**
 * IndexedDB layer — stores trips and photo blobs locally on device.
 */
const DB = (() => {
  const DB_NAME = 'trip-itin';
  const DB_VERSION = 1;

  let db = null;

  function open() {
    if (db) return Promise.resolve(db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const database = e.target.result;
        if (!database.objectStoreNames.contains('trips')) {
          const trips = database.createObjectStore('trips', { keyPath: 'id' });
          trips.createIndex('sortOrder', 'sortOrder', { unique: false });
        }
        if (!database.objectStoreNames.contains('photos')) {
          const photos = database.createObjectStore('photos', { keyPath: 'id' });
          photos.createIndex('tripId', 'tripId', { unique: false });
          photos.createIndex('addedAt', 'addedAt', { unique: false });
        }
      };
      req.onsuccess = (e) => { db = e.target.result; resolve(db); };
      req.onerror = () => reject(req.error);
    });
  }

  function tx(storeNames, mode = 'readonly') {
    return open().then((database) => database.transaction(storeNames, mode));
  }

  function promisifyRequest(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function getAllTrips() {
    const transaction = await tx(['trips']);
    const trips = await promisifyRequest(transaction.objectStore('trips').getAll());
    return trips.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async function getTrip(id) {
    const transaction = await tx(['trips']);
    return promisifyRequest(transaction.objectStore('trips').get(id));
  }

  async function saveTrip(trip) {
    const transaction = await tx(['trips'], 'readwrite');
    await promisifyRequest(transaction.objectStore('trips').put(trip));
    return trip;
  }

  async function deleteTrip(id) {
    const photos = await getPhotosByTrip(id);
    const transaction = await tx(['trips', 'photos'], 'readwrite');
    transaction.objectStore('trips').delete(id);
    for (const photo of photos) {
      transaction.objectStore('photos').delete(photo.id);
    }
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async function getPhotosByTrip(tripId) {
    const transaction = await tx(['photos']);
    const store = transaction.objectStore('photos');
    const index = store.index('tripId');
    const photos = await promisifyRequest(index.getAll(tripId));
    return photos.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async function getInboxPhotos() {
    return getPhotosByTrip(null);
  }

  async function getPhoto(id) {
    const transaction = await tx(['photos']);
    return promisifyRequest(transaction.objectStore('photos').get(id));
  }

  async function savePhoto(photo) {
    const transaction = await tx(['photos'], 'readwrite');
    await promisifyRequest(transaction.objectStore('photos').put(photo));
    return photo;
  }

  async function deletePhoto(id) {
    const transaction = await tx(['photos'], 'readwrite');
    await promisifyRequest(transaction.objectStore('photos').delete(id));
  }

  async function movePhoto(photoId, tripId) {
    const photo = await getPhoto(photoId);
    if (!photo) return null;
    photo.tripId = tripId;
    const existing = tripId ? await getPhotosByTrip(tripId) : await getInboxPhotos();
    photo.sortOrder = existing.length;
    return savePhoto(photo);
  }

  async function countPhotos(tripId) {
    const photos = tripId === undefined
      ? await getAllPhotos()
      : await getPhotosByTrip(tripId);
    return photos.length;
  }

  async function getAllPhotos() {
    const transaction = await tx(['photos']);
    return promisifyRequest(transaction.objectStore('photos').getAll());
  }

  async function getPreviewPhotos(tripId, limit = 3) {
    const photos = await getPhotosByTrip(tripId);
    return photos.slice(-limit);
  }

  async function nextTripSortOrder() {
    const trips = await getAllTrips();
    if (!trips.length) return 0;
    return Math.max(...trips.map((t) => t.sortOrder)) + 1;
  }

  async function nextPhotoSortOrder(tripId) {
    const photos = tripId ? await getPhotosByTrip(tripId) : await getInboxPhotos();
    if (!photos.length) return 0;
    return Math.max(...photos.map((p) => p.sortOrder)) + 1;
  }

  return {
    open,
    getAllTrips,
    getTrip,
    saveTrip,
    deleteTrip,
    getPhotosByTrip,
    getInboxPhotos,
    getPhoto,
    savePhoto,
    deletePhoto,
    movePhoto,
    countPhotos,
    getPreviewPhotos,
    nextTripSortOrder,
    nextPhotoSortOrder,
  };
})();
