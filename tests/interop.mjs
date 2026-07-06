import "fake-indexeddb/auto";
import fs from "node:fs";
const { readRova, mergeRova, exportRova } = await import("../js/chamber.js");
const { dbGet, saveJson } = await import("../js/core.js");
const PWD = "interop-pass";

// 1) Python-produced .rova -> JS merge
const bytes = new Uint8Array(fs.readFileSync("/tmp/interop_py.rova"));
const { manifest, payload } = await readRova(bytes, PWD);
const st = await mergeRova(manifest, payload);
console.log("JS merge:", JSON.stringify(st));
const ev = await dbGet("calendar_events.json");
if (!ev || ev.length !== 2) throw new Error("events count "+(ev&&ev.length));
if (!(await dbGet("daily_ref.json")).kcal) throw new Error("doc-shape missing");
if ((await dbGet("library.json"))[0].title !== "EN 1993-1-2") throw new Error("library");
if (st.snapshot?.patrimonio_all !== 12345.67) throw new Error("snapshot");

// wrong password must fail with the single message
let failed = false;
try { await readRova(bytes, "wrong"); } catch(e){ failed = /errata o file corrotto/.test(e.message); }
if (!failed) throw new Error("wrong password accepted");

// 2) edit one composite-key event, delete the other, add a new one (with id)
const evs = await dbGet("calendar_events.json");
const target = evs.find(e => e.title === "Dentista");
target.note = "portare radiografie";                    // edit (same identity)
const idx = evs.findIndex(e => e.title === "Riunione");
evs.splice(idx, 1);                                     // delete
evs.push({ id: crypto.randomUUID(), title: "Palestra", date: "10/07/2026",
           end_date: "", time: "18:00", color: "#4a7a3a", note: "" });
await saveJson("calendar_events.json", evs);

const out = await exportRova(PWD, ["calendar", "library", "nutrition"]);
fs.writeFileSync("/tmp/interop_js.rova", Buffer.from(out));
console.log("JS export ok:", out.length, "bytes");
