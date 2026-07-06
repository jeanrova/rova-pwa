import "fake-indexeddb/auto";
import fs from "node:fs";
import { JSDOM } from "jsdom";

const html = fs.readFileSync("index.html", "utf-8");
const dom = new JSDOM(html, { url: "https://rova.local/", runScripts: "outside-only" });
const { window } = dom;
for (const k of ["document","HTMLElement","HTMLDialogElement","Node"])
  globalThis[k] = window[k];
Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
globalThis.window = window;
globalThis.alert = m => { globalThis._lastAlert = m; };
// dialog polyfill with scripted answers
const answers = [];
window.HTMLDialogElement.prototype.showModal = function(){
  this.open = true;
  const a = answers.shift();
  if (a){ setTimeout(() => {
    if (a.fill) for (const [n,v] of Object.entries(a.fill)){
      const inp = this.querySelector(`[name="${n}"],#${n}`); if (inp) inp.value = v;
    }
    this.returnValue = a.value;
    if (a.click) this.querySelector(a.click).click();
    else this.dispatchEvent(new window.Event("close"));
    this.open = false;
  }, 0); }
};
window.HTMLDialogElement.prototype.close = function(v){
  if (v !== undefined) this.returnValue = v;
  this.open = false; this.dispatchEvent(new window.Event("close"));
};

const { saveJson, dbGet, dbPut } = await import("../js/core.js");
// seed: events, foods, snapshot, medicines
await saveJson("calendar_events.json",
  [{ title:"Dentista", date:"09/07/2026", end_date:"", time:"15:30", color:"#1a5fa0", note:"" }]);
await dbPut("nutrizionale.json", [{ nome:"Riso integrale", kcal:350 },{ nome:"Pollo", kcal:165 }]);
await dbPut("daily_ref.json", { kcal:2200 });
await dbPut("mobile_snapshot.json", { patrimonio_all:70131.35, patrimonio_eur:50000, updated_at:"2026-07-03T10:00:00" });
await dbPut("medicines.json", [{ nome:"Vitamina D", dose:"1000 UI", frequenza:"1/die" }]);
await dbPut("recurrences.json", [{ title:"Backup mensile" }]);

await import("../js/ui.js");
const tick = () => new Promise(r => setTimeout(r, 30));
await tick();

// HOME
const $ = s => window.document.querySelector(s);
if (!$("#patri-value").textContent.includes("70.131")) throw new Error("patrimonio card");
if (!$("#qt-list").textContent.includes("Backup mensile")) throw new Error("quick tasks");
if (!$("#home-events").textContent.includes("Dentista")) throw new Error("home events");
console.log("UI home OK (patrimonio 70.131 dal desktop, quick tasks, eventi)");

// CALENDAR: navigate, select day 9, event visible; edit via dialog
window.document.querySelector('[data-scr="calendar"]').click(); await tick();
const dayBtns = [...window.document.querySelectorAll("#cal-days .day")];
dayBtns.find(b => b.textContent === "9" && !b.classList.contains("out")).click(); await tick();
if (!$("#cal-day-events").textContent.includes("Dentista")) throw new Error("day events");
answers.push({ value:"ok", fill:{ note:"portare radiografie" } });
$("#cal-day-events .evcard").click(); await tick(); await tick();
let evs = await dbGet("calendar_events.json");
if (evs[0].note !== "portare radiografie") throw new Error("event edit not saved");
// add new event via FAB
answers.push({ value:"ok", fill:{ title:"Palestra", date:"10/07/2026", time:"18:00" } });
$("#ev-add").click(); await tick(); await tick();
evs = await dbGet("calendar_events.json");
if (evs.length !== 2 || !evs[1].id) throw new Error("event add / uuid");
console.log("UI calendar OK (selezione giorno, edit, add con uuid)");

// DIARIO: search + add food
window.document.querySelector('[data-scr="diario"]').click(); await tick();
$("#food-search").value = "riso";
$("#food-search").dispatchEvent(new window.Event("input")); await tick();
if (!$("#food-results").textContent.includes("Riso integrale")) throw new Error("food search");
answers.push({ value:"ok" });
$("#food-results .food-hit").click(); await tick(); await tick(); await tick();
const dia = await dbGet("diario_alimentare.json");
if (!dia || dia[0].ricetta.ingredienti[0].alimento !== "Riso integrale") throw new Error("diario add");
if (!$("#dia-kcal").textContent.includes("350")) throw new Error("kcal calc: " + $("#dia-kcal").textContent);
console.log("UI diario OK (ricerca, log, 350 kcal calcolate)");

// CONSULTA
window.document.querySelector('[data-scr="consulta"]').click(); await tick();
if (!$("#con-med").textContent.includes("Vitamina D")) throw new Error("consulta med");
console.log("UI consulta OK");

// CHAMBER: import the real Python-made .rova through the UI path
window.document.querySelector('[data-scr="chamber"]').click(); await tick();
const bytes = fs.readFileSync("/tmp/interop_py.rova");
const file = new window.File([bytes], "interop_py.rova");
Object.defineProperty(file, "arrayBuffer", { value: async () =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
answers.push({ value:"ok", fill:{ "pwd-input":"interop-pass" } });
const inp = $("#ch-file");
Object.defineProperty(inp, "files", { value:[file], configurable:true });
inp.dispatchEvent(new window.Event("change")); 
await new Promise(r => setTimeout(r, 800));
if (!/Import completato/.test(globalThis._lastAlert||"")) throw new Error("import alert: "+globalThis._lastAlert);
const lib = await dbGet("library.json");
if (!lib || lib[0].title !== "EN 1993-1-2") throw new Error("import content");
console.log("UI chamber OK (import .rova reale dal desktop, via file input + dialog password)");

console.log("\nPWA UI: all screen tests passed");
