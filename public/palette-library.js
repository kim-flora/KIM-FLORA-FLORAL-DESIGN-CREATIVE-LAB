const storeName = 'formulas';

function connect() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('kim-flora-color-studio', 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Library upgrade blocked'));
  });
}

async function transact(mode, action) {
  const database = await connect();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      const request = action(transaction.objectStore(storeName));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export async function savePhotoPalette(entry) {
  const id = await transact('readwrite', store => store.put(entry));
  window.dispatchEvent(new Event('studio:storage-saved'));
  return id;
}
export const readPhotoPalettes = () => transact('readonly', store => store.getAll());
