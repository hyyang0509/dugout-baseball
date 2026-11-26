// Save storage (v3.3). localStorage holds about 5 MB, but a four-league world save grows
// past that within a season, so saves now go to IndexedDB as gzip-compressed JSON.
// - A localStorage save is moved to IndexedDB on load, and the old copy is deleted only
//   after the IndexedDB copy reads back identical.
// - Without IndexedDB the store falls back to localStorage. When both hold a save, the
//   one with the newer savedAt wins.
// - An IndexedDB save that cannot be decoded is an error, never "no save".
// - Writes are coalesced: while one write runs, only the newest pending text is written next.
// Backends are injectable so tests can run without a browser.
export const DB_NAME = 'dugout', DB_STORE = 'saves';

export class SaveReadError extends Error {}

export async function gzip(text) {
  if (typeof CompressionStream !== 'function') return null;
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export async function gunzip(bytes) {
  if (typeof DecompressionStream !== 'function') throw new SaveReadError('這個瀏覽器無法解壓縮存檔。');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/** Record stored in IndexedDB. size is the stored byte count; raw the JSON length. */
export async function encodeRecord(text, savedAt = savedAtOf(text)) {
  const z = await gzip(text);
  return z ? {v: 1, format: 'gzip', data: z, savedAt, raw: text.length, size: z.byteLength}
    : {v: 1, format: 'json', data: text, savedAt, raw: text.length, size: text.length * 2};
}
export async function decodeRecord(rec) {
  if (rec?.format === 'gzip') {
    const bytes = rec.data instanceof Uint8Array ? rec.data : rec.data instanceof ArrayBuffer ? new Uint8Array(rec.data) : null;
    if (!bytes) throw new SaveReadError('存檔資料損毀。');
    try { return await gunzip(bytes); } catch (e) { throw new SaveReadError('存檔無法解壓縮。'); }
  }
  if (rec?.format === 'json' && typeof rec.data === 'string') return rec.data;
  throw new SaveReadError('存檔格式不明。');
}

/** savedAt of a save's JSON text ('' when missing or unreadable, i.e. older than any dated save). */
export function savedAtOf(text) {
  try { return String(JSON.parse(text)?.savedAt || ''); } catch (e) { return ''; }
}

/** Promise wrapper around window.indexedDB. Returns null when IndexedDB is missing. */
export function idbBackend(idb = globalThis.indexedDB) {
  if (!idb) return null;
  let opening = null;
  const open = () => opening ??= new Promise((resolve, reject) => {
    let req;
    try { req = idb.open(DB_NAME, 1); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(DB_STORE)) req.result.createObjectStore(DB_STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB 無法開啟'));
    req.onblocked = () => reject(new Error('IndexedDB 被其他分頁占用'));
  }).catch(e => { opening = null; throw e; });
  const run = (mode, fn) => open().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, mode), req = fn(tx.objectStore(DB_STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error || req.error);
    tx.onabort = () => reject(tx.error || new Error('IndexedDB 寫入中止'));
  }));
  return {
    get: key => run('readonly', st => st.get(key)),
    put: (key, value) => run('readwrite', st => st.put(value, key)),
    del: key => run('readwrite', st => st.delete(key)),
  };
}
export function localBackend(ls = globalThis.localStorage) {
  if (!ls) return null;
  return {get: key => ls.getItem(key), set: (key, text) => ls.setItem(key, text), del: key => ls.removeItem(key)};
}

/**
 * createSaveStore({key, idb, local}): idb/local default to the browser backends; pass
 * null to disable one. load() resolves {text, where, savedAt, size} or null.
 */
export function createSaveStore({key, idb = idbBackend(), local = localBackend()} = {}) {
  let info = null, pending = null, running = null;
  const localGet = () => { try { return local?.get(key) ?? null; } catch (e) { return null; } };
  const localDel = () => { try { local?.del(key); } catch (e) { /* nothing to clean */ } };
  const describeLocal = text => ({text, where: 'local', savedAt: savedAtOf(text), size: text.length * 2, raw: text.length});

  /** Copies a localStorage save into IndexedDB and deletes it once the copy reads back the same. */
  async function migrate(text) {
    const rec = await encodeRecord(text);
    await idb.put(key, rec);
    const back = await decodeRecord(await idb.get(key));
    if (back !== text) throw new Error('IndexedDB 讀回內容不一致');
    localDel();
    return {text, where: 'idb', savedAt: rec.savedAt, size: rec.size, raw: rec.raw, format: rec.format, migrated: true};
  }

  async function load() {
    const localText = localGet();
    let rec = null, idbOk = !!idb;
    if (idb) { try { rec = await idb.get(key); } catch (e) { idbOk = false; } }
    if (rec != null) {
      let text;
      try { text = await decodeRecord(rec); }
      catch (e) {
        // Never treat it as "no save": keep a copy a new game cannot overwrite, then report.
        try { if (!(await idb.get(key + '.unreadable'))) await idb.put(key + '.unreadable', rec); } catch (err) { /* report anyway */ }
        throw new SaveReadError(e.message || '存檔無法讀取。');
      }
      const fromIdb = {text, where: 'idb', savedAt: rec.savedAt || savedAtOf(text), size: rec.size, raw: rec.raw ?? text.length, format: rec.format};
      if (localText != null && savedAtOf(localText) > fromIdb.savedAt) {
        // A newer fallback copy (IndexedDB failed for a while): move it over.
        try { info = await migrate(localText); } catch (e) { info = describeLocal(localText); }
        return info;
      }
      if (localText != null) localDel(); // stale copy left by an interrupted migration
      return info = fromIdb;
    }
    if (localText == null) {
      // IndexedDB exists but could not be read: a save may be there, so do not report "none".
      if (idb && !idbOk) throw new SaveReadError('瀏覽器資料庫無法開啟，無法確認是否有存檔。');
      return info = null;
    }
    if (idbOk) { try { return info = await migrate(localText); } catch (e) { /* keep using localStorage */ } }
    return info = describeLocal(localText);
  }

  async function write(text) {
    if (idb) {
      try {
        const rec = await encodeRecord(text);
        await idb.put(key, rec);
        if (localGet() != null) localDel();
        return info = {where: 'idb', savedAt: rec.savedAt, size: rec.size, raw: rec.raw, format: rec.format, ok: true};
      } catch (e) { /* fall back below */ }
    }
    if (!local) throw new Error('這個瀏覽器無法儲存。');
    local.set(key, text); // throws QuotaExceededError when full
    return info = {...describeLocal(text), text: undefined, ok: true};
  }

  /** Queues a write. Concurrent calls collapse into one write of the newest text. */
  function save(text) {
    pending = text;
    if (!running) running = (async () => {
      let result = null;
      try {
        while (pending != null) {
          const t = pending; pending = null;
          try { result = await write(t); } catch (error) { result = {ok: false, error}; }
        }
      } finally { running = null; }
      return result;
    })();
    return running;
  }

  return {load, save, busy: () => !!running, info: () => info, flush: () => running || Promise.resolve(null)};
}

export function formatBytes(n) {
  if (!(n >= 0)) return '—';
  return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`;
}
