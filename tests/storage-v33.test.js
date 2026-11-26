import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createSaveStore, encodeRecord, decodeRecord, savedAtOf, SaveReadError, formatBytes} from '../dist/storage.js';
import * as W from '../dist/world.js';

const KEY = 'dugout.world.v1';
function memIdb({fail = false} = {}) {
  const map = new Map(), log = [];
  const guard = () => { if (fail) return Promise.reject(new Error('idb down')); };
  return {map, log,
    get: async k => { await guard(); return map.get(k); },
    put: async (k, v) => { await guard(); log.push(k); map.set(k, structuredClone(v)); },
    del: async k => { await guard(); map.delete(k); }};
}
function memLocal({quota = Infinity} = {}) {
  const map = new Map();
  return {map, get: k => map.get(k) ?? null, set: (k, v) => { if (v.length > quota) throw new Error('QuotaExceededError'); map.set(k, v); }, del: k => map.delete(k)};
}
const text = (savedAt, extra = '') => JSON.stringify({kind: 'world', savedAt, pad: 'x'.repeat(2000) + extra});

test('records round-trip through gzip and are much smaller than the JSON', async () => {
  const t = text('2027-04-01T00:00:00.000Z');
  const rec = await encodeRecord(t);
  assert.equal(rec.format, 'gzip');
  assert.ok(rec.size < t.length / 5, `${rec.size} vs ${t.length}`);
  assert.equal(rec.savedAt, '2027-04-01T00:00:00.000Z');
  assert.equal(await decodeRecord(rec), t);
  assert.equal(savedAtOf('{bad'), '');
  assert.equal(formatBytes(2048), '2 KB');
});

test('a localStorage save moves to IndexedDB and the old copy is deleted only after it reads back', async () => {
  const idb = memIdb(), local = memLocal(), t = text('2027-05-01T00:00:00.000Z');
  local.map.set(KEY, t);
  const got = await createSaveStore({key: KEY, idb, local}).load();
  assert.equal(got.text, t);
  assert.equal(got.where, 'idb');
  assert.equal(got.migrated, true);
  assert.equal(local.map.has(KEY), false);
  assert.equal(await decodeRecord(idb.map.get(KEY)), t);
});

test('a failed migration keeps the localStorage save', async () => {
  const local = memLocal(), t = text('2027-05-01T00:00:00.000Z');
  local.map.set(KEY, t);
  const idb = memIdb();
  idb.put = async () => { throw new Error('quota'); };
  const got = await createSaveStore({key: KEY, idb, local}).load();
  assert.equal(got.where, 'local');
  assert.equal(local.map.get(KEY), t);
  // A copy that reads back differently is not trusted either.
  const bad = memIdb();
  let reads = 0;
  bad.get = async () => reads++ === 0 ? undefined : encodeRecord(text('2027-05-01T00:00:00.000Z', 'changed'));
  const got2 = await createSaveStore({key: KEY, idb: bad, local}).load();
  assert.equal(got2.where, 'local');
  assert.equal(local.map.get(KEY), t);
});

test('when both hold a save the newer savedAt wins', async () => {
  const idb = memIdb(), local = memLocal();
  const older = text('2027-04-01T00:00:00.000Z'), newer = text('2027-06-01T00:00:00.000Z');
  idb.map.set(KEY, await encodeRecord(older));
  local.map.set(KEY, newer);
  assert.equal((await createSaveStore({key: KEY, idb, local}).load()).text, newer);
  assert.equal(await decodeRecord(idb.map.get(KEY)), newer, 'the newer copy is moved over');
  assert.equal(local.map.has(KEY), false);
  // The reverse: a stale localStorage copy loses and is cleaned up.
  local.map.set(KEY, older);
  assert.equal((await createSaveStore({key: KEY, idb, local}).load()).text, newer);
  assert.equal(local.map.has(KEY), false);
});

test('an IndexedDB save that cannot be decoded is an error, not an empty slot, and is backed up', async () => {
  const idb = memIdb(), local = memLocal();
  const broken = {v: 1, format: 'gzip', data: new Uint8Array([1, 2, 3, 4]), savedAt: 'x'};
  idb.map.set(KEY, broken);
  await assert.rejects(createSaveStore({key: KEY, idb, local}).load(), SaveReadError);
  assert.ok(idb.map.get(KEY + '.unreadable'), 'a copy is kept under another key');
  assert.ok(idb.map.get(KEY), 'the original record is untouched');
  // IndexedDB present but unreadable and nothing in localStorage: also an error.
  await assert.rejects(createSaveStore({key: KEY, idb: memIdb({fail: true}), local: memLocal()}).load(), SaveReadError);
});

test('without IndexedDB the store falls back to localStorage', async () => {
  const local = memLocal(), store = createSaveStore({key: KEY, idb: null, local});
  assert.equal(await store.load(), null);
  const r = await store.save(text('2027-04-02T00:00:00.000Z'));
  assert.equal(r.ok, true);
  assert.equal(r.where, 'local');
  assert.ok(local.map.has(KEY));
  // An IndexedDB that fails on write also falls back.
  const local2 = memLocal(), r2 = await createSaveStore({key: KEY, idb: memIdb({fail: true}), local: local2}).save(text('2027-04-03T00:00:00.000Z'));
  assert.equal(r2.where, 'local');
  // Both failing reports a failure instead of throwing.
  const r3 = await createSaveStore({key: KEY, idb: null, local: memLocal({quota: 10})}).save(text('2027-04-03T00:00:00.000Z'));
  assert.equal(r3.ok, false);
});

test('writes during a run collapse into one write of the newest save', async () => {
  const idb = memIdb(), store = createSaveStore({key: KEY, idb, local: memLocal()});
  const results = [];
  for (let d = 1; d <= 7; d++) results.push(store.save(text(`2027-04-0${d}T00:00:00.000Z`)));
  assert.equal(store.busy(), true);
  await Promise.all(results);
  assert.ok(idb.log.length <= 2, `wrote ${idb.log.length} times`);
  assert.equal(savedAtOf(await decodeRecord(idb.map.get(KEY))), '2027-04-07T00:00:00.000Z');
  assert.equal(store.busy(), false);
  assert.equal(store.info().where, 'idb');
});

test('a real world save compresses well and restores from the store', async () => {
  const raw = id => JSON.parse(fs.readFileSync(new URL(`../dist/data/roster_${id.toLowerCase()}.json`, import.meta.url), 'utf8'));
  const bases = Object.fromEntries(W.LEAGUE_ORDER.map(id => [id, W.toWorldScale(id, raw(id))]));
  const w = W.makeWorld(bases, 'CPBL', bases.CPBL.teams[0].id, 3);
  w.savedAt = '2027-03-30T00:00:00.000Z';
  const t = W.packWorld(w, bases), idb = memIdb();
  await createSaveStore({key: KEY, idb, local: memLocal()}).save(t);
  const rec = idb.map.get(KEY);
  assert.ok(rec.size < t.length / 4, `${rec.size} bytes from ${t.length}`);
  const back = await createSaveStore({key: KEY, idb, local: memLocal()}).load();
  const restored = W.restoreWorld(JSON.parse(back.text), bases);
  assert.equal(restored.teamId, w.teamId);
  assert.equal(restored.savedAt, w.savedAt);
});
