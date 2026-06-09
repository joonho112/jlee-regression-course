// quiz-engine.js — BER 640 client-side quiz engine (all six item types).
//
// Dependency-free vanilla-JS ES module. Public API:
//
//     import { renderQuiz } from "./quiz-engine.js";
//     renderQuiz(bank, mountEl);
//
// Supports all six item types from the canonical schema (v1.0):
//   - multiple_choice  (radios; single correct; all-or-nothing)
//   - true_false       (radios; exactly two options; all-or-nothing)
//   - multiple_answer  (checkboxes; exact-set match by default; all-or-nothing)
//   - numeric          (number input; accept window; all-or-nothing)
//   - multi_blank      (inline blanks; per-blank window/text; partial credit)
//   - matching         (one <select> per prompt; per-pair; partial credit)
//
// Grading rules are transcribed from schema.md §7–§12.
//
// MATH (D7 / P0-1). The book is Quarto, whose STOCK MathJax 3 enables only the
// `\(…\)` (inline) and `$$…$$` / `\[…\]` (display) delimiters — NOT `$…$`
// inline. Authors write course math as `$…$`, so the engine CONVERTS `$…$` →
// `\(…\)` and `$$…$$` → `\[…\]` in author prose BEFORE injecting it, then asks
// Quarto/MathJax to typeset the injected subtree. The engine NEVER defines
// `window.MathJax` — Quarto owns that object and its config.
//
// All `$…$`-awareness (the conversion, plus the markdown/blank/numeric fixes
// below) is built on ONE shared tokenizer, `splitMath`, that segments a raw
// string into ordered `{ kind:"text"|"math", value }` runs. Inline markdown is
// applied only to `text` runs (so `$a*b*c$` is never corrupted), blank tokens
// are refused inside `math` runs, and the block splitter never breaks a `$$…$$`
// block on an internal blank line.
//
// No build step, no framework, no required globals (MathJax/Quarto optional).

"use strict";

/* ============================================================================
 * Math-delimiter tokenizer (the shared foundation for D7 + P1-1/P1-2/P1-3).
 *
 * `splitMath(raw)` scans the RAW (un-escaped) string left to right and returns
 * an ordered array of runs:
 *     { kind: "text", value }   — ordinary prose (markdown applies here)
 *     { kind: "math", value, display }  — a `$…$` (display:false) or `$$…$$`
 *                                          (display:true) span, delimiters included
 *
 * Rules (matching how MathJax/pandoc treat TeX `$`):
 *   • `$$` opens a DISPLAY span; it closes at the next `$$`.
 *   • a single `$` opens an INLINE span; it closes at the next single `$` that
 *     is NOT immediately followed by another `$`. An inline `$` is only a real
 *     opener if it is not escaped (`\$`) — `\$` is a literal dollar sign.
 *   • a `$` with no matching closer is treated as literal text (no span).
 * We do not try to be a full TeX scanner; this is the subset the banks use.
 * ========================================================================== */
function splitMath(raw) {
  const s = String(raw == null ? "" : raw);
  const runs = [];
  let text = ""; // accumulating plain-text run
  let i = 0;
  const n = s.length;

  const flushText = () => {
    if (text !== "") {
      runs.push({ kind: "text", value: text });
      text = "";
    }
  };

  while (i < n) {
    const c = s[i];

    // Escaped dollar `\$` is a literal `$` in the text run (never a delimiter).
    if (c === "\\" && s[i + 1] === "$") {
      text += "\\$";
      i += 2;
      continue;
    }

    if (c === "$") {
      const isDisplay = s[i + 1] === "$";
      const open = isDisplay ? "$$" : "$";
      const start = i + open.length;
      // Find the matching closer.
      let j = start;
      let close = -1;
      while (j < n) {
        if (s[j] === "\\" && s[j + 1] === "$") {
          j += 2; // skip an escaped dollar inside the span
          continue;
        }
        if (s[j] === "$") {
          if (isDisplay) {
            if (s[j + 1] === "$") {
              close = j;
              break;
            }
            // a lone `$` inside `$$…$$` is part of the math; keep scanning
            j += 1;
            continue;
          } else {
            // inline closes on a `$` that is not part of a `$$`
            if (s[j + 1] !== "$") {
              close = j;
              break;
            }
            // `$$` inside an inline span: not a closer; skip both
            j += 2;
            continue;
          }
        }
        j += 1;
      }
      if (close === -1) {
        // No closer — treat this `$`/`$$` as literal text and move on.
        text += open;
        i += open.length;
        continue;
      }
      flushText();
      const value = s.slice(i, close + open.length);
      runs.push({ kind: "math", value, display: isDisplay });
      i = close + open.length;
      continue;
    }

    text += c;
    i += 1;
  }
  flushText();
  return runs;
}

/**
 * Convert author math delimiters to Quarto/stock-MathJax delimiters (D7):
 *   `$…$`   → `\(…\)`   (inline)
 *   `$$…$$` → `\[…\]`   (display)
 * Operates per math run from `splitMath`, so text is untouched and `\$`
 * literals are preserved. This is the ONLY place delimiters are rewritten.
 */
function convertMathDelimiters(mathRun) {
  const v = mathRun.value;
  if (mathRun.display) {
    // strip leading `$$` and trailing `$$`
    return "\\[" + v.slice(2, v.length - 2) + "\\]";
  }
  return "\\(" + v.slice(1, v.length - 1) + "\\)";
}

/* ============================================================================
 * Minimal, SAFE Markdown -> HTML.
 *
 * The bank is author-trusted content, but we still escape HTML first so that
 * stray `<`/`>`/`&` in prose can never inject markup. Inline markdown (`**`,
 * `*`, `` ` ``) is applied ONLY to text runs; math runs are escaped (so a
 * literal `<` inside TeX is safe) and have their delimiters converted, but are
 * NOT run through the markdown substitutions — so `$a*b*c$` stays intact.
 * ========================================================================== */

/** HTML-escape a raw string. */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/* Private-use sentinels (never appear in prose) used to protect content from
 * the markdown emphasis pass: one for backslash-escaped punctuation, one as the
 * base for opaque math placeholders. */
const PUA_ESC = "\uE000"; // \X escape sentinel: PUA_ESC + 2-hex-of-charcode
const PUA_MATH = "\uE001"; // math placeholder: PUA_MATH + index + PUA_MATH

/**
 * Render one inline prose fragment to HTML (P1-2 + D7 + emphasis-across-math).
 *
 * Strategy: tokenize into math/text runs; replace each MATH run with an opaque
 * placeholder (its converted+escaped HTML stashed by index) so the emphasis
 * pass can never see inside it; escape the text; protect `\`-escaped punctuation
 * so `\*` stays literal; run the emphasis/code substitutions over the WHOLE
 * string (so `**bold $x$ more**` bolds across the math span); finally restore
 * the math HTML and the escaped literals. The result: markdown applies only to
 * prose yet may span a math span, while math content (e.g. `$a*b*c$`) is never
 * corrupted.
 */
function renderInline(srcFragment) {
  const runs = splitMath(srcFragment);
  const mathHtml = [];
  // Build a single string of escaped text with math runs swapped for placeholders.
  let s = "";
  for (const run of runs) {
    if (run.kind === "math") {
      const idx = mathHtml.length;
      mathHtml.push(escapeHtml(convertMathDelimiters(run)));
      s += PUA_MATH + idx + PUA_MATH;
    } else {
      s += escapeHtml(run.value);
    }
  }
  // Protect backslash-escaped ASCII punctuation (CommonMark): `\*` -> literal `*`.
  s = s.replace(
    /\\([!-/:-@[-`{-~])/g,
    (_m, ch) => PUA_ESC + ch.charCodeAt(0).toString(16).padStart(2, "0")
  );
  // Emphasis + inline code over the whole string (math is opaque placeholders).
  // Bold before italic so `**x**` is not mis-parsed as nested `*`.
  s = s
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
  // Restore escaped literals, then math HTML.
  s = s.replace(
    new RegExp(PUA_ESC + "([0-9a-f]{2})", "g"),
    (_m, hex) => String.fromCharCode(parseInt(hex, 16))
  );
  s = s.replace(
    new RegExp(PUA_MATH + "(\\d+)" + PUA_MATH, "g"),
    (_m, idx) => mathHtml[Number(idx)]
  );
  return s;
}

/**
 * Split a normalized (\n-only, trimmed) source string into blocks on blank
 * lines, WITHOUT splitting inside a `$$…$$` display-math span (P1-3) — a
 * multi-line `aligned`/`cases` environment may legitimately contain a blank
 * line. We tokenize first, then only treat blank lines that fall in TEXT runs
 * as block breaks; blank lines inside a math run are preserved verbatim.
 *
 * Returns an array of block strings (math delimiters NOT yet converted; that
 * happens later, per run, in renderInline / the display-block path).
 */
function splitBlocks(text) {
  const runs = splitMath(text);
  const blocks = [];
  let current = "";
  for (const run of runs) {
    if (run.kind === "math") {
      current += run.value; // never split inside math (P1-3)
      continue;
    }
    // Split this text run on blank lines; the first/last pieces fuse with the
    // surrounding runs, interior pieces become standalone block boundaries.
    const pieces = run.value.split(/\n{2,}/);
    for (let k = 0; k < pieces.length; k++) {
      if (k === 0) {
        current += pieces[k];
      } else {
        blocks.push(current);
        current = pieces[k];
      }
    }
  }
  blocks.push(current);
  return blocks.map((b) => b.trim()).filter((b) => b !== "");
}

/**
 * Block-level Markdown -> HTML for a prose fragment.
 *
 * Splits on blank lines into blocks (math-aware, P1-3). A block whose every
 * line begins with a `- ` marker becomes a `<ul>` (one `<li>` per line). A
 * block that is exactly one `$$…$$` display-math span renders as a centered
 * display-math `<div>` (so it is not wrapped in a `<p>`). Any other block
 * becomes a `<p>` with single newlines folded to spaces. Inline markdown and
 * `$…$`→`\(…\)` conversion are handled by renderInline per run.
 */
function renderMarkdown(src) {
  const text = String(src == null ? "" : src).replace(/\r\n?/g, "\n").trim();
  if (text === "") return "";
  return splitBlocks(text).map((block) => renderBlock(block, false)).join("\n");
}

/**
 * Like renderMarkdown but ALSO renders GitHub-style pipe tables (P0-5). The
 * minimal inline markdown above cannot do tables, and `shared_assets` of
 * `kind: table` / `note` carry pipe tables (the Langton / Berkeley tables).
 * Used for asset bodies AND for item stems / why_correct, which may embed a
 * per-item table (e.g. a coefficient / ANOVA / cell-means table the item reads).
 */
function renderMarkdownWithTables(src) {
  const text = String(src == null ? "" : src).replace(/\r\n?/g, "\n").trim();
  if (text === "") return "";
  return splitBlocks(text).map((block) => renderBlock(block, true)).join("\n");
}

/**
 * Render ONE block (already split on blank lines, math-aware) to HTML.
 * Order of recognition: standalone display math → pipe table (when allowed) →
 * bullet list → paragraph. Inline markdown + `$…$`→`\(…\)` conversion happen
 * per run inside renderInline / the table-cell path.
 */
function renderBlock(block, allowTables) {
  // A standalone display-math block: one `$$…$$` span and nothing else.
  const runs = splitMath(block);
  if (runs.length === 1 && runs[0].kind === "math" && runs[0].display) {
    return `<div class="qz-mathblock">${escapeHtml(convertMathDelimiters(runs[0]))}</div>`;
  }

  // A pipe table (only where tables are allowed, e.g. asset bodies).
  if (allowTables) {
    const table = parsePipeTable(block);
    if (table) return renderTableHTML(table);
  }

  const lines = block.split("\n").map((l) => l.trim()).filter((l) => l !== "");
  // A list block: every line is a `- ` bullet AND no line is interrupted by a
  // multi-line math span (lists are single-line bullets in these banks).
  const isList =
    lines.length > 0 &&
    lines.every((l) => /^-\s+/.test(l)) &&
    !/\$\$[\s\S]*\n/.test(block);
  if (isList) {
    const items = lines
      .map((l) => `<li>${renderInline(l.replace(/^-\s+/, ""))}</li>`)
      .join("");
    return `<ul>${items}</ul>`;
  }
  // Fold single newlines to spaces, but keep them as separators so a `$$`
  // that spans lines is preserved by splitMath inside renderInline.
  const joined = block.replace(/\n/g, " ").trim();
  return `<p>${renderInline(joined)}</p>`;
}

/* ----------------------------------------------------------------------------
 * GitHub-style pipe-table parser + renderer (P0-5).
 *
 * Accepts a block whose first line is a header row of `| … | … |` and whose
 * SECOND line is a delimiter row of dashes with optional leading/trailing
 * colons that set per-column alignment (`:---` left, `---:` right, `:--:`
 * center, `---` default). Remaining lines are body rows. Outer pipes are
 * optional. A `\|` inside a cell is a literal pipe. Cells are rendered through
 * renderInline, so each cell may carry markdown + `$…$` math. Returns null if
 * the block is not a well-formed pipe table (so callers fall back to prose).
 * -------------------------------------------------------------------------- */

/** Split one table row into cells on unescaped `|`, honoring `\|` literals. */
function splitTableRow(line) {
  let s = line.trim();
  // Drop a single leading / trailing pipe (outer borders), if present.
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|") && !s.endsWith("\\|")) s = s.slice(0, -1);
  const cells = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\" && s[i + 1] === "|") {
      cur += "|"; // literal pipe
      i += 1;
      continue;
    }
    if (c === "|") {
      cells.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

/** Is this line a table delimiter row (dashes + optional colons per column)? */
function isDelimiterRow(line) {
  const cells = splitTableRow(line);
  if (cells.length === 0) return false;
  return cells.every((c) => /^:?-{1,}:?$/.test(c.replace(/\s+/g, "")));
}

/** Map a delimiter cell to an alignment keyword. */
function cellAlign(cell) {
  const c = cell.replace(/\s+/g, "");
  const left = c.startsWith(":");
  const right = c.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return "";
}

/** Parse a block into a table object, or null if it is not a pipe table. */
function parsePipeTable(block) {
  const lines = block.split("\n").map((l) => l.trim()).filter((l) => l !== "");
  if (lines.length < 2) return null;
  // The first line must look like a row, the second must be the delimiter.
  if (lines[0].indexOf("|") === -1) return null;
  if (!isDelimiterRow(lines[1])) return null;

  const headers = splitTableRow(lines[0]);
  const aligns = splitTableRow(lines[1]).map(cellAlign);
  const rows = lines.slice(2).map(splitTableRow);
  return { headers, aligns, rows };
}

/** Render a parsed pipe table to an accessible <table>. */
function renderTableHTML(table) {
  const align = (i) => {
    const a = table.aligns[i];
    return a ? ` style="text-align:${a}"` : "";
  };
  const thead =
    "<thead><tr>" +
    table.headers
      .map((h, i) => `<th scope="col"${align(i)}>${renderInline(h)}</th>`)
      .join("") +
    "</tr></thead>";
  const tbody =
    "<tbody>" +
    table.rows
      .map(
        (row) =>
          "<tr>" +
          table.headers
            .map((_h, i) => `<td${align(i)}>${renderInline(row[i] == null ? "" : row[i])}</td>`)
            .join("") +
          "</tr>"
      )
      .join("") +
    "</tbody>";
  return `<div class="qz-table-wrap"><table class="qz-md-table">${thead}${tbody}</table></div>`;
}

/**
 * Inline-only Markdown for short single-line strings (option labels, link
 * text). No paragraph wrapping. `$…$`/`$$…$$` are converted to `\(…\)`/`\[…\]`
 * and markdown applies only outside math.
 */
function renderMarkdownInline(src) {
  const text = String(src == null ? "" : src).replace(/\s+/g, " ").trim();
  if (text === "") return "";
  return renderInline(text);
}

/* ============================================================================
 * Small DOM helpers (no innerHTML for structure; innerHTML only for the
 * trusted-and-escaped Markdown fragments above).
 * ========================================================================== */

/** Create an element with optional attributes and children. */
function el(tag, attrs, children) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v; // trusted Markdown fragment
      else if (k === "text") node.textContent = v;
      else node.setAttribute(k, v === true ? "" : String(v));
    }
  }
  if (children != null) {
    for (const c of [].concat(children)) {
      if (c == null) continue;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
  }
  return node;
}

/** Inline SVG icons (decorative; the textual state label carries the meaning). */
function icon(kind) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("class", "qz-icon");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const path = document.createElementNS(ns, "path");
  if (kind === "check") {
    // check mark
    path.setAttribute("d", "M13.5 4.5 6.5 11.5 2.8 7.8l1.1-1.1 2.6 2.6 5.9-5.9z");
  } else if (kind === "partial") {
    // half-filled circle: distinct from check/cross for the partial state (P2-1)
    path.setAttribute(
      "d",
      "M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 2v10a5 5 0 0 1 0-10z"
    );
  } else {
    // cross mark
    path.setAttribute(
      "d",
      "M4.3 3.2 8 6.9l3.7-3.7 1.1 1.1L9.1 8l3.7 3.7-1.1 1.1L8 9.1l-3.7 3.7-1.1-1.1L6.9 8 3.2 4.3z"
    );
  }
  path.setAttribute("fill", "currentColor");
  svg.appendChild(path);
  return svg;
}

/* ============================================================================
 * MathJax / Quarto typesetting (D7). Re-typeset a freshly injected subtree.
 *
 * The engine does NOT own MathJax. It prefers Quarto's own helper —
 * `window.Quarto.typesetMath(node)` (Quarto >= 1.4 exposes this) — and falls
 * back to `window.MathJax.typesetPromise([node])` when MathJax 3 is present
 * directly. Both paths are guarded so the engine is a no-op with neither
 * loaded (e.g. a headless test or a CDN still in flight). Author math has
 * already had its `$…$`/`$$…$$` delimiters converted to `\(…\)`/`\[…\]` before
 * injection, so whichever typesetter runs sees the delimiters it understands.
 * ========================================================================== */
function typeset(node) {
  try {
    const Q = window.Quarto;
    if (Q && typeof Q.typesetMath === "function") {
      // Quarto's helper handles its own engine (MathJax or KaTeX) + errors.
      const r = Q.typesetMath(node);
      return r && typeof r.then === "function" ? r.catch(swallowTypeset) : Promise.resolve();
    }
    const MJ = window.MathJax;
    if (MJ && typeof MJ.typesetPromise === "function") {
      return MJ.typesetPromise([node]).catch(swallowTypeset);
    }
  } catch (err) {
    swallowTypeset(err);
  }
  return Promise.resolve();
}
function swallowTypeset(err) {
  // One bad expression must never break the whole render.
  // eslint-disable-next-line no-console
  console.error("Quiz engine: math typeset failed:", err);
}

/* ============================================================================
 * Grading.
 *
 * Every grader returns { earned, correctIds, isFullyCorrect } where:
 *   - earned          : points awarded (number)
 *   - correctIds      : Set of option ids that are the keyed-correct answer
 *   - isFullyCorrect  : did the student earn the full points?
 * For these three types grading is all-or-nothing, so earned is 0 or points.
 * ========================================================================== */

/** Set of ids of options flagged correct:true. */
function correctIdSet(item) {
  return new Set(item.options.filter((o) => o.correct === true).map((o) => o.id));
}

/**
 * multiple_choice / true_false grader.
 * Full points iff the single selected id is the one correct id; else 0.
 * (selectedIds is a Set; for radios it has 0 or 1 member.)
 */
function gradeSingle(item, selectedIds) {
  const correct = correctIdSet(item);
  const chosen = [...selectedIds];
  const ok = chosen.length === 1 && correct.has(chosen[0]);
  return { earned: ok ? item.points : 0, correctIds: correct, isFullyCorrect: ok };
}

/**
 * multiple_answer grader — EXACT-SET match (schema §9; multiple_answer is
 * exact-set / all-or-nothing and takes no partial_credit field).
 *
 * Full points iff the selected set equals the correct set EXACTLY:
 *   every correct option chosen AND every wrong option left out.
 * Implemented as: same size AND every selected id is correct. Equal-size +
 * subset => set equality (no duplicates possible, ids are unique).
 */
function gradeMultipleAnswer(item, selectedIds) {
  const correct = correctIdSet(item);
  const sameSize = selectedIds.size === correct.size;
  let allChosenAreCorrect = true;
  for (const id of selectedIds) {
    if (!correct.has(id)) {
      allChosenAreCorrect = false;
      break;
    }
  }
  const ok = sameSize && allChosenAreCorrect;
  return { earned: ok ? item.points : 0, correctIds: correct, isFullyCorrect: ok };
}

/** Dispatch to the right grader by item type. */
function gradeItem(item, selectedIds) {
  if (item.type === "multiple_answer") return gradeMultipleAnswer(item, selectedIds);
  return gradeSingle(item, selectedIds); // multiple_choice, true_false
}

/* ----------------------------------------------------------------------------
 * Numeric helpers (schema §10) — shared by `numeric` and `multi_blank`'s
 * numeric blanks.
 * -------------------------------------------------------------------------- */

/** Escape a string for safe literal use inside a RegExp. */
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Parse a free-text entry as a number (schema §10 + P1-4). Normalizations,
 * in order:
 *   1. trim outer whitespace;
 *   2. strip a trailing `unit` label only on a WORD BOUNDARY (so "2.6 GPA"
 *      drops "GPA", but a unit of "s" never eats the "s" in "12 seconds"-style
 *      partial matches, and "2.6x" is not mangled). The unit may be preceded
 *      by whitespace;
 *   3. map the Unicode MINUS SIGN U+2212 `−` → ASCII `-` (the data tables in
 *      these banks DISPLAY `−`, and students copy it);
 *   4. drop a single leading `+`;
 *   5. strip thousands separators: commas (and spaces/U+00A0/U+202F) that sit
 *      between digit groups — e.g. "35,491" → "35491", "1 234" → "1234".
 *      The decimal point stays `.` (course convention; decimal-comma is NOT
 *      treated as a decimal — see the authoring guide).
 * Returns a finite Number, or NaN if what remains is not a clean number
 * (e.g. "", "abc", "2.6 or so", "2.6x").
 */
function parseNumericEntry(raw, unit) {
  let s = String(raw == null ? "" : raw).trim();
  if (s === "") return NaN;

  // (2) Strip a trailing unit on a WORD boundary (case-insensitive). We anchor
  //     at end-of-string and require the char before the unit to be a non-LETTER
  //     (start, whitespace, or a digit). So "GPA" is stripped from "2.6 GPA",
  //     "2.6GPA", and "GPA"; but a unit that is the tail of a larger WORD is not
  //     chopped — unit "s" leaves "12 seconds" intact (the char before the final
  //     "s" is the letter "d"), which is then correctly rejected as non-numeric.
  if (unit) {
    const u = String(unit).trim();
    if (u) {
      const re = new RegExp("(^|[^A-Za-z])" + escapeRegExp(u) + "\\s*$", "i");
      const m = s.match(re);
      if (m) s = s.slice(0, m.index + m[1].length).trim();
    }
  }

  // (3) Unicode minus → ASCII minus.
  s = s.replace(/−/g, "-");

  // (4) Drop a single leading `+`.
  if (s[0] === "+") s = s.slice(1).trim();
  if (s === "") return NaN;

  // (5) Strip thousands separators that sit BETWEEN digit groups (lookbehind-
  //     free; see stripThousands). Never removes a leading sign, a decimal
  //     point, or trailing junk (so "1,2,3" or "1," stay malformed and are
  //     rejected by Number() below).
  s = stripThousands(s);

  if (s === "" || s === "-") return NaN;
  // Number() is strict about stray characters (returns NaN), unlike parseFloat,
  // so "2.6x" is correctly rejected rather than silently read as 2.6.
  const x = Number(s);
  return Number.isFinite(x) ? x : NaN;
}

/**
 * Remove thousands separators flanked by digits, WITHOUT regex lookbehind
 * (Safari < 16.4 lacks it). A separator is a comma or a regular / NBSP
 * (U+00A0) / thin (U+202F) / narrow (U+2009) space. We use a capture-replace
 * `(\\d)[sep](\\d)` -> "$1$2" and loop until stable, because consecutive
 * groups (e.g. "1,234,567") share the boundary digit and need repeated passes.
 * A separator NOT flanked by digits on both sides is left in place, so
 * malformed inputs stay malformed and are rejected downstream.
 */
function stripThousands(s) {
  // separator class: comma, space, NBSP (\u00A0), thin (\u202F), narrow (\u2009).
  const sep = /(\d)[,\u0020\u00A0\u202F\u2009](\d)/;
  let out = String(s);
  let prev;
  do {
    prev = out;
    out = out.replace(sep, "$1$2");
  } while (out !== prev);
  return out;
}

/**
 * Does numeric `x` fall in the accept window for a spec carrying `answer`,
 * `tolerance`, and/or `accept_range {min,max}` (schema §10)?
 *
 * The accepted set is the UNION of the symmetric ±tolerance band around
 * `answer` and the explicit inclusive `[min, max]` range. At least one form is
 * always present (the schema requires it). NaN is never in-window.
 */
function inAcceptWindow(x, spec) {
  if (!Number.isFinite(x)) return false;
  let ok = false;
  if (typeof spec.tolerance === "number") {
    if (Math.abs(x - spec.answer) <= spec.tolerance) ok = true;
  }
  if (!ok && spec.accept_range && typeof spec.accept_range.min === "number") {
    const { min, max } = spec.accept_range;
    if (x >= min && x <= max) ok = true;
  }
  return ok;
}

/**
 * Human-readable description of the accepted window(s) for feedback, e.g.
 * "2.55 to 2.65" or "2.55 to 2.65 (or 698.46 ± 0.05)". Returns "" if neither
 * form is present (should not happen for a valid item).
 */
function describeWindow(spec) {
  const parts = [];
  if (spec.accept_range && typeof spec.accept_range.min === "number") {
    parts.push(`${fmtNum(spec.accept_range.min)} to ${fmtNum(spec.accept_range.max)}`);
  }
  if (typeof spec.tolerance === "number") {
    parts.push(`${fmtNum(spec.answer)} ± ${fmtNum(spec.tolerance)}`);
  }
  return parts.join(" or ");
}

/** Format a number for display without trailing-zero noise. */
function fmtNum(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return String(n);
  // Avoid scientific notation for the magnitudes used here; trim any float dust.
  return String(Number(n.toPrecision(12)));
}

/**
 * Text-blank match (schema §11): the trimmed entry equals an `accept` string.
 * `match: "exact"` compares verbatim (after trim); the default `ci_trim`
 * compares case-folded. Returns true/false.
 */
function matchesText(raw, blank) {
  const entry = String(raw == null ? "" : raw).trim();
  if (entry === "") return false;
  const accepts = Array.isArray(blank.accept) ? blank.accept : [];
  const exact = blank.match === "exact";
  if (exact) {
    return accepts.some((a) => String(a).trim() === entry);
  }
  const folded = entry.toLowerCase();
  return accepts.some((a) => String(a).trim().toLowerCase() === folded);
}

/**
 * numeric grader (schema §10) — all-or-nothing on the accept window.
 * `raw` is the live input value string. Non-numeric => incorrect, never throws.
 * Returns { earned, isFullyCorrect, x } where x is the parsed entry (or NaN).
 */
function gradeNumeric(item, raw) {
  const x = parseNumericEntry(raw, item.unit);
  const ok = inAcceptWindow(x, item);
  return { earned: ok ? item.points : 0, isFullyCorrect: ok, x };
}

/**
 * multi_blank grader (schema §11). `entries` is a Map blankId -> raw string.
 * Each blank is graded independently; `results[i].ok` records per-blank state.
 * Proportional partial credit by default; `partial_credit:false` is all-or-none.
 */
function gradeMultiBlank(item, entries) {
  const blanks = Array.isArray(item.blanks) ? item.blanks : [];
  const results = blanks.map((b) => {
    const raw = entries.get(b.id);
    const ok = b.kind === "numeric" ? inAcceptWindow(parseNumericEntry(raw, b.unit), b) : matchesText(raw, b);
    return { blank: b, ok };
  });
  const nCorrect = results.filter((r) => r.ok).length;
  const n = blanks.length || 1;
  const partial = item.partial_credit !== false; // default true (§11)
  let earned;
  if (partial) {
    earned = item.points * (nCorrect / n);
  } else {
    earned = nCorrect === n ? item.points : 0;
  }
  return { earned, isFullyCorrect: nCorrect === n, results, nCorrect, n };
}

/**
 * matching grader (schema §12). `choices` is a Map promptId -> selected
 * response id (or "" for none). A prompt is correct iff its chosen id equals
 * its `match`. Proportional partial credit by default.
 */
function gradeMatching(item, choices) {
  const prompts = Array.isArray(item.prompts) ? item.prompts : [];
  const results = prompts.map((p) => {
    const chosen = choices.get(p.id) || "";
    return { prompt: p, chosen, ok: chosen !== "" && chosen === p.match };
  });
  const nCorrect = results.filter((r) => r.ok).length;
  const n = prompts.length || 1;
  const partial = item.partial_credit !== false; // default true (§12)
  let earned;
  if (partial) {
    earned = item.points * (nCorrect / n);
  } else {
    earned = nCorrect === n ? item.points : 0;
  }
  return { earned, isFullyCorrect: nCorrect === n, results, nCorrect, n };
}

/* ============================================================================
 * Source link (schema §4): label from source.title + optional section.
 * ========================================================================== */
function buildSourceLink(source) {
  if (!source || !source.href) return null;
  const parts = [];
  if (source.title) parts.push(source.title);
  if (source.section) parts.push(source.section);
  const label = parts.length ? parts.join(" — ") : source.href;
  const wrap = el("p", { class: "qz-source" }, [
    el("span", { class: "qz-source__label", text: "Source: " }),
    el("a", {
      class: "qz-source__link",
      href: source.href,
      // The notes open in a new tab so the quiz state is preserved.
      target: "_blank",
      rel: "noopener",
      html: renderMarkdownInline(label),
    }),
  ]);
  return wrap;
}

/* ============================================================================
 * Per-item rendering.
 * ========================================================================== */

let uidCounter = 0;
function uid(prefix) {
  uidCounter += 1;
  return `${prefix}-${uidCounter}`;
}

/**
 * Return a shuffled COPY of an array (Fisher–Yates), never mutating the input
 * (P2-9). Uses crypto.getRandomValues when available for a better shuffle, else
 * Math.random. Order never affects grading or resume (responses key on id).
 */
function shuffled(arr) {
  const a = Array.isArray(arr) ? arr.slice() : [];
  const rand = (k) => {
    const c = typeof window !== "undefined" && window.crypto;
    if (c && typeof c.getRandomValues === "function") {
      const u = new Uint32Array(1);
      c.getRandomValues(u);
      return u[0] % k;
    }
    return Math.floor(Math.random() * k);
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/** Points suffix: "pt" / "pts" matching the count. */
function ptsLabel(points) {
  return points === 1 ? "pt" : "pts";
}

/** Format an earned score for the verdict, trimming float dust (5/3 partials). */
function fmtScore(n) {
  // Round to 2 dp but drop trailing zeros: 1.3333… -> 1.33, 1 -> 1, 0.5 -> 0.5.
  return String(Math.round(n * 100) / 100);
}

/* ----------------------------------------------------------------------------
 * Shared assets (P0-5). An item may carry `asset_refs: [id, …]` pointing into
 * `bank.shared_assets[]`. Each asset has a `kind`:
 *   table | note → a `markdown` body rendered with the pipe-table renderer
 *   figure       → an `<img src alt>` (figures are pre-rendered, never live).
 * Assets render ABOVE the stem (the item text reads the asset's numbers), are
 * display-only, and are never graded. Resolution is done once in renderQuiz and
 * handed to each card via `ctx.assetsFor`.
 * -------------------------------------------------------------------------- */

/** Build a DOM node for one shared asset, or null if it is malformed. */
function renderAsset(asset) {
  if (!asset || typeof asset !== "object") return null;
  const fig = el("figure", { class: `qz-asset qz-asset--${asset.kind || "note"}` });

  if (asset.title) {
    fig.appendChild(
      el("figcaption", { class: "qz-asset__title", html: renderMarkdownInline(asset.title) })
    );
  }

  if (asset.kind === "figure") {
    if (!asset.src) return null;
    fig.appendChild(
      el("img", {
        class: "qz-asset__img",
        src: asset.src,
        alt: asset.alt != null ? asset.alt : "",
        loading: "lazy",
        decoding: "async",
      })
    );
  } else {
    // table | note (and any unknown kind that still carried markdown).
    if (asset.markdown == null) return null;
    fig.appendChild(
      el("div", { class: "qz-asset__body", html: renderMarkdownWithTables(asset.markdown) })
    );
  }

  if (asset.caption) {
    fig.appendChild(
      el("figcaption", { class: "qz-asset__caption", html: renderMarkdownWithTables(asset.caption) })
    );
  }
  return fig;
}

/** Append every resolved asset for `item` (via ctx) above the stem. */
function appendAssets(card, item, ctx) {
  if (!ctx || typeof ctx.assetsFor !== "function") return;
  const assets = ctx.assetsFor(item);
  if (!assets || !assets.length) return;
  const wrap = el("div", { class: "qz-assets" });
  for (const asset of assets) {
    const node = renderAsset(asset);
    if (node) wrap.appendChild(node);
  }
  if (wrap.childNodes.length) card.appendChild(wrap);
}

/**
 * Build the shared card shell every item type uses: <section> + header
 * (number, points, topic/difficulty meta) + any referenced shared assets +
 * stem. The stem is rendered as block Markdown unless `skipStem` is set
 * (multi_blank renders its own stem so it can splice inputs into the prose
 * before typesetting). Pass `opts.ctx` so referenced assets resolve.
 */
function buildCardShell(item, displayNumber, opts) {
  const card = el("section", {
    class: "qz-card",
    "data-item-id": item.id,
    "data-item-type": item.type,
  });

  const header = el("header", { class: "qz-card__header" }, [
    el("span", { class: "qz-number", text: `Q${displayNumber}` }),
    el("span", { class: "qz-points", text: `${item.points} ${ptsLabel(item.points)}` }),
  ]);
  const metaBits = [];
  if (item.topic) metaBits.push(item.topic);
  if (item.difficulty) metaBits.push(item.difficulty);
  if (metaBits.length) {
    header.appendChild(el("span", { class: "qz-meta", text: metaBits.join(" · ") }));
  }
  card.appendChild(header);

  // Referenced shared assets render above the stem (the item reads their data).
  appendAssets(card, item, opts && opts.ctx);

  if (!(opts && opts.skipStem)) {
    // Stems may carry a GitHub-style pipe table (e.g. a coefficient / ANOVA /
    // cell-means table read by the item), so use the table-aware renderer.
    card.appendChild(el("div", { class: "qz-stem", html: renderMarkdownWithTables(item.stem) }));
  }
  return card;
}

/**
 * The shared feedback TAIL shown after grading on every item type: the
 * "Why this is correct" panel (schema §6) then the Source link (§4). Appended
 * to the given feedback container. (The verdict line is built per-type because
 * the wording differs slightly, but it always uses `buildVerdict`.)
 */
function appendWhyAndSource(feedback, item) {
  if (item.why_correct) {
    feedback.appendChild(
      el("div", { class: "qz-why" }, [
        el("p", { class: "qz-why__head", text: "Why this is correct" }),
        el("div", { class: "qz-why__body", html: renderMarkdownWithTables(item.why_correct) }),
      ])
    );
  }
  const sourceLink = buildSourceLink(item.source);
  if (sourceLink) feedback.appendChild(sourceLink);
}

/**
 * Build the verdict line (icon + text + color class) from a graded result.
 *
 * State (P2-1) is THREE-way:
 *   "correct"   → teal,  check icon
 *   "partial"   → gold,  partial icon  (some-but-not-all credit earned)
 *   "incorrect" → rust,  cross icon
 * For the all-or-nothing types pass fully=true/false (never partial). For
 * multi_blank / matching pass state="partial" when 0 < earned < points. Score
 * is shown as earned/points with earned rounded to ≤ 2 dp (fmtScore). `lead`
 * overrides the leading word (e.g. "Partial credit").
 */
function buildVerdict(item, earned, state, lead) {
  // Back-compat: a boolean `fully` maps to "correct"/"incorrect".
  const st = state === true ? "correct" : state === false ? "incorrect" : state;
  const cls = st === "correct" ? "is-correct" : st === "partial" ? "is-partial" : "is-incorrect";
  const ic = st === "correct" ? "check" : st === "partial" ? "partial" : "cross";
  const verdict = el("div", { class: `qz-verdict ${cls}` });
  verdict.appendChild(icon(ic));
  const word = lead || (st === "correct" ? "Correct" : st === "partial" ? "Partial credit" : "Not quite");
  verdict.appendChild(
    el("span", {
      class: "qz-verdict__text",
      text: `${word} — ${fmtScore(earned)}/${item.points} ${ptsLabel(item.points)}`,
    })
  );
  return verdict;
}

/**
 * Move keyboard focus to the just-revealed feedback after a LIVE Check (WCAG
 * 2.4.3, ADR P2-3). Disabling the focused Check button otherwise drops focus to
 * <body>; the feedback container carries tabindex=-1 so it can receive focus,
 * and a screen reader then lands on the verdict.
 *
 * GATED to live grading only: during the resume replay (`ctx.replaying === true`)
 * we skip the move so restored items don't fight over focus on load. Guarded so
 * a headless/no-focus environment never throws.
 */
function focusFeedback(feedback, ctx) {
  if (ctx && ctx.replaying) return; // resume replay: do not steal focus
  if (!feedback || typeof feedback.focus !== "function") return;
  // Defer one frame: focusing a just-inserted node synchronously is unreliable
  // until layout flushes. rAF runs before the next paint, so a foreground Check
  // click moves focus to the verdict with no perceptible delay.
  const move = () => { try { feedback.focus({ preventScroll: false }); } catch (_e) {} };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(move);
  else move();
}

/** A small inline ✓/✗ status chip (icon + text) for blanks/prompts. */
function statusChip(ok) {
  const chip = el("span", {
    class: `qz-chip ${ok ? "is-correct" : "is-incorrect"}`,
  });
  chip.appendChild(icon(ok ? "check" : "cross"));
  chip.appendChild(el("span", { class: "qz-chip__text", text: ok ? "Correct" : "Incorrect" }));
  return chip;
}

/**
 * Render a single radio/checkbox-style item into a <section> card.
 * Returns the card element (already appended by the caller).
 *
 * `ctx` (optional) is the quiz-level controller hook: after a successful grade
 * the renderer calls `ctx.onGraded(item, response, earned)` so the quiz can
 * persist the attempt and update the running-score banner. The same path also
 * powers resume: `card._qzApply(response)` re-selects the saved options, then
 * `card._qzGrade()` re-reads the DOM and runs the identical grading/feedback.
 */
function renderItem(item, displayNumber, ctx) {
  const isMulti = item.type === "multiple_answer";
  const inputType = isMulti ? "checkbox" : "radio";

  // --- Shared shell: card + header + assets + stem ---
  const card = buildCardShell(item, displayNumber, { ctx });

  // Give the stem a stable id and tie the radio/checkbox group to it via
  // aria-describedby (P2-9): the <legend> names the group ("Select one answer")
  // and the stem is announced as its description, so a screen-reader user hears
  // the QUESTION on entering the group without burying it inside the <legend>.
  const stemEl = card.querySelector(".qz-stem");
  const stemId = uid(`stem-${item.id}`);
  if (stemEl) stemEl.id = stemId;

  // --- Options inside a <fieldset> with a <legend> for the screen reader ---
  const groupName = uid(`qz-${item.id}`);
  const fieldset = el("fieldset", {
    class: "qz-options",
    "aria-describedby": stemEl ? stemId : null,
  });
  const legend = el("legend", { class: "qz-legend" }, [
    isMulti ? "Select all that apply." : "Select one answer.",
  ]);
  fieldset.appendChild(legend);

  // Determine render order (P2-9). Option types shuffle by default; an item may
  // set `shuffle:false` to keep author order (e.g. True before False). Grading
  // is order-free and saved responses key on option id, so shuffling never
  // affects scoring or resume. true_false defaults to NOT shuffling (keep the
  // conventional True/False order) unless the author opts in.
  const defaultShuffle = item.type !== "true_false";
  const doShuffle = item.shuffle === undefined ? defaultShuffle : item.shuffle !== false;
  const options = doShuffle ? shuffled(item.options) : item.options.slice();

  const inputs = []; // {input, option, wrap, labelText}
  for (const opt of options) {
    const inputId = uid(`opt-${opt.id}`);
    const input = el("input", {
      type: inputType,
      name: groupName,
      id: inputId,
      value: opt.id,
      class: "qz-input",
    });
    const labelText = el("span", {
      class: "qz-option__text",
      html: renderMarkdownInline(opt.text),
    });
    // a11y (WCAG 1.4.1/1.3.1): the wrapper is NOT aria-hidden so the textual
    // state ("Correct"/"Incorrect"/"Correct answer (not selected)") appended
    // here is announced. Only the decorative SVG icon carries aria-hidden.
    const statusIcon = el("span", { class: "qz-option__status" });
    const label = el("label", { class: "qz-option", for: inputId }, [
      input,
      labelText,
      statusIcon,
    ]);
    const wrap = el("div", { class: "qz-option-row" }, [label]);
    fieldset.appendChild(wrap);
    inputs.push({ input, option: opt, wrap, statusIcon });
  }
  card.appendChild(fieldset);

  // --- Controls: Check button ---
  const checkBtn = el("button", {
    type: "button",
    class: "qz-btn qz-btn--check",
    text: "Check",
  });
  const controls = el("div", { class: "qz-controls" }, [checkBtn]);
  card.appendChild(controls);

  // --- Feedback live region (announced politely on grade) ---
  // NOT aria-atomic (ADR P2-3): the verdict line is inserted FIRST, so a polite
  // region announces a terse verdict ("Correct — 1/1 pt") instead of reading the
  // whole block (verdict + why-correct + details + source) as one long utterance.
  // tabindex=-1 makes it a programmatic focus target (WCAG 2.4.3): after a live
  // Check we move focus here so it doesn't drop to <body> when the focused
  // Check button is disabled.
  const feedback = el("div", {
    class: "qz-feedback",
    "aria-live": "polite",
    tabindex: "-1",
  });
  card.appendChild(feedback);

  // ------------------------------------------------------------------------
  // Grade handler.
  // ------------------------------------------------------------------------
  let graded = false;

  function onCheck() {
    // Collect the selected ids from the live DOM (single source of truth).
    const selectedIds = new Set(
      inputs.filter((r) => r.input.checked).map((r) => r.option.id)
    );

    const result = gradeItem(item, selectedIds);

    // Lock inputs so the result is stable while feedback is shown (one
    // graded attempt per item; Reset clears progress to retry).
    for (const r of inputs) r.input.disabled = true;
    checkBtn.disabled = true;
    graded = true;

    // Mark every option correct/incorrect with color PLUS an icon PLUS text.
    for (const r of inputs) {
      const isKeyedCorrect = result.correctIds.has(r.option.id);
      const wasChosen = selectedIds.has(r.option.id);

      // Clear any prior state classes (defensive; we only grade once here).
      r.wrap.classList.remove(
        "is-correct",
        "is-incorrect",
        "is-missed",
        "is-chosen"
      );
      // Reset status node.
      r.statusIcon.textContent = "";

      let stateLabel = "";
      if (isKeyedCorrect) {
        r.wrap.classList.add("is-correct");
        if (wasChosen) {
          stateLabel = "Correct";
        } else {
          // A correct answer the student did NOT pick (matters for
          // multiple_answer; also shows the key on a missed single-select).
          r.wrap.classList.add("is-missed");
          stateLabel = "Correct answer (not selected)";
        }
        r.statusIcon.appendChild(icon("check"));
      } else if (wasChosen) {
        // Chosen but wrong.
        r.wrap.classList.add("is-incorrect");
        stateLabel = "Incorrect";
        r.statusIcon.appendChild(icon("cross"));
      }
      if (wasChosen) r.wrap.classList.add("is-chosen");

      // Visible, non-color state text appended to the option (a11y: never
      // rely on color alone). Empty for unchosen wrong options (neutral).
      if (stateLabel) {
        r.statusIcon.appendChild(
          el("span", { class: "qz-status-text", text: stateLabel })
        );
      }

      // Reveal the chosen WRONG option's rationale beneath it (schema §6 rule).
      if (wasChosen && !isKeyedCorrect && r.option.rationale) {
        r.wrap.appendChild(
          el("div", { class: "qz-rationale" }, [
            el("span", { class: "qz-rationale__tag", text: "Why this is wrong: " }),
            el("span", { html: renderMarkdownInline(r.option.rationale) }),
          ])
        );
      }
    }

    // Build the feedback block: verdict + points, "Why this is correct", Source.
    feedback.textContent = "";
    feedback.appendChild(buildVerdict(item, result.earned, result.isFullyCorrect));
    appendWhyAndSource(feedback, item);

    // Re-typeset any math that landed in the rationale / why-correct / source.
    typeset(card);

    // Notify the quiz controller (persist + update banner). The captured
    // `response` is everything needed to rehydrate this item on a later load:
    // the list of selected option ids (0..n for checkboxes, 0..1 for radios).
    if (ctx && typeof ctx.onGraded === "function") {
      ctx.onGraded(item, { selected: [...selectedIds] }, result.earned);
    }

    // Move focus to the verdict (WCAG 2.4.3); skipped during resume replay.
    focusFeedback(feedback, ctx);
  }

  checkBtn.addEventListener("click", onCheck);

  // Initial typeset of the stem + option labels (math in the question itself).
  typeset(card);

  // Expose a tiny hook for tests/automation without leaking internals.
  card._qzGrade = () => {
    if (!graded) onCheck();
  };

  // Resume hook: re-apply a saved `response` to the live inputs WITHOUT grading.
  // Idempotent and safe to call before `_qzGrade()`; grading then re-reads the
  // DOM, so the replayed result is bit-for-bit identical to the live attempt.
  card._qzApply = (response) => {
    if (graded || !response) return;
    const sel = new Set(Array.isArray(response.selected) ? response.selected : []);
    for (const r of inputs) r.input.checked = sel.has(r.option.id);
  };

  return card;
}

/* ============================================================================
 * Shared "Check" controls + feedback live region for the entry/select types.
 *
 * Returns { controls, feedback, checkBtn, wire } where wire(onCheck) attaches
 * the handler and a single-grade test hook to the given card. Mirrors the
 * radio-type wiring so all six types behave identically (one attempt, then a
 * politely-announced verdict block).
 * ========================================================================== */
function buildControlsAndFeedback(card) {
  const checkBtn = el("button", {
    type: "button",
    class: "qz-btn qz-btn--check",
    text: "Check",
  });
  const controls = el("div", { class: "qz-controls" }, [checkBtn]);
  // NOT aria-atomic (ADR P2-3): the verdict line is inserted FIRST, so a polite
  // region announces a terse verdict instead of the whole feedback block at once.
  // tabindex=-1 makes it a programmatic focus target (WCAG 2.4.3): after a live
  // Check the renderer moves focus here so focus doesn't fall to <body> when the
  // focused Check button is disabled.
  const feedback = el("div", {
    class: "qz-feedback",
    "aria-live": "polite",
    tabindex: "-1",
  });

  function wire(onCheck) {
    let graded = false;
    function run() {
      if (graded) return;
      graded = true;
      onCheck();
    }
    checkBtn.addEventListener("click", run);
    card._qzGrade = run;
  }

  return { controls, feedback, checkBtn, wire };
}

/* ============================================================================
 * numeric (schema §10) — one number input, accept-window grading.
 * ========================================================================== */
function renderNumeric(item, displayNumber, ctx) {
  const card = buildCardShell(item, displayNumber, { ctx });

  // Single numeric input. CRUCIAL (P1-4): this is type="text" with
  // inputmode="decimal", NOT type="number". A native number field silently
  // REJECTS exactly the characters the parser must handle — the Unicode minus
  // `−` (U+2212, which the data tables DISPLAY and students copy), thousands
  // commas, and any trailing unit — clearing them to "" before grading ever
  // sees them. text + inputmode lets the value reach parseNumericEntry intact
  // while still showing a numeric keypad on mobile.
  const inputId = uid(`num-${item.id}`);
  const input = el("input", {
    type: "text",
    inputmode: "decimal",
    autocomplete: "off",
    autocapitalize: "off",
    spellcheck: "false",
    id: inputId,
    name: inputId,
    class: "qz-num-input",
    placeholder: item.placeholder || null,
    "aria-describedby": item.unit ? `${inputId}-unit` : null,
  });
  // A visually-hidden label keeps the bare input accessible (the stem above is
  // the visible prompt). The unit, if any, is shown beside the field.
  const label = el("label", { class: "qz-sr-only", for: inputId, text: "Your numeric answer" });
  const fieldRow = el("div", { class: "qz-num-row" }, [label, input]);
  if (item.unit) {
    fieldRow.appendChild(
      el("span", { class: "qz-num-unit", id: `${inputId}-unit`, html: renderMarkdownInline(item.unit) })
    );
  }
  card.appendChild(fieldRow);

  const { controls, feedback, checkBtn, wire } = buildControlsAndFeedback(card);
  card.appendChild(controls);
  card.appendChild(feedback);

  wire(function onCheck() {
    // Capture the raw entry verbatim BEFORE we disable the field, so the saved
    // response replays exactly (parsing/window logic re-runs on resume).
    const rawValue = input.value;
    const result = gradeNumeric(item, rawValue);
    input.disabled = true;
    checkBtn.disabled = true;
    fieldRow.classList.add(result.isFullyCorrect ? "is-correct" : "is-incorrect");

    feedback.textContent = "";
    feedback.appendChild(buildVerdict(item, result.earned, result.isFullyCorrect));

    // Reveal the keyed answer + the accepted window (what counts as right).
    const yours = Number.isFinite(result.x) ? fmtNum(result.x) : "(not a number)";
    const win = describeWindow(item);
    const answerLine = el("div", { class: "qz-answer-line" }, [
      el("span", { class: "qz-answer-line__tag", text: "Answer: " }),
      el("span", {
        html: renderMarkdownInline(
          `**${fmtNum(item.answer)}**${item.unit ? " " + item.unit : ""}` +
            (win ? `  ·  accepted: ${win}` : "")
        ),
      }),
    ]);
    feedback.appendChild(answerLine);
    feedback.appendChild(
      el("p", { class: "qz-your-entry", text: `You entered: ${yours}` })
    );

    // Common wrong answers (distractor_notes) — documented, not graded.
    if (Array.isArray(item.distractor_notes) && item.distractor_notes.length) {
      const list = el("ul", { class: "qz-distractors" });
      for (const d of item.distractor_notes) {
        list.appendChild(
          el("li", { class: "qz-distractor" }, [
            el("span", { class: "qz-distractor__val", html: renderMarkdownInline(`$${fmtNum(d.value)}$`) }),
            el("span", { class: "qz-distractor__sep", text: " — " }),
            el("span", { html: renderMarkdownInline(d.rationale) }),
          ])
        );
      }
      feedback.appendChild(
        el("div", { class: "qz-distractors-wrap" }, [
          el("p", { class: "qz-distractors__head", text: "Common wrong answers" }),
          list,
        ])
      );
    }

    appendWhyAndSource(feedback, item);
    typeset(card);

    // Persist + update the running-score banner via the controller hook.
    if (ctx && typeof ctx.onGraded === "function") {
      ctx.onGraded(item, { value: rawValue }, result.earned);
    }

    // Move focus to the verdict (WCAG 2.4.3); skipped during resume replay.
    focusFeedback(feedback, ctx);
  });

  // Resume hook: set the input value from a saved response (re-grading re-parses
  // it through the same accept-window path, so the verdict is identical).
  card._qzApply = (response) => {
    if (response && typeof response.value === "string") input.value = response.value;
  };

  typeset(card);
  return card;
}

/**
 * Compute the set of blank ids whose `{{id}}` token lands inside a `$…$`/`$$…$$`
 * span in the RAW stem (P1-1). A blank input inside an equation would corrupt
 * the math and can't be typeset, so such tokens must be refused. Returns a Set
 * of offending ids; the caller warns and leaves those tokens as literal text.
 */
function blanksInsideMath(rawStem) {
  const bad = new Set();
  const tokenRe = /\{\{\s*([a-z0-9][a-z0-9_-]*)\s*\}\}/gi;
  for (const run of splitMath(rawStem)) {
    if (run.kind !== "math") continue;
    let m;
    tokenRe.lastIndex = 0;
    while ((m = tokenRe.exec(run.value)) !== null) bad.add(m[1].toLowerCase());
  }
  return bad;
}

/**
 * Splice `{{blankId}}` tokens in the rendered `html` into inline <input>s.
 *
 * - A token whose blank is unknown is left visible (the gap is obvious).
 * - A token the RAW stem placed inside a math span is REFUSED (P1-1): a console
 *   warning fires and the literal `{{id}}` is kept, rather than injecting an
 *   input mid-equation. (CI mirrors this as a hard error — schema.md §13f.)
 * The input markup escapes author placeholders; the token text is fixed.
 */
function spliceBlanks(html, blankMeta, rawStem) {
  const unsafe = blanksInsideMath(rawStem);
  for (const id of unsafe) {
    // eslint-disable-next-line no-console
    console.warn(
      `quiz engine: blank "{{${id}}}" sits inside a $…$/$$…$$ span and was not ` +
        "spliced (it would break the equation). Move the token into prose."
    );
  }
  return html.replace(/\{\{\s*([a-z0-9][a-z0-9_-]*)\s*\}\}/gi, (whole, rawId) => {
    const id = rawId.toLowerCase();
    if (unsafe.has(id)) return whole; // refuse: token inside math (P1-1)
    const meta = blankMeta.get(rawId) || blankMeta.get(id);
    if (!meta) return whole; // unknown token: leave visible so the gap is obvious
    const ph = meta.blank.label ? ` placeholder="${escapeHtml(meta.blank.label)}"` : "";
    const mode = meta.blank.kind === "numeric" ? "decimal" : "text";
    const ariaLabel = escapeHtml(meta.blank.label || `blank ${meta.blank.id}`);
    return (
      `<span class="qz-blank-wrap" data-blank="${escapeHtml(meta.blank.id)}">` +
      `<input type="text" inputmode="${mode}" class="qz-blank-input" ` +
      `id="${meta.domId}" name="${meta.domId}" aria-label="${ariaLabel}"` +
      `${ph} autocomplete="off" autocapitalize="off" spellcheck="false" />` +
      `<span class="qz-blank-status" aria-hidden="true"></span>` +
      `</span>`
    );
  });
}

/* ============================================================================
 * multi_blank (schema §11) — inline {{blankN}} inputs in the prose.
 *
 * Ordering is load-bearing: (1) Markdown -> HTML on the stem (tokens survive;
 * `$…$`/`$$…$$` is converted to `\(…\)`/`\[…\]`); (2) splice each `{{blankN}}`
 * token into an <input> placeholder span (refusing tokens inside math, P1-1);
 * (3) typeset LAST, so equations render and the inputs are not touched.
 * ========================================================================== */
function renderMultiBlank(item, displayNumber, ctx) {
  // skipStem: we build the stem ourselves so we can splice inputs into it.
  const card = buildCardShell(item, displayNumber, { skipStem: true, ctx });

  const blanks = Array.isArray(item.blanks) ? item.blanks : [];
  // Map each blank id to a freshly-minted DOM input id.
  const blankMeta = new Map(); // blankId -> { domId, blank }
  for (const b of blanks) {
    blankMeta.set(b.id, { domId: uid(`blank-${b.id}`), blank: b });
  }

  // (1) Markdown -> HTML. `{{blankN}}` tokens survive (not math/markdown); math
  //     `$…$`/`$$…$$` has already been converted to `\(…\)`/`\[…\]`.
  // (2) Splice each token into an inline <input>, refusing any token that the
  //     RAW stem places inside a math span (P1-1).
  const html = spliceBlanks(
    renderMarkdownWithTables(item.stem),
    blankMeta,
    item.stem
  );

  const stemEl = el("div", { class: "qz-stem qz-stem--blanks", html });
  card.appendChild(stemEl);

  const { controls, feedback, checkBtn, wire } = buildControlsAndFeedback(card);
  card.appendChild(controls);
  card.appendChild(feedback);

  // Resolve the live input nodes now that the stem is in the card.
  const liveInputs = new Map(); // blankId -> input node
  for (const [id, meta] of blankMeta) {
    const node = stemEl.querySelector(`#${cssEscape(meta.domId)}`);
    if (node) liveInputs.set(id, node);
  }

  wire(function onCheck() {
    const entries = new Map();
    const responseBlanks = {}; // serializable mirror of `entries` for storage
    for (const [id, node] of liveInputs) {
      entries.set(id, node.value);
      responseBlanks[id] = node.value;
    }
    const result = gradeMultiBlank(item, entries);

    for (const node of liveInputs.values()) node.disabled = true;
    checkBtn.disabled = true;

    // Per-blank inline ✓/✗ on the wrapper + the keyed value/accepts.
    feedback.textContent = "";
    const fully = result.isFullyCorrect;
    // Three-way state (P2-1): full -> correct; some-but-not-all -> partial
    // (gold), none -> incorrect. Earned > 0 without `fully` also covers an
    // all-or-nothing partial_credit:false item that happened to earn 0.
    const state = fully ? "correct" : result.nCorrect > 0 ? "partial" : "incorrect";
    feedback.appendChild(buildVerdict(item, result.earned, state));

    const detail = el("ol", { class: "qz-blank-detail" });
    for (const r of result.results) {
      const id = r.blank.id;
      const wrap = stemEl.querySelector(`.qz-blank-wrap[data-blank="${cssAttr(id)}"]`);
      if (wrap) {
        wrap.classList.add(r.ok ? "is-correct" : "is-incorrect");
        const status = wrap.querySelector(".qz-blank-status");
        if (status) status.appendChild(icon(r.ok ? "check" : "cross"));
      }
      // Build the "expected" string for this blank.
      let expected;
      if (r.blank.kind === "numeric") {
        const win = describeWindow(r.blank);
        expected = `**${fmtNum(r.blank.answer)}**${r.blank.unit ? " " + r.blank.unit : ""}` +
          (win ? `  ·  accepted: ${win}` : "");
      } else {
        const accepts = (r.blank.accept || []).map((a) => `\`${a}\``).join(", ");
        expected = `accepts ${accepts}`;
      }
      const li = el("li", { class: `qz-blank-row ${r.ok ? "is-correct" : "is-incorrect"}` }, [
        statusChip(r.ok),
        el("span", { class: "qz-blank-row__label", html: renderMarkdownInline(r.blank.label || r.blank.id) }),
        el("span", { class: "qz-blank-row__exp", html: renderMarkdownInline(expected) }),
      ]);
      if (r.blank.rationale) {
        li.appendChild(
          el("div", { class: "qz-rationale qz-rationale--neutral" }, [
            el("span", { html: renderMarkdownInline(r.blank.rationale) }),
          ])
        );
      }
      detail.appendChild(li);
    }
    feedback.appendChild(detail);

    appendWhyAndSource(feedback, item);
    // (3) Typeset LAST: equations in the stem + math in the feedback render now.
    typeset(card);

    // Persist + update banner. `blanks` is a {blankId: rawString} map; resume
    // re-fills each input and the same per-blank window/text grading re-runs.
    if (ctx && typeof ctx.onGraded === "function") {
      ctx.onGraded(item, { blanks: responseBlanks }, result.earned);
    }

    // Move focus to the verdict (WCAG 2.4.3); skipped during resume replay.
    focusFeedback(feedback, ctx);
  });

  // Resume hook: re-fill each blank's input from the saved response.
  card._qzApply = (response) => {
    const saved = response && response.blanks ? response.blanks : {};
    for (const [id, node] of liveInputs) {
      if (Object.prototype.hasOwnProperty.call(saved, id) && typeof saved[id] === "string") {
        node.value = saved[id];
      }
    }
  };

  // (3) Initial typeset: render the stem's display equation with inputs in place.
  typeset(card);
  return card;
}

/* ============================================================================
 * matching (schema §12) — one <select> per prompt, listing every response.
 * ========================================================================== */
function renderMatching(item, displayNumber, ctx) {
  const card = buildCardShell(item, displayNumber, { ctx });

  const prompts = Array.isArray(item.prompts) ? item.prompts : [];
  const responses = Array.isArray(item.responses) ? item.responses : [];
  const responseById = new Map(responses.map((r) => [r.id, r]));

  // A definition-list-like layout: each prompt (left) + its <select> (right).
  const list = el("div", { class: "qz-match-list" });
  const selects = new Map(); // promptId -> select node
  prompts.forEach((p, i) => {
    const selId = uid(`match-${p.id}`);
    const promptText = el("div", {
      class: "qz-match__prompt",
      id: `${selId}-label`,
      html: renderMarkdownInline(p.text),
    });

    const select = el("select", {
      class: "qz-match__select",
      id: selId,
      name: selId,
      "aria-labelledby": `${selId}-label`,
    });
    select.appendChild(el("option", { value: "", text: "— choose —" }));
    // Every response (incl. distractors) is offered, in author order, so the
    // distractor is genuinely a plausible-looking option, not visibly flagged.
    for (const resp of responses) {
      // Option text strips MathJax delimiters' visual benefit (a <select>
      // can't render math), so we use the plain text — acceptable for short
      // diagnosis labels. The full math version is revealed in the feedback.
      select.appendChild(
        el("option", { value: resp.id, text: stripMarkdown(resp.text) })
      );
    }
    selects.set(p.id, select);

    const row = el("div", { class: "qz-match-row" }, [
      el("span", { class: "qz-match__num", text: `${i + 1}.` }),
      promptText,
      el("div", { class: "qz-match__control" }, [select]),
      // a11y (WCAG 1.4.1/1.3.1): wrapper NOT aria-hidden so the per-row state
      // text ("Correct"/"Incorrect") appended on grade is announced; only the
      // decorative SVG icon inside it carries aria-hidden.
      el("span", { class: "qz-match__status" }),
    ]);
    list.appendChild(row);
  });
  card.appendChild(list);

  const { controls, feedback, checkBtn, wire } = buildControlsAndFeedback(card);
  card.appendChild(controls);
  card.appendChild(feedback);

  wire(function onCheck() {
    const choices = new Map();
    const responseChoices = {}; // serializable mirror: promptId -> responseId|""
    for (const [id, sel] of selects) {
      choices.set(id, sel.value);
      responseChoices[id] = sel.value;
    }
    const result = gradeMatching(item, choices);

    for (const sel of selects.values()) sel.disabled = true;
    checkBtn.disabled = true;

    feedback.textContent = "";
    const fully = result.isFullyCorrect;
    // Three-way state (P2-1): full -> correct; some-but-not-all -> partial
    // (gold), none -> incorrect. Earned > 0 without `fully` also covers an
    // all-or-nothing partial_credit:false item that happened to earn 0.
    const state = fully ? "correct" : result.nCorrect > 0 ? "partial" : "incorrect";
    feedback.appendChild(buildVerdict(item, result.earned, state));

    // Per-prompt detail: ✓/✗, the correct pairing, and each prompt's rationale.
    const detail = el("ol", { class: "qz-match-detail" });
    result.results.forEach((r, i) => {
      const row = list.children[i];
      const statusCell = row ? row.querySelector(".qz-match__status") : null;
      if (statusCell) {
        statusCell.appendChild(icon(r.ok ? "check" : "cross"));
        statusCell.appendChild(
          el("span", { class: "qz-status-text", text: r.ok ? "Correct" : "Incorrect" })
        );
      }
      if (row) row.classList.add(r.ok ? "is-correct" : "is-incorrect");

      const correctResp = responseById.get(r.prompt.match);
      const correctText = correctResp ? stripMarkdown(correctResp.text) : r.prompt.match;
      const li = el("li", { class: `qz-match-detail__row ${r.ok ? "is-correct" : "is-incorrect"}` }, [
        statusChip(r.ok),
        el("span", { class: "qz-match-detail__pair" }, [
          el("span", { class: "qz-match-detail__left", html: renderMarkdownInline(r.prompt.text) }),
          el("span", { class: "qz-match-detail__arrow", text: " → " }),
          el("span", { class: "qz-match-detail__right", html: renderMarkdownInline(correctText) }),
        ]),
      ]);
      if (r.prompt.rationale) {
        li.appendChild(
          el("div", { class: "qz-rationale qz-rationale--neutral" }, [
            el("span", { html: renderMarkdownInline(r.prompt.rationale) }),
          ])
        );
      }
      detail.appendChild(li);
    });
    feedback.appendChild(detail);

    // Surface any DISTRACTOR responses' rationale ("why this is unused").
    const distractors = responses.filter((r) => r.distractor === true && r.rationale);
    if (distractors.length) {
      const dl = el("ul", { class: "qz-match-distractors" });
      for (const d of distractors) {
        dl.appendChild(
          el("li", { class: "qz-match-distractor" }, [
            el("span", { class: "qz-match-distractor__opt", html: renderMarkdownInline(d.text) }),
            el("span", { class: "qz-match-distractor__sep", text: " — " }),
            el("span", { html: renderMarkdownInline(d.rationale) }),
          ])
        );
      }
      feedback.appendChild(
        el("div", { class: "qz-match-distractors-wrap" }, [
          el("p", { class: "qz-match-distractors__head", text: "Unused option (distractor)" }),
          dl,
        ])
      );
    }

    appendWhyAndSource(feedback, item);
    typeset(card);

    // Persist + update banner. `choices` is a {promptId: responseId|""} map;
    // resume re-selects each <select> and the same per-pair grading re-runs.
    if (ctx && typeof ctx.onGraded === "function") {
      ctx.onGraded(item, { choices: responseChoices }, result.earned);
    }

    // Move focus to the verdict (WCAG 2.4.3); skipped during resume replay.
    focusFeedback(feedback, ctx);
  });

  // Resume hook: restore each prompt's <select> to its saved response id. We
  // only assign ids that still exist as options (guards a bank edit that drops
  // a response); an unknown id leaves the select on "— choose —".
  card._qzApply = (response) => {
    const saved = response && response.choices ? response.choices : {};
    for (const [id, sel] of selects) {
      const v = saved[id];
      if (typeof v === "string" && (v === "" || responseById.has(v))) sel.value = v;
    }
  };

  typeset(card);
  return card;
}

/* ============================================================================
 * Unknown / unsupported item type — graceful placeholder (P2-9).
 *
 * Renders the standard card shell (number, points, stem if present) plus a
 * neutral note, so a bank that uses a not-yet-implemented type still shows the
 * question and keeps the numbering intact, rather than the item disappearing.
 * It carries no controls and never grades (its points stay 0 in the banner,
 * which is the safe formative default).
 * ========================================================================== */
function renderUnknown(item, displayNumber) {
  // eslint-disable-next-line no-console
  console.warn(`renderQuiz: unsupported item type "${item && item.type}" (id=${item && item.id})`);
  const card = buildCardShell(item, displayNumber);
  card.classList.add("qz-card--unknown");
  card.appendChild(
    el("p", { class: "qz-unknown-note" }, [
      `This question type ("${item && item.type}") is not supported in this version.`,
    ])
  );
  // No ctx here: a placeholder cannot resolve assets and never grades, but a
  // _qzApply/_qzGrade pair keeps the resume loop uniform (both no-ops).
  card._qzApply = () => {};
  card._qzGrade = () => {};
  return card;
}

/* ----------------------------------------------------------------------------
 * Tiny utilities used by the new renderers.
 * -------------------------------------------------------------------------- */

/** Escape a string for use as a CSS #id selector (digits/specials are safe). */
function cssEscape(id) {
  if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(id);
  // Fallback: our uids are [a-z0-9-], already selector-safe.
  return String(id).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

/** Escape a string for use inside a `[attr="..."]` selector value. */
function cssAttr(v) {
  return String(v).replace(/["\\]/g, "\\$&");
}

/**
 * Convert a TeX fragment to a readable plain-text approximation for contexts
 * that cannot render MathJax (a native <select> <option>). Handles the small
 * subset the banks actually use — `\text{…}`/`\mathrm{…}` unwrapped, the LaTeX
 * thin-comma `{,}` → `,`, `_{x}`/`^{x}` flattened to `_x`/`^x`, and the common
 * operators/relations/Greek letters → Unicode. Unknown commands fall through
 * unchanged (no worse than raw TeX). The fully typeset version is shown in the
 * feedback panel, so this only needs to be legible, not perfect.
 */
function prettifyTexLabel(tex) {
  let s = String(tex == null ? "" : tex);
  // \text{…}/\mathrm{…}/\operatorname{…} → inner text (twice for light nesting,
  // e.g. \text{MS}_{\text{between}}).
  const unwrap = /\\(?:text|mathrm|mathbf|mathit|mathsf|operatorname)\s*\{([^{}]*)\}/g;
  s = s.replace(unwrap, "$1").replace(unwrap, "$1");
  s = s.replace(/\{,\}/g, ","); // LaTeX thin-comma in thousands
  s = s.replace(/_\{\s*([^{}]*?)\s*\}/g, "_$1"); // subscript: _{x} → _x
  s = s.replace(/\^\{\s*([^{}]*?)\s*\}/g, "^$1"); // superscript: ^{x} → ^x
  s = s
    .replace(/\\times/g, "×")
    .replace(/\\cdot/g, "·")
    .replace(/\\div/g, "÷")
    .replace(/\\pm/g, "±")
    .replace(/\\leq?/g, "≤")
    .replace(/\\geq?/g, "≥")
    .replace(/\\neq/g, "≠")
    .replace(/\\approx/g, "≈")
    .replace(/\\alpha/g, "α")
    .replace(/\\beta/g, "β")
    .replace(/\\gamma/g, "γ")
    .replace(/\\mu/g, "μ")
    .replace(/\\sigma/g, "σ")
    .replace(/\\,|\\;|\\!|\\ /g, " "); // TeX spacing macros → a plain space
  s = s.replace(/[{}]/g, ""); // drop any leftover grouping braces
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Strip the small Markdown/LaTeX subset to plain text for a <select> <option>
 * (which cannot render markup or math). Uses the shared math tokenizer so it is
 * robust to internal `$` and to `$a*b*c$`-style content: math runs are
 * converted to a readable plain-text approximation (prettifyTexLabel), and text
 * runs drop `**`/`*`/`` ` `` markers (honoring `\*` escapes). The rich,
 * math-typeset version is revealed in the feedback panel.
 */
function stripMarkdown(src) {
  const s = String(src == null ? "" : src).replace(/\s+/g, " ").trim();
  if (s === "") return "";
  return splitMath(s)
    .map((run) => {
      if (run.kind === "math") {
        // A native <select> cannot render MathJax; render the TeX as legible
        // plain text instead (the typeset form is revealed in the feedback).
        const inner = run.display ? run.value.slice(2, -2) : run.value.slice(1, -1);
        return prettifyTexLabel(inner);
      }
      return run.value
        .replace(/\\([*`_~])/g, "$1") // unescape \* \` etc. to literals
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/\*([^*]+)\*/g, "$1");
    })
    .join("");
}

/* ============================================================================
 * localStorage persistence (per-browser, anonymous, no network).
 *
 * Key:    ber640:practice:<quiz_id>:v1
 *         The trailing `:v1` is the RECORD-FORMAT version. Bump it (here, in
 *         STORE_FORMAT) if the saved-record shape changes incompatibly; old
 *         keys are then simply ignored (and can be swept by clearStale).
 *
 * Payload (JSON):
 *   {
 *     format: 1,                 // mirrors STORE_FORMAT (defense in depth)
 *     quiz_id: "<id>",           // sanity check vs. the bank we're loading
 *     schema_version: "1.0",     // bank.schema_version at save time
 *     signature: "id:type:pts|…",// grading-shape fingerprint (see bankSignature)
 *     saved_at: <epoch ms>,      // last-write timestamp (display/debug)
 *     items: { <itemId>: { response, graded:true, earned } }
 *   }
 *
 * A saved payload is RESTORED only if quiz_id, schema_version, AND signature all
 * still match the bank being rendered — so any item add/remove/retype/repoint,
 * a schema bump, or a manual key bump invalidates stale progress automatically.
 * (Reordering items or editing prose does NOT invalidate — grading is unchanged.)
 * ========================================================================== */

const STORE_PREFIX = "ber640:practice";
const STORE_FORMAT = 1; // record-format version; reflected in the `:v1` key suffix

/** The versioned localStorage key for a bank: ber640:practice:<quiz_id>:v1. */
function storageKey(bank) {
  return `${STORE_PREFIX}:${bank.quiz_id}:v${STORE_FORMAT}`;
}

/**
 * A compact fingerprint of the bank's GRADING shape and ANSWER KEY (P0-4).
 *
 * The signature changes whenever ANY input to grading changes:
 *   • the item set (add / remove / retype / repoint), AND
 *   • the keyed answer itself — which `options` are `correct`, a numeric
 *     `answer` / `tolerance` / `accept_range`, a text blank's `accept` list +
 *     `match` mode, a blank's `partial_credit`, a `prompt.match` pairing, and
 *     which `responses` are distractors.
 * So fixing a miskey (e.g. flipping `correct`, widening a window, renaming the
 * keyed option, or re-pairing a prompt) NOW invalidates any stale saved record,
 * which would otherwise replay the old verdict against the new key.
 *
 * It deliberately ignores PROSE and the ORDER of options/blanks/prompts/
 * responses (sorted by id below), since none of those affect earned points —
 * cosmetic edits keep a student's progress. Item order is preserved (also
 * grading-irrelevant, but cheap to keep stable). Built without JSON.stringify
 * so key order in the source object can't perturb it.
 */
function bankSignature(bank) {
  const num = (v) => (typeof v === "number" ? fmtNum(v) : "·");
  const range = (r) =>
    r && typeof r.min === "number" ? `[${num(r.min)},${num(r.max)}]` : "·";
  const numKey = (spec) => `a=${num(spec.answer)};t=${num(spec.tolerance)};r=${range(spec.accept_range)}`;

  const sigForItem = (it) => {
    const head = `${it.id}:${it.type}:${num(it.points)}`;
    let key = "";
    switch (it.type) {
      case "multiple_choice":
      case "true_false":
      case "multiple_answer": {
        // The correct-set: each option id flagged with its correct bit, id-sorted.
        const opts = (it.options || [])
          .map((o) => `${o.id}=${o.correct === true ? 1 : 0}`)
          .sort()
          .join(",");
        key = `opts(${opts})`;
        break;
      }
      case "numeric": {
        key = `num(${numKey(it)};u=${it.unit || ""})`;
        break;
      }
      case "multi_blank": {
        const blanks = (it.blanks || [])
          .map((b) => {
            if (b.kind === "numeric") return `${b.id}:n:${numKey(b)}:u=${b.unit || ""}`;
            const acc = (b.accept || []).map((a) => String(a)).slice().sort().join("␟");
            return `${b.id}:t:${b.match || "ci_trim"}:[${acc}]`;
          })
          .slice()
          .sort()
          .join(",");
        key = `blanks(${blanks};pc=${it.partial_credit !== false ? 1 : 0})`;
        break;
      }
      case "matching": {
        const pairs = (it.prompts || [])
          .map((p) => `${p.id}->${p.match}`)
          .slice()
          .sort()
          .join(",");
        const dist = (it.responses || [])
          .map((r) => `${r.id}=${r.distractor === true ? 1 : 0}`)
          .slice()
          .sort()
          .join(",");
        key = `match(${pairs};resp(${dist});pc=${it.partial_credit !== false ? 1 : 0})`;
        break;
      }
      default:
        key = "?";
    }
    return `${head}|${key}`;
  };

  return (bank.items || []).map(sigForItem).join("||");
}

/** Is localStorage usable here? (Private-mode / disabled / SSR all return false.) */
function storageAvailable() {
  try {
    const t = "__qz_probe__";
    window.localStorage.setItem(t, "1");
    window.localStorage.removeItem(t);
    return true;
  } catch (_e) {
    return false;
  }
}

/**
 * Read + validate the saved payload for this bank. Returns the parsed object
 * (with an `items` map) when it is present AND still matches this bank, else
 * null. Never throws (corrupt JSON / shape mismatch / no storage => null).
 */
function loadSaved(bank) {
  if (!storageAvailable()) return null;
  let raw;
  try {
    raw = window.localStorage.getItem(storageKey(bank));
  } catch (_e) {
    return null;
  }
  if (!raw) return null;
  let data;
  try {
    data = JSON.parse(raw);
  } catch (_e) {
    return null; // corrupt JSON — treat as no save
  }
  if (!data || typeof data !== "object" || !data.items || typeof data.items !== "object") {
    return null;
  }
  // Invalidate stale saves: format, quiz_id, schema_version, and grading shape
  // must all still match. Any mismatch => ignore (a future load may overwrite).
  if (data.format !== STORE_FORMAT) return null;
  if (data.quiz_id !== bank.quiz_id) return null;
  if (data.schema_version !== bank.schema_version) return null;
  if (data.signature !== bankSignature(bank)) return null;
  return data;
}

/**
 * Persist one item's graded record, merging into the existing payload. Silently
 * no-ops if storage is unavailable or the write fails (e.g. quota) — persistence
 * is a convenience, never a correctness dependency.
 */
function saveItemRecord(bank, itemId, record) {
  if (!storageAvailable()) return;
  const key = storageKey(bank);
  let data = null;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) data = JSON.parse(raw);
  } catch (_e) {
    data = null;
  }
  // Rebuild the envelope if missing or if it no longer matches this bank (a
  // mismatched leftover is replaced wholesale rather than appended to).
  if (
    !data ||
    typeof data !== "object" ||
    data.format !== STORE_FORMAT ||
    data.quiz_id !== bank.quiz_id ||
    data.schema_version !== bank.schema_version ||
    data.signature !== bankSignature(bank) ||
    !data.items ||
    typeof data.items !== "object"
  ) {
    data = {
      format: STORE_FORMAT,
      quiz_id: bank.quiz_id,
      schema_version: bank.schema_version,
      signature: bankSignature(bank),
      items: {},
    };
  }
  data.items[itemId] = record;
  data.saved_at = Date.now();
  try {
    window.localStorage.setItem(key, JSON.stringify(data));
  } catch (_e) {
    /* quota / disabled mid-session: drop silently */
  }
}

/** Remove this bank's saved progress entirely (used by the Reset button). */
function clearSaved(bank) {
  if (!storageAvailable()) return;
  try {
    window.localStorage.removeItem(storageKey(bank));
  } catch (_e) {
    /* ignore */
  }
}

/* ============================================================================
 * Mastery band (schema §2): pct = 100 × earned / total_points.
 *   pct ≥ full_min      -> "full"     ("Full mastery")
 *   pct ≥ partial_min   -> "partial"  ("Partial mastery")
 *   else                -> "minimal"  ("Minimal mastery")
 * Defaults: full_min 80, partial_min 60 (course defaults).
 * ========================================================================== */
function masteryBand(pct, mastery) {
  const m = mastery || {};
  const full = typeof m.full_min === "number" ? m.full_min : 80;
  const partial = typeof m.partial_min === "number" ? m.partial_min : 60;
  if (pct >= full) return { key: "full", label: "Full mastery" };
  if (pct >= partial) return { key: "partial", label: "Partial mastery" };
  return { key: "minimal", label: "Minimal mastery" };
}

/* ============================================================================
 * Quiz-level running-score banner + controller.
 *
 * Builds the sticky summary (earned/total, percent, answered N of M, mastery
 * band, progress bar, local-save note, Reset). Holds a per-item tally and, on
 * every grade (live OR replayed), recomputes the totals and repaints. The banner
 * is role="status" / aria-live="polite" so the running score is announced.
 * ========================================================================== */
function createQuizController(bank, onReset) {
  const items = Array.isArray(bank.items) ? bank.items : [];
  const totalPoints = items.reduce((s, it) => s + (typeof it.points === "number" ? it.points : 0), 0);
  const totalItems = items.length;
  const masteryLabel = (bank.mastery && bank.mastery.label) || "Mastery";

  // Per-item live tally: itemId -> { points, earned, graded }.
  const tally = new Map();
  for (const it of items) tally.set(it.id, { points: it.points || 0, earned: 0, graded: false });

  /* ---- DOM ----------------------------------------------------------- */
  const earnedNum = el("span", { class: "qz-score__earned", text: "0" });
  const totalNum = el("span", { class: "qz-score__total", text: fmtScore(totalPoints) });
  const pctNum = el("span", { class: "qz-score__pct", text: "0%" });
  const answeredNum = el("span", { class: "qz-score__answered", text: `0 of ${totalItems}` });

  const masteryPill = el("span", {
    class: "qz-band qz-band--minimal",
    text: `${masteryLabel}: Minimal mastery`,
  });

  const bar = el("div", {
    class: "qz-progress__bar",
    role: "progressbar",
    "aria-valuemin": "0",
    "aria-valuemax": String(totalItems),
    "aria-valuenow": "0",
    "aria-label": "Items answered",
  });
  const barFill = el("div", { class: "qz-progress__fill" });
  bar.appendChild(barFill);

  const resetBtn = el("button", {
    type: "button",
    class: "qz-btn qz-btn--reset",
    text: "Reset quiz",
  });
  resetBtn.addEventListener("click", () => {
    // Confirm only when there is something to lose (at least one graded item).
    const hasProgress = [...tally.values()].some((t) => t.graded);
    if (hasProgress && typeof window.confirm === "function") {
      const ok = window.confirm(
        "Reset this quiz? Your saved answers and score on this device will be cleared."
      );
      if (!ok) return;
    }
    if (typeof onReset === "function") onReset();
  });

  const scoreLine = el("div", { class: "qz-score__line" }, [
    el("span", { class: "qz-score__points" }, [
      earnedNum,
      el("span", { class: "qz-score__slash", text: " / " }),
      totalNum,
      el("span", { class: "qz-score__unit", text: " pts" }),
    ]),
    el("span", { class: "qz-score__dot", "aria-hidden": "true", text: "·" }),
    pctNum,
    el("span", { class: "qz-score__dot", "aria-hidden": "true", text: "·" }),
    el("span", { class: "qz-score__answered-wrap" }, [
      el("span", { class: "qz-score__answered-label", text: "answered " }),
      answeredNum,
    ]),
  ]);

  const banner = el("section", {
    class: "qz-scorebar",
    role: "status",
    "aria-live": "polite",
    "aria-atomic": "true",
    "aria-label": "Quiz score and progress",
  });
  const bannerInner = el("div", { class: "qz-scorebar__inner" }, [
    el("div", { class: "qz-scorebar__main" }, [scoreLine, masteryPill]),
    el("div", { class: "qz-progress" }, [bar]),
    el("div", { class: "qz-scorebar__foot" }, [
      el("span", { class: "qz-savenote" }, [
        el("span", { class: "qz-savenote__icon", "aria-hidden": "true", text: "🔒 " }),
        el("span", {
          text: "Progress is saved locally on this device only — clearing your browser data removes it.",
        }),
      ]),
      resetBtn,
    ]),
  ]);
  banner.appendChild(bannerInner);

  /* ---- Repaint from the live tally ----------------------------------- */
  function repaint() {
    let earned = 0;
    let answered = 0;
    for (const t of tally.values()) {
      if (t.graded) {
        earned += t.earned;
        answered += 1;
      }
    }
    const pct = totalPoints > 0 ? (100 * earned) / totalPoints : 0;
    const pctRounded = Math.round(pct);

    earnedNum.textContent = fmtScore(earned);
    pctNum.textContent = `${pctRounded}%`;
    answeredNum.textContent = `${answered} of ${totalItems}`;

    const band = masteryBand(pct, bank.mastery);
    masteryPill.textContent = `${masteryLabel}: ${band.label}`;
    masteryPill.className = `qz-band qz-band--${band.key}`;

    const frac = totalItems > 0 ? answered / totalItems : 0;
    barFill.style.width = `${Math.round(frac * 100)}%`;
    bar.setAttribute("aria-valuenow", String(answered));
    bar.setAttribute(
      "aria-valuetext",
      `${answered} of ${totalItems} answered · ${fmtScore(earned)} of ${fmtScore(totalPoints)} points · ${pctRounded}% · ${band.label}`
    );

    banner.classList.toggle("is-started", answered > 0);
    banner.classList.toggle("is-complete", totalItems > 0 && answered === totalItems);
  }

  // During resume, every replayed item fires onGraded; without batching, the
  // role=status/aria-live banner would announce a burst of intermediate scores
  // (P2-10). `quiet` suppresses the per-grade repaint AND flips the banner's
  // aria-live to "off" so the synchronous replay is silent; renderQuiz calls
  // setQuiet(false) + one final repaint afterwards for a single announcement.
  let quiet = false;

  /* ---- Public surface used by renderers / renderQuiz ----------------- */
  return {
    banner,
    // Called by each item after it grades (live OR replayed). Records the score
    // for the banner and persists the captured response for resume.
    onGraded(item, response, earned) {
      const t = tally.get(item.id);
      if (t) {
        t.earned = earned;
        t.graded = true;
      }
      saveItemRecord(bank, item.id, { response, graded: true, earned });
      if (!quiet) repaint();
    },
    repaint,
    // Toggle the resume-time announcement suppression (P2-10).
    setQuiet(flag) {
      quiet = !!flag;
      // aria-live="off" while quiet stops the burst; "polite" restores live
      // announcements for subsequent real Check actions.
      banner.setAttribute("aria-live", quiet ? "off" : "polite");
    },
  };
}

/* ============================================================================
 * Public API.
 * ========================================================================== */

/**
 * Render a quiz bank into a mount element.
 *
 * @param {object} bank      Parsed bank object (schema v1.0).
 * @param {Element} mountEl  Container element to render into (cleared first).
 *
 * All six schema item types are rendered; any unrecognized type is skipped with
 * a console warning so a mixed bank still renders what it can.
 *
 * Adds a quiz-level running-score banner (earned/total, percent, answered N of
 * M, mastery band, progress bar), localStorage persistence on every Check, and
 * resume-on-load that re-applies each saved answer and REPLAYS its grade so the
 * feedback, per-option marks, score, and banner are restored exactly.
 */
export function renderQuiz(bank, mountEl, opts) {
  opts = opts || {};
  if (!mountEl || !(mountEl instanceof Element)) {
    throw new TypeError("renderQuiz: mountEl must be a DOM Element");
  }
  if (!bank || !Array.isArray(bank.items)) {
    throw new TypeError("renderQuiz: bank.items must be an array");
  }

  mountEl.textContent = ""; // clear prior render
  const root = el("div", { class: "qz-quiz" });

  // Quiz title/module: shown on a standalone page, but suppressed when the host
  // page already titles the quiz (a Quarto chapter) via data-show-title="false".
  if (bank.title && opts.showTitle !== false) {
    root.appendChild(el("h1", { class: "qz-title", text: bank.title }));
  }
  if (bank.module && opts.showTitle !== false) {
    root.appendChild(el("p", { class: "qz-module", text: bank.module }));
  }

  // Quiz-level controller: the running-score banner + persistence hub. Its
  // Reset handler wipes this bank's storage key and re-renders from scratch,
  // which returns every item to its fresh, ungraded state and the banner to 0.
  const controller = createQuizController(bank, () => {
    clearSaved(bank);
    renderQuiz(bank, mountEl, opts);
  });
  // Sticky summary sits ABOVE the question list (its own sticky offset stacks
  // under the page's own top bar — see .qz-scorebar in quiz.css).
  root.appendChild(controller.banner);

  // Resolve shared assets once: id -> asset (P0-5). Each card asks ctx.assetsFor
  // for the asset objects its `asset_refs` name, in ref order; an unresolved id
  // is skipped with a console warning (CI also guards this — schema.md §13c).
  const assetById = new Map();
  for (const a of Array.isArray(bank.shared_assets) ? bank.shared_assets : []) {
    if (a && typeof a.id === "string") assetById.set(a.id, a);
  }

  // Every item is handed the same controller hook; after it grades (live or on
  // replay) it calls ctx.onGraded(item, response, earned) to persist + retally.
  // `assetsFor` resolves an item's asset_refs; `replaying` lets onGraded batch
  // the live-region repaint during resume (P2-10).
  const ctx = {
    onGraded: controller.onGraded,
    replaying: false,
    assetsFor(item) {
      const refs = Array.isArray(item.asset_refs) ? item.asset_refs : [];
      const out = [];
      for (const id of refs) {
        const a = assetById.get(id);
        if (a) out.push(a);
        // eslint-disable-next-line no-console
        else console.warn(`renderQuiz: item "${item.id}" references unknown asset "${id}"`);
      }
      return out;
    },
  };

  // Dispatch table: item type -> render function. The radio family shares
  // renderItem; the three entry/select families each have their own renderer.
  const renderers = {
    multiple_choice: renderItem,
    true_false: renderItem,
    multiple_answer: renderItem,
    numeric: renderNumeric,
    multi_blank: renderMultiBlank,
    matching: renderMatching,
  };

  // Track each item's card by id so we can replay saved attempts after mount.
  const cardsById = new Map(); // itemId -> { card, item }

  let n = 0;
  for (const item of bank.items) {
    const render = renderers[item.type];
    n += 1;
    // An unknown item type renders a graceful placeholder rather than silently
    // vanishing (P2-9), so a future schema type still shows the question shell
    // and a note instead of dropping the item and skewing the numbering.
    const card = render
      ? render(item, item.number != null ? item.number : n, ctx)
      : renderUnknown(item, item.number != null ? item.number : n);
    cardsById.set(item.id, { card, item });
    root.appendChild(card);
  }

  mountEl.appendChild(root);

  // -----------------------------------------------------------------------
  // Resume on load: re-apply each saved answer to its inputs, then REPLAY the
  // grade through the very same code path a live Check uses. Because every
  // grader reads its answer from the live DOM (selected radios/checkboxes,
  // the numeric input value, each blank's value, each <select>'s value), and
  // _qzApply restores exactly those, the replayed verdict, per-option marks,
  // earned points, and banner are reproduced bit-for-bit. The replay's own
  // onGraded re-tallies the banner and re-writes the (identical) record.
  // -----------------------------------------------------------------------
  const saved = loadSaved(bank);
  if (saved && saved.items) {
    // P2-10: suppress the live-region announcement burst during replay. We mark
    // the banner + every card's polite live regions inert (aria-live="off"),
    // replay all saved attempts synchronously, then restore "polite" and fire a
    // single banner repaint — so a returning student hears ONE summary, not a
    // machine-gun of intermediate scores and per-item verdicts.
    ctx.replaying = true;
    controller.setQuiet(true);
    const muted = [];
    for (const { card } of cardsById.values()) {
      card.querySelectorAll('[aria-live="polite"]').forEach((node) => {
        node.setAttribute("aria-live", "off");
        muted.push(node);
      });
    }

    for (const [itemId, rec] of Object.entries(saved.items)) {
      if (!rec || rec.graded !== true) continue; // only restore completed attempts
      const entry = cardsById.get(itemId);
      if (!entry) continue; // saved item no longer in the bank — skip it
      const { card } = entry;
      if (typeof card._qzApply === "function") card._qzApply(rec.response);
      if (typeof card._qzGrade === "function") card._qzGrade();
    }

    // Restore live regions AFTER the synchronous mutation burst has flushed, so
    // none of the replayed changes are announced, then paint ONE final summary.
    // Scheduled on a macrotask (setTimeout 0): unlike requestAnimationFrame —
    // which is fully paused in a backgrounded/inactive tab and could otherwise
    // leave the banner stuck at 0 — timers still fire, so the restore is
    // guaranteed. A run-once guard means a redundant scheduler can't double-run.
    let restored = false;
    const restore = () => {
      if (restored) return;
      restored = true;
      for (const node of muted) node.setAttribute("aria-live", "polite");
      ctx.replaying = false;
      controller.setQuiet(false);
      controller.repaint();
    };
    if (typeof setTimeout === "function") {
      setTimeout(restore, 0);
    } else {
      Promise.resolve().then(restore);
    }
  } else {
    // Nothing to restore — still paint the baseline (total / 0%).
    controller.repaint();
  }

  // One more global typeset pass in case MathJax loaded after the per-item
  // calls (e.g. CDN still in flight when renderQuiz ran).
  typeset(mountEl);

  return root;
}

// Also export internals under a namespace so they can be unit-tested headless
// (e.g. with a DOM shim) without going through the full render path.
export const __internals = {
  renderMarkdown,
  renderMarkdownInline,
  renderMarkdownWithTables,
  gradeSingle,
  gradeMultipleAnswer,
  gradeItem,
  correctIdSet,
  // §10–§12 graders + their parsing/matching primitives, for headless tests.
  parseNumericEntry,
  inAcceptWindow,
  matchesText,
  gradeNumeric,
  gradeMultiBlank,
  gradeMatching,
  describeWindow,
  stripMarkdown,
  // math/markdown primitives (D7 + P1-1/2/3), for headless tests.
  splitMath,
  convertMathDelimiters,
  splitBlocks,
  parsePipeTable,
  renderTableHTML,
  spliceBlanks,
  // quiz-level scoring / persistence primitives.
  storageKey,
  bankSignature,
  loadSaved,
  saveItemRecord,
  clearSaved,
  masteryBand,
  STORE_FORMAT,
};

export default renderQuiz;

/* =====================================================================
 * Auto-mount. When this module is loaded on a page (e.g. via
 *   <script type="module" src="…/quiz-engine.js"></script>)
 * it renders every
 *   <div class="quizbank" data-bank="<relative-url-to-bank.json>"></div>
 * by fetching its JSON bank and calling renderQuiz(). Idempotent (skips
 * already-mounted nodes); does nothing on a page with no such div, so the
 * same module stays safe to import-and-call-renderQuiz-manually.
 * ===================================================================== */
export async function autoMountQuizBanks(root) {
  const scope = root || (typeof document !== "undefined" ? document : null);
  if (!scope) return;
  const nodes = scope.querySelectorAll(
    ".quizbank[data-bank]:not([data-quizbank-mounted])"
  );
  for (const el of nodes) {
    el.setAttribute("data-quizbank-mounted", "1");
    const url = el.getAttribute("data-bank");
    try {
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status + " fetching " + url);
      const bank = await res.json();
      renderQuiz(bank, el, {
        showTitle: el.getAttribute("data-show-title") !== "false",
      });
    } catch (err) {
      el.removeAttribute("data-quizbank-mounted");
      el.innerHTML =
        '<p role="alert" style="color:#A8431E">Sorry — this quiz could not load (' +
        String((err && err.message) || err).replace(/</g, "&lt;") +
        "). Try refreshing the page.</p>";
      console.error("quiz-engine auto-mount:", err);
    }
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      autoMountQuizBanks();
    });
  } else {
    autoMountQuizBanks();
  }
}
