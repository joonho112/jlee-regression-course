# BER 640: Advanced Statistical Methods in Education

> The complete course materials for an asynchronous online graduate course in applied regression with R at the University of Alabama — lecture notes, hands-on R labs, homework solutions, module quizzes, a final-project guide, a course website, and a companion data package, all built and published from one place to a **single website**.

[![Content: CC BY-NC-SA 4.0](https://img.shields.io/badge/Content-CC%20BY--NC--SA%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)
[![Code: MIT](https://img.shields.io/badge/Code-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Made with Quarto](https://img.shields.io/badge/Made%20with-Quarto-blue.svg)](https://quarto.org/)
[![Live site](https://img.shields.io/badge/Live%20site-GitHub%20Pages-2ea44f.svg)](https://joonho112.github.io/jlee-regression-course/)

**Live site:** <https://joonho112.github.io/jlee-regression-course/>

---

## About this course

**BER 640: Advanced Statistical Methods in Education** is a 3-credit, fully online (asynchronous) graduate course at the **University of Alabama**. It teaches applied regression analysis with R — from simple linear regression through generalized linear models — for students in education and the social sciences.

This repository is the **single source for the entire course**. It brings together the lecture notes, R labs, homework solutions, module quizzes, the final-project guide, the course website, and the companion data package, and builds and publishes them together to one website.

The course was developed with the support of the University of Alabama's **Office of Teaching Innovation and Digital Education (OTIDE)** and is first offered in **Fall 2026**. This repository is its living source: I maintain it for ongoing online delivery at UA and revise it each time the course runs.

> **Status.** The five Quarto projects below are now consolidated into this repository as subfolders, and the unified site builds locally — the course website at the root, the four books at their subpaths, and the `regdatasets` documentation at `/regdatasets`. The standalone repositories are still live and linked below; automated deployment to GitHub Pages via the included workflow is the remaining step.

---

## The deliverables

The course is made of seven parts. Six are Quarto projects consolidated into this repository as subfolders — the course website publishes to the site root and the five books to subpaths; the seventh (`regdatasets`) stays its own installable R package, with its documentation embedded in the published site.

| # | Deliverable | What it is | Standalone site | Path in this site |
|:--|:------------|:-----------|:-------------|:-------------|
| 1 | **Lecture Notes** — *A Regression Approach with R* | A narrative textbook in 13 chapters with executable R and interactive Observable JS apps | [regression-lecture-notes](https://joonho112.github.io/regression-lecture-notes/) | `/notes` |
| 2 | **R Lab Book** | 12 hands-on R labs paralleling the notes | [regression-labs](https://joonho112.github.io/regression-labs/) | `/labs` |
| 3 | **Homework Solutions** | 8 problem sets with complete, fully explained R solutions | [regression-homework-solutions](https://joonho112.github.io/regression-homework-solutions/) | `/homework` |
| 4 | **Final Project Guide** | Step-by-step guide with fully worked linear and logistic regression project examples | [regression-project-guide](https://joonho112.github.io/regression-project-guide/) | `/project` |
| 5 | **Course Website** | Syllabus, 15-week schedule, weekly module pages, assignment pages, and resources | [regression-course-website](https://joonho112.github.io/regression-course-website/) | `/` (site root / hub) |
| 6 | **`regdatasets`** | An R data package bundling 24 curated teaching datasets | [github.com/joonho112/regdatasets](https://github.com/joonho112/regdatasets) | `/regdatasets` (embedded pkgdown site) |
| 7 | **Module Quizzes** *(instructor-facing)* | 6 auto-gradable Blackboard quizzes (90 items) with answer keys & deployment settings | — (in this repo) | `/quizzes` |

---

## Course topics

The notes and labs progress in a deliberate arc, building from a single predictor up to generalized linear models:

| Ch. | Topic | Ch. | Topic |
|:---:|:------|:---:|:------|
| 1 | Simple Linear Regression | 8 | Model Diagnostics |
| 2 | ANCOVA | 9 | Simple Logistic Regression |
| 3 | One-Way ANOVA | 10 | Multiple Logistic Regression |
| 4 | Multiple Regression: Continuous Predictors | 11 | Logistic Regression Diagnostics |
| 5 | Interactions | 12 | Latent Response Models and GLM |
| 6 | Nonlinear Relationships | 13 | Ordinal Response Models |
| 7 | Model Building | | |

Each analysis is written as narrative prose, presented results-first and paired with interpretation and code explanation, and supported by interactive applications for building statistical intuition. All examples are built on the **tidyverse** and **easystats** ecosystems and draw their data from `regdatasets`, so every example runs out of the box.

---

## The data: `regdatasets`

The companion R package bundles all **24 curated teaching datasets** used throughout the course. Install it directly:

```r
# install.packages("remotes")
remotes::install_github("joonho112/regdatasets")
```

`regdatasets` keeps its **own repository** so that it stays cleanly installable (a CRAN-friendly path) and usable on its own. Its documentation — a **pkgdown** site — is rendered and embedded into this repository's published site at `/regdatasets`, so readers get one seamless experience while the package keeps its own release cycle.

---

## Architecture: many books, one website

A common assumption is that GitHub Pages gives you "one site per repository," so a bundle of separate books can't share a single site. The useful insight is that a **Pages site is just a directory tree** — and a directory tree can hold all of these books as subdirectories. That is exactly what this repo does.

### Repository layout

Each book and the website is **its own Quarto project**, with its own `_quarto.yml`, so it can still be developed and rendered in isolation.

```
jlee-regression-course/
├── website/      # Course Website (Quarto)       → site root (hub)
├── notes/        # Lecture Notes (Quarto)         → /notes
├── labs/         # R Lab Book (Quarto)            → /labs
├── homework/     # Homework Solutions (Quarto)    → /homework
├── quizzes/      # Module Quizzes (Quarto)        → /quizzes
├── project/      # Final Project Guide (Quarto)   → /project
├── scripts/
│   └── assemble.sh      # Collect rendered projects into _site/
├── .github/
│   └── workflows/
│       └── publish.yml  # CI: render → build pkgdown → assemble → deploy
├── _site/        # Assembled output (git-ignored build artifact)
├── LICENSE       # CC BY-NC-SA 4.0 (course content)
├── LICENSE-CODE  # MIT (source code)
└── README.md
```

Each book commits its `_freeze/` cache (the stored results of its R computations), so the site rebuilds without re-executing R. The course website is the **site root** — there is no separate landing page. `regdatasets` is **not** a subfolder here: it is built from its [own repository](https://github.com/joonho112/regdatasets) and its pkgdown site is slotted in at `/regdatasets`.

After the build, every output is collected into a single `_site/` tree that mirrors the published URL structure: the course website at the root, plus `/notes`, `/labs`, `/homework`, `/quizzes`, `/project`, and `/regdatasets`.

### How it builds and deploys

The pipeline is a two-stage process: **render**, then **assemble**.

> **Why two stages.** A Quarto *website* render **cleans its output directory** before writing. If several projects rendered straight into one shared directory, each render would wipe the previous project's output. The safe pattern is therefore: render each project into its own output directory, then **copy** those outputs into `_site/` in a separate assemble step.

1. **Render** each Quarto project. The four R-bearing books reuse their committed `_freeze/` caches, so this does **not** re-execute R; the course website and the quizzes book contain no executable code.
2. **Build** the `regdatasets` pkgdown site from [its own repository](https://github.com/joonho112/regdatasets).
3. **Assemble** the outputs into one `_site/` tree (`scripts/assemble.sh`): course website → root, the five books → their subpaths, `regdatasets` → `/regdatasets`.
4. **Deploy** the assembled `_site/` to GitHub Pages.

A **GitHub Actions** workflow ([`.github/workflows/publish.yml`](.github/workflows/publish.yml), triggered on push to `main`, with the Pages *Source* set to **GitHub Actions**) runs the four steps and publishes via `actions/upload-pages-artifact` + `actions/deploy-pages` — no manually maintained `gh-pages` branch, and the assembled `_site/` stays git-ignored. Because each book's `_freeze/` is committed, the build is fast, deterministic, and never needs to re-run R. The design intent is simple: **one push to `main` = a full rebuild and redeploy of the entire course.**

### Build locally

Prerequisites: [R](https://cran.r-project.org/) (≥ 4.3), [Quarto](https://quarto.org/docs/get-started/) (≥ 1.4), and the R packages used throughout the materials:

```r
install.packages("pacman")
pacman::p_load(tidyverse, easystats, pkgdown)
remotes::install_github("joonho112/regdatasets")
```

```bash
# 1. Render each Quarto project (books reuse their committed _freeze/ cache)
quarto render website
quarto render notes
quarto render labs
quarto render homework
quarto render quizzes
quarto render project

# 2. Assemble everything into a single _site/ tree.
#    regdatasets pkgdown is pulled from a sibling ../regdatasets/docs if present;
#    in CI it is built fresh from github.com/joonho112/regdatasets.
bash scripts/assemble.sh

# 3. Preview the assembled site
python3 -m http.server --directory _site
```

**Tech stack:** [Quarto](https://quarto.org/) · [R](https://cran.r-project.org/) (tidyverse, easystats) · [pkgdown](https://pkgdown.r-lib.org/) · [GitHub Actions](https://github.com/features/actions) · [GitHub Pages](https://pages.github.com/)

---

## Acknowledgments

This course was developed with the support of the University of Alabama's **Office of Teaching Innovation and Digital Education (OTIDE)** and its UA Online program. I am grateful to the OTIDE instructional design and media team for their guidance and production support in developing and delivering BER 640.

---

## License

This repository uses a **dual license** to fit its two kinds of material:

- **Course content** — prose, lecture notes, slides, and other instructional text — is licensed under [**CC BY-NC-SA 4.0**](https://creativecommons.org/licenses/by-nc-sa/4.0/). You may share and adapt it for non-commercial purposes, with attribution, under the same license. See [`LICENSE`](LICENSE).
- **Source code** — build scripts, GitHub Actions workflows, and R code — is licensed under the [**MIT License**](https://opensource.org/licenses/MIT). See [`LICENSE-CODE`](LICENSE-CODE).

Copyright © 2026 JoonHo Lee.

---

## Citation

If you use these materials in your teaching or research, please cite:

> Lee, J. (2026). *BER 640: Advanced Statistical Methods in Education* [online course materials]. University of Alabama. <https://joonho112.github.io/jlee-regression-course/>

```bibtex
@misc{lee2026ber640,
  author       = {Lee, JoonHo},
  title        = {BER 640: Advanced Statistical Methods in Education},
  year         = {2026},
  howpublished = {\url{https://joonho112.github.io/jlee-regression-course/}},
  note         = {Online course materials, University of Alabama.
                  Content: CC BY-NC-SA 4.0; Code: MIT}
}
```

The companion data package may be cited as:

> Lee, J. (2026). *regdatasets: Curated Teaching Datasets for Applied Regression.* R package. <https://github.com/joonho112/regdatasets>

---

## Author

**JoonHo Lee**
College of Education, University of Alabama
[jlee296@ua.edu](mailto:jlee296@ua.edu) · [github.com/joonho112](https://github.com/joonho112)

Questions and corrections are welcome — please open an [issue](https://github.com/joonho112/jlee-regression-course/issues) or reach out by email.
