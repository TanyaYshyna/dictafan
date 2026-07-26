(function () {
  if (window.IdbManager) {
    return;
  }

  const DB_VERSION = 3;

  async function openDraftDb() {
    return await new Promise((resolve, reject) => {
      const req = indexedDB.open('dictafan_drafts', DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        try {
          if (!db.objectStoreNames.contains('drafts')) {
            db.createObjectStore('drafts', { keyPath: 'key' });
          }
        } catch (e) {
        }
        try {
          if (!db.objectStoreNames.contains('outbox')) {
            db.createObjectStore('outbox', { keyPath: 'key' });
          }
        } catch (e) {
        }
        try {
          if (!db.objectStoreNames.contains('activity_outbox')) {
            db.createObjectStore('activity_outbox', { keyPath: 'key' });
          }
        } catch (e) {
        }
        try {
          if (!db.objectStoreNames.contains('success_outbox')) {
            db.createObjectStore('success_outbox', { keyPath: 'key' });
          }
        } catch (e) {
        }
        try {
          if (!db.objectStoreNames.contains('dictations')) {
            db.createObjectStore('dictations', { keyPath: 'key' });
          }
        } catch (e) {
        }
        try {
          if (!db.objectStoreNames.contains('desk_items')) {
            db.createObjectStore('desk_items', { keyPath: 'key' });
          }
        } catch (e) {
        }
        try {
          if (!db.objectStoreNames.contains('media_manifest')) {
            db.createObjectStore('media_manifest', { keyPath: 'key' });
          }
        } catch (e) {
        }

        try {
          if (!db.objectStoreNames.contains('student_plan_cache')) {
            db.createObjectStore('student_plan_cache', { keyPath: 'key' });
          }
        } catch (e) {
        }

        try {
          if (!db.objectStoreNames.contains('sessions')) {
            db.createObjectStore('sessions', { keyPath: 'key' });
          }
        } catch (e) {
        }
        try {
          if (!db.objectStoreNames.contains('draft_save_queue')) {
            db.createObjectStore('draft_save_queue', { keyPath: 'key' });
          }
        } catch (e) {
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbPut(storeName, value) {
    const db = await openDraftDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.put(value);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  }

  async function idbGet(storeName, key) {
    const db = await openDraftDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  }

  async function idbDelete(storeName, key) {
    const db = await openDraftDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.delete(key);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  }

  async function idbGetAll(storeName) {
    const db = await openDraftDb();
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  }

  async function idbDeleteDictationCache(dictationId) {
    try {
      const dictId = String(dictationId || '').trim();
      if (!dictId) return;
      const rows = await idbGetAll('dictations');
      for (const row of rows || []) {
        try {
          if (row && String(row.dictationId || '') === dictId && row.key) {
            await idbDelete('dictations', row.key);
          }
        } catch (e) {
        }
      }
    } catch (e) {
    }
  }

  window.IdbManager = {
    openDraftDb,
    idbPut,
    idbGet,
    idbDelete,
    idbGetAll,
    idbDeleteDictationCache,
  };
})();
