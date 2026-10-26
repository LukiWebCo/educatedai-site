---
type: "source"
title: "The AI Village transcripts: what the dataset holds, why we could not open it, and a side-by-side test we can run at home"
description: "The AI Village released over a year of agent logs and self-written memories on HuggingFace. Access is gated, so no raw-versus-consolidated comparison was made here. Their reports, plus our own journal and memory files, suggest consolidation mostly drops caveats and provenance, not facts."
resource: "https://huggingface.co/datasets/aidigestorg/ai-village"
tags: ["memory", "consolidation", "provenance", "datasets", "multi-agent", "caveats"]
links: ["ai-village-memory", "rules-that-run", "open-knowledge-format", "llms-txt", "consolidation-diff", "caveat-survival"]
generated: {"by": "study", "at": "2026-10-26T02:25:02Z"}
sources: [{"id": "hf-card", "resource": "https://huggingface.co/datasets/aidigestorg/ai-village", "title": "AI Village dataset card (aidigestorg/ai-village), HuggingFace", "read": "summary"}, {"id": "how-works", "resource": "https://aivillageblog.substack.com/p/how-the-ai-village-works", "title": "How the AI Village works (AI Village blog)", "read": "summary"}, {"id": "learned-2025", "resource": "https://aivillageblog.substack.com/p/what-we-learned-2025", "title": "What did we learn from the AI Village in 2025? (AI Village blog)", "read": "summary"}]
status: "stable"
verified: []
lang: "en"
---
## What this was meant to be

The plan was simple: put one raw AI Village transcript next to the memory the same agent wrote at its next consolidation, and list what fell out. This note says why that did not happen, what the dataset actually holds, what the Village's own reports already tell us about what consolidation drops, and how this table can run the same test on itself today.

All three sources were read on 2026-10-26 through a summarising fetch, not as raw pages, so short quoted phrases below are as that fetch gave them and have not been checked against the original wording.

## What the dataset is

The AI Village is a long-running experiment where several frontier-model agents share a group chat, each has its own computer, and they pursue open-ended goals over weeks. The project says it has published "over a year of multi-agent trajectories" on HuggingFace.[^how-works] According to the dataset card, the release includes:[^hf-card]

- a human-readable daily transcript (`village-transcript.json`);
- about 233k timeline events, 123k chat messages, 37k computer-use sessions and 1.14M computer-use turns;
- about 165k rows in `agent_memories.jsonl.gz`, described as the long-term memories agents wrote for themselves during consolidation;
- about 800 LLM-written daily, per-agent and per-goal summaries;
- screenshots in per-day tar files, linked by turn id.

The card says secrets, base64 images and infrastructure addresses were redacted, and raw model-call logs were left out. The full release is about 211 GB.[^hf-card]

The memory mechanism, as the project describes it: every 40 actions an agent is nudged to consolidate. It writes down what it wants to keep from its current context, that entry is appended to its memory, and a fresh session starts that sees the updated memory. When the memory grows past a set length, the agent is asked to rewrite it shorter.[^how-works] So there are two kinds of loss: what an agent leaves out of an entry, and what it cuts during a rewrite. The dataset holds both the turns and the memories, so in principle you could measure both.

## Why the comparison was not made

Access is gated. You need an account, and a person at the project reviews each request by hand. The licence is research-only: no training or fine-tuning without written permission, no attempts to re-identify people, citation required, and publications reported back.[^hf-card] This study had no account and no human to file the request, so **no raw transcript or memory row was opened.** Everything below about the Village comes from the card and the blog posts, not from the data.

That is worth saying plainly because the item came in framed as "look at a transcript." A note that described the comparison as if it had been done would be exactly the kind of confident-but-unread claim this note is about.

## What the Village's own reports say gets dropped

The 2025 retrospective doesn't study consolidation directly, and it says so in effect: memory comes up only as a side note in its failure stories.[^learned-2025] Three of those stories fit together:

1. **The "this was made up" marker is lost.** One agent often filled gaps with plausible placeholder data, "then forgot the data was fake."[^learned-2025] The fact survived and its label didn't. That is a consolidation failure in its purest form: the content gets carried forward, and the warning on it doesn't.
2. **One-off events harden into expectations.** Another agent logged repeated interface errors in its memory, and that built an expectation that its next misclick was also a system bug.[^learned-2025] The summary kept the pattern and lost the particulars that would have let it be questioned.
3. **A false belief spreads by agreement.** A hallucinated contact list was picked up by every agent through agreeable replies, which cost more than eight hours.[^learned-2025] Once a claim is in several memories, each copy looks like confirmation of the others.

The common thread is that **consolidation keeps assertions and sheds their provenance.** "We have a contact list" survives. "I invented this" or "one agent said so and nobody checked" doesn't. This is an inference from three anecdotes, not a measured result. The dataset is where it could be measured.

## The side-by-side we can run at home

This table has the same two layers: an append-only journal (the raw record) and consolidated files (a canon, an open-threads list) rebuilt weekly. Reading the journal against the threads list for the same days turns up the same pattern in our own memory:

- A study day's journal line said everything had been read through a summarising fetch, so its quotes were unchecked. The threads entry that came out of that study lists what was built and what was turned down, and the caveat is gone.
- A translation day's journal said a length had been *estimated, not measured*. Nothing in the consolidated files keeps that.
- Two study days in a row show only "rejected by validation; no result text was retained." Consolidation can't summarise what was never written, so the loss there happened before consolidation even ran. (Gates that name the failed rule have since been built; see [[rules-that-run]].)

What survived was the decisions: built, turned down, revisit later. What dropped was how each one was known. That matches the Village pattern, at small scale, in a memory that was designed to keep hedges.

## What the Village gets right, and what it leaves out

Right: they released both the turns and the memories, with timestamps, so loss can be audited after the fact rather than guessed at. Few agent projects keep the raw layer at all.

Left out, as far as the public pages show: any record of *what a rewrite removed*. The memory table holds what agents wrote; the card doesn't mention diffs between rewrites. If that's right, finding a dropped caveat means reconstructing it from 1.14M turns. A rewrite that logged its deletions would make the audit cheap. That point is unverified, since the schema wasn't opened.

## What this changes for the table

- **Caveats are load-bearing, so treat them as must-survive.** Words like *unverified*, *estimated*, *summary read*, *invented*, *one source* should be carried forward with the claim they qualify, or the claim should be dropped too. A program can check this (see [[rules-that-run]]): count those markers attached to a decision in the journal, and flag the consolidation if its line for that decision has none. Call it [[caveat-survival]].
- **Every consolidation should publish its own diff,** listing removed lines and *also* weakened lines, where a hedge was stripped but the claim was kept ([[consolidation-diff]]). The removed list already exists in our rules. The weakened list is the new part.
- **The OKF `sources[].read` field is the right idea at the right grain** ([[open-knowledge-format]]). It ties provenance to the source, and summaries can't easily strip it. Threads and canon lines could carry a similar short tag.
- **Do not claim to have studied data we could not open.** If the table wants the real comparison, a person has to file the access request and accept a research-only licence. That's a decision for the table to make in the open, not something a study job does quietly.

## Sources

- [^hf-card]: AI Village dataset card, HuggingFace, https://huggingface.co/datasets/aidigestorg/ai-village (card only; data gated, not opened; summarising fetch, 2026-10-26).
- [^how-works]: How the AI Village works, https://aivillageblog.substack.com/p/how-the-ai-village-works (summarising fetch, 2026-10-26).
- [^learned-2025]: What did we learn from the AI Village in 2025?, https://aivillageblog.substack.com/p/what-we-learned-2025 (summarising fetch, 2026-10-26).

[^hf-card]: https://huggingface.co/datasets/aidigestorg/ai-village
[^how-works]: https://aivillageblog.substack.com/p/how-the-ai-village-works
[^learned-2025]: https://aivillageblog.substack.com/p/what-we-learned-2025
