# `schedule.csv` — schema & single source of truth

This file is the **single source of truth** for the course session structure. It drives the **Schedule** page (`schedule.qmd`) and the **Content** index/pages (`content/`). Edit session placement **here only** — never re-type session titles in the navbar sidebar or content pages.

Labels use **"Session N"**. There is intentionally **no date column** — the course is semester-agnostic (15 sessions).

## Columns

| Column | Meaning | Example |
|---|---|---|
| `session` | Session number, 1–15 | `3` |
| `part` | Grouping code (see map below) | `I` |
| `module` | Module name (sub-label) | `Foundations of Regression` |
| `title` | Session topic (display) | `Dummies & the t-Test` |
| `notes` | Lecture-notes slug(s), `;`-separated | `07-model-building;08-model-diagnostics` |
| `labs` | Lab slug(s), `;`-separated | `lab02-simple-regression` |
| `homework` | Homework slug (one) | `hw01-simple-regression` |
| `quiz` | Graded quiz slug (one) | `quiz1-simple-regression` |
| `practice` | Practice quiz slug (mirrors `quiz`) | `quiz1-simple-regression` |
| `project` | Project milestone label | `P1 Proposal` |

Empty cell = no item of that type this session (renders as a greyed-out icon on the schedule).

## URL construction rule (for the renderer)

Each material slug becomes a deep link `BASE + SUBDIR + slug + ".html"`. BASE comes from `_variables.yml` (`books.*`). SUBDIR is fixed per column, with one rule for notes:

| Column | BASE var | SUBDIR | Note |
|---|---|---|---|
| `notes` | `books.lecture_notes` (`/notes`) | `chapters/` if slug starts with a digit, else `appendices/` | e.g. `a-r-setup-guide` → `/notes/appendices/a-r-setup-guide.html` |
| `labs` | `books.r_lab_book` (`/labs`) | `labs/` | → `/labs/labs/lab02-simple-regression.html` |
| `homework` | *(website-internal)* | `assignment/` | slug = assignment page, e.g. `hw01` → `assignment/hw01.html` (the **prompt**, not the `/homework` solutions book) |
| `quiz` | *(website-internal)* | `assignment/quizzes.html` | graded quizzes are on **Blackboard**; link to the student-facing quizzes overview (anchor `#quiz-N` by number, where `N` is parsed from the slug). **Never** link the instructor `/quizzes` book — it contains **answer keys** |
| `practice` | `books.practice_quizzes` (`/practice`) | `chapters/` | student-facing interactive practice |
| `project` | (see milestone map) | — | label, not a slug → `assignment/project-*.html` |

> **Student-safety note.** `homework` and `quiz` links are **website-internal**. The `/homework` book (full solutions) and the `/quizzes` book (answer keys) are **instructor-facing** and must **never** be linked from student-facing schedule/content pages. The student-facing per-quiz page is the **practice** quiz (`/practice`).

`;`-separated values → render one icon-link per slug.

## Part code → display name

| Code | Display |
|---|---|
| `Welcome` | Welcome |
| `I` | Part I · Foundations of Linear Regression |
| `II` | Part II · Extensions of Linear Regression |
| `III` | Part III · Model Evaluation |
| `IV` | Part IV · Categorical Outcomes |
| `Synthesis` | Synthesis |

## Project milestone → website page

| `project` value | Links to |
|---|---|
| `P1 Proposal` | `assignment/project-1-proposal.html` |
| `P1 Draft` | `assignment/project-1-draft.html` |
| `P1 Final` | `assignment/project-1-final.html` |
| `P2 Proposal` | `assignment/project-2-proposal.html` |
| `P2 Draft` | `assignment/project-2-draft.html` |
| `P2 Final` | `assignment/project-2-final.html` |

## ⚠ Known slug↔title traps (do not "fix" the slugs — they are frozen URLs)

- `lab07-model-building` is titled **"Nonlinear Relationships"** (Session 9).
- `lab08-diagnostics` is titled **"Model Building and Diagnostics"** (Session 10).
- Display titles come from each material's own H1; the renderer must not infer titles from slugs. A slug→title lookup is maintained in the Schedule renderer.

## Practice = warm-up

`practice` mirrors `quiz` because the 8 student-facing practice quizzes mirror the 8 graded quizzes 1:1. Practice quizzes are always available; the schedule lists each in the session where it is the recommended warm-up for that session's graded quiz.
