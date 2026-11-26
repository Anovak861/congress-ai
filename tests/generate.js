// Checks for the message builder (docs/generate.js). No browser or packages needed:
//   node tests/generate.js
// Exits with code 1 if any check fails.
const assert = require("assert");
const G = require("../docs/generate.js");
const D = require("../docs/data.json");
const M = require("../docs/messages.json");

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok   " + name); }
  catch (e) { failed++; console.log("FAIL " + name + "\n     " + e.message); }
}

const member = name => D.members.find(m => m.name === name);
const hawley = member("Josh Hawley"), schumer = member("Chuck Schumer");
const ctx = (m, over = {}) => ({
  m, angles: D.angles, policies: { RSI: true, OVS: true, PAUSE: true }, angleIds: [], long: true,
  u: { name: "Pat Lee", city: "Springfield", zip: "", email: "", phone: "", note: "" },
  localLine: "", roleLine: "", callLines: M.callLines, voterStats: M.voterStats, ...over,
});

check("members used below exist", () => { assert(hawley && hawley.party === "R"); assert(schumer && schumer.party === "D"); });

check("speakTime rounds to 15 seconds", () => {
  assert.strictEqual(G.speakTime(70), "about 30 seconds");
  assert.strictEqual(G.speakTime(140), "about 1 minute");
  assert.strictEqual(G.speakTime(175), "about 1 minute 15 seconds");
});

check("call heading is timed from the spoken part only", () => {
  const t = G.build("call", ctx(hawley));
  assert(/^CALL SCRIPT \(about [^)]+\)/.test(t), t.split("\n")[0]);
  assert.strictEqual(G.callHeading(t), t.split("\n")[0]);
});

check("call arguments link: because, Also, Finally", () => {
  const t = G.build("call", ctx(hawley, { angleIds: ["A24", "A01", "A21"] }));
  assert(t.includes("We should do this because AI with growing hacking skills"), "first argument keeps 'AI' capitalised");
  assert(t.includes("\nAlso, people, not machines"));
  assert(t.includes("\nFinally, in the 1970s"));
});

check("short call has no arguments", () => {
  const t = G.build("call", ctx(hawley, { long: false, angleIds: [] }));
  assert(!t.includes("We should do this because"));
});

check("every argument has a one-liner", () => {
  const missing = D.angles.filter(a => !M.callLines[a.id]).map(a => a.id);
  assert.deepStrictEqual(missing, []);
});

check("meeting has four texts", () => {
  const p = G.meetingParts(ctx(schumer));
  for (const k of ["request", "agenda", "leave", "thanks"]) assert(p[k] && p[k].length > 50, k);
});

check("leave-behind polling matches the member's party", () => {
  const r = G.meetingParts(ctx(hawley)).leave, d = G.meetingParts(ctx(schumer)).leave;
  assert(r.includes("What Republican voters think") && r.includes("83% of Republicans"));
  assert(d.includes("What voters think") && !d.includes("Republican voters think"));
});

check("email and phone fill the meeting texts", () => {
  const p = G.meetingParts(ctx(schumer, { u: { name: "Pat Lee", city: "", zip: "", email: "pat@example.com", phone: "555-0100", note: "" } }));
  assert(p.request.includes("You can reach me at pat@example.com or 555-0100."));
  assert(p.leave.includes("pat@example.com\n555-0100"));
  assert(p.thanks.trim().endsWith("555-0100"));
  const blank = G.meetingParts(ctx(schumer));
  assert(blank.request.includes("[your email and phone number]"));
});

check("starting argument comes from the member's own recommended list", () => {
  const ids = new Set(D.angles.map(a => a.id)), own = hawley.angles.filter(id => ids.has(id));
  for (let i = 0; i < 50; i++) {
    const [pick] = G.startAngles(hawley, D.angles, { RSI: true, OVS: true, PAUSE: false }, { count: 1 });
    assert(own.includes(pick), pick + " is not on Hawley's list");
  }
});

check("Republican pause wording stresses a mutual deal", () => {
  const t = G.build("email", ctx(hawley));
  assert(t.includes("verifiable, mutual agreement with China"));
});

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exitCode = failed ? 1 : 0;
