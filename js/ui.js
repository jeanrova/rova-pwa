/* ROVA PWA — ui.js: router + the five screens */
import { dbGet, saveJson, uuid, nowIso } from "./core.js";
import { MODULES, exportRova, readRova, mergeRova } from "./chamber.js";

const $ = s => document.querySelector(s);
const el = (t, cls, txt) => { const e = document.createElement(t);
  if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
const MESI = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
              "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const dmy = d => `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
const parseDmy = s => { const p = (s||"").split("/");
  return p.length === 3 ? new Date(+p[2], +p[1]-1, +p[0]) : null; };
const fmtEur = v => v==null ? "—" :
  v.toLocaleString("it-IT",{maximumFractionDigits:0}) + " €";

/* ── router ──────────────────────────────────────────────────────────── */
const SCREENS = ["home","calendar","diario","consulta","chamber"];
const RENDER = { home: renderHome, calendar: renderCalendar,
                 diario: renderDiario, consulta: renderConsulta, chamber: renderChamber };
document.querySelectorAll(".tab").forEach(b => b.onclick = () => show(b.dataset.scr));
function show(name){
  SCREENS.forEach(s => $("#scr-"+s).classList.toggle("hidden", s !== name));
  document.querySelectorAll(".tab").forEach(b =>
    b.classList.toggle("active", b.dataset.scr === name));
  RENDER[name]();
}
$("#topdate").textContent = new Date().toLocaleDateString("it-IT",
  { weekday:"short", day:"numeric", month:"short" });

/* ── HOME ────────────────────────────────────────────────────────────── */
async function renderHome(){
  const snap = await dbGet("mobile_snapshot.json");
  const card = $("#patri-card");
  if (snap && snap.patrimonio_all != null){
    card.classList.remove("hidden");
    $("#patri-value").textContent = fmtEur(snap.patrimonio_all);
    const parts = [];
    if (snap.patrimonio_eur != null) parts.push("EUR " + fmtEur(snap.patrimonio_eur));
    if (snap.patrimonio_brl != null)
      parts.push("BRL " + snap.patrimonio_brl.toLocaleString("it-IT",{maximumFractionDigits:0}) + " R$");
    $("#patri-sub").textContent = parts.join(" · ") +
      (snap.updated_at ? " · " + snap.updated_at.slice(0,10) : "");
  } else card.classList.add("hidden");

  // quick tasks: recurrences + birthdays this month, done-state in quick_tasks.json
  const box = $("#qt-list"); box.innerHTML = "";
  const monthKey = new Date().toISOString().slice(0,7);
  const qt = (await dbGet("quick_tasks.json")) || {};
  const done = qt[monthKey] || {};
  const items = [];
  for (const r of (await dbGet("recurrences.json")) || [])
    items.push(["rec_" + (r.title || ""), r.title || ""]);
  const now = new Date();
  for (const b of (await dbGet("birthdays.json")) || [])
    if (b.month === now.getMonth()+1)
      items.push(["bd_" + (b.name || b.nome || ""),
                  `Compleanno ${b.name || b.nome || ""} (${b.day}/${b.month})`]);
  if (!items.length) box.append(el("div","muted","Nessuna quick task — importa da Chamber."));
  for (const [key, label] of items){
    const row = el("label","qt" + (done[key] ? " done" : ""));
    const cb = el("input"); cb.type = "checkbox"; cb.checked = !!done[key];
    cb.onchange = async () => {
      const q = (await dbGet("quick_tasks.json")) || {};
      (q[monthKey] ||= {})[key] = cb.checked;
      await saveJson("quick_tasks.json", q);
      renderHome();
    };
    row.append(cb, el("span", "", label));
    box.append(row);
  }

  // prossimi eventi (14 giorni)
  const evbox = $("#home-events"); evbox.innerHTML = "";
  const evs = ((await dbGet("calendar_events.json")) || [])
    .map(e => [parseDmy(e.date), e]).filter(([d]) => d)
    .filter(([d]) => d >= new Date(now.getFullYear(), now.getMonth(), now.getDate())
                  && d - now < 15*864e5)
    .sort((a,b) => a[0]-b[0]).slice(0,6);
  if (!evs.length) evbox.append(el("div","muted","Nessun evento nei prossimi 14 giorni."));
  for (const [d, e] of evs){
    const row = el("div","evrow");
    row.append(el("b","", d.toLocaleDateString("it-IT",{day:"numeric",month:"short"})),
               el("span","", e.title + (e.time ? " · " + e.time : "")));
    evbox.append(row);
  }
}

/* ── CALENDARIO ──────────────────────────────────────────────────────── */
let calCur = new Date(); let calSel = new Date();
$("#cal-prev").onclick = () => { calCur.setMonth(calCur.getMonth()-1); renderCalendar(); };
$("#cal-next").onclick = () => { calCur.setMonth(calCur.getMonth()+1); renderCalendar(); };
$("#ev-add").onclick = () => eventDialog(null);

async function renderCalendar(){
  $("#cal-title").textContent = `${MESI[calCur.getMonth()]} ${calCur.getFullYear()}`;
  const dow = $("#cal-dow"); dow.innerHTML = "";
  for (const d of ["L","M","M","G","V","S","D"]) dow.append(el("span","",d));
  const events = (await dbGet("calendar_events.json")) || [];
  const byDay = {};
  events.forEach((e,i) => { const d = parseDmy(e.date);
    if (d) (byDay[dmy(d)] ||= []).push(i); });

  const grid = $("#cal-days"); grid.innerHTML = "";
  const first = new Date(calCur.getFullYear(), calCur.getMonth(), 1);
  const start = new Date(first); start.setDate(1 - ((first.getDay()+6)%7));
  const today = dmy(new Date());
  for (let i = 0; i < 42; i++){
    const d = new Date(start); d.setDate(start.getDate()+i);
    const b = el("button","day", d.getDate());
    if (d.getMonth() !== calCur.getMonth()) b.classList.add("out");
    if (dmy(d) === today) b.classList.add("today");
    if (dmy(d) === dmy(calSel)) b.classList.add("sel");
    if (byDay[dmy(d)]) b.classList.add("has");
    b.onclick = () => { calSel = d; renderCalendar(); };
    grid.append(b);
  }
  $("#cal-day-title").textContent =
    calSel.toLocaleDateString("it-IT",{weekday:"long", day:"numeric", month:"long"});
  const box = $("#cal-day-events"); box.innerHTML = "";
  for (const i of byDay[dmy(calSel)] || []){
    const e = events[i];
    const c = el("div","evcard");
    c.style.borderLeftColor = e.color || "#4a7a3a";
    c.append(el("b","", e.title),
             el("span","", [e.time, e.note].filter(Boolean).join(" · ") || "evento"));
    c.onclick = () => eventDialog(i);
    box.append(c);
  }
  if (!(byDay[dmy(calSel)] || []).length)
    box.append(el("div","muted","Nessun evento."));
}

async function eventDialog(idx){
  const dlg = $("#dlg-event"), f = $("#ev-form");
  const events = (await dbGet("calendar_events.json")) || [];
  const e = idx !== null ? events[idx] : null;
  $("#ev-dlg-title").textContent = e ? "Modifica evento" : "Evento";
  $("#ev-del").classList.toggle("hidden", !e);
  const F = f.elements;
  F.title.value = e?.title || ""; F.date.value = e?.date || dmy(calSel);
  F.end_date.value = e?.end_date || ""; F.time.value = e?.time || "";
  F.color.value = e?.color || "#4a7a3a"; F.note.value = e?.note || "";
  dlg.returnValue = ""; dlg.showModal();
  dlg.addEventListener("close", async function h(){
    dlg.removeEventListener("close", h);
    if (dlg.returnValue === "ok" && F.title.value.trim()){
      const rec = { id: e?.id ?? uuid(), title: F.title.value.trim(),
        date: F.date.value.trim(), end_date: F.end_date.value.trim(),
        time: F.time.value.trim(), color: F.color.value, note: F.note.value.trim() };
      if (e) events[idx] = { ...e, ...rec };
      else events.push(rec);
      await saveJson("calendar_events.json", events);
    } else if (dlg.returnValue === "del" && e){
      events.splice(idx, 1);
      await saveJson("calendar_events.json", events);
    }
    renderCalendar(); renderHome();
  });
}

/* ── DIARIO ──────────────────────────────────────────────────────────── */
let foodDb = null;
async function loadFoods(){
  if (foodDb) return foodDb;
  foodDb = [];
  for (const f of ["nutrizionale.json","industrialized.json"])
    for (const r of (await dbGet(f)) || [])
      foodDb.push(r);
  return foodDb;
}
const foodName = r => r.nome || r.name || r.alimento || "";
const foodKcal = r => parseFloat(r.kcal ?? r.calorie ?? r.energia ?? 0) || 0;

async function renderDiario(){
  const today = dmy(new Date());
  $("#dia-date").textContent = "Diario · oggi";
  const ref = (await dbGet("daily_ref.json")) || {};
  const target = parseFloat(ref.kcal ?? 2200) || 2200;
  const diario = (await dbGet("diario_alimentare.json")) || [];
  const rows = diario.filter(r => r.data === today);
  const foods = await loadFoods();
  const fmap = {}; foods.forEach(r => fmap[foodName(r)] = r);
  let kcal = 0;
  const box = $("#dia-list"); box.innerHTML = "";
  for (const r of rows){
    let rk = 0; const names = [];
    for (const ing of r.ricetta?.ingredienti || []){
      names.push(ing.alimento);
      const fr = fmap[ing.alimento];
      if (fr) rk += foodKcal(fr) * (parseFloat(ing.qty)||0) / 100;
    }
    kcal += rk;
    const row = el("div","dia-row");
    const left = el("div");
    left.append(el("div","", r.momento || "Pasto"),
                Object.assign(el("small"), { textContent: names.join(", ") }));
    row.append(left, el("b","", rk ? String(Math.round(rk)) : "—"));
    box.append(row);
  }
  if (!rows.length) box.append(el("div","muted","Nessun pasto registrato oggi."));
  $("#dia-kcal").textContent = `${Math.round(kcal)} / ${target} kcal`;
  $("#kbar-fill").style.width = Math.min(100, kcal/target*100) + "%";
}

$("#food-search").oninput = async ev => {
  const q = ev.target.value.trim().toLowerCase();
  const box = $("#food-results"); box.innerHTML = "";
  if (q.length < 2) return;
  const foods = await loadFoods();
  for (const r of foods.filter(r => foodName(r).toLowerCase().includes(q)).slice(0,8)){
    const hit = el("div","food-hit");
    hit.append(el("span","",foodName(r)),
               el("span","muted", foodKcal(r) ? Math.round(foodKcal(r)) + " kcal/100" : ""));
    hit.onclick = () => foodDialog(r);
    box.append(hit);
  }
  if (!box.children.length) box.append(el("div","muted","Nessun risultato nel database cibi."));
};

function foodDialog(food){
  const dlg = $("#dlg-food"), f = $("#food-form");
  $("#food-name").textContent = foodName(food);
  dlg.returnValue = ""; dlg.showModal();
  dlg.addEventListener("close", async function h(){
    dlg.removeEventListener("close", h);
    if (dlg.returnValue !== "ok") return;
    const diario = (await dbGet("diario_alimentare.json")) || [];
    diario.push({ id: uuid(), data: dmy(new Date()), momento: f.elements.momento.value,
      ricetta: { ingredienti: [{ alimento: foodName(food),
        qty: parseFloat(f.elements.qty.value)||100, mode: "g", source: "pwa" }] } });
    await saveJson("diario_alimentare.json", diario);
    $("#food-search").value = ""; $("#food-results").innerHTML = "";
    renderDiario();
  });
}

/* ── CONSULTA (read-only) ────────────────────────────────────────────── */
async function renderConsulta(){
  const put = (sel, rows) => { const b = $(sel); b.innerHTML = "";
    if (!rows.length){ b.textContent = "— importa da Chamber"; return; }
    b.classList.remove("muted");
    for (const [a, c] of rows){ const r = el("div","evrow");
      r.append(el("b","",a), el("span","",c)); b.append(r); } };
  put("#con-med", ((await dbGet("medicines.json")) || []).slice(0,8)
    .map(m => [m.nome || m.name || "?", [m.dose, m.frequenza || m.freq].filter(Boolean).join(" · ")]));
  const blood = ((await dbGet("blood_exams.json")) || []).slice(-1)[0];
  put("#con-blood", blood ? Object.entries(blood)
      .filter(([k,v]) => !k.startsWith("_") && typeof v === "number").slice(0,8)
      .map(([k,v]) => [k, String(v)]) : []);
  put("#con-pro", ((await dbGet("professional_projects.json")) || []).slice(0,8)
    .map(p => [p.deadline || p.scadenza || "", p.title || p.titolo || p.nome || "?"]));
  put("#con-fin", ((await dbGet("food4rova.json")) || []).slice(-8).reverse()
    .map(t => [t.data || "", `${t.descrizione || ""} ${t.importo ?? ""} ${t.valuta || ""}`]));
}

/* ── CHAMBER ─────────────────────────────────────────────────────────── */
async function renderChamber(){
  const st = (await dbGet("chamber_ui_state.json")) || {};
  $("#ch-last").textContent = st.last || "mai";
  $("#ch-stats").textContent = st.stats || "";
  const box = $("#ch-mods");
  if (!box.children.length)
    for (const m of Object.keys(MODULES)){
      const l = el("label"); const c = el("input");
      c.type = "checkbox"; c.checked = ["calendar","nutrition","home"].includes(m);
      c.dataset.mod = m; l.append(c, document.createTextNode(m));
      box.append(l);
    }
}

function askPassword(title){
  return new Promise(res => {
    const dlg = $("#dlg-pwd");
    $("#pwd-title").textContent = title; $("#pwd-input").value = ""; $("#pwd-err").textContent = "";
    dlg.returnValue = ""; dlg.showModal();
    dlg.addEventListener("close", function h(){
      dlg.removeEventListener("close", h);
      res(dlg.returnValue === "ok" ? $("#pwd-input").value : null);
    });
  });
}
function conflictResolver(fname, key, local, imp){
  return new Promise(res => {
    const dlg = $("#dlg-conflict");
    $("#cf-key").textContent = `${fname} · ${key}`;
    const strip = r => JSON.stringify(Object.fromEntries(
      Object.entries(r).filter(([k]) => !k.startsWith("_"))), null, 1);
    $("#cf-local").textContent = strip(local);  $("#cf-local-m").textContent = local._modified_at || "";
    $("#cf-import").textContent = strip(imp);   $("#cf-import-m").textContent = imp._modified_at || "";
    const done = v => { dlg.close(); res(v); };
    $("#cf-keep").onclick = () => done("local");
    $("#cf-take").onclick = () => done("import");
    $("#cf-auto").onclick = () => done(null);
    dlg.showModal();
  });
}

$("#ch-import").onclick = () => $("#ch-file").click();
$("#ch-file").onchange = async ev => {
  const file = ev.target.files[0]; ev.target.value = "";
  if (!file) return;
  const pwd = await askPassword("Master password");
  if (pwd === null) return;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { manifest, payload } = await readRova(bytes, pwd);
    const stats = await mergeRova(manifest, payload, { resolver: conflictResolver });
    const line = `+${stats.added} ~${stats.updated} −${stats.deleted} · conflitti ${stats.conflicts}`;
    const { dbPut } = await import("./core.js");
    await dbPut("chamber_ui_state.json",
      { last: new Date().toLocaleString("it-IT"), stats: `${file.name} · ${line}` });
    alert("Import completato:\n" + line);
    foodDb = null;
    renderChamber(); renderHome();
  } catch (e){ alert(e.message); }
};

$("#ch-export").onclick = async () => {
  const mods = [...document.querySelectorAll("#ch-mods input:checked")].map(c => c.dataset.mod);
  if (!mods.length) return alert("Seleziona almeno un modulo.");
  const pwd = await askPassword("Master password per l'export");
  if (pwd === null) return;
  if (pwd.length < 4) return alert("Password troppo corta.");
  try {
    const bytes = await exportRova(pwd, mods);
    const name = "rova_export_" + new Date().toISOString().slice(0,16)
      .replace(/[-:T]/g, "").slice(0,13).replace(/(\d{8})/, "$1_") + ".rova";
    const blob = new Blob([bytes], { type: "application/octet-stream" });
    if (navigator.share && navigator.canShare?.({ files: [new File([blob], name)] }))
      await navigator.share({ files: [new File([blob], name)], title: name });
    else {
      const a = el("a"); a.href = URL.createObjectURL(blob); a.download = name;
      a.click(); URL.revokeObjectURL(a.href);
    }
    const { dbPut } = await import("./core.js");
    await dbPut("chamber_ui_state.json",
      { last: new Date().toLocaleString("it-IT"), stats: "export " + name });
    renderChamber();
  } catch (e){ alert(e.message); }
};

/* boot */
show("home");
