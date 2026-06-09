# Maintaining the BER 640 Practice Quizzes

This is the practical guide for instructors who want to **edit, add, or fix** the
interactive practice quizzes. You do **not** need to touch any JavaScript or CSS — you
edit a plain **YAML** data file and re-render. (For the full field-by-field contract,
see `schema/schema.md`.)

---

## 1. How it fits together (30-second tour)

```
practice/
├── banks/quizN.yml          ← YOU EDIT THIS: the questions, answers, feedback (YAML)
├── extract/build_banks.py   ← the validator/build gate (YAML → JSON, fails on bad content)
├── assets/
│   ├── banks/quizN.json      ← generated from the YAML (do not hand-edit)
│   └── quiz-engine.js         ← the quiz engine (rarely touched)
├── html/_quiz.scss           ← the quiz styles (compiled into the book theme via custom.scss)
├── chapters/quizN-….qmd      ← one thin page per quiz (mounts the engine)
└── _quarto.yml               ← the book config / chapter list
```

A student opens a chapter page; a `<div class="quizbank" data-bank="…json">` plus the
engine script renders the quiz from the JSON bank. The JSON is **generated** from the
YAML by `build_banks.py`, which **also validates** every item — so a malformed quiz
fails the build instead of shipping broken.

---

## 2. Edit or fix an existing question

1. Open the bank, e.g. `banks/quiz3.yml`, and find the item by `id` (e.g. `q3-10`).
2. Edit the field(s) — the prompt `stem`, an option's `text` / `correct` flag, a
   `rationale`, the `why_correct`, a numeric `answer`/window, etc. **All prose fields
   accept Markdown + LaTeX** (`$…$` inline, `$$…$$` display) — write math exactly as in
   the lecture notes.
3. **Validate + regenerate** (from the `practice/` directory):
   ```bash
   python3 extract/build_banks.py
   ```
   It prints `PASS`/`FAIL` per bank, **rewrites `assets/banks/*.json` only if every
   bank passes**, and exits non-zero on any error (so CI will catch it too).
4. **Preview**: `quarto render practice` then open `_book/index.html` (or
   `quarto preview practice`).

> Fixing a wrong answer key automatically invalidates students' saved progress for that
> quiz (the saved-state signature includes the answer key), so returning students are
> re-graded against the corrected key — no stale scores.

---

## 3. Add a new question to a quiz

Append an item to the bank's `items:` list. Copy the matching template below, change
the `id` (must be unique, lowercase slug like `q3-11`), and fill it in. Every item
needs `id, type, points, difficulty, stem, why_correct, source`. **Every wrong option
needs a `rationale`** ("why this is wrong"); the `source.href` must point to a notes
section and **contain a `#anchor`**.

**Multiple choice** (3–5 options, exactly one `correct: true`):
```yaml
  - id: q3-11
    type: multiple_choice
    points: 1
    difficulty: applied        # conceptual | applied | challenge
    stem: |
      Your question text, with math like $\hat{y} = b_0 + b_1 x$.
    options:
      - { id: a, text: "First option", correct: false, rationale: "Why this is wrong." }
      - { id: b, text: "Second option", correct: true }
      - { id: c, text: "Third option", correct: false, rationale: "Why this is wrong." }
    why_correct: "Why b is right."
    source: { chapter: 2, title: "ANCOVA", section: "…", href: "../../notes/chapters/02-ancova.html#sec-id" }
```

**True/False** — same as MC but exactly two options (`True` / `False`).

**Multiple answer** (select-all; exact-set match; ≥1 correct):
```yaml
  - id: q3-12
    type: multiple_answer
    points: 2
    difficulty: conceptual
    stem: "Select **all** that apply."
    options:
      - { id: a, text: "…", correct: true }
      - { id: b, text: "…", correct: false, rationale: "…" }
      - { id: c, text: "…", correct: true }
    why_correct: "…"
    source: { chapter: 2, title: "…", href: "…#id" }
```

**Numeric** (a number with a tolerance and/or accept window):
```yaml
  - id: q3-13
    type: numeric
    points: 2
    difficulty: applied
    stem: "Compute … Enter a number."
    answer: 2.6
    tolerance: 0.05                 # and/or:  accept_range: { min: 2.55, max: 2.65 }
    unit: "GPA points"              # optional, display-only
    distractor_notes:               # optional: common wrong values + why
      - { value: 2.1, rationale: "dropped the intercept" }
    why_correct: "…"
    source: { chapter: 1, title: "…", href: "…#id" }
```

**Fill-in-multiple-blanks** — put `{{blank1}}`, `{{blank2}}` tokens **in the prose**
(never inside `$…$`):
```yaml
  - id: q3-14
    type: multi_blank
    points: 2
    difficulty: applied
    stem: |
      The intercept is {{blank1}} and the slope is {{blank2}}; the gap {{blank3}} (widens / narrows).
    blanks:
      - { id: blank1, kind: numeric, answer: 0, tolerance: 0, rationale: "…" }
      - { id: blank2, kind: numeric, answer: 1, accept_range: { min: 0.9, max: 1.1 }, rationale: "…" }
      - { id: blank3, kind: text, accept: ["widens", "increases"], rationale: "…" }
    why_correct: "…"
    source: { chapter: 1, title: "…", href: "…#id" }
```

**Matching** (each prompt → one response; extra responses = unused distractors):
```yaml
  - id: q3-15
    type: matching
    points: 2
    difficulty: applied
    stem: "Match each pattern to its diagnosis."
    prompts:
      - { id: p1, text: "…", match: rW, rationale: "Why p1 → W." }
      - { id: p2, text: "…", match: rX, rationale: "Why p2 → X." }
    responses:
      - { id: rW, text: "…" }
      - { id: rX, text: "…" }
      - { id: rZ, text: "…", distractor: true, rationale: "Why this is an unused distractor." }
    why_correct: "…"
    source: { chapter: 8, title: "…", href: "…#id" }
```

Then run `python3 extract/build_banks.py` and `quarto render practice`.

### Shared tables (quizzes 5, 7, 8)
If several items read from the same data table, define it **once** under
`shared_assets:` at the top of the bank and reference it from each item with
`asset_refs: [table-id]`:
```yaml
shared_assets:
  - id: my-table
    kind: table
    title: "Caption"
    markdown: |
      | Variable | Estimate |
      |:---------|---------:|
      | …        | …        |
items:
  - id: q5-XX
    asset_refs: [my-table]
    …
```

---

## 4. Add a whole new quiz

1. Create `banks/quizN.yml` (copy an existing bank; set `quiz_id: quizN`, `title`,
   `mastery: {full_min: 80, partial_min: 60}`, and the `items:`).
2. Create `chapters/quizN-slug.qmd` from this template (note the **intro math** — it
   makes Quarto load MathJax on the page; and `data-show-title="false"` so the chapter
   title isn't duplicated):
   ```markdown
   ---
   title: "Quiz N — Topic"
   ---

   A one-paragraph intro that includes at least one inline equation like
   $\hat{y} = b_0 + b_1 x$ (this guarantees MathJax loads on the page).

   ```{=html}
   <div class="quizbank" data-bank="../assets/banks/quizN.json" data-show-title="false"></div>
   <script type="module" src="../assets/quiz-engine.js"></script>
   ```
   ```
3. Add the chapter to `_quarto.yml` under the right `part:`.
4. `python3 extract/build_banks.py` → `quarto render practice`.

---

## 5. The validation gate (what it checks)

`python3 extract/build_banks.py` runs the JSON Schema **plus** relational rules and
**fails the build** on any violation. It catches, among others:

- a `multiple_choice` without exactly one correct option; a `true_false` without two;
- a wrong option (or matching distractor) missing its `rationale`;
- a `numeric` item with no tolerance/accept-window;
- a `multi_blank` whose `{{blankN}}` token is missing, duplicated, or **inside math**;
- a `matching` `match` that points to a missing or distractor response;
- an `asset_refs` that doesn't resolve; a duplicate `id`; `partial_min ≥ full_min`;
- a `source.href` with no `#anchor`.

It also runs in **CI** (`.github/workflows/publish.yml`) before the book renders, so a
bad commit fails the deploy rather than shipping a broken quiz. Re-run the schema
self-test any time with `python3 schema/test-schema.py`.

---

## 6. Deploy

Push to `main`. CI installs Python, runs the validation gate, renders all books
(including `quarto render practice`), assembles `_site/`, and deploys to GitHub Pages.
The practice quizzes publish at
`https://joonho112.github.io/jlee-regression-course/practice/`. Each book commits its
`_freeze/` cache; the practice book has no R, so it needs none.

---

## 7. Notes & gotchas

- **Grading is open-book.** All answers/feedback are in the page's JSON — these are
  *formative* practice quizzes. Keep the *graded* assessments in Blackboard.
- **Progress is per-browser** (`localStorage`), anonymous, never uploaded. Editing a
  bank's answer key invalidates stale saves automatically.
- **Math:** write `$…$`/`$$…$$`; the engine converts to the `\(…\)`/`\[…\]` that
  Quarto's MathJax expects, so it renders the same as the rest of the course.
- **Don't hand-edit `assets/banks/*.json`** — they're generated; edit the YAML and
  rebuild.
- **The 6 question types & every field** are specified in `schema/schema.md`; the
  machine contract is `schema/quiz-schema.json`.
