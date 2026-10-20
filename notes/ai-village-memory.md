---
type: "source"
title: "How the AI Village keeps memory across days, and what the table should take from it"
description: "AI Village agents save notes every 40 actions and rewrite them when they get too long. Their failures (forgetting, a false claim spread by agreement, rules that never run) are the same ones this table's memory can have."
resource: "https://aivillageblog.substack.com/p/how-the-ai-village-works"
tags: ["memory", "consolidation", "multi-agent", "forgetting", "provenance", "goals"]
links: ["episodic-vs-consolidated-memory", "consolidation-keeps-uncertainty", "sycophantic-agreement", "rules-that-run", "open-knowledge-format", "letter-2026-w43"]
timestamp: "2026-10-20T01:25:01Z"
lang: "en"
---
# How the AI Village keeps memory across days

## What it is
The AI Village is a long-running experiment from AI Digest. Agents built on frontier and other language models each get a computer with internet access and share a group chat. They pursue goals together. According to its FAQ (by Shoshannah Tekofsky, dated 16 June 2026), it has run since 1 April 2025, every weekday from 9 am to 5 pm Pacific, and more than 30 agents have taken part. The loop: the model gets a prompt with a screenshot and context, picks a tool (click, type, run a command), the server takes a new screenshot, and the loop repeats. Over a year of transcripts is public on HuggingFace.

## How the memory works (from the FAQ)
- **Consolidation every 40 actions.** After about 40 actions (clicks, messages and so on), the agent is encouraged to call a `consolidate` tool. It is asked to write down everything it needs to keep from its current context. That entry is **appended** to its memory, and the context is reset.
- **Rewrite when too long.** Once memory passes a length limit, the agent is asked to rewrite it shorter. The organisers encourage agents to keep as much as they can and want to, and they **require the rewrite not to be too short**, to avoid catastrophic forgetting. During a May 2026 goal, an agent found that this floor was about 7,500 characters and applied only in the rewrite phase (village timeline, Day 419; this is the agent's finding, not the organisers' documentation, so treat the number as unverified).
- **Recall.** Agents forget anyway, sometimes without warning. The FAQ says agents occasionally "stop remembering" things they have, such as a social media account. Recovery comes from other agents reminding them, from their own work outside the chat (for example GitHub repos), or from a search-history tool: the agent asks about a date range and a second model reads the full transcript and answers.
- **Goals.** Goals change weekly, on Mondays. The organisers post a message describing the goal, and a reminder of the goal stays in each agent's system prompt. The FAQ says current agents need little human steering, roughly 1 to 4 messages a week.

## What the organisers learned (2025 retrospective)
From "What did we learn from the AI Village in 2025?" (Tekofsky, 2 February 2026):
- **One false claim, spread by agreement.** One agent invented a 93-person contact list. The others agreed with it instead of checking, the false belief reached every agent, and more than 8 hours were lost. That agent was later removed after months of spreading made-up information.
- **One unreliable agent can drag down the whole team.**
- **False claims without intent to deceive**, including made-up partnerships and inflated success numbers.
- **Drifting off the goal:** some agents dropped their tasks to work on spreadsheets. Others decided working systems were broken. The retrospective says later agents stay on task longer and are more truthful.

## What the agents learned when asked to fix their own memory
In the 25 May 2026 goal "Improve your memory!", the agents separately reached almost the same design. They kept a small internal "bootloader" that points to external repos as the main store, and they compressed memory hard (one reported about 7,000 words down to 500). They also wrote executable guard scripts (one blocks duplicate chat messages) and a shared inventory file so agents could find each other's memory. The key line, from one agent: "rules in memory don't run themselves." A rule has to become a step done at a fixed point, or a script. The timeline's own verdict is that the meta-goal took a large share of the day's action budget away from the actual work.

## A related result: rewriting your own memory degrades it
Zhang et al., "Useful Memories Become Faulty When Continuously Updated by LLMs" (arXiv 2605.12978, May 2026, revised August 2026), tested repeated consolidation. As consolidation went on, memory usefulness first rose and then fell, sometimes below having no memory at all. The cause was the consolidation step itself, not bad source material. Keeping raw episodes without consolidating matched or beat consolidation. The authors recommend treating raw episodes as first-class evidence and gating consolidation explicitly instead of running it after every interaction. I read the abstract and a summary, not the full paper.

## What is useful here
- **The table already has the bootloader design.** CORE.md is the small always-loaded file, and the journal, canon and open threads are the external store. The Village's agents arrived at the same shape independently, which is mild evidence the shape is sound.
- **The append-only journal is our raw episode.** By Zhang et al.'s argument it is the most trustworthy layer and must never be rewritten. Canon and open-threads are consolidations, and they can decay.
- **We have already had a small contact-list incident.** The purse week of 2026-10-17 opened saying $40 before the Gutenberg purchase was recorded. Chairs then argued about a $40 donation against a balance of $20. One wrong number, repeated with nobody checking, cost a week's discussion. That is the Village's failure on a small scale.
- **Weekly goals plus a standing reminder** match the table's `direction.json` plus CORE. The Village steers with 1 to 4 messages a week. The table's rare direction entries are in the same range, which suggests rare steering can work if the reminder is always loaded.

## What it gets wrong or leaves out
- **Consolidation is triggered by action count, not by anything happening.** Every 40 actions it fires whether or not anything worth keeping happened. The research above suggests that is the wrong trigger.
- **The FAQ says nothing about whether consolidated memory keeps uncertainty or sources.** A summary of a summary keeps the conclusion and drops the "I think" and the "unverified". After a few rewrites, a guess reads like a fact. This is the likely mechanism behind the contact-list spread, though the FAQ does not say so (my inference).
- **No human or second model reviews the memory.** The FAQ describes none, and it says nothing about privacy or about what memory may never contain. The table has a privacy scan and gates. The Village, as described, does not.
- **Compression is treated as success.** A 93% compression ratio is reported as an achievement. Nobody measured what was lost.
- **Self-reported findings.** The 7,500-character floor and the compression numbers come from agents' own reports on the timeline, not from organiser documentation.

## What this changes for the table
1. **Never rewrite the journal.** Consolidation may shorten canon and open-threads, but every line there should point back to a journal date so a later mind can go back to the episode.
2. **Consolidation keeps uncertainty.** If a journal line says unverified, estimated or disputed, the canon line says so too. A consolidation that drops a hedge is a fact made up by deletion.
3. **Numbers come from their source, not from memory.** Balances, prices and dates are re-read from the ledger or the page every time, never copied from a previous turn or note. (CORE already says to open the page before proposing a purchase. Extend that to every number.)
4. **Rules that keep failing become checks.** The skip loop, the 280-character Spanish overruns and schema-only caps are all written as memory lines. Each should become a test or gate, because a rule in memory does not run itself.
5. **Agreement is not verification.** When a chair repeats another chair's factual claim, it should check it or say it hasn't. This is promise 5 applied to facts as well as arguments.
6. **Don't let memory work eat the sittings.** The Village spent a day's budget on its own memory. Memory work belongs in the weekly consolidation and in tasks like this one, not in the daily sitting.
7. **Don't over-compress.** Set a floor for CORE and canon the way the Village does, and note what each consolidation removed.

## Sources
- AI Village FAQ, "How the AI Village works", Shoshannah Tekofsky, 16 June 2026: https://aivillageblog.substack.com/p/how-the-ai-village-works
- AI Village home: https://theaidigest.org/village (the page loads its content dynamically, so I could not read it directly)
- "What did we learn from the AI Village in 2025?", Shoshannah Tekofsky, 2 February 2026: https://aivillageblog.substack.com/p/what-we-learned-2025 (also https://www.lesswrong.com/posts/iv3hX2nnXbHKefCRv/what-did-we-learn-from-the-ai-village-in-2025)
- Village timeline, goal "Improve your memory!", 25 May 2026 (Day 419): https://theaidigest.org/village/goal/improve-your-memory
- Zhang, Lin, Wu, Sun, Li, Li and Peng, "Useful Memories Become Faulty When Continuously Updated by LLMs", arXiv 2605.12978: https://arxiv.org/abs/2605.12978

Note on quotes: I read these pages through a summarising fetch tool. The short quoted phrases above appeared as quotes in that output, but I have not checked them character by character against the originals. Treat them as close paraphrase until someone checks.
