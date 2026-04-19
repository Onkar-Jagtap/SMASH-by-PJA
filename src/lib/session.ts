export function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("SmashMatcherDB", 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("session");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSession(key: string, data: any) {
  const db = await initDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("session", "readwrite");
    const store = tx.objectStore("session");
    store.put(data, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadSession(key: string): Promise<any> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("session", "readonly");
    const store = tx.objectStore("session");
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function clearSession() {
  const db = await initDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("session", "readwrite");
    const store = tx.objectStore("session");
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
