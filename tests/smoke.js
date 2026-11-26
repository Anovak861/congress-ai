// End-to-end check of the page in a real browser. Needs Node and Playwright:
//   npm i -D playwright && npx playwright install chromium
//   python3 -m http.server 8765 -d docs      (in another terminal)
//   node tests/smoke.js
// Set CHROME=/path/to/chrome to use an installed Chrome instead of Playwright's Chromium.
// Exits with code 1 if any check fails.
const { chromium } = require("playwright");
const URL = process.env.URL || "http://localhost:8765/";

let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log("ok   " + name); }
  catch (e) { failed++; console.log("FAIL " + name + "\n     " + e.message.split("\n")[0]); }
}
const expect = (v, msg) => { if (!v) throw new Error(msg); };

(async () => {
  const b = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["clipboard-read", "clipboard-write"] });
  const p = await ctx.newPage();
  const errors = [], google = [];
  p.on("pageerror", e => errors.push(e.message));
  p.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  p.on("request", r => { if (/googleapis|gstatic/.test(r.url())) google.push(r.url()); });
  await p.goto(URL);
  await p.waitForFunction(() => document.querySelectorAll("#stateSel option").length > 50);

  // Missouri, district 7: two senators (both R) and the representative.
  await p.selectOption("#stateSel", "MO");
  await p.selectOption("#distSel", "7");
  await p.waitForSelector(".card");

  await check("finds three members and opens the first", async () => {
    expect((await p.$$(".card")).length === 3, "expected 3 cards");
    expect(await p.isVisible("#s3"), "step 3 hidden");
    expect((await p.textContent("#out")).startsWith("Dear "), "email doesn't start with Dear");
  });

  await check("message sits beside the options on wide screens", async () => {
    const pos = await p.$eval("#outCol", e => getComputedStyle(e).position);
    expect(pos === "sticky", "message column is " + pos);
  });

  await check("record viewer names the member", async () => {
    expect(/record on AI/.test(await p.textContent("#recSum")), "no record summary");
  });

  await check("edits survive an option change, and Rewrite resets them", async () => {
    await p.click("#out"); await p.keyboard.press("End"); await p.keyboard.type(" MY EDIT");
    await p.check("#polBox input[data-p=WHISTLE]");
    expect((await p.textContent("#out")).includes("MY EDIT"), "edit lost after option change");
    expect(await p.isVisible("#note-out"), "no 'you've edited this' note");
    p.once("dialog", d => d.accept());
    await p.click("[data-rewrite=out]");
    expect(!(await p.textContent("#out")).includes("MY EDIT"), "Rewrite kept the edit");
  });

  await check("long call script is timed and links its arguments", async () => {
    await p.click("label:has(input[value=call])"); await p.click("label:has(input[value=long])");
    const t = await p.textContent("#out");
    expect(/^CALL SCRIPT \(about /.test(t), "no timed heading");
    expect(t.includes("We should do this because"), "no linked arguments");
    expect(await p.isVisible("#qa"), "no staff questions box");
  });

  await check("clicking an argument's name previews it without ticking it", async () => {
    const box = await p.$("#angBox label input");
    const before = await box.isChecked();
    await p.click("#angBox label span");
    expect(await p.isVisible("#angTip"), "no preview");
    expect((await box.isChecked()) === before, "checkbox changed");
  });

  await check("meeting shows four texts, tips and party polling", async () => {
    await p.click("label:has(input[value=meeting])");
    expect(!(await p.isVisible("#lenBox")), "Length shown for meetings");
    for (const id of ["mReq", "mAgenda", "mLeave", "mThanks"]) expect((await p.textContent("#" + id)).length > 50, id + " empty");
    expect((await p.textContent("#mLeave")).includes("What Republican voters think"), "no Republican polling for a Republican");
    expect((await p.textContent("#qa")).includes("Any meeting"), "no meeting questions");
  });

  await check("copying marks the member done and offers the next one", async () => {
    await p.click("button.copy[data-copy=mReq]");
    expect((await p.textContent(".card[aria-pressed=true]")).includes("Copied"), "card not marked");
    const next = await p.textContent("#nextBar [data-next]");
    await p.click("#nextBar [data-next]");
    const now = await p.textContent(".card[aria-pressed=true] .nm");
    expect(next.includes(now), `next button said "${next}" but selected ${now}`);
    expect(await p.isChecked("#polBox input[data-p=WHISTLE]"), "changed asks didn't carry over");
  });

  await check("seat without a member is disabled with a reason", async () => {
    await p.selectOption("#stateSel", "LA"); await p.selectOption("#distSel", "5");
    const card = await p.$(".card:disabled");
    expect(card, "no disabled card for LA-5");
    expect(/not in yet|not filled/.test(await card.textContent()), "no reason shown");
  });

  await check("no horizontal overflow on a phone", async () => {
    await p.setViewportSize({ width: 375, height: 812 });
    expect(!(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "page scrolls sideways");
  });

  await check("fonts are self-hosted (no requests to Google)", async () => { expect(!google.length, google.join(", ")); });
  await check("no page errors", async () => { expect(!errors.length, errors.join(" | ")); });

  await b.close();
  console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
  process.exitCode = failed ? 1 : 0;
})();
