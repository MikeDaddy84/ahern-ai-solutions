---
title: What private, offline AI looks like for a small law office
date: 2026-06-30
tag: Reference build — Private local AI
excerpt: Client confidentiality makes cloud AI tools a non-starter. Here's how a fully local alternative is built, and what it costs.
---

## The constraint

A small law office wants the productivity boost everyone else is getting from AI — drafting help, summarization, quick research assistance — and runs straight into an obvious, non-negotiable problem: client documents can't be pasted into a public chatbot. Privilege and confidentiality rules don't bend for convenience, and "the AI company says they don't train on your data" is a different claim from *the data never left the building*.

This is the wall I hear about most often, and not only from law firms.

## How this gets built

Rather than avoid AI entirely, the answer is a workstation-class local system that never touches the internet with client data:

- **Dedicated hardware.** A quiet, purpose-built workstation with enough GPU memory to run capable open-weight models entirely offline. As of September 2026 a 70B-class machine runs **$15,850–$20,725** depending on configuration; a unified-memory appliance starts around **$3,075** if capacity matters more than speed per token. Memory and GPUs are moving 10–15% a quarter right now, so treat those as a shape rather than a quote.
- **Local model stack.** Document summarization, drafting assistance, and search running on-device — no API calls, no cloud logging, no third party in the loop.
- **Firm-wide search.** A private index over the firm's own document history, so finding *that clause from the Miller filing in 2024* takes seconds instead of a folder-by-folder hunt.
- **Simple handoff.** No new workflow to learn. The interface sits alongside the tools the office already uses daily.

You can price either shape of this yourself in the [PC Builder](/pc-builder) — the same engine I quote from.

## What to expect

The drafting and research speed-up is real but ordinary; it is roughly what any competent AI assistant gives you, minus the largest frontier models' edge on the hardest reasoning tasks. Open-weight models you can run on your own hardware have closed most of that gap for summarization, drafting and retrieval, which is what this work actually is.

The part that is categorically different is the answer to the only question that matters for a firm under privilege: *does anything leave this building?* No. Not "no, subject to a vendor's data-retention policy" — no, because there is no network path for it to leave by.

**The honest trade:** you own the hardware, so you carry the capital cost and the maintenance. You give up the frontier model's last few points of capability. What you get back is certainty about where the data goes, no per-seat subscription that grows with your headcount, and no vendor who can change their terms next year.

## The bigger pattern

Private local AI isn't only for law firms. Anyone handling sensitive data — health records, financial details, proprietary source code, unreleased product plans — hits the same wall with cloud tools. A local system trades a bit of raw model scale for something cloud tools structurally cannot offer.

If *we can't use AI because of X* has been the answer at your business, it's worth checking whether X is a cloud problem rather than an AI problem.

*This is a reference build — how I'd approach the problem, priced from the live component model. It isn't a report on a past client engagement.*
