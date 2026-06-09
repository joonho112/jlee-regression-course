# BER 640 Quiz Bank — Canonical Schema (v1.0)

The **data contract** for the BER 640 client-side student quiz engine. One YAML
**bank** is authored per quiz, converted to JSON at build time, validated in CI
against `quiz-schema.json`, and rendered by the dependency-free quiz engine.
This file is the human-readable companion to `quiz-schema.json`; where the two
disagree, **the JSON Schema wins** and this file is the bug. The JSON Schema is
machine-verified (12 negative cases + the reference bank pass — see log 002).

## Conventions

- **Type** uses JSON types (`string`, `number`, `integer`, `boolean`, `array`,
  `object`); YAML authoring maps onto these directly.
- **Req?** = `required` / `optional` / *conditional* (required only for some
  item `type`s or under a condition).
- All author-facing prose fields (`stem`, every `text`, `rationale`,
  `why_correct`, `caption`, table cells) are **Markdown with LaTeX** using
  `$...$` (inline) and `$$...$$` (display), rendered by MathJax 3. Write math
  exactly as in the `.qmd` sources; do **not** HTML-escape.
- **IDs** (`quiz_id`, item `id`, `shared_assets[].id`, and option / blank /
  prompt / response ids) are slugs matching `^[a-z0-9][a-z0-9_-]*$`. They must
  be **unique within their scope** (see §11).
- `total_points` is **never stored** — the engine derives it as the sum of
  `items[].points`, so it can never drift from the item list.

---

## 1. Quiz-level object (bank root)

| Field | Type | Req? | Allowed / default | Meaning |
|:--|:--|:--|:--|:--|
| `schema_version` | string | **required** | `"1.0"` | Schema contract version; the validator/engine reject banks they don't understand. |
| `quiz_id` | slug | **required** | e.g. `quiz1` | Stable machine id; the `localStorage` progress namespace derives from it. |
| `title` | string | **required** | non-empty | Display title (the quiz H1). |
| `module` | string | optional | — | Short module/topic label. |
| `available_after` | string | optional | e.g. `"Week 2"` | Display-only availability note. |
| `source` | object | optional | §4 | Quiz-level "home" link into the Lecture Notes (chapter landing). |
| `mastery` | object | **required** | §2 | Mastery-band thresholds. |
| `settings` | object | optional | §3 | Display-only deployment settings (mirrors the Blackboard table). |
| `shared_assets` | array\<asset> | optional | default `[]` | Chapter-level tables/figures stored once, referenced by items (§5). |
| `items` | array\<item> | **required** | `minItems: 1` | The ordered question bank (§6–§10). |

## 2. `mastery` object — required

| Field | Type | Req? | Allowed | Meaning |
|:--|:--|:--|:--|:--|
| `full_min` | number | **required** | `0–100` (percent) | Score % ≥ this ⇒ **Full** mastery (course default **80**). |
| `partial_min` | number | **required** | `0–100`, `< full_min` | Score % ≥ this and `< full_min` ⇒ **Partial** (default **60**); below ⇒ **Minimal**. |
| `label` | string | optional | default `"Mastery"` | Display label for the band readout. |

**Engine rule.** `pct = 100 × earned / total_points`; `pct ≥ full_min → Full`;
else `pct ≥ partial_min → Partial`; else `Minimal`.

## 3. `settings` object — optional, display-only

`time_limit_min` (integer ≥ 0) · `attempts` (string, e.g. `"unlimited"`) ·
`score_recorded` (`highest` | `latest` | `average`) · `show_answers`
(`immediately` | `after_close`; this engine is formative → `immediately`).
The engine may surface these but does not enforce them.

## 4. `source` object — required on every item (optional at quiz root)

| Field | Type | Req? | Allowed | Meaning |
|:--|:--|:--|:--|:--|
| `chapter` | integer | **required** | `1–99` | Notes chapter number; must match the item's `Notes Ch. N` tag. |
| `title` | string | **required** | non-empty | Chapter title for the citation. |
| `section` | string | optional | — | Nearest section/heading the item draws on. |
| `href` | string | **required** | must contain `#` | Live deep link to the exact section; the `#anchor` is the ground-truth `<section id>`. The schema rejects an `href` with no `#` fragment. |

Rendered as the **Source** link in each item's feedback panel, so the quiz
doubles as formative review.

## 5. `asset` object (shared data, stored once)

Quizzes 5, 7, 8 lean on one chapter-level table several items reference (the
Langton salary table; the Berkeley admissions tables). Store it **once** here
and pull it in per item via `asset_refs`.

| Field | Type | Req? | Allowed | Meaning |
|:--|:--|:--|:--|:--|
| `id` | slug | **required** | unique in bank | Reference key for `item.asset_refs`. |
| `kind` | string | **required** | `table` \| `figure` \| `note` | Render mode. |
| `title` | string | optional | — | Caption shown above the asset. |
| `caption` | string (md) | optional | — | Longer note (source line, coding key). |
| `markdown` | string (md) | **req. if `table`/`note`** | — | The asset body (a pipe table / prose). |
| `src` | string | **req. if `figure`** | path/URL | Static image source (figures are pre-rendered, never live code). |
| `alt` | string | **req. if `figure`** | — | Accessibility alt text. |

Assets are display-only; never graded.

---

## 6. Item — common envelope (all six types)

| Field | Type | Req? | Allowed | Meaning |
|:--|:--|:--|:--|:--|
| `id` | slug | **required** | unique in bank | Stable item id; the per-item `localStorage` key. |
| `type` | string | **required** | `multiple_choice` \| `true_false` \| `multiple_answer` \| `numeric` \| `multi_blank` \| `matching` | **Discriminator** — selects renderer, required payload, and grading rule. |
| `stem` | string (md) | **required** | non-empty | The question prompt (self-contained). |
| `points` | number | **required** | `> 0` (usually 1 or 2) | Item value. Convention: single-select = 1; set/pair/computed = 2. |
| `difficulty` | string | **required** | `conceptual` \| `applied` \| `challenge` | Difficulty tag. |
| `why_correct` | string (md) | **required** | non-empty | The "why the correct answer is correct" explanation shown after grading. |
| `source` | object | **required** | §4 | Lecture-Notes deep link with anchor. |
| `number` | integer | optional | `≥ 1` | Display number (engine may auto-number). |
| `topic` | string | optional | 2–5 words | Concept label. |
| `asset_refs` | array\<slug> | optional | default `[]` | Shared-asset ids to render with this item (each must resolve). |
| `shuffle` | boolean | optional | default `true` for option types | May the engine randomize option order? (Set `false` to keep True before False.) |

> **Per-distractor rationale rule (global).** Every selectable **wrong** choice
> carries a non-empty `rationale` ("why this is wrong"): every `correct:false`
> option, and every `distractor:true` matching response. The validator rejects a
> missing/empty rationale on those. The correct option's rationale is optional
> (the item's `why_correct` carries the key explanation). Numeric wrong-method
> notes live in `distractor_notes` (free-form, optional).

The six type-specific payloads follow. `unevaluatedProperties: false` means an
item may **only** carry its own type's fields — a `multiple_choice` with
`blanks`, or a `numeric` with `options`, is rejected.

## 7. `multiple_choice` — single correct, 3–5 options

Adds `options` (array of **option**, `minItems 3`, `maxItems 5`), with **exactly
one** `correct: true`.

**option** = `{ id (slug), text (md), correct (bool), rationale (md, req. when correct:false) }`.

**Grading:** all-or-nothing. Full `points` iff the selected option is the single
`correct:true`, else 0. Engine reveals the chosen option's `rationale` +
`why_correct` + the Source link.

## 8. `true_false` — 2-option special case

Same `options` array as §7 but **exactly two** options, exactly one
`correct: true` (convention: `True` then `False`). All-or-nothing.

## 9. `multiple_answer` — select-all

Adds `options` (`minItems 3`, `maxItems 6`), with **≥ 1** `correct: true`.

**Grading:** **exact-set, all-or-nothing** — full `points` iff the selected set
equals the correct set exactly (every correct chosen, every wrong left out),
else 0. Multiple-answer items do **not** take a `partial_credit` field (the
engine hard-codes exact-set); only `multi_blank` and `matching` support partial
credit.

## 10. `numeric` — fill-in number with tolerance / accept window

| Field | Type | Req? | Meaning |
|:--|:--|:--|:--|
| `answer` | number | **required** | The keyed value. |
| `tolerance` | number ≥ 0 | **one of `tolerance` / `accept_range` required** | Symmetric ± window: accept iff `|x − answer| ≤ tolerance`. |
| `accept_range` | `{min, max}` | — | Explicit inclusive window `[min, max]`. If both forms are given, the accepted set is their **union**. |
| `unit` | string | optional | Display unit; not parsed from input. |
| `placeholder` | string | optional | Input hint. |
| `distractor_notes` | array\<`{value, rationale}`> | optional | Documented wrong-method values the window excludes (shown as feedback; not graded). |

**Grading:** parse the entry as a number (trim spaces, leading `+`, the trailing
`unit`); all-or-nothing on the window. Non-numeric input → 0.

## 11. `multi_blank` — fill-in-multiple-blanks (mixed numeric + text)

Adds `blanks` (array, `minItems 1`) and optional `partial_credit` (boolean,
**default `true`**). The `stem` marks each blank's position with a `{{blank_id}}`
token **in prose** (never inside `$$...$$`, so the rendered equation is not
broken).

**blank** = `{ id (slug), kind (numeric|text), label?, rationale (md, required) }` plus, by `kind`:
- `kind: numeric` → `answer` (number) + a window (`tolerance` and/or `accept_range`); optional `unit`.
- `kind: text` → `accept` (array of strings, `minItems 1`) + `match` (`ci_trim` default | `exact`).

**Grading:** each blank scored independently (numeric → window; text → an
`accept` entry under `match`). `partial_credit: true` (default) →
`points × (#blanks_correct / #blanks)`; `false` → full `points` only if all
blanks correct.

## 12. `matching` — match N prompts to responses

Adds `prompts` (`minItems 2`), `responses` (`minItems 2`), and optional
`partial_credit` (boolean, **default `true`**). `responses` may outnumber
`prompts` — the extras are unused **distractors**.

- **prompt** = `{ id, text (md), match (a response id), rationale (md, required) }`.
- **response** = `{ id, text (md), distractor? (bool), rationale (md, required when distractor:true) }`.

**Grading:** a prompt is correct iff the student's chosen response id equals its
`match`. `partial_credit: true` (default) → `points × (#prompts_correct / #prompts)`;
`false` → all-or-nothing. The engine offers every response (incl. distractors)
per prompt, via a `<select>` (accessible, mobile-friendly).

---

## 13. Validation summary

**Enforced by `quiz-schema.json` (machine-verified):** required root/item fields;
`schema_version == "1.0"`; slug pattern on all ids; `type` ∈ the six; per-type
payload present and closed (`unevaluatedProperties:false`); MC 3–5 options with
**exactly one** correct; T/F exactly two options, one correct; MA ≥1 correct;
numeric requires `answer` + a window; multi_blank ≥1 blank (numeric→answer+window,
text→accept); matching ≥2 prompts/responses; **every wrong option and every
distractor response has a non-empty `rationale`**; `why_correct` non-empty;
`source.href` present **and containing `#`**; `difficulty` ∈ the three; `points > 0`;
no unknown properties anywhere.

**Enforced by the CI wrapper (relational checks JSON Schema can't express):**
(a) `mastery.partial_min < full_min`; (b) all ids unique within scope;
(c) every `asset_refs` entry resolves to a `shared_assets[].id`; (d) every
`prompt.match` resolves to an existing **non-distractor** `response.id`, with each
non-distractor response targeted once; (e) `responses.length ≥ prompts.length`;
(f) every `multi_blank` blank `id` appears exactly once as a `{{id}}` token in the
`stem`, and every token has a blank; (g) `accept_range.min ≤ max`. These run in
the same CI step as schema validation.
