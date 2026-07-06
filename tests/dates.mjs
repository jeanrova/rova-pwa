import "fake-indexeddb/auto";
import fs from "node:fs";
import { JSDOM } from "jsdom";
const html = fs.readFileSync("index.html","utf-8");
const dom = new JSDOM(html,{url:"https://rova.local/",runScripts:"outside-only"});
const { window } = dom;
for (const k of ["document","HTMLElement","HTMLDialogElement","Node"]) globalThis[k]=window[k];
globalThis.window=window;
Object.defineProperty(globalThis,"navigator",{value:window.navigator,configurable:true});
window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
window.HTMLDialogElement.prototype.close=function(){this.open=false;};
const { dbPut } = await import("../js/core.js");
// events in BOTH formats, like a real desktop export might contain
await dbPut("calendar_events.json",[
  {title:"ISO event", date:"2026-07-09", end_date:"", time:"15:30", color:"#1a5fa0", note:""},
  {title:"Slash event", date:"12/07/2026", end_date:"", time:"", color:"#4a7a3a", note:""},
]);
await import("../js/ui.js");
const tick=()=>new Promise(r=>setTimeout(r,30));
await tick();
const $=s=>window.document.querySelector(s);
// go to calendar, July 2026
$('[data-scr="calendar"]').click(); await tick();
// select day 9
[...window.document.querySelectorAll("#cal-days .day")]
  .find(b=>b.textContent==="9"&&!b.classList.contains("out")).click(); await tick();
if(!$("#cal-day-events").textContent.includes("ISO event")) throw new Error("yyyy-mm-dd event NOT shown");
// day 9 and 12 must be marked 'has'
const marked=[...window.document.querySelectorAll("#cal-days .day.has")].map(b=>b.textContent);
if(!marked.includes("9")||!marked.includes("12")) throw new Error("day markers missing: "+marked);
// home upcoming (relative to a fixed 'now' won't include past; just check no crash + parse)
console.log("DATE FIX OK — both yyyy-mm-dd and dd/mm/yyyy events render, days",marked,"marked");
