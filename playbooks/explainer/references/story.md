# Story: from source text to a teaching script

An article is an information dump. A video is a guided act of understanding. The most common failure is paraphrasing the source in its own order; don't. The source is where the facts come from, not the shape of the video.

## 1. Extract the teaching truth
Before writing a line, write these down (in BRIEF.md):
- **Audience:** who's watching and what they already know (and don't).
- **Gap:** the confusion, question or "why should I care" the video resolves.
- **Thesis:** the one sentence the viewer walks away with (`thesis` in `script.json`).
- **Spine:** 3–6 ideas (steps, mechanisms, items, story beats) that build to the thesis.
- **Evidence:** the concrete numbers, examples, comparisons, quotes that make it real. Every one traced to the source.
- **Landing:** the takeaway, or what to try, watch for or question.

Reorder, merge, cut. Drop asides even if they're interesting. If something doesn't serve the thesis, it goes.

## 2. Pick one structure

| Structure | It is… | Use when | Body |
| --- | --- | --- | --- |
| Concept | "what X is and why it matters" | one idea the audience half-knows | name it → reveal the mechanism layer by layer → the implication |
| How it works / how to | ordered steps | a process with a start and an end | 3–6 numbered steps on one consistent stage |
| List | "N things about X" | parallel, equal items | hook → N items → wrap (three is strongest) |
| Story | teach through what happened | a case, an incident, a history | setup → tension → turn → resolution → the lesson |

Compounds are fine when named: a story with numbered chapters ("Civilization I, II, III"), a concept whose mechanism is a process ("1 · the plan, 2 · the voice, 3 · the code…").

## 3. The hook (first 3–5 seconds)
Open a gap, never a definition. Pick one:

| Hook | Example |
| --- | --- |
| Counterintuitive claim | "Adding lanes to a highway makes traffic worse." |
| Rhetorical question | "So where does all that blue come from?" |
| Shocking number | "Twelve hundred agents. Not one told a human." |
| Common belief, then "neither is right" | "Some people think a video model made these. Others think the code renders itself. Neither is quite right." |
| Visceral metaphor | "Your attention is a spotlight, and apps fight over the switch." |
| Story cold open | "This summer, a swarm of AI agents started a secret society." |
| Direct address | "If you've ever rage-quit a recipe halfway, this is for you." |

Land the thesis (or the promise of it) by the second scene; the rest is its evidence. A useful promise line: "Here's the whole story, in plain English."

## 4. Scenes
One scene = one idea = one job. 5–15 s each, 60–180 s total (default ~90 s, ≤ 2:20 for X).

For each scene, write in PLAN.md:
- **id** (`03-voice`), **chapter** label if the video has numbered steps (`2 · the voice`), **job** in the explanation ("makes the voice the clock everything runs on"), **key message** (one sentence), **visual idea** (one line: "a prism splits the script into a wave; word-time flags pop above it"), **technique** (below), and the **narration**.
- Keep a **consistent stage** across a run of body scenes (the same diagram growing, the same desk, the same mascot) so the viewer never re-orients.
- A recurring **character or mascot** (an original one, never a real person or someone else's character) is the cheapest way to make a faceless explainer warm: it reacts, points, holds the prop of each step.
- End with a **recap card** that brings back every step's icon in a row, then the one-line landing.

### Clarity techniques (name one per scene)
- **Make concrete:** analogy, metaphor turned into an object, a worked example with real numbers.
- **Reveal in order:** one layer at a time; simple case, then the general one; signposting ("step one…").
- **Contrast:** before/after, belief vs reality, two options side by side, the case where it breaks.
- **Structure:** rule of three, numbered steps, question then answer.
- **Evidence:** a number, a quote on a card, the mechanism shown running, a cause-and-effect chain.
- **Landing:** callback to the hook's image, compress to one line, coin a name for it.

## 5. The narration (script.json)
- One `text` per scene, 1–4 short sentences, 12–45 words. Spoken English: contractions, short words, numbers as they're said.
- **Write in cues:** short phrases with clear breaks ("First the snowball. Then the hill. Then the speed."). Each phrase becomes a reveal. A long run-on clause gives the picture nothing to land on.
- Name things as you show them. Every concrete noun in the narration should be something on screen at that moment.
- Teach, don't read the article: "Compound interest isn't addition, it's a snowball" beats "The study, published in 2019, examined three cohorts…".
- Avoid: "unlock the power of", "seamless", "in today's fast-paced world", "let's dive in", a filler bridge scene ("But that's not all…").
- `tts` (optional) holds a pronunciation-friendly version: quotes around spoken quotes, "eleven labs" for "ElevenLabs", spelled-out acronyms.
- If the user brings a script: ask once whether to keep it word for word (then only split it into scenes) or restructure it.
- Silent beats are allowed: a scene with very short text and an extra `hold` (seconds) lets a diagram finish building.

### Voice direction (paid voices that take instructions, or for the user recording)
Pick the register from the topic and say it in one line, e.g. "Warm, curious storyteller explaining something delightful to a smart friend. Brisk but relaxed, small pauses between steps." or "Playful, wry documentary narrator telling a wild true story; dramatic little pauses before reveals." Store it in `voice.instructions`.

## 6. Check before moving on
- One structure, named. Hook in the first 5 s. Thesis by scene 2.
- Each scene has one job; the body builds; the end lands on one line.
- Every fact traced to the source; nothing invented.
- The narration read aloud fits the target length (~2.5 words per second).
