{
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const G = window.Gen;

// States whose House maps changed for the 2026 election. The Census geocoder may still return the old district there.
const REDRAWN = new Set(["CA", "TX", "MO", "NC", "OH", "UT"]);
const FIPS = {"01":"AL","02":"AK","04":"AZ","05":"AR","06":"CA","08":"CO","09":"CT","10":"DE","12":"FL","13":"GA","15":"HI","16":"ID","17":"IL","18":"IN","19":"IA","20":"KS","21":"KY","22":"LA","23":"ME","24":"MD","25":"MA","26":"MI","27":"MN","28":"MS","29":"MO","30":"MT","31":"NE","32":"NV","33":"NH","34":"NJ","35":"NM","36":"NY","37":"NC","38":"ND","39":"OH","40":"OK","41":"OR","42":"PA","44":"RI","45":"SC","46":"SD","47":"TN","48":"TX","49":"UT","50":"VT","51":"VA","53":"WA","54":"WV","55":"WI","56":"WY"};

let D = null;
const S = { state: "", district: null, members: [], sel: null, kind: "email", long: false, policies: {}, angles: new Set(), userEdited: false };

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem("cc_" + k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem("cc_" + k, JSON.stringify(v)); } catch {} },
};

// ---------- Step 1: find members ----------
function fillStates() {
  const states = Object.keys(G.STATE_NAMES).sort((a, b) => G.STATE_NAMES[a].localeCompare(G.STATE_NAMES[b]));
  $("stateSel").innerHTML = '<option value="">State</option>' + states.map(s => `<option value="${s}">${esc(G.STATE_NAMES[s])}</option>`).join("");
}
function fillDistricts(st) {
  const ds = [...new Set(D.members.filter(m => m.chamber === "House" && m.state === st).map(m => m.district))].sort((a, b) => a - b);
  const sel = $("distSel");
  sel.disabled = !ds.length;
  sel.innerHTML = '<option value="">District</option>' + ds.map(d => `<option value="${d}">${ds.length === 1 ? "At-large" : "District " + d}</option>`).join("");
  if (ds.length === 1) sel.value = String(ds[0]);
}
function setMsg(t, warn) { $("findMsg").textContent = t; $("findMsg").className = "msg" + (warn ? " warn" : ""); }

const STATE_CODE = Object.fromEntries(Object.entries(G.STATE_NAMES).map(([k, v]) => [v, k]));
STATE_CODE["District of Columbia"] = "DC";

// Census geocoder supports JSONP, which works from a plain static host without an API key.
const CENSUS = "https://geocoding.geo.census.gov/geocoder/geographies/";
const CENSUS_Q = "benchmark=Public_AR_Current&vintage=Current_Current&layers=all";
let jsonpN = 0;
function jsonp(url, ms = 12000) {
  return new Promise((resolve, reject) => {
    const cb = "cg" + Date.now() + "_" + jsonpN++;
    const s = document.createElement("script");
    // After a timeout the script may still arrive, so leave a no-op callback behind instead of deleting it.
    const done = () => { clearTimeout(timer); window[cb] = () => { delete window[cb]; }; s.remove(); };
    const timer = setTimeout(() => { done(); reject(new Error("timeout")); }, ms);
    window[cb] = data => { done(); resolve(data); };
    s.onerror = () => { done(); reject(new Error("blocked")); };
    s.src = url + "&format=jsonp&callback=" + cb;
    document.head.appendChild(s);
  });
}
function readDistrict(g = {}) {
  const cdKey = Object.keys(g).filter(k => /Congressional District/i.test(k)).sort().pop();
  const cd = cdKey && g[cdKey][0];
  const stFips = cd?.STATE || g.States?.[0]?.STATE;
  const state = g.States?.[0]?.STUSAB || FIPS[stFips];
  const field = cd && Object.keys(cd).find(k => /^CD\d+$/.test(k));
  let district = field ? parseInt(cd[field], 10) : null;
  if (district === 0) district = 1; // at-large
  return { state, district, layer: cdKey };
}
async function censusAddress(address) {
  const d = await jsonp(`${CENSUS}onelineaddress?${CENSUS_Q}&address=${encodeURIComponent(address)}`);
  const m = d?.result?.addressMatches?.[0];
  return m ? { ...readDistrict(m.geographies), matched: m.matchedAddress } : null;
}
async function censusPoint(lon, lat) {
  const d = await jsonp(`${CENSUS}coordinates?${CENSUS_Q}&x=${lon}&y=${lat}`);
  return d?.result?.geographies ? readDistrict(d.result.geographies) : null;
}

// ---------- address suggestions (Photon, built on OpenStreetMap: free, no key, CORS-enabled) ----------
const PHOTON = "https://photon.komoot.io/api/?limit=12&lang=en&layer=house&layer=street&bbox=-179.2,17.8,-66.9,71.5&q=";
const AC = { items: [], active: -1, chosen: null, seq: 0, timer: 0, ctrl: null };

function toSuggestion(f, typedNum) {
  const p = f.properties || {};
  const st = p.countrycode === "US" && STATE_CODE[p.state];
  if (!st || !f.geometry) return null;
  let line1 = [p.housenumber, p.street || p.name].filter(Boolean).join(" ");
  // OSM often has the street but not the house number; keep the number the user typed so the lookup stays precise.
  if (!p.housenumber && typedNum) line1 = typedNum + " " + line1;
  const place = p.city || p.town || p.village || p.district || p.county || "";
  const line2 = [place, [st, p.postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const [lon, lat] = f.geometry.coordinates;
  return { line1, line2, label: line1 + ", " + line2, state: st, lon, lat, exact: !!p.housenumber };
}
// Resolves to a list of suggestions, or null if the request failed or a newer one replaced it.
async function suggest(q) {
  const my = ++AC.seq;
  AC.ctrl?.abort();
  const ctrl = AC.ctrl = new AbortController();
  try {
    const d = await (await fetch(PHOTON + encodeURIComponent(q), { signal: ctrl.signal })).json();
    if (my !== AC.seq) return null;
    const num = (q.match(/^\s*(\d+[A-Za-z]?)\b/) || [])[1];
    const seen = new Set();
    return (d.features || []).map(f => toSuggestion(f, num))
      .filter(s => s && !seen.has(s.label) && seen.add(s.label)).slice(0, 6);
  } catch { return null; }
}
function cancelSuggest() { clearTimeout(AC.timer); AC.seq++; AC.ctrl?.abort(); }
function showList(items) {
  AC.items = items; AC.active = -1;
  const ul = $("sugg");
  ul.innerHTML = items.map((s, i) => `<li role="option" id="sugg${i}" data-i="${i}" aria-selected="false"><span>${esc(s.line1)}</span><small>${esc(s.line2)}</small></li>`).join("");
  ul.hidden = !items.length;
  $("addr").setAttribute("aria-expanded", String(!!items.length));
  $("addr").removeAttribute("aria-activedescendant");
}
function closeList() { $("sugg").hidden = true; $("addr").setAttribute("aria-expanded", "false"); $("addr").removeAttribute("aria-activedescendant"); AC.active = -1; }
function highlight(i) {
  const lis = $("sugg").children;
  if (!lis.length) return;
  AC.active = (i + lis.length) % lis.length;
  [...lis].forEach((li, j) => li.setAttribute("aria-selected", String(j === AC.active)));
  lis[AC.active].scrollIntoView({ block: "nearest" });
  $("addr").setAttribute("aria-activedescendant", lis[AC.active].id);
}
function pick(i) {
  const s = AC.items[i]; if (!s) return;
  $("addr").value = s.label; AC.chosen = s;
  closeList(); lookup();
}
function onAddrInput() {
  AC.chosen = null;
  cancelSuggest();
  const q = $("addr").value.trim();
  if (q.length < 4) { showList([]); return; }
  AC.timer = setTimeout(async () => { const l = await suggest(q); if (l) showList(l); }, 250);
}
function onAddrKey(e) {
  const open = !$("sugg").hidden;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    if (!open && AC.items.length && !AC.chosen) { showList(AC.items); }
    if (!$("sugg").hidden) { e.preventDefault(); highlight(AC.active + (e.key === "ArrowDown" ? 1 : AC.active < 0 ? 0 : -1)); }
  } else if (e.key === "Enter" && open && AC.active >= 0) {
    e.preventDefault(); pick(AC.active);
  } else if (e.key === "Escape" && open) {
    e.preventDefault(); closeList();
  }
}

// ---------- lookup ----------
function onFind(e) { e.preventDefault(); cancelSuggest(); closeList(); lookup(); }

async function lookup() {
  const a = $("addr").value.trim();
  if (!a) { setMsg("Type your street address, or choose your state and district below.", true); return; }
  if (!D) { setMsg("Member data hasn't loaded yet. Try again in a moment.", true); return; }
  const s = AC.chosen && AC.chosen.label === a ? AC.chosen : null;
  setMsg("Looking up your district…");
  let r = null, failed = false;
  try {
    // A picked house-level suggestion has the building's coordinates, which pin the district directly.
    if (s?.exact) r = await censusPoint(s.lon, s.lat);
    else {
      r = await censusAddress(a);
      if (!r?.state && s) r = await censusPoint(s.lon, s.lat);
    }
  } catch { failed = true; }

  if (r?.state) return applyMatch(r.state, r.district, s?.label || r.matched || a, a);
  if (s) {
    // Census is unreachable, but the suggestion still tells us the state, so the senators can be shown.
    if (!G.STATE_NAMES[s.state]) { setMsg("This tool covers the 50 states. DC and territories aren't included yet.", true); return; }
    $("stateSel").value = s.state; fillDistricts(s.state);
    choose(s.state, $("distSel").value ? parseInt($("distSel").value, 10) : null);
    setMsg(`Found ${G.STATE_NAMES[s.state]}, but the district lookup isn't responding. Choose your district below.`, true);
    return;
  }
  if (failed) { setMsg("The address lookup isn't available here, so please choose your state and district below.", true); return; }
  // No exact match: offer the closest addresses instead of a dead end.
  const l = await suggest(a);
  if (l?.length) {
    showList(l); $("addr").focus();
    setMsg("Couldn't match that address exactly. Pick yours from the list, or choose your state and district below.", true);
  } else setMsg("Couldn't match that address. Check it, or choose your state and district below.", true);
}

function applyMatch(st, dist, label, typed) {
  if (!G.STATE_NAMES[st]) { setMsg("This tool covers the 50 states. DC and territories aren't included yet.", true); return; }
  store.set("addr", typed);
  $("stateSel").value = st; fillDistricts(st);
  if (dist) $("distSel").value = String(dist);
  if (!dist && $("distSel").value) dist = parseInt($("distSel").value, 10);
  const redrawn = REDRAWN.has(st) ? ` ${G.STATE_NAMES[st]} redrew its House map for 2026, and the Census data may still show your old district, so please check it.` : "";
  setMsg(`Matched ${label}.${redrawn}`, !!redrawn);
  choose(st, dist);
}

function choose(st, dist) {
  S.state = st; S.district = dist;
  const sen = D.members.filter(m => m.chamber === "Senate" && m.state === st);
  const rep = D.members.filter(m => m.chamber === "House" && m.state === st && m.district === dist);
  S.members = [...sen, ...rep];
  renderCards();
  $("s2").classList.remove("hidden");
  const ok = S.members.filter(m => !/TBD/.test(m.name + m.party));
  if (ok.length) selectMember(ok.includes(S.sel) ? S.sel : ok[0]);
}

// ---------- Step 2: cards ----------
function ideoName(tag) {
  return tag.split("+").map(t => D.ideology[t]?.name?.replace(/ \(.*\)$/, "") || t).join(" · ");
}
function memberTitle(m) {
  return m.chamber === "Senate" ? `Senator · ${m.state}` : `Representative · ${m.state}-${m.district}`;
}
function renderCards() {
  $("cards").innerHTML = S.members.map((m, i) => {
    const pending = /TBD/.test(m.party) || /TBD/.test(m.name);
    return `<button type="button" class="card" data-i="${i}" aria-pressed="${m === S.sel}" ${pending ? "disabled" : ""}>
      <span class="nm">${esc(m.name)}</span>
      <span class="meta">${esc(memberTitle(m))} · ${esc(m.party)} · ${esc(m.status)}</span>
      <span class="chips">${pending ? "" : `<span class="chip">${esc(ideoName(m.tag))}</span><span class="chip${m.confidence === "High" ? " hi" : ""}">${m.confidence === "High" ? "Strong AI record" : m.confidence === "Med" ? "Some AI record" : "Little AI record"}</span>`}</span>
      <p>${esc(m.record)}</p></button>`;
  }).join("") || `<p>No members found for that choice.</p>`;
}

// ---------- Step 3: builder ----------
function selectMember(m) {
  S.sel = m;
  S.policies = G.defaultPolicies(m);
  S.angles = new Set(m.angles);
  S.userEdited = false;
  [...$("cards").children].forEach((c, i) => c.setAttribute?.("aria-pressed", String(S.members[i] === m)));
  $("tip").innerHTML = `<b>Suggested approach for ${esc(G.honorific(m))} ${esc(G.lastName(m.name))}:</b> ${esc(m.ask)}.` +
    (D.ideology[m.tag.split("+")[0]]?.avoid ? ` <span style="color:var(--soft)">Avoid: ${esc(D.ideology[m.tag.split("+")[0]].avoid)}.</span>` : "");
  renderPolicies(); renderAngles(); renderLocal();
  $("s3").classList.remove("hidden");
  render();
}
function renderPolicies() {
  const help = { RSI: "Limits on AI that automates its own research and development.", OVS: "Licensed third-party testing, incident reports and an emergency off-switch.", PAUSE: "A verifiable agreement, including China, to pause the most advanced AI." };
  $("polBox").innerHTML = "<legend>What to ask for</legend>" + G.POLICY_ORDER.map(p =>
    `<label><input type="checkbox" data-p="${p}" ${S.policies[p] ? "checked" : ""}><span>${esc(G.POLICY_LABEL[p])}<small>${esc(help[p])}</small></span></label>`).join("") +
    (S.sel.party === "R" && !S.policies.PAUSE ? `<small style="color:var(--soft)">Pause is off by default for Republicans; if you add it, the wording stresses a verifiable deal that binds China.</small>` : "");
}
function renderAngles() {
  const m = S.sel, spec = new Set(m.specific);
  const ordered = [...m.angles, ...D.angles.map(a => a.id).filter(id => !m.angles.includes(id))];
  const byId = Object.fromEntries(D.angles.map(a => [a.id, a]));
  const row = id => {
    const a = byId[id]; if (!a) return "";
    const usable = G.angleUsable(a, S.policies);
    return `<label class="${usable ? "" : "off"}" title="${esc(a.evidence)}"><input type="checkbox" data-a="${id}" ${S.angles.has(id) ? "checked" : ""} ${usable ? "" : "disabled"}><span>${spec.has(id) ? '<span class="star" aria-label="matches their record">★ </span>' : ""}${esc(a.name)}${usable ? "" : "<small>Not used by the asks you picked</small>"}</span></label>`;
  };
  const sug = ordered.filter(id => m.angles.includes(id)), rest = ordered.filter(id => !m.angles.includes(id));
  $("angBox").innerHTML = `<legend>Reasons to include</legend><small style="color:var(--soft)">Pre-checked for a ${esc(ideoName(m.tag).toLowerCase())}. ★ = ties to their own record. Short messages use the first two checked; long ones up to five.</small>` +
    sug.map(row).join("") + `<details><summary style="cursor:pointer;padding:8px 0">More reasons (${rest.length})</summary>${rest.map(row).join("")}</details>`;
}
function renderLocal() {
  const hooks = D.hooks[S.state] || [];
  $("localBox").classList.toggle("hidden", !hooks.length);
  if (hooks.length) { $("localOn").checked = false; $("localText").value = `Here in ${G.STATE_NAMES[S.state]}, ` + hooks[0].text; }
}
function ctx() {
  const order = [...S.sel.angles, ...D.angles.map(a => a.id).filter(id => !S.sel.angles.includes(id))].filter(id => S.angles.has(id));
  return {
    m: S.sel, angles: D.angles, policies: S.policies, angleIds: order, long: S.long,
    u: { name: $("uName").value.trim(), city: $("uCity").value.trim(), zip: $("uZip").value.trim(), note: $("uNote").value.trim() },
    localLine: $("localOn").checked ? $("localText").value.trim() : "",
  };
}
function render() {
  if (!S.sel) return;
  $("out").value = G.build(S.kind, ctx());
  const m = S.sel;
  $("contact").innerHTML = S.kind === "call"
    ? `Capitol switchboard: <b>(202) 224-3121</b>. Ask for ${esc(G.honorific(m))} ${esc(m.name)}.`
    : S.kind === "email"
      ? `Congressional offices take email through a web form on the member's site. Find it via <a href="${m.chamber === "Senate" ? "https://www.senate.gov/senators/senators-contact.htm" : "https://www.house.gov/representatives/find-your-representative"}" target="_blank" rel="noopener">${m.chamber === "Senate" ? "senate.gov" : "house.gov"}</a>, then paste the text (the subject line goes in the subject field).`
      : `Meeting requests go through the scheduling form on the member's website, reachable from <a href="${m.chamber === "Senate" ? "https://www.senate.gov/senators/senators-contact.htm" : "https://www.house.gov/representatives/find-your-representative"}" target="_blank" rel="noopener">${m.chamber === "Senate" ? "senate.gov" : "house.gov"}</a>.`;
}

// ---------- events ----------
function bind() {
  $("findForm").addEventListener("submit", onFind);
  $("addr").addEventListener("input", onAddrInput);
  $("addr").addEventListener("keydown", onAddrKey);
  $("addr").addEventListener("blur", closeList);
  $("sugg").addEventListener("mousedown", e => e.preventDefault()); // keep focus in the input while clicking
  $("sugg").addEventListener("click", e => { const li = e.target.closest("li"); if (li) pick(+li.dataset.i); });
  $("stateSel").addEventListener("change", e => {
    const st = e.target.value; fillDistricts(st); setMsg("");
    if (st) choose(st, $("distSel").value ? parseInt($("distSel").value, 10) : null);
  });
  $("distSel").addEventListener("change", e => { if (S.state) choose(S.state, parseInt(e.target.value, 10)); });
  $("cards").addEventListener("click", e => { const c = e.target.closest(".card"); if (c && !c.disabled) selectMember(S.members[+c.dataset.i]); });
  document.querySelectorAll('input[name=kind]').forEach(r => r.addEventListener("change", e => { S.kind = e.target.value; render(); }));
  document.querySelectorAll('input[name=len]').forEach(r => r.addEventListener("change", e => { S.long = e.target.value === "long"; render(); }));
  $("polBox").addEventListener("change", e => { const p = e.target.dataset.p; if (!p) return; S.policies[p] = e.target.checked; renderPolicies(); renderAngles(); render(); });
  $("angBox").addEventListener("change", e => { const a = e.target.dataset.a; if (!a) return; e.target.checked ? S.angles.add(a) : S.angles.delete(a); render(); });
  ["localOn", "localText"].forEach(id => $(id).addEventListener("input", render));
  ["uName", "uCity", "uZip", "uNote"].forEach(id => $(id).addEventListener("input", () => { store.set(id, $(id).value); render(); }));
  $("copyBtn").addEventListener("click", async () => {
    const b = $("copyBtn");
    try { await navigator.clipboard.writeText($("out").value); b.textContent = "Copied"; }
    catch { $("out").select(); b.textContent = "Press Ctrl/Cmd+C"; }
    setTimeout(() => (b.textContent = "Copy text"), 1800);
  });
}

async function init() {
  fillStates(); bind();
  ["uName", "uCity", "uZip", "uNote"].forEach(id => { const v = store.get(id); if (v) $(id).value = v; });
  const a = store.get("addr"); if (a) $("addr").value = a;
  try { D = await (await fetch("data.json")).json(); }
  catch { setMsg("Couldn't load member data. If you opened this file directly, serve the folder over http instead.", true); }
}
init();
}
