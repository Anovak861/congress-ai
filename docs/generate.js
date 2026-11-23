// Message builder: pure functions, no DOM. Works in the browser (window.Gen) and in Node (require).
(function (root) {
  const POLICY_ORDER = ["RSI", "OVS", "PAUSE"];
  const POLICY_LABEL = {
    RSI: "Restrict recursive self-improvement",
    OVS: "Independent evaluators & oversight",
    PAUSE: "International pause",
  };
  const STATE_NAMES = {AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming"};

  function isRepublican(m) { return m.party === "R"; }

  // What we ask for, worded per policy. Republicans get "verifiable, mutual" framing on the pause.
  function askText(p, m) {
    if (p === "RSI") return "support legislation restricting recursive self-improvement (AI systems that automate their own research and development) until it can be shown to be safe";
    if (p === "OVS") return "require independent, licensed evaluators to test the most powerful AI systems, with incident reporting and a working emergency shutdown";
    return isRepublican(m)
      ? "push for a verifiable, mutual agreement with China and other AI powers to pause the most advanced AI development while safety work catches up"
      : "push for a verifiable international agreement, including China, to pause the most advanced AI development while safety work catches up";
  }
  function askShort(p) {
    return { RSI: "limits on AI that improves itself", OVS: "independent safety testing of frontier AI", PAUSE: "a verifiable international pause on the most advanced AI" }[p];
  }

  function lastName(name) {
    const parts = name.replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(w => !/^(Jr\.?|Sr\.?|II|III|IV)$/.test(w));
    return parts[parts.length - 1] || name;
  }
  function honorific(m) { return m.chamber === "Senate" ? "Senator" : "Representative"; }
  function shortHon(m) { return m.chamber === "Senate" ? "Senator" : "Rep."; }
  function listJoin(xs) {
    if (xs.length <= 1) return xs.join("");
    if (xs.length === 2) return xs[0] + " and " + xs[1];
    return xs.slice(0, -1).join(", ") + ", and " + xs[xs.length - 1];
  }

  // Ally = documented record in favour of safeguards, no record of blocking them.
  function isAlly(m) {
    const txt = (m.record || "") + " " + (m.stance || "");
    return m.confidence === "High" && !/blocked|opposed|rejected|championed the 2025|industry-backed|innovation\/preemption/i.test(txt);
  }

  // Default policy boxes for a member.
  function defaultPolicies(m) {
    const p = { RSI: true, OVS: true, PAUSE: true };
    if (isRepublican(m) && !/PROG/.test(m.tag)) p.PAUSE = false;
    return p;
  }

  // Pick the script line an angle should contribute, given the chosen policies.
  function angleLine(angle, policies) {
    for (const p of POLICY_ORDER) {
      if (policies[p] && angle.policies.includes(p) && angle.lines[p]) return { policy: p, text: angle.lines[p] };
    }
    return null;
  }
  function angleUsable(angle, policies) { return !!angleLine(angle, policies); }

  function pickLines(angles, chosenIds, policies, n) {
    const byId = Object.fromEntries(angles.map(a => [a.id, a]));
    const out = [];
    for (const id of chosenIds) {
      const a = byId[id]; if (!a) continue;
      const l = angleLine(a, policies); if (l && !out.some(o => o.text === l.text)) out.push({ id, name: a.name, ...l });
      if (n && out.length >= n) break;
    }
    return out;
  }

  // Which reasons start checked: up to cfg.maxRecord that tie to the member's own record,
  // then the group's list (RELC overlay takes the last slot), then the member's other defaults.
  function startAngles(m, angles, policies, cfg) {
    const byId = Object.fromEntries(angles.map(a => [a.id, a]));
    const ok = id => byId[id] && angleUsable(byId[id], policies);
    const out = [];
    for (const id of m.specific || []) if (out.length < cfg.maxRecord && ok(id) && !out.includes(id)) out.push(id);
    const [base, ...over] = (m.tag || "").split("+");
    let list = [...(cfg.groups[base] || [])];
    if (over.includes("RELC") && cfg.groups.RELC) list = [...list.slice(0, cfg.count - 1), ...cfg.groups.RELC, ...list.slice(cfg.count - 1)];
    for (const id of [...list, ...(m.angles || [])]) {
      if (out.length >= cfg.count) break;
      if (ok(id) && !out.includes(id)) out.push(id);
    }
    return out;
  }

  // Role sentences are written to the member ("you"); call scripts speak to staff about them.
  function aboutMember(line, hon) {
    const verbs = { are: "is", know: "knows", decide: "decides", can: "can", would: "would", see: "sees", have: "has" };
    let done = false;
    return line.replace(/\byour\b|\byou (are|know|decide|can|would|see|have)\b/g, (w, v) => {
      if (done) return v ? "they " + v : "their";
      done = true;
      return v ? hon + " " + verbs[v] : hon + "'s";
    });
  }

  function who(u, m) {
    const name = u.name || "[Your name]";
    const place = [u.city, STATE_NAMES[m.state] || m.state].filter(Boolean).join(", ");
    const zip = u.zip ? " " + u.zip : "";
    return { name, place: (place || "[your town]") + zip };
  }

  function chosenPolicies(policies) { return POLICY_ORDER.filter(p => policies[p]); }

  // The subject goes in its own box on the page, so it is never pasted into the message body.
  function emailSubject(ctx) {
    const P = chosenPolicies(ctx.policies);
    const s = "Constituent request: " + (P.length ? listJoin(P.map(askShort)) : "AI safety");
    return s;
  }

  function buildEmail(ctx) {
    const { m, u, policies, angleIds, angles, long, localLine } = ctx;
    const P = chosenPolicies(policies);
    const w = who(u, m);
    const lines = pickLines(angles, angleIds, policies);
    const out = [];
    out.push(`Dear ${honorific(m)} ${lastName(m.name)},`);
    out.push("");
    out.push(`My name is ${w.name}, and I live in ${w.place}.` + (m.chamber === "House" ? " I'm a constituent in your district." : " I'm one of your constituents."));
    if (isAlly(m)) out.push("Thank you for taking the risks of advanced AI seriously. I'm writing to ask you to keep leading on this.");
    if (u.note) { out.push(""); out.push(u.note); }
    out.push("");
    if (!P.length) out.push("[Choose at least one ask above.]");
    else if (P.length === 1) out.push(`I'm asking you to ${askText(P[0], m)}.`);
    else { out.push("I'm asking you to:"); P.forEach(p => out.push("- " + askText(p, m)[0].toUpperCase() + askText(p, m).slice(1) + ".")); }
    if (ctx.roleLine) { out.push(""); out.push(ctx.roleLine); }
    if (lines.length) { out.push(""); out.push(long ? "Here is why this matters to me:" : "Why it matters:"); lines.forEach(l => out.push(long || lines.length > 2 ? "- " + l.text : l.text)); }
    if (localLine) { out.push(""); out.push(localLine); }
    out.push("");
    out.push(P.length ? `Will you ${P.length > 1 ? "support these steps" : "support this"}? I'd appreciate a reply letting me know where you stand.` : "I'd appreciate a reply letting me know where you stand.");
    out.push("");
    out.push("Sincerely,");
    out.push(w.name);
    out.push(w.place);
    return out.join("\n");
  }

  function buildCall(ctx) {
    const { m, u, policies, angleIds, angles, long, localLine } = ctx;
    const P = chosenPolicies(policies);
    const w = who(u, m);
    const lines = pickLines(angles, angleIds, policies);
    const hon = shortHon(m) + " " + lastName(m.name);
    const o = [];
    o.push(long ? "CALL SCRIPT (1–2 minutes)" : "CALL SCRIPT (about a minute)");
    o.push("");
    o.push(`"Hi, my name is ${w.name} and I'm a constituent from ${w.place}.`);
    if (u.note) o.push(u.note);
    if (isAlly(m) && long) o.push(`First, thank you to ${hon} for taking the risks of advanced AI seriously.`);
    o.push(P.length ? `I'm calling to ask ${hon} to support ${listJoin(P.map(askShort))}.` : "[Choose at least one ask above.]");
    if (ctx.roleLine) o.push(aboutMember(ctx.roleLine, hon));
    if (long && P.includes("RSI")) o.push("By that I mean AI systems that automate their own research and development, building the next generation faster than people can check it.");
    lines.forEach(l => o.push(l.text));
    if (localLine) o.push(localLine);
    o.push(`Can you tell me where ${hon} stands on this? Thank you."`);
    o.push("");
    o.push("IF YOU GET VOICEMAIL");
    o.push(`"Hi, this is ${w.name} from ${w.place}. I'm asking ${hon} to support ${listJoin(P.map(askShort)) || "[your ask]"}. Thank you."`);
    if (long) {
      o.push("");
      o.push("IF STAFF ASK QUESTIONS");
      if (P.includes("RSI")) o.push(`- "What do you mean by recursive self-improvement?" → AI systems doing most of the work of building the next, more capable AI, so each generation arrives faster and with less human checking. AI companies say this is starting now.`);
      o.push(`- "Won't this hurt innovation?" → The asks are narrow: they leave chatbots, medical tools and business software alone and target the riskiest step.`);
      o.push(`- "What about China?" → Most voters want both to keep up with China and to have guardrails. Any agreement should be verifiable and bind China too.`);
    }
    o.push("");
    o.push("HOW TO CALL");
    o.push(ctx.phone
      ? "- " + honorific(m) + " " + m.name + "'s Washington office: " + ctx.phone + "."
      : "- Capitol switchboard: (202) 224-3121. Ask for " + honorific(m) + " " + m.name + "'s office.");
    o.push("- Calls are logged by issue and position, so short calls count. Ask for the staffer who covers technology or AI if you want to say more.");
    o.push("- Weekdays, 9am–5pm Eastern. Being polite and local matters more than being detailed.");
    return o.join("\n");
  }

  function buildMeeting(ctx) {
    const { m, u, policies, angleIds, angles, long, localLine } = ctx;
    const P = chosenPolicies(policies);
    const w = who(u, m);
    const lines = pickLines(angles, angleIds, policies);
    const hon = honorific(m) + " " + lastName(m.name);
    const o = [];
    o.push("1. REQUEST THE MEETING");
    o.push("Use the scheduling form on the member's website (or email the scheduler). Allow 4–6 weeks; follow up by phone after 2 weeks if you hear nothing. District offices are easiest for a first meeting; Washington offices are where policy staff sit.");
    o.push("");
    o.push("Request text:");
    o.push(`"Hello, I'm ${w.name}, a constituent from ${w.place}. I'd like to request a 20-minute meeting with ${hon} or the staff member who covers technology and AI, to discuss ${listJoin(P.map(askShort)) || "[your topic]"}. I'm flexible on dates and can meet in the district office or virtually. Thank you."`);
    o.push("");
    o.push("2. AGENDA (20 MINUTES)");
    o.push("- Introductions (2 min): who you are, where you live, why you care.");
    if (u.note) o.push("    • In your words: " + u.note);
    if (isAlly(m)) o.push("- Thanks (1 min): acknowledge their work on AI risk (see their record on this page) and ask them to keep leading.");
    o.push("- The ask (3 min):" + (P.length ? "" : " [choose an ask]"));
    P.forEach(p => o.push("    • " + askText(p, m)[0].toUpperCase() + askText(p, m).slice(1) + "."));
    if (ctx.roleLine) o.push("    • Their role: " + aboutMember(ctx.roleLine, hon));
    o.push("- Why it matters (8 min):");
    lines.forEach(l => o.push("    • " + l.name + ": " + l.text));
    if (localLine) o.push("    • Local angle: " + localLine);
    o.push("- Their view (4 min): ask what would make it easier for them to support this, and listen.");
    o.push("- Close (2 min): ask directly: \"Will " + hon + " support this?\" Offer to send more information.");
    o.push("");
    o.push("3. LEAVE-BEHIND (ONE OR TWO PAGES)");
    o.push("- Your name, address and contact details.");
    o.push("- The specific asks above, each in one sentence.");
    o.push("- 3–4 supporting points, with a source for each figure.");
    if (long) o.push("- Polling that fits this office (e.g. bipartisan support for independent testing).");
    o.push("");
    o.push("4. AFTERWARDS");
    o.push("- Send a thank-you email within 24 hours repeating the ask and answering anything you promised.");
    o.push("- Check in again after 2 weeks and after 4+ weeks.");
    if (long) {
      o.push("");
      o.push("TIPS");
      o.push("- Staff meetings are normal and valuable; don't be disappointed if the member isn't there.");
      o.push("- Bring a story about why you care. Personal and local beats technical.");
      o.push("- If you work in AI or policy and prefer not to be public, private meetings and calls are fine; you don't need to sign public letters.");
    }
    return o.join("\n");
  }

  function build(kind, ctx) {
    if (kind === "call") return buildCall(ctx);
    if (kind === "meeting") return buildMeeting(ctx);
    return buildEmail(ctx);
  }

  const api = { POLICY_ORDER, POLICY_LABEL, STATE_NAMES, defaultPolicies, angleUsable, angleLine, startAngles, aboutMember, emailSubject, isAlly, build, lastName, honorific };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Gen = api;
})(typeof window !== "undefined" ? window : globalThis);
