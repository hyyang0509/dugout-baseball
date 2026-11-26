// Save storage (v3.3). localStorage holds about 5 MB, but a four-league world save grows
// past that within a season, so saves now go to IndexedDB as gzip-compressed JSON.
// - A localStorage save is moved to IndexedDB on load, and the old copy is deleted only
//   after the IndexedDB copy reads back identical.
// - Without IndexedDB the store falls back to localStorage. When both hold a save, the
//   one with the newer savedAt wins.
// - An IndexedDB save that cannot be decoded is an error, never "no save".
// - Writes are coalesced: while one write runs, only the newest pending text is written next.
// - Snapshots (v3.9): extra copies under their own keys (`<key>.snap.<kind>.<n>`) with an
//   index at `<key>.snaps`, so a bad write, a restart or an import can be undone. IndexedDB
//   only; the main save record is never touched by them.
// Backends are injectable so tests can run without a browser.
export const DB_NAME = 'dugout', DB_STORE = 'saves';
/** How many snapshots each kind keeps: 'auto' every few game days, 'replace' before a save is replaced. */
export const SNAPSHOT_KEEP = {auto: 3, replace: 2};

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

  const indexKey = key + '.snaps';
  async function snapshotIndex() {
    if (!idb) return [];
    const list = await idb.get(indexKey);
    return Array.isArray(list) ? list.filter(x => x && x.slot && SNAPSHOT_KEEP[x.kind]) : [];
  }
  /** Newest first: [{slot, kind, label, mark, savedAt, at, seq, size, raw}]. [] without IndexedDB or on error. */
  async function snapshots() {
    try { return (await snapshotIndex()).sort((a, b) => (b.seq || 0) - (a.seq || 0)); } catch (e) { return []; }
  }
  /**
   * Keeps a copy of text as a snapshot of the given kind, replacing that kind's oldest one.
   * The copy is read back before the index points to it. Resolves the entry, or null when it
   * could not be kept (a snapshot never blocks or breaks the main save).
   */
  let snapChain = Promise.resolve();
  function snapshot(text, opts) {
    // One at a time, so two snapshots never edit the index together.
    const run = snapChain.then(() => takeSnapshot(text, opts));
    snapChain = run.catch(() => null);
    return run;
  }
  async function takeSnapshot(text, {kind = 'auto', label = '', mark = ''} = {}) {
    if (!idb || !SNAPSHOT_KEEP[kind] || typeof text !== 'string') return null;
    try {
      const list = await snapshotIndex(), mine = list.filter(x => x.kind === kind);
      let n = 0;
      if (mine.length >= SNAPSHOT_KEEP[kind]) n = +mine.sort((a, b) => (a.seq || 0) - (b.seq || 0))[0].slot.split('.').pop();
      else while (mine.some(x => x.slot === `${kind}.${n}`)) n++;
      const slot = `${kind}.${n}`, rec = await encodeRecord(text);
      // Drop the old entry first, so the index never names a slot that holds other data.
      const rest = list.filter(x => x.slot !== slot);
      await idb.put(indexKey, rest);
      await idb.put(`${key}.snap.${slot}`, rec);
      if (await decodeRecord(await idb.get(`${key}.snap.${slot}`)) !== text) return null;
      const seq = list.reduce((m, x) => Math.max(m, x.seq || 0), 0) + 1;
      const entry = {slot, kind, label: String(label), mark: String(mark), savedAt: rec.savedAt, at: new Date().toISOString(), seq, size: rec.size, raw: rec.raw};
      await idb.put(indexKey, [...rest, entry]);
      return entry;
    } catch (e) { return null; }
  }
  /** The JSON text of a snapshot; throws SaveReadError when it is missing or cannot be decoded. */
  async function readSnapshot(slot) {
    if (!idb) throw new SaveReadError('這個瀏覽器沒有備份。');
    const rec = await idb.get(`${key}.snap.${slot}`);
    if (rec == null) throw new SaveReadError('找不到這份備份。');
    return decodeRecord(rec);
  }

  return {load, save, snapshot, snapshots, readSnapshot, busy: () => !!running, info: () => info, flush: () => running || Promise.resolve(null)};
}

export function formatBytes(n) {
  if (!(n >= 0)) return '—';
  return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`;
}
