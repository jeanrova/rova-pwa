/* ROVA PWA — core.js
   Record identity, content hashing, IndexedDB store, diff-stamping persistence
   and the Chamber shadow. Mirrors the desktop contract (CHAMBER_FORMAT.md):
   - record_key: id | uuid | stable-field composite (same field order as desktop)
   - _modified_at assigned at SAVE time, only to records whose content changed
   - shadow tracks per-record content hash + timestamp + tombstones (90d purge)
   Records created on the PWA always get an explicit `id` (uuid), so their
   cross-device identity never depends on hash details. */

export const STABLE = ["data","date","month","titolo","title","nome","name",
                       "descrizione","site","user","banca","categoria"];
const META = new Set(["_modified_at","_deleted","_key"]);

export const nowIso = () => new Date().toISOString();          // matches desktop format
export const uuid = () => crypto.randomUUID();

async function sha1hex(str){
  const b = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(str));
  return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
}

/* content hash: device-local only (never crosses devices) — JSON with sorted keys */
export async function contentHash(rec){
  const core = {};
  for (const k of Object.keys(rec).sort()) if (!META.has(k)) core[k] = rec[k];
  return sha1hex(JSON.stringify(core));
}

export async function recordKey(rec){
  if (rec.id !== undefined && rec.id !== null && rec.id !== "") return "id:"+rec.id;
  if (rec.uuid) return "uuid:"+rec.uuid;
  const parts = [];
  for (const f of STABLE){
    const v = rec[f];
    if (v !== undefined && v !== null && v !== "") parts.push(`${f}=${v}`);
  }
  if (parts.length) return "k:" + await sha1hex(parts.join("|"));
  return "h:" + await contentHash(rec);
}

export function docShape(doc){
  if (Array.isArray(doc))
    return doc.every(r => r && typeof r === "object" && !Array.isArray(r)) ? "list" : "doc";
  if (doc && typeof doc === "object"){
    const vals = Object.values(doc);
    if (vals.length && vals.every(v => Array.isArray(v)) &&
        vals.every(v => v.every(r => r && typeof r === "object" && !Array.isArray(r))))
      return "sections";
  }
  return "doc";
}

export function* iterRecords(doc, shape){
  if (shape === "list") for (const r of doc) yield [null, r];
  else if (shape === "sections")
    for (const [sec, lst] of Object.entries(doc)) for (const r of lst) yield [sec, r];
}

/* ── IndexedDB: one object store, key = filename ─────────────────────── */
const DB_NAME = "rova", STORE = "files";
let _db = null;
function idb(){
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    const rq = indexedDB.open(DB_NAME, 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore(STORE);
    rq.onsuccess = () => { _db = rq.result; res(_db); };
    rq.onerror = () => rej(rq.error);
  });
}
export async function dbGet(fname){
  const db = await idb();
  return new Promise((res, rej) => {
    const rq = db.transaction(STORE).objectStore(STORE).get(fname);
    rq.onsuccess = () => res(rq.result ?? null);
    rq.onerror = () => rej(rq.error);
  });
}
export async function dbPut(fname, doc){
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(doc, fname);
    tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
  });
}
export async function dbKeys(){
  const db = await idb();
  return new Promise((res, rej) => {
    const rq = db.transaction(STORE).objectStore(STORE).getAllKeys();
    rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
  });
}

/* ── shadow ──────────────────────────────────────────────────────────── */
export async function shadowLoad(){
  return (await dbGet("chamber_shadow.json")) ?? { files: {}, _last_sync_at: "" };
}
export const shadowSave = sh => dbPut("chamber_shadow.json", sh);

/* ── diff-stamping save (persist.py port) ────────────────────────────── */
export async function saveJson(fname, doc){
  const shape = docShape(doc);
  if (shape === "list" || shape === "sections"){
    const prev = {};
    const old = await dbGet(fname);
    if (old !== null){
      const os = docShape(old);
      if (os === "list" || os === "sections")
        for (const [sec, rec] of iterRecords(old, os)){
          const k = (sec ? sec+"::" : "") + await recordKey(rec);
          prev[k] = [await contentHash(rec), rec._modified_at];
        }
    }
    const now = nowIso();
    for (const [sec, rec] of iterRecords(doc, shape)){
      const k = (sec ? sec+"::" : "") + await recordKey(rec);
      const h = await contentHash(rec);
      const p = prev[k];
      rec._modified_at = (p && p[0] === h && p[1]) ? p[1] : now;
    }
  }
  await dbPut(fname, doc);
}

/* touch-for-export: same rules as desktop chamber._touch_file */
export async function touchFile(doc, shape, fsh, now){
  const seen = new Set();
  if (shape === "doc"){
    const h = await sha1hex(JSON.stringify(doc));
    const ent = fsh["__doc__"];
    fsh["__doc__"] = { h, m: (ent && ent.h === h) ? ent.m : now };
    return [];
  }
  for (const [sec, rec] of iterRecords(doc, shape)){
    const k = (sec ? sec+"::" : "") + await recordKey(rec);
    seen.add(k);
    const h = await contentHash(rec);
    const ent = fsh[k], rm = rec._modified_at;
    if (ent && ent.h === h && ent.m) rec._modified_at = ent.m;
    else if (rm && (!ent || rm > (ent.m || ""))) rec._modified_at = rm;
    else rec._modified_at = now;
    fsh[k] = { h, m: rec._modified_at };
  }
  const tombs = [];
  const cutoff = new Date(Date.now() - 90*864e5).toISOString();
  for (const [k, ent] of Object.entries(fsh)){
    if (k === "__doc__" || seen.has(k)) continue;
    if (!ent.deleted){ ent.deleted = now; ent.m = now; }
    tombs.push({ _key: k, _deleted: true, _modified_at: ent.m });
    if (ent.deleted < cutoff) delete fsh[k];
  }
  return tombs;
}
