// Message builder: pure functions, no DOM. Works in the browser (window.Gen) and in Node (require).
(function (root) {
  const POLICY_ORDER = ["RSI", "OVS", "PAUSE", "PREEMPT", "WHISTLE"];
  // Reasons (angles) have a sentence for these asks only; the other asks carry no reasons of their own.
  const LINE_POLICIES = ["RSI", "OVS", "PAUSE"];
  const POLICY_LABEL = {
    RSI: "Restrict recursive self-improvement",
    OVS: "Independent evaluators & oversight",
    PAUSE: "International pause",
    PREEMPT: "Protect state AI laws from preemption",
    WHISTLE: "Whistleblower protections & incident reporting",
  };
  const STATE_NAMES = {AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming"};

  function isRepublican(m) { return m.party === "R"; }

  // What we ask for, worded per policy. Republicans get "verifiable, mutual" framing on the pause.
  function askText(p, m) {
    if (p === "RSI") return "support legislation restricting recursive self-improvement (AI systems that automate their own research and development) until it can be shown to be safe";
    if (p === "OVS") return "require independent, licensed evaluators to test the most powerful AI systems, with a working emergency shutdown";
    if (p === "PREEMPT") return "oppose federal preemption of state AI safety laws, so state rules like those in California, New York and Illinois stay in place as a floor, not a ceiling";
    if (p === "WHISTLE") return "protect employees of AI companies who report safety risks, and require serious AI incidents to be reported within hours, not weeks";
    return isRepublican(m)
      ? "push for a verifiable, mutual agreement with China and other AI powers to pause the most advanced AI development while safety work catches up"
      : "push for a verifiable international agreement, including China, to pause the most advanced AI development while safety work catches up";
  }
  function askShort(p) {
    return { RSI: "limits on AI that improves itself", OVS: "independent safety testing of frontier AI", PAUSE: "a verifiable international pause on the most advanced AI",
      PREEMPT: "protecting state AI safety laws from federal preemption", WHISTLE: "protections for AI whistleblowers" }[p];
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
    const p = { RSI: true, OVS: true, PAUSE: true, PREEMPT: false, WHISTLE: false };
    if (isRepublican(m) && !/PROG/.test(m.tag)) p.PAUSE = false;
    return p;
  }

  // The first sentence an angle has for the chosen asks (used to tell whether a reason applies at all).
  function angleLine(angle, policies) {
    for (const p of LINE_POLICIES) {
      if (policies[p] && angle.policies.includes(p) && angle.lines[p]) return { policy: p, text: angle.lines[p] };
    }
    return null;
  }
  function angleUsable(angle, policies) { return !!angleLine(angle, policies); }

  // Each checked reason adds its sentence for every checked ask, in ask order. A sentence that appears
  // under more than one ask (or more than one reason) is used once.
  function pickLines(angles, chosenIds, policies, n) {
    const byId = Object.fromEntries(angles.map(a => [a.id, a]));
    const out = [], seen = new Set();
    for (const id of chosenIds) {
      const a = byId[id]; if (!a) continue;
      const parts = [];
      for (const p of LINE_POLICIES) {
        const t = policies[p] && a.policies.includes(p) && (a.lines[p] || "").trim();
        if (t && !seen.has(t)) { seen.add(t); parts.push(t); }
      }
      if (parts.length) out.push({ id, name: a.name, text: parts.join(" ") });
      if (n && out.length >= n) break;
    }
    return out;
  }

  // Reasons aimed at the member's ideology: their "Suits" groups include the member's tag
  // (or the RELC overlay), or the reason suits all tags.
  function ideologyAngles(m, angles) {
    const tags = (m.tag || "").split("+").filter(Boolean);
    return angles.filter(a => /all tags/i.test(a.receptive) ||
      tags.some(t => new RegExp("\\b" + t + "\\b").test(a.receptive))).map(a => a.id);
  }

  // The arguments suggested for a member: their own recommended list from the research (m.angles),
  // or, for the few without one, the arguments aimed at their ideology.
  function suggestedAngles(m, angles) {
    const ids = new Set(angles.map(a => a.id));
    const own = (m.angles || []).filter(id => ids.has(id));
    return own.length ? own : ideologyAngles(m, angles);
  }

  // Which reasons start checked: cfg.count picked at random from the member's suggested arguments
  // that the chosen asks can use (falling back to their ideology's), so messages from different
  // people don't all argue the same way.
  function startAngles(m, angles, policies, cfg, rand = Math.random) {
    const byId = Object.fromEntries(angles.map(a => [a.id, a]));
    const usable = ids => ids.filter(id => angleUsable(byId[id], policies));
    let pool = usable(suggestedAngles(m, angles));
    if (!pool.length) pool = usable(ideologyAngles(m, angles));
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    return pool.slice(0, cfg.count);
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

  // Lines wrapped in ** are shown in bold on the page (and copied as bold where the paste target allows it).
  function buildEmail(ctx) {
    const { m, u, policies, angleIds, angles, long, localLine } = ctx;
    const P = chosenPolicies(policies);
    const w = who(u, m);
    const byId = Object.fromEntries(angles.map(a => [a.id, a]));
    const seen = new Set();
    const out = [];
    out.push(`Dear ${honorific(m)} ${lastName(m.name)},`);
    out.push("");
    out.push(`My name is ${w.name}, and I live in ${w.place}.` + (m.chamber === "House" ? " I'm a constituent in your district." : " I'm one of your constituents."));
    if (isAlly(m)) out.push("Thank you for taking the risks of advanced AI seriously. I'm writing to ask you to keep leading on this.");
    if (u.note) { out.push(""); out.push(u.note); }
    if (!P.length) { out.push(""); out.push("[Choose at least one ask above.]"); }
    for (const p of P) {
      out.push("");
      out.push("**Please " + askText(p, m) + ".**");
      if (!long) continue;
      // Each checked argument's sentence for this ask; a sentence already used under an earlier ask is skipped.
      for (const id of angleIds) {
        const a = byId[id], t = a && a.policies.includes(p) && (a.lines[p] || "").trim();
        if (t && !seen.has(t)) { seen.add(t); out.push("- " + t); }
      }
    }
    if (ctx.roleLine) { out.push(""); out.push(ctx.roleLine); }
    if (localLine) { out.push(""); out.push(localLine); }
    out.push("");
    out.push(P.length ? `Will you ${P.length > 1 ? "support these steps" : "support this"}? I'd appreciate a reply letting me know where you stand.` : "I'd appreciate a reply letting me know where you stand.");
    out.push("");
    out.push("Sincerely,");
    out.push(w.name);
    out.push(w.place);
    return out.join("\n");
  }

  // How long the call script takes to say: its words at a calm phone pace, to the nearest 15 seconds.
  // Bracketed placeholders like [your town] aren't counted.
  const CALL_WPM = 140, CALL_HEAD = /^CALL SCRIPT \([^)\n]*\)/, CALL_END = /\n\s*IF YOU GET VOICEMAIL\b/;
  function wordCount(text) { return text.replace(/\[[^\]]*\]/g, " ").split(/\s+/).filter(t => /[\p{L}\p{N}]/u.test(t)).length; }
  function speakTime(words) {
    const s = Math.max(15, Math.round(words / CALL_WPM * 60 / 15) * 15);
    if (s < 60) return `about ${s} seconds`;
    const min = Math.floor(s / 60), sec = s % 60;
    return `about ${min} minute${min > 1 ? "s" : ""}${sec ? ` ${sec} seconds` : ""}`;
  }
  const callHeader = spoken => `CALL SCRIPT (${speakTime(wordCount(spoken))})`;
  // For a whole call script (possibly edited by the visitor): the heading it should have now,
  // timed from the spoken part between the heading and the voicemail line.
  function callHeading(text) {
    if (!CALL_HEAD.test(text)) return null;
    const body = text.replace(CALL_HEAD, ""), end = body.search(CALL_END);
    return callHeader(end < 0 ? body : body.slice(0, end));
  }

  function buildCall(ctx) {
    const { m, u, policies, angleIds, angles, long, localLine } = ctx;
    const P = chosenPolicies(policies);
    const w = who(u, m);
    const hon = shortHon(m) + " " + lastName(m.name);
    const why = [u.note, ...linkReasons(callLines(angles, angleIds, policies, ctx.callLines))].filter(Boolean);
    const o = [];
    o.push("");  // heading, filled in below once the spoken part is known
    o.push("");
    // Intro, the asks, why, the local and role points, then the close.
    o.push(`"Hi, my name is ${w.name} and I'm a constituent from ${w.place}.`);
    if (isAlly(m) && long) o.push(`First, thank you to ${hon} for taking the risks of advanced AI seriously.`);
    o.push(P.length ? `I'm calling to ask ${hon} to support ${listJoin(P.map(askShort))}.` : "[Choose at least one ask above.]");
    if (long && P.includes("RSI")) o.push("By AI that improves itself, I mean AI systems that automate their own research and development, building the next generation faster than people can check it.");
    o.push(...why);
    if (localLine) o.push(localLine);
    if (ctx.roleLine) o.push(aboutMember(ctx.roleLine, hon));
    o.push(`Can you tell me where ${hon} stands on this? Thank you."`);
    o[0] = callHeader(o.slice(2).join("\n"));
    o.push("");
    o.push("IF YOU GET VOICEMAIL");
    o.push(`"Hi, this is ${w.name} from ${w.place}. I'm asking ${hon} to support ${listJoin(P.map(askShort)) || "[your ask]"}. Thank you."`);
    return o.join("\n");
  }

  // Call scripts use one sentence per checked argument (messages.json callLines), falling back to
  // the argument's first sentence for the checked asks. Arguments the checked asks can't use are skipped.
  // The one-liners read as one run: "We should do this because …", then "Also, …", "On top of that, …",
  // and "Finally, …" on the last of three or more. Each one-liner's first letter is lowercased unless
  // it starts with an acronym (AI, U.S.) or a name in KEEP_CAPS.
  const KEEP_CAPS = new Set(["I", "I'm", "Congress", "America", "American", "Americans", "China", "Republicans", "Democrats"]);
  const MID_LINKS = ["Also, ", "On top of that, ", "Plus, ", "Beyond that, "];
  function lowerFirst(s) {
    const w = s.split(/[\s,:;]/)[0];
    return /^[A-Z][A-Z.]+$/.test(w) || KEEP_CAPS.has(w) ? s : s.charAt(0).toLowerCase() + s.slice(1);
  }
  function linkReasons(lines) {
    const n = lines.length;
    return lines.map((t, i) => (i === 0 ? "We should do this because " : i === n - 1 && n > 2 ? "Finally, " : MID_LINKS[(i - 1) % MID_LINKS.length]) + lowerFirst(t));
  }

  function callLines(angles, angleIds, policies, lines = {}) {
    const byId = Object.fromEntries(angles.map(a => [a.id, a]));
    return angleIds.map(id => byId[id]).filter(a => a && angleUsable(a, policies))
      .map(a => lines[a.id] || angleLine(a, policies).text);
  }

  // An in-person meeting is four separate texts the visitor edits and copies one at a time:
  // the request, the agenda, the leave-behind and the thank-you email. Placeholders in [brackets]
  // are for things only the visitor knows (contact details, the staffer's name, the date).
  function meetingParts(ctx) {
    const { m, u, policies, angleIds, angles, localLine } = ctx;
    const P = chosenPolicies(policies);
    const w = who(u, m);
    const lines = pickLines(angles, angleIds, policies);
    const hon = honorific(m) + " " + lastName(m.name);
    const topics = listJoin(P.map(askShort)) || "[your topic]";
    const asks = P.map(p => askText(p, m)[0].toUpperCase() + askText(p, m).slice(1) + ".");
    const role = ctx.roleLine ? aboutMember(ctx.roleLine, hon) : "";
    // Email and phone from About you, if given; otherwise a placeholder to fill in.
    const reach = [u.email, u.phone].filter(Boolean);
    const contact = reach.length ? reach.join(" or ") : "[your email and phone number]";
    const contactLines = reach.length ? reach : ["[your email and phone number]"];

    const request = [
      "Hello,",
      "",
      `I'm ${w.name}, a constituent from ${w.place}. I'd like to request a 20-minute meeting with ${hon} or the staff member who covers technology and AI, to discuss ${topics}.`,
      "",
      "I'm flexible on dates and glad to meet at a local office, in Washington or by video. You can reach me at " + contact + ".",
      "",
      "Thank you,",
      w.name,
      w.place,
    ].join("\n");

    const a = [];
    a.push("AGENDA (20 MINUTES)");
    a.push("");
    a.push("Introductions (2 min): who you are, where you live, why you care.");
    if (u.note) a.push("- In your words: " + u.note);
    if (isAlly(m)) a.push(`Thanks (1 min): thank ${hon} for taking the risks of advanced AI seriously and ask them to keep leading.`);
    a.push("The ask (3 min):" + (P.length ? "" : " [choose an ask]"));
    asks.forEach(t => a.push("- " + t));
    if (lines.length || localLine || role) a.push("Why it matters (8 min):");
    lines.forEach(l => a.push(`- ${l.name}: ${l.text}`));
    if (localLine) a.push("- Here at home: " + localLine);
    if (role) a.push("- Their role: " + role);
    a.push("Their view (4 min): ask what would make it easier for them to support this, and listen.");
    a.push(`Close (2 min): ask directly, "Will ${hon} support this?" Offer to send more information, and ask for the staffer's email so you can follow up.`);
    const agenda = a.join("\n");

    const l = [];
    l.push("**Keeping AI under human control**");
    l.push(`A request to ${hon} from ${w.name}, ${w.place}`);
    l.push("");
    l.push("**What I'm asking for**");
    if (asks.length) asks.forEach(t => l.push("- " + t)); else l.push("- [Choose at least one ask above.]");
    // Polling for the member's own voters: Republican voters for Republicans, all voters otherwise.
    const statSet = (ctx.voterStats || {})[isRepublican(m) ? "R" : "all"] || {};
    const stats = [...new Set(P.flatMap(p => statSet[p] || []))];
    // The page has room for one short point per argument, so it uses the one-liners. The two
    // polling arguments (A14, A27) are left out when the voter figures below cover them.
    const argIds = stats.length ? angleIds.filter(id => id !== "A14" && id !== "A27") : angleIds;
    const why = [...callLines(angles, argIds, policies, ctx.callLines), localLine].filter(Boolean);
    if (why.length || u.note) {
      l.push("");
      l.push("**Why it matters**");
      why.forEach(t => l.push("- " + t));
      if (u.note) { l.push(""); l.push(u.note); }
    }
    if (stats.length) {
      l.push("");
      l.push(isRepublican(m) ? "**What Republican voters think**" : "**What voters think**");
      stats.forEach(t => l.push("- " + t));
    }
    l.push("");
    l.push("**Contact**");
    l.push(`${w.name}, ${w.place}`);
    l.push(...contactLines);
    const leave = l.join("\n");

    const t = [];
    t.push("Subject: Thank you for meeting with me about AI safety");
    t.push("");
    t.push("Dear [staffer's name],");
    t.push("");
    t.push(`Thank you for meeting with me on [date] to discuss ${topics}. I appreciated the chance to share why this matters to me and to people here in ${STATE_NAMES[m.state] || m.state}.`);
    t.push("");
    t.push(`As we discussed, I'm asking ${hon} to:`);
    if (asks.length) P.forEach(p => t.push("- " + askText(p, m) + ".")); else t.push("- [your ask]");
    t.push("");
    t.push("[Add anything you promised to send, or answers to questions that came up.]");
    t.push("");
    t.push(`I'd be glad to be a resource on this. Please let me know where ${hon} stands, and I'll check in again in a few weeks.`);
    t.push("");
    t.push("Thank you,");
    t.push(w.name);
    t.push(w.place);
    if (u.phone) t.push(u.phone);  // the email itself carries the address
    const thanks = t.join("\n");

    return { request, agenda, leave, thanks };
  }
  function buildMeeting(ctx) {
    const p = meetingParts(ctx);
    return ["REQUEST", p.request, "", p.agenda, "", "LEAVE-BEHIND", p.leave, "", "THANK-YOU EMAIL", p.thanks].join("\n");
  }

  function build(kind, ctx) {
    if (kind === "call") return buildCall(ctx);
    if (kind === "meeting") return buildMeeting(ctx);
    return buildEmail(ctx);
  }

  const api = { POLICY_ORDER, LINE_POLICIES, POLICY_LABEL, STATE_NAMES, defaultPolicies, angleUsable, angleLine, startAngles, ideologyAngles, suggestedAngles, aboutMember, emailSubject, isAlly, build, lastName, honorific, callHeading, wordCount, speakTime, callLines, askShort, meetingParts };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Gen = api;
})(typeof window !== "undefined" ? window : globalThis);
