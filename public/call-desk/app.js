/*
  Ahern AI — Call Desk client
  Version  : 1.1.0
  Built by : Claude Opus 5.5 (claude-opus-5-5) · 2026-10-27
  Talks to : /api/portal/call-desk/* (portal session cookie + X-CSRF-Token)
*/
(() => {
"use strict";

/* ---------- session ---------- */
const meta = (n) => document.querySelector(`meta[name="${n}"]`)?.content || "";
const CSRF = meta("call-desk-csrf");
const ROLE = meta("call-desk-role");
const IS_OWNER = ROLE === "owner";
const API = "/api/portal/call-desk";

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) n.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat()) if (k != null) n.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return n;
};
const toast = (msg) => { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2800); };
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const key = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 12));
const normPhone = (p) => String(p || "").replace(/\D/g, "").slice(-10);
const fmtSlot = (v) => { if (!v) return ""; const d = new Date(v); if (isNaN(d)) return ""; return d.toLocaleString("en-US", { weekday: "long", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); };
const fmtWhen = (ms) => new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
const fmtDue = (ms) => new Date(ms).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "America/Chicago" });

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(API + path, {
    method, credentials: "same-origin",
    headers: method === "GET" ? {} : { "Content-Type": "application/json", "X-CSRF-Token": CSRF },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) { location.assign("/login?next=%2Fportal%2Fcall-desk"); throw Object.assign(new Error("Signed out"), { status: 401 }); }
  let data = {}; try { data = await res.json(); } catch {}
  if (!res.ok) throw Object.assign(new Error(data.error || "Request failed"), { status: res.status });
  return data;
}

/* ---------- state ---------- */
const FIELDS = ["business","phone","website","seen","seenother","contact","role","dm","email","best","slot1","slot2","chosen","notes"];
const blankSheet = () => ({ business:"", phone:"", website:"", seen:"none", seenother:"", contact:"", role:"", dm:"", email:"", best:"", slot1:"", slot2:"", chosen:"", notes:"", outcome:"", requestKey: key() });
let sheet = Object.assign(blankSheet(), store.get("desk.sheet", {}));
if (!sheet.requestKey) sheet.requestKey = key();
let nav = store.get("desk.nav", { node: "prep", history: [] });
let callQs = store.get("desk.callQs", []);
let config = { availability: "", length: 20, callback_phone: "" };
let calls = [], questions = [], dncList = [], nextDue = null, online = false;

const OUTCOMES = [
  ["booked","Consult booked"],["callback","Call back"],["sendinfo","Send info"],["voicemail","Left voicemail"],
  ["notinterested","Not interested"],["nocontact","No contact"],["dnc","Do not call"]
];
const outcomeLabel = (k) => (OUTCOMES.find(o => o[0] === k) || [k, k || "—"])[1];

/* ---------- script variables ---------- */
const HOOKS = {
  none:     ["I couldn't find a website for you anywhere", "you don't have a website up yet"],
  facebook: ["it looks like Facebook is the main place you're online", "you're mostly on Facebook right now"],
  mobile:   ["your site's a bit tough to use on a phone", "your site's hard to use on a phone"],
  contact:  ["I couldn't find an easy way to send you a request from the site", "there's no easy way to reach you from the site"],
  broken:   ["a few things on your site weren't loading for me", "a few things on the site aren't loading"],
  dated:    ["your site looks like it's due for a refresh", "the site's due for a refresh"],
};
function vars() {
  const other = sheet.seenother ? "I noticed " + sheet.seenother : "";
  const hook = sheet.seen === "other" ? [other, other] : (HOOKS[sheet.seen] || HOOKS.none);
  const first = (sheet.contact || "").trim().split(/\s+/)[0];
  const s1 = fmtSlot(sheet.slot1), s2 = fmtSlot(sheet.slot2);
  return {
    business: sheet.business.trim(), contact: first || "", dm: (sheet.dm || "").trim(),
    hook: hook[0], hookShort: hook[1],
    slot1: s1, slot2: s2, chosen: sheet.chosen === "1" ? s1 : sheet.chosen === "2" ? s2 : "",
    length: String(config.length || 20),
    due: nextDue ? fmtDue(nextDue) : "",
    phone: config.callback_phone || "",
  };
}
const FALLBACK = { business:"[business]", contact:"[name]", dm:"[their name]", hook:"[what you saw]", hookShort:"[what you saw]", slot1:"[Time A]", slot2:"[Time B]", chosen:"[their time]", length:"20", due:"[tomorrow]", phone:"[your number]" };
function line(text) {
  const v = vars(), p = el("p");
  text.split(/(\{\w+\})/g).forEach(part => {
    const m = part.match(/^\{(\w+)\}$/);
    if (!m) { if (part) p.append(part); return; }
    const val = v[m[1]];
    p.append(el("span", { class: "v" + (val ? "" : " empty"), text: val || FALLBACK[m[1]] || "[?]" }));
  });
  return p;
}

/* ---------- the script ---------- */
const N = {
  prep: { stage:"Prep", title:"Before you dial", say: [],
    do: ["Look the business up on your phone, not just a desktop. That's how their customers see it.",
         "Fill in Business, Phone and 'What I saw' on the call sheet. The opener uses it.",
         "If a red do-not-call banner shows up, stop. Don't dial.",
         "Put two consult times from Mike's availability into Time A and Time B before you dial."],
    options: [ {label:"I'm ready, dialing", to:"gatekeeper"} ] },
  gatekeeper: { stage:"Opening", title:"Someone picks up",
    say: ["Hi, this is Scotty with Ahern AI over in Gordon. Who would I talk to about the website for {business}? Is that the owner?"],
    do: ["Friendly and quick. Don't pitch whoever answers unless they turn out to be the decision maker.",
         "Get the name of whoever answered and put it in 'Who I'm talking to'."],
    options: [
      {label:"\"That's me\" / owner is on", hear:"they're the owner or manager", to:"opener"},
      {label:"\"Let me transfer you\"", hear:"getting put through", to:"opener"},
      {label:"\"What's this about?\"", hear:"screening you", to:"gk_regarding"},
      {label:"\"They're not in\"", hear:"owner unavailable", to:"gk_callback"},
      {label:"\"We're not interested\"", hear:"blocking", to:"gk_block"},
      {label:"Voicemail", hear:"machine picks up", to:"voicemail"},
    ] },
  gk_regarding: { stage:"Opening", title:"Getting past the front desk",
    say: ["It's about {business}'s website. I was looking you up and {hookShort}. I'd only need a couple of minutes with whoever handles that. Who would that be?"],
    do: ["Straight answer, no tricks. If they ask whether it's a sales call, say yes, it's a short one."],
    options: [ {label:"Putting you through", to:"opener"}, {label:"They're not in", to:"gk_callback"}, {label:"Still a no", to:"gk_block"} ] },
  gk_callback: { stage:"Opening", title:"Owner's not available",
    say: ["No problem. What's the owner's name, and when's the best time to catch them?",
          "Is there a direct line or an email that's better than this number?"],
    do: ["Owner's name goes in 'Decision maker'. Time and direct line go in 'Best time / direct line'."],
    options: [ {label:"Got a name and a time", to:"wrap", outcome:"callback"}, {label:"Got an email only", to:"wrap", outcome:"sendinfo"}, {label:"Got nothing", to:"wrap", outcome:"nocontact"} ] },
  gk_block: { stage:"Opening", title:"Front desk says no",
    say: ["Understood. Could I get the owner's name and an email? I'll send one short note with a link instead of calling back."],
    do: ["One ask. If it's still no, thank them and go. Don't push past a gatekeeper twice."],
    options: [ {label:"Got name/email", to:"wrap", outcome:"sendinfo"}, {label:"No", to:"wrap", outcome:"nocontact"}, {label:"\"Take us off your list\"", to:"dnc", danger:true} ] },
  opener: { stage:"Decision maker", title:"The opener",
    say: ["Hi {contact}, this is Scotty with Ahern AI in Gordon. I'll be quick. I was looking for {business} online and {hook}. Have you got two minutes, or is there a better time?"],
    do: ["Then stop talking. Let them answer.", "If you were transferred, update 'Who I'm talking to' with the new name first."],
    options: [ {label:"\"Go ahead\"", to:"dm_check"}, {label:"\"Bad time\"", to:"bad_time"}, {label:"\"Not interested\"", to:"obj_notinterested"}, {label:"\"Take me off your list\"", to:"dnc", danger:true} ] },
  dm_check: { stage:"Decision maker", title:"Confirm you've got the right person",
    say: ["Just so I don't waste your time, are you the one who makes the call on things like the website, or is someone else involved?"],
    do: ["If they say \"me and my partner\" or similar, that's fine. Keep going and note it."],
    options: [ {label:"Yes, it's them", to:"discovery"}, {label:"Them plus someone else", to:"discovery"}, {label:"Someone else decides", to:"dm_redirect"} ] },
  dm_redirect: { stage:"Decision maker", title:"Wrong person, find the right one",
    say: ["Appreciate you telling me. Who is that, and what's the best way to reach them? I'd rather talk to them directly than make you pass it along."],
    do: ["Name goes in 'Decision maker'. If they're there now, ask to be put through."],
    options: [ {label:"Putting me through", to:"opener"}, {label:"Got their name and number", to:"wrap", outcome:"callback"}, {label:"Wouldn't say", to:"wrap", outcome:"nocontact"} ] },
  discovery: { stage:"Discovery", title:"Ask, then listen",
    say: ["How are most new customers finding you right now?",
          "When someone looks up {business} on their phone, what do you want them to find?",
          "What happens today when someone wants a quote after hours?"],
    do: ["Pick one or two. Don't run through all three like a survey.", "Write what they say in Notes. Their words, not yours.", "Don't solve anything here. No promises about features."],
    options: [
      {label:"They see a gap", hear:"\"we probably lose some\", \"word of mouth mostly\"", to:"value"},
      {label:"\"We're fine as is\"", to:"obj_happy"}, {label:"\"Facebook works for us\"", to:"obj_facebook"}, {label:"They asked a specific question", to:"FINDOUT"},
    ] },
  value: { stage:"Pitch", title:"What we do",
    say: ["Here's what we do. Mike Ahern builds the sites himself, no templates, and you work with him directly from start to finish.",
          "A one-page site starts at $995. A full business site, up to five pages, is $1,995. Both work on phones, have a contact form, and get hooked up to your domain.",
          "If you want new inquiries routed and answered automatically, that starts at $2,995. Everything's listed at ahernai.com under Websites."],
    do: ["Don't read all three in one breath. Gauge them after the first.", "If they ask \"how long does it take\" or \"can it do X\", that's a find-out."],
    options: [ {label:"Interested, go to close", to:"close"}, {label:"Pushback on price", to:"obj_price"}, {label:"Asked something specific", to:"FINDOUT"}, {label:"\"Send me something\"", to:"obj_sendinfo"} ] },
  close: { stage:"Close", title:"Book the free consult",
    say: ["Easiest next step is a free consultation with Mike. About {length} minutes, no obligation. He'll look at what you've got and tell you straight what makes sense, even if that's nothing.",
          "I've got {slot1} or {slot2}. Which one works better?"],
    do: ["Two options, not \"when are you free\". Times come from Mike's availability on the call sheet.", "Set 'They picked' on the call sheet as soon as they choose."],
    options: [ {label:"Picked a time", to:"booked"}, {label:"Neither time works", hear:"ask for a better day, note it", to:"close_other"}, {label:"\"Send me info first\"", to:"obj_sendinfo"}, {label:"\"Let me think about it\"", to:"obj_think"} ] },
  close_other: { stage:"Close", title:"Neither time works",
    say: ["No problem. What day and time generally works better for you? I'll check with Mike and confirm by email."],
    do: ["Write their preference in Notes. Don't promise a time Mike hasn't offered.", "Get their email, then save as 'Call back' so Mike sees it."],
    options: [ {label:"Got a preference and email", to:"wrap", outcome:"callback"} ] },
  booked: { stage:"Close", title:"Lock it in",
    say: ["Perfect. So that's {chosen} with Mike. What's the best email for the invite?",
          "Mike will email you to confirm by {due}. In the meantime, have a look at ahernai.com. The Websites page has all the packages.",
          "Thanks, {contact}. Talk soon."],
    do: ["Read the email back letter by letter. A bad email kills a booked call.", "If they had any questions you couldn't answer, remind them you'll have answers by {due}."],
    options: [ {label:"Done, save it", to:"wrap", outcome:"booked"} ] },
  voicemail: { stage:"Voicemail", title:"Leave a short one",
    say: ["Hi, this is Scotty with Ahern AI out of Gordon, calling for the owner of {business}. I was looking you up and {hookShort}.",
          "Mike Ahern builds small-business websites right here in North Texas, starting at $995. Have a look at ahernai.com.",
          "You can reach me at {phone}. Again, Scotty with Ahern AI. Thanks."],
    do: ["Under 30 seconds. Say the number slowly, twice if you've got room."],
    options: [ {label:"Left it", to:"wrap", outcome:"voicemail"} ] },
  bad_time: { stage:"Objection", title:"\"Bad time\"", say: ["Totally fair. Is later today better, or tomorrow morning?"],
    do: ["Get a specific time and put it in 'Best time'."],
    options: [ {label:"Got a time", to:"wrap", outcome:"callback"}, {label:"\"Don't call back\"", to:"dnc", danger:true} ] },
  obj_notinterested: { stage:"Objection", title:"\"Not interested\"",
    say: ["No worries. Just so I know, is it the timing, or are you set on the website front?"], do: ["One question, then respect the answer."],
    options: [ {label:"Timing", to:"bad_time"}, {label:"They're set", to:"wrap", outcome:"notinterested"}, {label:"Opens up a bit", to:"discovery"}, {label:"\"Take me off your list\"", to:"dnc", danger:true} ] },
  obj_happy: { stage:"Objection", title:"\"We're fine as is\"",
    say: ["Good to hear. Out of curiosity, when's the last time a customer told you they found you through the website?",
          "Mike's consult is free. If what you've got is doing its job, he'll tell you that."],
    do: ["Don't knock their current setup or whoever built it."],
    options: [ {label:"They'll take the consult", to:"close"}, {label:"Still no", to:"wrap", outcome:"notinterested"} ] },
  obj_facebook: { stage:"Objection", title:"\"Facebook works for us\"",
    say: ["Facebook's great for the folks who already know you. The catch is that a Facebook page doesn't always show up when someone searches for your kind of business, and Facebook owns that page, not you.",
          "A simple site gives you a spot you control, and it works alongside the Facebook page. Worth a free {length}-minute look with Mike?"],
    do: ["No numbers, no promises about Google. Just the point."],
    options: [ {label:"Sure", to:"close"}, {label:"No thanks", to:"wrap", outcome:"notinterested"} ] },
  obj_price: { stage:"Objection", title:"\"That's a lot\" / price questions",
    say: ["That's fair. The $995 site is a fixed build price with two rounds of changes included. Hosting and care is optional at $99 a month.",
          "Anything beyond the package, Mike quotes before any work starts, so there are no surprises. The consult's free, so it costs nothing to find out what you'd actually need."],
    do: ["No discounts, no payment plans. If they ask about either, that's a find-out.", "Stores, portals, migrations, integrations: \"quoted separately, Mike scopes it.\""],
    options: [ {label:"OK, book it", to:"close"}, {label:"Asked about discounts/terms", to:"FINDOUT"}, {label:"Still no", to:"wrap", outcome:"notinterested"} ] },
  obj_sendinfo: { stage:"Objection", title:"\"Just send me something\"",
    say: ["Happy to. Everything's on ahernai.com under Websites, with packages and prices. What's your email? I'll send you the link.",
          "While I've got you, can I pencil in {slot1} with Mike? If the site doesn't grab you, just reply and cancel."],
    do: ["Get the email first. Then try the pencil-in once."],
    options: [ {label:"They'll take the time", to:"booked"}, {label:"Email only", to:"wrap", outcome:"sendinfo"} ] },
  obj_think: { stage:"Objection", title:"\"Let me think about it\"",
    say: ["Sure. What's the main thing you'd want to think through?", "Want me to hold {slot1} with Mike anyway? Easy to cancel if you decide against it."],
    do: ["If the thing they're stuck on is a question you can't answer, go to find-out."],
    options: [ {label:"Hold the time", to:"booked"}, {label:"It's a question I can't answer", to:"FINDOUT"}, {label:"Call back later", to:"wrap", outcome:"callback"} ] },
  obj_legit: { stage:"Objection", title:"\"Who are you guys?\"",
    say: ["Fair question. Ahern AI is Mike Ahern, based in Gordon. He's been doing IT and network work for twelve years and builds everything himself.",
          "The website, ahernai.com, is his work. Have a look, and you can reach us at hello@ahernai.com."],
    do: ["Don't oversell. Point them at the site and let it do the work."],
    options: [ {label:"Satisfied, keep going", to:"discovery"}, {label:"Wants info first", to:"obj_sendinfo"} ] },
  obj_hasguy: { stage:"Objection", title:"\"I've got someone who does that\"",
    say: ["That's great, stick with what works. If it ever stalls, we're at ahernai.com.", "Mind if I check back in a few months?"],
    do: ["Never say anything about their web person. Note when to follow up."],
    options: [ {label:"OK to check back", to:"wrap", outcome:"callback"}, {label:"No", to:"wrap", outcome:"notinterested"} ] },
  dnc: { stage:"Do not call", title:"They want off the list",
    say: ["Understood. I'll take you off our list. Have a good one."],
    do: ["That's it. No pitch, no \"just one more thing\".", "Save it as Do not call. The desk will flag this number if anyone tries it again."],
    options: [ {label:"Save as Do not call", to:"wrap", outcome:"dnc", danger:true} ] },
  wrap: { stage:"Wrap up", title:"Log it before the next dial", say: [],
    do: ["Check the outcome on the call sheet, add notes, and hit Save call to log.",
         "Booked? Mike gets it in the log to send the confirmation.",
         "Questions you couldn't answer are already queued for Mike."],
    options: [] },
};
const OBJ_MENU = [
  ["Bad time","bad_time"],["Not interested","obj_notinterested"],["Price","obj_price"],["Send me info","obj_sendinfo"],
  ["Need to think","obj_think"],["We're fine as is","obj_happy"],["Facebook is enough","obj_facebook"],
  ["I've got a web guy","obj_hasguy"],["Who are you guys?","obj_legit"],["Take me off your list","dnc"],
];

/* ---------- render: script ---------- */
function go(to, outcome) {
  if (to === "FINDOUT") { openFindout(); return; }
  nav.history.push(nav.node); if (nav.history.length > 60) nav.history.shift();
  nav.node = to;
  if (outcome) { sheet.outcome = outcome; saveSheet(); renderOutcomes(); }
  store.set("desk.nav", nav);
  closeFindout(); $("#objmenu").hidden = true; $("#btn-obj").setAttribute("aria-expanded", "false");
  renderScript();
  $("#script").scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
}
function renderScript() {
  const n = N[nav.node] || N.prep;
  $("#stage-label").textContent = n.stage;
  $("#stage-title").textContent = n.title;
  const body = $("#stage-body"); body.replaceChildren();
  if (n.say.length) {
    const box = el("div", { class: "say" }, el("span", { class: "say-tag", text: "Say" }));
    n.say.forEach(s => box.append(line(s)));
    body.append(box);
  }
  if (n.do.length) {
    const ul = el("ul"); n.do.forEach(d => ul.append(el("li", {}, [...line(d).childNodes])));
    body.append(el("div", { class: "do" }, el("b", { text: "Do" }), ul));
  }
  if (nav.node === "wrap") {
    body.append(el("div", { class: "row" }, el("button", { class: "btn primary", type: "button", text: "Go to Save call",
      onclick: () => { $("#btn-save").scrollIntoView({ block: "center" }); $("#btn-save").focus(); } })));
  }
  if (n.options.length) {
    body.append(el("p", { class: "choices-h", text: "What did they say?" }));
    const grid = el("div", { class: "choices" });
    n.options.forEach(o => grid.append(el("button", { class: "choice" + (o.danger ? " danger" : ""), type: "button", onclick: () => go(o.to, o.outcome) },
      el("strong", { text: o.label }), o.hear ? el("span", { class: "hear", text: o.hear }) : null)));
    body.append(grid);
  }
  $("#btn-back").disabled = !nav.history.length;
}
$("#btn-back").addEventListener("click", () => { if (!nav.history.length) return; nav.node = nav.history.pop(); store.set("desk.nav", nav); closeFindout(); renderScript(); });
$("#btn-restart").addEventListener("click", () => {
  const b = $("#btn-restart");
  const dirty = sheet.business || sheet.contact || sheet.notes;
  if (dirty && !b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Clear unsaved call?"; setTimeout(() => { delete b.dataset.armed; b.textContent = "New call"; }, 3500); return; }
  delete b.dataset.armed; b.textContent = "New call";
  resetCall();
});
const objmenu = $("#objmenu");
OBJ_MENU.forEach(([label, to]) => objmenu.append(el("button", { type: "button", text: label, onclick: () => go(to) })));
$("#btn-obj").addEventListener("click", () => { objmenu.hidden = !objmenu.hidden; $("#btn-obj").setAttribute("aria-expanded", String(!objmenu.hidden)); });

/* ---------- find-out ---------- */
function openFindout() {
  $("#findout").hidden = false;
  const p = line("Good question. I don't want to guess on that. Mike's our developer and he'll give you a straight answer. Let me write it down exactly. … Got it. I'll get back to you with the answer by {due}. Is a call or an email better?");
  p.id = "fo-line"; $("#fo-line").replaceWith(p);
  $("#fo-text").focus();
}
function closeFindout() { $("#findout").hidden = true; $("#fo-text").value = ""; $("#fo-contactinfo").value = ""; }
$("#btn-findout").addEventListener("click", openFindout);
$("#fo-cancel").addEventListener("click", closeFindout);
$("#fo-save").addEventListener("click", async (ev) => {
  const text = $("#fo-text").value.trim();
  if (!text) { toast("Type their question first."); $("#fo-text").focus(); return; }
  const reach = $("#fo-reach").value;
  const body = {
    request_key: ev.currentTarget.dataset.key || (ev.currentTarget.dataset.key = key()),
    text, reach, reach_to: $("#fo-contactinfo").value.trim() || (reach === "email" ? sheet.email : sheet.phone) || "",
    business: sheet.business, contact: sheet.contact, phone: sheet.phone, email: sheet.email,
  };
  const btn = ev.currentTarget; btn.disabled = true;
  try {
    const r = await api("/questions", { method: "POST", body });
    delete btn.dataset.key;
    callQs.push({ id: r.id, text, due: r.due_by }); store.set("desk.callQs", callQs);
    renderCallQs(); closeFindout(); refresh();
    toast("Queued for Mike. Answer due " + fmtDue(r.due_by) + ".");
  } catch (e) {
    if (e.status === 400) { toast(e.message); }
    else {
      // Keep the question on the call so nothing is lost; the retry key stays on the button.
      sheet.notes = (sheet.notes ? sheet.notes + "\n" : "") + "FIND-OUT (not queued yet): " + text; $("#s-notes").value = sheet.notes; saveSheet();
      toast("Couldn't reach the desk. The question is in your notes. Hit save again to queue it.");
    }
  } finally { btn.disabled = false; }
});
function renderCallQs() {
  const ul = $("#call-qs"); ul.replaceChildren();
  if (!callQs.length) { ul.append(el("li", { class: "empty-hint", text: "None yet. Use the teal button the moment you're unsure." })); return; }
  callQs.forEach(q => ul.append(el("li", {}, el("div", { text: q.text }), el("span", { class: "due", text: "Answer due " + fmtDue(q.due) }))));
}

/* ---------- call sheet ---------- */
const inputOf = (f) => $("#s-" + f);
function fillSheet() {
  FIELDS.forEach(f => { const i = inputOf(f); if (i) i.value = sheet[f] || ""; });
  if (!sheet.seen) inputOf("seen").value = "none";
  $("#seenother-wrap").hidden = sheet.seen !== "other";
  renderOutcomes();
}
function saveSheet() { store.set("desk.sheet", sheet); }
let rerenderT;
FIELDS.forEach(f => {
  const i = inputOf(f); if (!i) return;
  i.addEventListener("input", () => {
    sheet[f] = i.value; saveSheet();
    if (f === "seen") $("#seenother-wrap").hidden = sheet.seen !== "other";
    clearTimeout(rerenderT); rerenderT = setTimeout(renderScript, 150);
    if (f === "business" || f === "phone") checkPrior();
  });
});
function renderOutcomes() {
  const box = $("#outcomes"); box.replaceChildren();
  OUTCOMES.forEach(([k, label]) => {
    const input = el("input", { type: "radio", name: "outcome", id: "o-" + k, value: k });
    input.checked = sheet.outcome === k;
    input.addEventListener("change", () => { sheet.outcome = k; saveSheet(); });
    box.append(el("label", { for: "o-" + k }, input, el("span", { text: label })));
  });
}
function checkPrior() {
  const ph = normPhone(sheet.phone), biz = sheet.business.trim().toLowerCase();
  const match = (business, phoneNorm) => (ph.length === 10 && phoneNorm === ph) || (biz.length > 3 && String(business || "").trim().toLowerCase() === biz);
  const dnc = dncList.find(d => match(d.business, d.phone_norm));
  const hits = calls.filter(c => match(c.business, c.phone_norm));
  const a = $("#dnc-alert"), p = $("#prior-alert");
  if (dnc) { a.hidden = false; a.textContent = "Do not call. " + (dnc.business || "This number") + " asked to be removed on " + fmtWhen(dnc.created_at) + ". Don't dial."; }
  else a.hidden = true;
  if (hits.length && !dnc) {
    const last = hits[0]; p.hidden = false;
    p.textContent = "Called before: " + hits.length + "×. Last on " + fmtWhen(last.created_at) + " — " + outcomeLabel(last.outcome) + (last.notes ? ". Note: " + String(last.notes).slice(0, 140) : "") + ".";
  } else p.hidden = true;
}
function resetCall() {
  sheet = blankSheet(); nav = { node: "prep", history: [] }; callQs = [];
  store.set("desk.sheet", sheet); store.set("desk.nav", nav); store.set("desk.callQs", callQs);
  fillSheet(); renderCallQs(); closeFindout(); renderScript(); checkPrior();
  $("#s-business").focus();
}
$("#btn-save").addEventListener("click", async () => {
  const hint = $("#save-hint");
  const say = (msg) => { hint.hidden = false; hint.textContent = msg; };
  if (!sheet.business.trim() && !sheet.phone.trim()) return say("Add at least the business name or phone number.");
  if (!sheet.outcome) return say("Pick an outcome first.");
  if (sheet.outcome === "booked" && !sheet.chosen) return say("Booked calls need 'They picked' set to Time A or Time B.");
  if (sheet.outcome === "booked" && !sheet.email.trim()) return say("Booked calls need an email so Mike can confirm.");
  hint.hidden = true;
  const v = vars();
  const body = {
    request_key: sheet.requestKey,
    business: sheet.business, phone: sheet.phone, website: sheet.website, seen: sheet.seen, seen_other: sheet.seenother,
    contact: sheet.contact, role: sheet.role, dm: sheet.dm, email: sheet.email, best: sheet.best,
    outcome: sheet.outcome, consult_at: sheet.chosen === "1" ? sheet.slot1 : sheet.chosen === "2" ? sheet.slot2 : "",
    consult_label: v.chosen || "", notes: sheet.notes, question_ids: callQs.map(q => q.id).filter(Boolean),
  };
  const btn = $("#btn-save"); btn.disabled = true; btn.textContent = "Saving…";
  try {
    await api("/calls", { method: "POST", body });
    toast("Call saved: " + outcomeLabel(body.outcome) + ".");
    resetCall(); refresh();
  } catch (e) {
    say(e.status === 400 ? e.message : e.status === 403 ? "Your account can't save calls. Ask Mike to check your access." : "Didn't save. Check your connection and hit Save again. Nothing on the sheet was lost.");
  } finally { btn.disabled = false; btn.textContent = "Save call to log"; }
});

/* ---------- questions view ---------- */
let qFilter = "open";
$("#qfilters").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; qFilter = b.dataset.f; [...$("#qfilters").children].forEach(x => x.setAttribute("aria-pressed", String(x === b))); renderQuestions(); });
function qState(q) { if (q.status === "relayed") return "relayed"; if (q.status === "answered") return "answered"; return Date.now() > (q.due_by || 0) ? "overdue" : "open"; }
const drafts = {};
function renderQuestions() {
  const box = $("#qcards");
  // Don't rebuild under someone typing an answer.
  if (box.contains(document.activeElement) && document.activeElement.tagName === "TEXTAREA") return;
  box.replaceChildren();
  const openCount = questions.filter(q => q.status === "open").length;
  const c = $("#qcount"); c.textContent = openCount; if (openCount) c.removeAttribute("data-zero"); else c.setAttribute("data-zero", "");
  if (!online) { box.append(el("div", { class: "panel empty-state" }, el("strong", { text: "Loading the queue…" }), "If this doesn't clear, reload the page.")); return; }
  const list = questions.filter(q => qFilter === "all" || q.status === qFilter);
  if (!list.length) {
    box.append(el("div", { class: "panel empty-state" }, el("strong", { text: qFilter === "open" ? "Nothing waiting on Mike" : "Nothing here" }),
      "When Scotty hits \"They asked something I don't know\" on a call, the question shows up here with a one-business-day due date."));
    return;
  }
  for (const q of list) {
    const st = qState(q);
    const card = el("div", { class: "panel qcard " + st },
      el("div", { class: "row", style: "justify-content:space-between" },
        el("span", { class: "pill " + st, text: { open: "Needs answer", overdue: "Overdue", answered: "Ready to relay", relayed: "Done" }[st] }),
        el("span", { class: "meta" }, el("span", { text: "Due " + fmtDue(q.due_by) }))),
      el("div", { class: "qtext", text: q.text }),
      el("div", { class: "meta" },
        el("span", { text: [q.business, q.contact].filter(Boolean).join(" · ") || "No business recorded" }),
        el("span", { text: "Reply by " + (q.reach || "call") + (q.reach_to ? ": " + q.reach_to : "") }),
        el("span", { text: "Asked " + fmtWhen(q.asked_at) + (q.by_name ? " by " + q.by_name : "") })));
    if (q.status === "open") {
      if (IS_OWNER) {
        const ta = el("textarea", { id: "ans-" + q.id, placeholder: "Your answer, in words Scotty can read out" });
        ta.value = drafts[q.id] || ""; ta.addEventListener("input", () => { drafts[q.id] = ta.value; });
        card.append(el("label", { class: "f", for: "ans-" + q.id }, "Answer", ta),
          el("div", { class: "row" }, el("button", { class: "btn primary sm", type: "button", text: "Mark answered", onclick: async (ev) => {
            const a = ta.value.trim(); if (!a) { toast("Write the answer first."); ta.focus(); return; }
            ev.currentTarget.disabled = true;
            try { await api("/questions/" + encodeURIComponent(q.id) + "/answer", { method: "POST", body: { answer: a } }); delete drafts[q.id]; ta.blur(); toast("Answered. Scotty can relay it."); refresh(); }
            catch (e) { ev.target.disabled = false; toast(e.message || "Didn't save. Try again."); }
          } })));
      } else {
        card.append(el("div", { class: "meta", text: "Waiting on Mike." }));
      }
    } else {
      card.append(el("div", { class: "answer", text: q.answer || "" }));
      if (q.status === "answered") card.append(el("div", { class: "row" },
        el("button", { class: "btn sm", type: "button", text: "Relayed to prospect", onclick: async (ev) => {
          ev.currentTarget.disabled = true;
          try { await api("/questions/" + encodeURIComponent(q.id) + "/relay", { method: "POST", body: {} }); toast("Marked done."); refresh(); }
          catch (e) { ev.target.disabled = false; toast(e.message || "Didn't save. Try again."); }
        } })));
    }
    box.append(card);
  }
}

/* ---------- log view ---------- */
let lFilter = "all", lSearch = "";
$("#lfilters").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; lFilter = b.dataset.f; [...$("#lfilters").children].forEach(x => x.setAttribute("aria-pressed", String(x === b))); renderLog(); });
$("#log-search").addEventListener("input", (e) => { lSearch = e.target.value.trim().toLowerCase(); renderLog(); });
function renderLog() {
  const tb = $("#logbody"); tb.replaceChildren();
  if (!online) { tb.append(el("tr", {}, el("td", { colspan: "8", class: "empty-state" }, el("strong", { text: "Loading the call log…" }), "If this doesn't clear, reload the page."))); return; }
  const ph = lSearch.replace(/\D/g, "");
  const rows = calls.filter(c => (lFilter === "all" || c.outcome === lFilter) &&
    (!lSearch || [c.business, c.contact, c.dm].some(s => String(s || "").toLowerCase().includes(lSearch)) || (ph.length >= 3 && String(c.phone_norm || "").includes(ph))));
  if (!rows.length) { tb.append(el("tr", {}, el("td", { colspan: "8", class: "empty-state" }, el("strong", { text: calls.length ? "No calls match" : "No calls logged yet" }), calls.length ? "Try a different filter." : "Saved calls from the Call tab show up here, newest first."))); return; }
  rows.forEach(c => {
    let consult;
    if (c.outcome === "booked") {
      const action = c.confirmed ? el("span", { class: "pill booked", text: "Confirmed" })
        : IS_OWNER ? el("button", { class: "btn sm", type: "button", text: "Mark confirmed", onclick: async (ev) => {
            ev.currentTarget.disabled = true;
            try { await api("/calls/" + encodeURIComponent(c.id) + "/confirm", { method: "POST", body: {} }); toast("Confirmed."); refresh(); }
            catch (e) { ev.target.disabled = false; toast(e.message || "Didn't save. Try again."); }
          } })
        : el("span", { class: "pill callback", text: "Mike to confirm" });
      consult = el("td", {}, el("div", { text: c.consult_label || fmtSlot(c.consult_at) || "—" }), action);
    } else consult = el("td", { text: c.best || "—" });
    tb.append(el("tr", {},
      el("td", { class: "num", text: fmtWhen(c.created_at) }),
      el("td", {}, el("div", { style: "font-weight:600", text: c.business || "—" }), el("div", { class: "meta", text: c.phone || "" })),
      el("td", {}, el("div", { text: c.contact || "—" }), el("div", { class: "meta", text: [c.role, c.dm ? "DM: " + c.dm : "", c.email].filter(Boolean).join(" · ") })),
      el("td", {}, el("span", { class: "pill " + c.outcome, text: outcomeLabel(c.outcome) })),
      consult,
      el("td", { style: "max-width:320px;white-space:pre-wrap", text: c.notes || "" }),
      el("td", { text: c.by_name || "—" }),
      el("td", {}, el("button", { class: "btn sm", type: "button", text: "Call again", onclick: () => loadForRecall(c) }))));
  });
}
function loadForRecall(c) {
  sheet = Object.assign(blankSheet(), { business: c.business || "", phone: c.phone || "", website: c.website || "", seen: c.seen || "none", seenother: c.seen_other || "",
    contact: c.dm || c.contact || "", role: c.dm ? "" : (c.role || ""), email: c.email || "", best: c.best || "" });
  nav = { node: "prep", history: [] }; callQs = [];
  store.set("desk.sheet", sheet); store.set("desk.nav", nav); store.set("desk.callQs", callQs);
  fillSheet(); renderCallQs(); renderScript(); checkPrior();
  location.hash = "#call";
}

/* ---------- settings ---------- */
let configDirty = false;
["#c-avail", "#c-length", "#c-phone"].forEach(s => $(s).addEventListener("input", () => { configDirty = true; }));
function renderConfig() {
  $("#avail").textContent = config.availability ? config.availability + "\nConsult: " + (config.length || 20) + " min" : "Mike's availability hasn't been set yet. Ask Mike before offering times.";
  if (!configDirty) { $("#c-avail").value = config.availability || ""; $("#c-length").value = config.length || 20; $("#c-phone").value = config.callback_phone || ""; }
}
["#c-avail", "#c-length", "#c-phone", "#c-save"].forEach(s => { $(s).disabled = !IS_OWNER; });
$("#settings-note").textContent = IS_OWNER ? "Scotty sees these on the call sheet and in the voicemail script." : "Mike sets these. You see them on the call sheet.";
$("#c-save").addEventListener("click", async () => {
  const body = { availability: $("#c-avail").value.trim(), length: parseInt($("#c-length").value, 10) || 20, callback_phone: $("#c-phone").value.trim() };
  try { await api("/config", { method: "PUT", body }); configDirty = false; toast("Settings saved."); refresh(); }
  catch (e) { toast(e.message || "Didn't save. Try again."); }
});

/* ---------- copy ---------- */
document.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-copy]"); if (!b) return;
  try { await navigator.clipboard.writeText(b.dataset.copy); toast("Copied."); }
  catch { const r = document.createRange(); r.selectNodeContents(b.parentNode.firstChild); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast("Selected. Press Ctrl+C."); }
});

/* ---------- routing ---------- */
const VIEWS = ["call", "questions", "log", "cheat"];
function route() {
  const v = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "call";
  VIEWS.forEach(x => { $("#view-" + x).hidden = x !== v; });
  document.querySelectorAll("nav.tabs a").forEach(a => { if (a.dataset.tab === v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  if (v === "questions") renderQuestions();
  if (v === "log") renderLog();
}
addEventListener("hashchange", route);

/* ---------- sync ---------- */
let inflight = false;
async function refresh() {
  if (inflight) return; inflight = true;
  try {
    const s = await api("/state");
    calls = s.calls || []; questions = s.questions || []; dncList = s.dnc || []; config = s.config || config; nextDue = s.next_due || null;
    online = true;
    renderConfig(); renderQuestions(); checkPrior(); renderScript();
    if (!$("#view-log").hidden) renderLog();
  } catch (e) {
    if (e.status !== 401 && !online) toast("Couldn't load the desk. Retrying…");
  } finally { inflight = false; }
}
// Poll while visible: other people's calls, answers and do-not-call flags show up within 20s.
setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 20000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refresh(); });

/* ---------- boot ---------- */
fillSheet(); renderCallQs(); renderScript(); renderConfig(); route(); refresh();
})();
