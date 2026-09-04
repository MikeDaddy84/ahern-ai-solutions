// Static content pages — About and Privacy.
//
// These live here rather than in public/ as hand-written HTML because they need
// the same chrome, canonical and OG tags as everything else, and duplicating
// the header and footer into two more files is how those four copies start
// drifting apart. renderPage() already does that job for the blog.
//
// The privacy page describes what lib/db.js actually stores, field by field. It
// is deliberately specific instead of boilerplate: a generic policy that talks
// about "third-party advertising partners" this site does not have is worse
// than useless, because the honest version is a selling point here. IF YOU ADD
// A TRACKER, AN EMBED, OR A NEW COLUMN, THIS PAGE IS NOW WRONG — update it in
// the same commit.

const CONTACT_PHONE = '(940) 329-9337';
const CONTACT_TEL = '+19403299337';

function aboutHtml() {
  return `
    <section class="container blog-hero">
      <p class="eyebrow">About</p>
      <h1>One person, three pillars, no handoffs.</h1>
      <p>Ahern AI Solutions is a one-person shop in Gordon, Texas, serving the North Texas area. The person who scopes your project is the person who builds it and the person who answers the phone afterwards.</p>
    </section>

    <section class="container post">
      <div class="post-body">
        <h2>Why one person is the point</h2>
        <p>Most businesses that need this work end up talking to three different companies. An automation agency wires up the workflow and hands you off when the question becomes what machine should run it. A PC builder sells you a box and the relationship ends at the door. Nobody local does private, on-premise AI at all &mdash; the piece that matters most if you handle client files, health records, or anything else that cannot go through a cloud model.</p>
        <p>Holding all three means the workflow, the hardware it runs on, and the private model that connects them get designed together, by someone who has to live with all three decisions. It also means there is no account manager between you and the person doing the work.</p>

        <h2>The person holding all three</h2>
        <p>I am Mike Ahern. I started as an installer at NextLink &mdash; running cable and mounting hardware, the physical end of the job. Two years in I was the company's VoIP engineer, and helped build and grow a phone service that came to carry tens of thousands of customers: hospitals, schools, small businesses, and private homes.</p>
        <p>Then I moved to KCS as a technician. For several years I was the entire support staff &mdash; every ticket, every outage, every user in the company. I became VP/CTO in 2022.</p>
        <p>Twelve years of that is why this business has three pillars rather than one. Nobody ever handed me a broken workflow and the machine running it as two separate problems, and being the only support person in a company teaches you quickly that they never were. I have made a habit of following technical problems past the point where they stop belonging to one job title.</p>
        <p>The decisions and the result land with me. I am also liable to disappear down a technical rabbit hole, come back with the answer, and explain it without making you learn the spellbook.</p>
        <p>I serve as treasurer and a deacon at First Baptist Church Gordon. Treasurer is the one worth raising in a business context: an elected job handling other people's money, for people who will ask me about it directly if anything looks wrong. Outside that, I am a husband and a father of four. None of this is a technical certification and I will not pretend it is &mdash; but it does mean I am used to stewardship, discretion, and being accountable to people I expect to see again. That is the standard I bring to client work.</p>

        <h2>What that means in practice</h2>
        <ul>
          <li><strong>You talk to the builder.</strong> Not a salesperson, not a ticket queue.</li>
          <li><strong>Quotes come from a real model, not a feeling.</strong> The <a href="/pc-builder">PC Builder</a> prices your machine from the same component data I buy against &mdash; components and platform at cost plus a disclosed 10% handling fee, and the fee is on the page, not in the total.</li>
          <li><strong>Scope is fixed before work starts.</strong> Automation packages are fixed-price. You know the number before I start, and it does not move because something took longer than I thought.</li>
          <li><strong>Small enough to say no.</strong> If what you need is a $200 fix or a piece of software that already exists, I would rather tell you that than sell you a project.</li>
        </ul>

        <h2>Where this business is right now</h2>
        <p><strong>The business is new. The work is not.</strong> Ahern AI Solutions has no client list yet, and I would rather say that plainly than dress up a launch as a track record &mdash; you can read the difference anyway, and starting a relationship by overstating one is a poor trade for both of us.</p>
        <p>What that means for you: the writing in the <a href="/blog">reference builds</a> is exactly what it says it is &mdash; how I would approach a problem, costed from real components &mdash; and not a report on work already delivered. When there are client results worth publishing, they will be published as results, with the client's name on them and their permission to use it.</p>
        <p>What it also means: early clients get an unreasonable amount of attention, and pricing set to win the first ten relationships rather than to maximise any one of them.</p>

        <h2>The work</h2>
        <ul>
          <li><strong>AI automation.</strong> Lead follow-up, scheduling, inbox triage, data entry, and the repetitive admin that eats a week. Wired into the tools you already use.</li>
          <li><strong>Custom PCs and workstations.</strong> Gaming rigs, creator and professional workstations, built around your actual software rather than a spec sheet.</li>
          <li><strong>Private local AI.</strong> GPU-equipped systems that run capable models on-site, so sensitive documents never leave the building.</li>
          <li><strong>Websites and internal tools</strong>, built as the front end of a system that has been automated behind it.</li>
        </ul>

        <h2>Get in touch</h2>
        <p>Gordon, Texas &middot; serving the North Texas area.<br />
        <a href="tel:${CONTACT_TEL}">${CONTACT_PHONE}</a></p>
        <p><a href="/#audit">Book a free consultation</a> &mdash; it is a conversation about what you need, not a sales call with a deck.</p>
      </div>
    </section>
  `;
}

function privacyHtml() {
  return `
    <section class="container blog-hero">
      <p class="eyebrow">Privacy</p>
      <h1>What this site collects, in plain English.</h1>
      <p>Short version: a contact form you chose to fill in, and a count of which pages get visited. No advertising trackers, no cookies, no third-party analytics, and nothing sold to anyone. Last updated September 2026.</p>
    </section>

    <section class="container post">
      <div class="post-body">
        <h2>When you fill in the contact form</h2>
        <p>The form stores exactly the fields it shows you: <strong>your name, email address, business name, what you are interested in, and your message.</strong> Alongside those it records the page that referred you and your browser's user-agent string, which is the line every browser sends identifying itself and your operating system.</p>
        <p>That information is used to reply to you and to keep track of the conversation. It is not added to a mailing list, not shared with anyone, and not sold. If you would like it deleted, ask and it will be deleted.</p>

        <h2>When you just read the site</h2>
        <p>A first-party analytics beacon records <strong>which page was viewed, where you came from, your browser's user-agent, and the time.</strong> That is the complete list.</p>
        <p>It does not record your IP address. It does not set a cookie. It does not assign you an identifier, so there is no way to connect one page view to another, or to recognise you on a later visit. It cannot follow you to any other website, because it exists only here. The purpose is to know whether anyone is reading the blog and which services people look at &mdash; not to build a profile of you.</p>

        <h2>Cookies</h2>
        <p><strong>This site sets no cookies.</strong></p>
        <p>Your theme choice &mdash; light or dark &mdash; is kept in your own browser's local storage under the key <span class="mono">ahern-theme</span>. That value never leaves your device and is never sent to the server. Clearing your browser data removes it and nothing else happens.</p>

        <h2>Third parties</h2>
        <p>The site loads its typefaces from Fontshare (<span class="mono">api.fontshare.com</span>). Like any font or asset host, their servers can see your IP address and which page requested the font, because that is how the web works. Fontshare is used for fonts only and receives nothing else about you.</p>
        <p>There is no Google Analytics, no advertising pixel, no Facebook tag, no session recorder, no chat widget, and no embedded video or social media.</p>

        <h2>Where the data lives</h2>
        <p>The website runs on Render and the data is stored in a hosted Turso database. Both are infrastructure providers holding the data on my behalf; neither uses it for their own purposes.</p>

        <h2>How long it is kept</h2>
        <p>Contact submissions are kept while there is a reason to &mdash; an ongoing conversation, a quote, an active project, or a warranty. Page-view records are kept as aggregate traffic history. Since page views carry no identifier, they cannot be traced back to a person, which means there is nothing personal in them to delete.</p>

        <h2>Your choices</h2>
        <p>Ask and I will tell you what has been stored about you, correct it, or delete it. There is no form for this and no waiting period. Use the contact form or call:</p>
        <p><a href="/#audit">Contact form</a><br />
        <a href="tel:${CONTACT_TEL}">${CONTACT_PHONE}</a></p>
        <p>You can also block the analytics beacon with any content blocker, or by disabling JavaScript. The site works either way &mdash; nothing on it depends on being measured.</p>

        <h2>Children</h2>
        <p>This is a business-to-business site and is not directed at children under 13. No information is knowingly collected from them.</p>

        <h2>Changes</h2>
        <p>If what is collected changes, this page changes in the same update, and the date at the top moves. This is a plain-language description of actual practice rather than a legal document; if you need something more formal for your own compliance requirements, ask and I will provide it.</p>
      </div>
    </section>
  `;
}

module.exports = { aboutHtml, privacyHtml };
