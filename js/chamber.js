/* ROVA PWA — chamber.js
   .rova container (ZIP STORED), PBKDF2-HMAC-SHA256 600k -> AES-256-GCM,
   zlib compression via CompressionStream('deflate'), per-record merge —
   wire-compatible with the desktop implementation (CHAMBER_FORMAT.md). */
import { docShape, iterRecords, recordKey, contentHash, nowIso,
         dbGet, saveJson, shadowLoad, shadowSave, touchFile } from "./core.js";

export const MODULES = {
  calendar:      ["calendar_events.json","calendar_notes.json","birthdays.json","recurrences.json"],
  library:       ["library.json"],
  medical:       ["medicines.json","blood_exams.json","image_exams.json"],
  nutrition:     ["diario_alimentare.json","ricette.json","nutrizionale.json","industrialized.json","daily_ref.json"],
  financial:     ["financial.json","food4rova.json","profile.json","exchange_rates.json","brl_investments.json","eur_investments.json","fixed_costs.json","targets.json","principia.json","user_categories.json","financial_settings.json","posterus_settings.json","fiscal_data.json"],
  professional:  ["professional_projects.json","professional_structural.json","struct_assessments.json"],
  entertainment: ["musica.json","cinema.json","sport.json","spirits.json","mundae.json","literario.json"],
  home:          ["quick_tasks.json","financial_goals.json"],
};
const KDF_ITER = 600000;
const te = new TextEncoder(), td = new TextDecoder();

/* ── zlib via Compression Streams ('deflate' = zlib format) ─────────── */
async function pipe(bytes, stream){
  const r = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(r).arrayBuffer());
}
const zlibC = b => pipe(b, new CompressionStream("deflate"));
const zlibD = b => pipe(b, new DecompressionStream("deflate"));

/* ── crypto ──────────────────────────────────────────────────────────── */
async function deriveKey(password, salt){
  const km = await crypto.subtle.importKey("raw", te.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: KDF_ITER, hash: "SHA-256" },
    km, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
const b64e = u8 => btoa(String.fromCharCode(...u8));
const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function sha256hex(u8){
  const b = await crypto.subtle.digest("SHA-256", u8);
  return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
}

/* ── minimal ZIP (STORED only) ───────────────────────────────────────── */
const CRC_T = (() => { const t = new Uint32Array(256);
  for (let n=0;n<256;n++){ let c=n; for (let k=0;k<8;k++) c = c&1 ? 0xEDB88320 ^ (c>>>1) : c>>>1; t[n]=c; }
  return t; })();
function crc32(u8){ let c = 0xFFFFFFFF;
  for (let i=0;i<u8.length;i++) c = CRC_T[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0; }

export function zipWrite(entries){                 // entries: {name: Uint8Array}
  const chunks = [], central = []; let off = 0;
  const u16 = v => new Uint8Array([v&255, (v>>8)&255]);
  const u32 = v => new Uint8Array([v&255,(v>>8)&255,(v>>16)&255,(v>>>24)&255]);
  for (const [name, data] of Object.entries(entries)){
    const n = te.encode(name), crc = crc32(data);
    const head = [u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
                  u32(crc), u32(data.length), u32(data.length), u16(n.length), u16(0)];
    const lh = concat([...head, n, data]);
    chunks.push(lh);
    central.push({ n, crc, size: data.length, off });
    off += lh.length;
  }
  const cd = [];
  for (const e of central)
    cd.push(concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
                    u32(e.crc), u32(e.size), u32(e.size), u16(e.n.length), u16(0), u16(0),
                    u16(0), u16(0), u32(0), u32(e.off), e.n]));
  const cdBytes = concat(cd);
  const eocd = concat([u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length),
                       u32(cdBytes.length), u32(off), u16(0)]);
  return concat([...chunks, cdBytes, eocd]);
  function concat(arr){ const L = arr.reduce((s,a)=>s+a.length,0);
    const out = new Uint8Array(L); let p = 0;
    for (const a of arr){ out.set(a, p); p += a.length; } return out; }
}

export function zipRead(u8){                       // -> {name: Uint8Array}
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let p = u8.length - 22;
  while (p >= 0 && dv.getUint32(p, true) !== 0x06054b50) p--;
  if (p < 0) throw new Error("not a zip");
  const count = dv.getUint16(p+10, true); let cd = dv.getUint32(p+16, true);
  const out = {};
  for (let i=0;i<count;i++){
    if (dv.getUint32(cd, true) !== 0x02014b50) throw new Error("bad central dir");
    const method = dv.getUint16(cd+10, true), size = dv.getUint32(cd+24, true);
    const nlen = dv.getUint16(cd+28, true), elen = dv.getUint16(cd+30, true), clen = dv.getUint16(cd+32, true);
    const lho = dv.getUint32(cd+42, true);
    const name = td.decode(u8.subarray(cd+46, cd+46+nlen));
    if (method !== 0) throw new Error("only STORED supported");
    const lnlen = dv.getUint16(lho+26, true), lelen = dv.getUint16(lho+28, true);
    const ds = lho + 30 + lnlen + lelen;
    out[name] = u8.subarray(ds, ds+size);
    cd += 46 + nlen + elen + clen;
  }
  return out;
}

/* ── export ──────────────────────────────────────────────────────────── */
export async function exportRova(password, modules){
  const now = nowIso();
  const sh = await shadowLoad();
  const payload = { files: {} };
  for (const mod of modules)
    for (const fname of (MODULES[mod] || [])){
      const doc = await dbGet(fname);
      if (doc === null) continue;
      const shape = docShape(doc);
      const fsh = (sh.files[fname] ||= {});
      const tombs = await touchFile(doc, shape, fsh, now);
      payload.files[fname] = { kind: shape, data: doc, _tombstones: tombs };
      await saveJsonRaw(fname, doc);               // persist the stamped copies
    }
  if (!Object.keys(payload.files).length) throw new Error("Nessun dato per i moduli selezionati");
  const raw = te.encode(JSON.stringify(payload));
  const comp = await zlibC(raw);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const enc = new Uint8Array(await crypto.subtle.encrypt({ name:"AES-GCM", iv: nonce }, key, comp));
  const manifest = { format:"rova.chamber", version:1, exported_at: now,
                     modules, app:"ROVA PWA 1.0", _last_sync_at: sh._last_sync_at || "" };
  const meta = { kdf:"pbkdf2-sha256", iterations:KDF_ITER, cipher:"aes-256-gcm",
                 compress:"zlib", salt:b64e(salt), nonce:b64e(nonce) };
  const zip = zipWrite({
    "manifest.json": te.encode(JSON.stringify(manifest)),
    "data.enc": enc,
    "checksum.sha256": te.encode(await sha256hex(enc)),
    "crypto_meta.json": te.encode(JSON.stringify(meta)),
  });
  sh._last_sync_at = now;
  await shadowSave(sh);
  return zip;
}
async function saveJsonRaw(fname, doc){ const { dbPut } = await import("./core.js"); await dbPut(fname, doc); }

/* ── read + verify + decrypt ─────────────────────────────────────────── */
export async function readRova(bytes, password){
  let entries;
  try { entries = zipRead(bytes); } catch { throw new Error("File .rova non valido"); }
  const manifest = JSON.parse(td.decode(entries["manifest.json"]));
  const meta = JSON.parse(td.decode(entries["crypto_meta.json"]));
  const enc = entries["data.enc"];
  const want = td.decode(entries["checksum.sha256"]).trim();
  if (await sha256hex(enc) !== want) throw new Error("Password errata o file corrotto");
  let payload;
  try {
    const key = await deriveKey(password, b64d(meta.salt));
    const comp = new Uint8Array(await crypto.subtle.decrypt(
      { name:"AES-GCM", iv: b64d(meta.nonce) }, key, enc));
    payload = JSON.parse(td.decode(await zlibD(comp)));
  } catch { throw new Error("Password errata o file corrotto"); }
  return { manifest, payload };
}

/* ── merge (port of merge_rova, same rules) ──────────────────────────── */
export async function mergeRova(manifest, payload, { resolver = null, modules = null } = {}){
  const sh = await shadowLoad();
  const now = nowIso();
  const lastSync = manifest._last_sync_at || "";
  const stats = { added:0, updated:0, deleted:0, kept:0, conflicts:0, snapshot:null };
  let allowed = null;
  if (modules) allowed = new Set(modules.flatMap(m => MODULES[m] || []));

  for (const [fname, fent] of Object.entries(payload.files || {})){
    if (fname === "mobile_snapshot.json"){ stats.snapshot = fent.data; await saveJsonRaw(fname, fent.data); continue; }
    if (allowed && !allowed.has(fname)) continue;
    const shape = fent.kind;
    const impDoc = fent.data;
    let localDoc = await dbGet(fname);
    const fsh = (sh.files[fname] ||= {});

    if (shape === "doc"){
      if (localDoc !== null) await touchFile(localDoc, "doc", fsh, now);
      const locM = fsh["__doc__"]?.m || "";
      const impM = fent.data_modified_at || manifest.exported_at || "";
      if (localDoc === null || impM > locM){
        await saveJsonRaw(fname, impDoc); stats.updated++;
        fsh["__doc__"] = { h: "", m: impM };
      } else stats.kept++;
      continue;
    }

    if (localDoc === null) localDoc = shape === "sections" ? {} : [];
    await touchFile(localDoc, docShape(localDoc) === "doc" ? shape : docShape(localDoc), fsh, now);

    const idx = new Map();
    for (const [sec, r] of iterRecords(localDoc, shape))
      idx.set((sec ? sec+"::" : "") + await recordKey(r), [sec, r]);

    for (const tb of fent._tombstones || []){
      const k = tb._key, tm = tb._modified_at || "";
      const loc = idx.get(k);
      if (loc){
        const [sec, rec] = loc;
        if (tm >= (rec._modified_at || "")){
          const arr = sec ? localDoc[sec] : localDoc;
          arr.splice(arr.indexOf(rec), 1);
          idx.delete(k);
          fsh[k] = { h:"", m:tm, deleted:tm };
          stats.deleted++;
        }
      } else {
        const ent = (fsh[k] ||= { h:"", m:tm });
        if (!ent.deleted || ent.deleted < tm){ ent.deleted = tm; ent.m = tm > (ent.m||"") ? tm : ent.m; }
      }
    }

    for (const [sec, rec] of iterRecords(impDoc, shape)){
      const k = (sec ? sec+"::" : "") + await recordKey(rec);
      const impM = rec._modified_at || "";
      const ent = fsh[k];
      const loc = idx.get(k);
      if (!loc){
        if (ent && ent.deleted && ent.deleted >= impM){ stats.kept++; continue; }
        if (shape === "sections") (localDoc[sec] ||= []).push(rec);
        else localDoc.push(rec);
        idx.set(k, [sec, rec]);
        fsh[k] = { h: await contentHash(rec), m: impM || now };
        stats.added++;
      } else {
        const [, lrec] = loc;
        const locM = lrec._modified_at || "";
        if (await contentHash(lrec) === await contentHash(rec)){ stats.kept++; continue; }
        const both = lastSync && locM > lastSync && impM > lastSync;
        let choice = null;
        if (both){ stats.conflicts++; if (resolver) choice = await resolver(fname, k, lrec, rec); }
        if (choice === null || choice === undefined) choice = impM > locM ? "import" : "local";
        if (choice === "import"){
          for (const kk of Object.keys(lrec)) delete lrec[kk];
          Object.assign(lrec, rec);
          fsh[k] = { h: await contentHash(rec), m: impM || now };
          stats.updated++;
        } else stats.kept++;
      }
    }
    await saveJsonRaw(fname, localDoc);
  }
  sh._last_sync_at = now;
  await shadowSave(sh);
  return stats;
}
