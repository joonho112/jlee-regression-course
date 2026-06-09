#!/usr/bin/env python3
r"""
build_banks_b.py — build-time validator + YAML->JSON converter for the
BER 640 student-quiz banks (canonical schema v1.0).

Build-author B. This is the CI gate that runs BEFORE the `/practice` Quarto
book builds (ADR D9). For every YAML bank it:

  1. validates against the JSON Schema (`practice/schema/quiz-schema.json`,
     Draft 2020-12) with `Draft202012Validator`;
  2. runs the relational rules JSON Schema cannot express (schema.md section 13:
     mastery ordering, scoped id uniqueness incl. cross-bank `quiz_id`,
     asset-ref resolution, matching prompt/response wiring, multi_blank token
     placement, numeric windows);
  3. on success only, converts each YAML bank -> the JSON the browser fetches
     (one `quizN.json` per bank in `--out-dir`, `indent=2`).

On ANY failure it prints clear, located errors (bank + item id + rule) and
exits non-zero — failing the build. JSON is written ONLY when every bank
passes all checks (the converter never emits a partial/invalid bank).

Idempotent: rerunning on unchanged inputs reproduces byte-identical outputs.

USAGE
-----
    python3 build_banks_b.py                       # all practice/banks/*.yml
    python3 build_banks_b.py practice/banks/quiz1.yml ...
    python3 build_banks_b.py --out-dir practice/assets/banks/
    python3 build_banks_b.py --quiet               # only the final summary line

Requires: pyyaml, jsonschema (>= 4.18, for Draft202012Validator).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

try:
    import yaml
except ImportError:  # pragma: no cover - environment guard
    sys.stderr.write("FATAL: pyyaml is required (`pip install pyyaml`).\n")
    raise SystemExit(2)

try:
    from jsonschema import Draft202012Validator
except ImportError:  # pragma: no cover - environment guard
    sys.stderr.write("FATAL: jsonschema>=4.18 is required (`pip install jsonschema`).\n")
    raise SystemExit(2)


# --------------------------------------------------------------------------- #
# Paths. Anchored on the repo so the script runs from anywhere (CI or shell).
# layout: <repo>/practice/{schema,banks,assets,extract}/...
# this file lives in <repo>/practice/extract/build_banks_b.py
# --------------------------------------------------------------------------- #
HERE = Path(__file__).resolve().parent          # practice/extract
PRACTICE_DIR = HERE.parent                       # practice
SCHEMA_PATH = PRACTICE_DIR / "schema" / "quiz-schema.json"
BANKS_DIR = PRACTICE_DIR / "banks"
DEFAULT_OUT_DIR = PRACTICE_DIR / "assets" / "banks"


# --------------------------------------------------------------------------- #
# A single located finding (error or warning) tied to a bank + optional item.
# --------------------------------------------------------------------------- #
class Finding:
    __slots__ = ("rule", "item_id", "message", "is_warning")

    def __init__(self, rule: str, message: str, item_id: str | None = None,
                 is_warning: bool = False) -> None:
        self.rule = rule
        self.item_id = item_id
        self.message = message
        self.is_warning = is_warning

    def render(self) -> str:
        loc = f"item '{self.item_id}'" if self.item_id else "bank-level"
        tag = "WARN " if self.is_warning else "ERROR"
        return f"  [{tag}] [{self.rule}] {loc}: {self.message}"


# --------------------------------------------------------------------------- #
# Math-span scanner for relational rule (5).
# Returns a list of (start, end) half-open character index ranges that lie
# inside a `$$...$$` (display) or `$...$` (inline) math span in `text`.
# A backslash-escaped dollar (`\$`) is a literal, not a delimiter.
# Display spans are checked first so `$$` is never mis-read as two inline `$`.
# An unterminated span (no closing delimiter) is treated as running to EOF,
# which makes any token after a dangling `$` correctly count as "inside math".
# --------------------------------------------------------------------------- #
def _math_spans(text: str) -> list[tuple[int, int]]:
    spans: list[tuple[int, int]] = []
    n = len(text)
    i = 0
    while i < n:
        ch = text[i]
        if ch == "\\":
            # Skip the escaped character (covers `\$`, `\\`, etc.).
            i += 2
            continue
        if ch == "$":
            if i + 1 < n and text[i + 1] == "$":
                # Display math `$$ ... $$`.
                start = i
                j = i + 2
                while j < n:
                    if text[j] == "\\":
                        j += 2
                        continue
                    if text[j] == "$" and j + 1 < n and text[j + 1] == "$":
                        j += 2
                        break
                    if text[j] == "$" and (j + 1 >= n or text[j + 1] != "$"):
                        # A lone `$` inside a `$$` block: tolerate, keep scanning.
                        j += 1
                        continue
                    j += 1
                spans.append((start, min(j, n)))
                i = j
                continue
            else:
                # Inline math `$ ... $`.
                start = i
                j = i + 1
                while j < n:
                    if text[j] == "\\":
                        j += 2
                        continue
                    if text[j] == "$":
                        j += 1
                        break
                    j += 1
                spans.append((start, min(j, n)))
                i = j
                continue
        i += 1
    return spans


def _inside_any_span(pos: int, spans: list[tuple[int, int]]) -> bool:
    """True if character index `pos` falls inside any [start, end) math span."""
    return any(start <= pos < end for (start, end) in spans)


_TOKEN_RE = re.compile(r"\{\{\s*([a-z0-9][a-z0-9_-]*)\s*\}\}")


# --------------------------------------------------------------------------- #
# Numeric-window overlap helper for rule (7) (disjoint tolerance+range warning).
# --------------------------------------------------------------------------- #
def _ranges_overlap(a_lo: float, a_hi: float, b_lo: float, b_hi: float) -> bool:
    return a_lo <= b_hi and b_lo <= a_hi


# --------------------------------------------------------------------------- #
# Relational checks (schema.md section 13). Operates on an already
# JSON-Schema-valid bank dict; appends located Findings to `out`.
# Cross-bank `quiz_id` uniqueness is handled by the caller via `seen_quiz_ids`.
# --------------------------------------------------------------------------- #
def relational_checks(bank: dict, out: list[Finding]) -> None:
    # ----- (1) mastery.partial_min < mastery.full_min ----------------------- #
    mastery = bank.get("mastery", {})
    partial_min = mastery.get("partial_min")
    full_min = mastery.get("full_min")
    if isinstance(partial_min, (int, float)) and isinstance(full_min, (int, float)):
        if not (partial_min < full_min):
            out.append(Finding(
                "1/mastery-order",
                f"mastery.partial_min ({partial_min}) must be < "
                f"mastery.full_min ({full_min}).",
            ))

    items = bank.get("items", []) or []
    shared_assets = bank.get("shared_assets", []) or []

    # ----- (2) id uniqueness within scope ----------------------------------- #
    # bank-scoped: item ids
    seen_item_ids: dict[str, int] = {}
    for idx, item in enumerate(items):
        iid = item.get("id")
        if iid is None:
            continue
        if iid in seen_item_ids:
            out.append(Finding(
                "2/dup-item-id",
                f"duplicate item id '{iid}' (also at items[{seen_item_ids[iid]}]).",
                item_id=iid,
            ))
        else:
            seen_item_ids[iid] = idx

    # bank-scoped: shared_asset ids
    seen_asset_ids: dict[str, int] = {}
    for idx, asset in enumerate(shared_assets):
        aid = asset.get("id")
        if aid is None:
            continue
        if aid in seen_asset_ids:
            out.append(Finding(
                "2/dup-asset-id",
                f"duplicate shared_assets id '{aid}' "
                f"(also at shared_assets[{seen_asset_ids[aid]}]).",
            ))
        else:
            seen_asset_ids[aid] = idx

    asset_id_set = set(seen_asset_ids)

    # item-scoped: option / blank / prompt / response ids unique within item
    for item in items:
        iid = item.get("id", "<no-id>")
        for field in ("options", "blanks", "prompts", "responses"):
            coll = item.get(field)
            if not isinstance(coll, list):
                continue
            seen: set[str] = set()
            for sub in coll:
                if not isinstance(sub, dict):
                    continue
                sid = sub.get("id")
                if sid is None:
                    continue
                if sid in seen:
                    out.append(Finding(
                        "2/dup-subid",
                        f"duplicate {field[:-1]} id '{sid}' within the item.",
                        item_id=iid,
                    ))
                seen.add(sid)

    # ----- (3) every asset_refs[] resolves to a shared_assets id ------------ #
    for item in items:
        iid = item.get("id", "<no-id>")
        for ref in item.get("asset_refs", []) or []:
            if ref not in asset_id_set:
                out.append(Finding(
                    "3/asset-ref",
                    f"asset_ref '{ref}' does not resolve to any shared_assets id "
                    f"(known: {sorted(asset_id_set) or 'none'}).",
                    item_id=iid,
                ))

    # ----- (4) matching wiring + (5) multi_blank tokens + (6) numeric ------- #
    for item in items:
        iid = item.get("id", "<no-id>")
        itype = item.get("type")

        if itype == "matching":
            _check_matching(item, iid, out)
        elif itype == "multi_blank":
            _check_multi_blank(item, iid, out)
        elif itype == "numeric":
            _check_numeric_window(item, iid, out, label="numeric item")


def _check_matching(item: dict, iid: str, out: list[Finding]) -> None:
    prompts = item.get("prompts", []) or []
    responses = item.get("responses", []) or []

    # Partition responses into non-distractors vs distractors.
    nondistractor_ids: set[str] = set()
    all_response_ids: set[str] = set()
    for r in responses:
        rid = r.get("id")
        if rid is None:
            continue
        all_response_ids.add(rid)
        if not r.get("distractor", False):
            nondistractor_ids.add(rid)

    # (e) responses >= prompts
    if len(responses) < len(prompts):
        out.append(Finding(
            "4/responses-lt-prompts",
            f"len(responses)={len(responses)} < len(prompts)={len(prompts)}; "
            "there must be at least as many responses as prompts.",
            item_id=iid,
        ))

    # Each prompt.match must resolve to an existing NON-distractor response,
    # and each non-distractor response must be targeted by EXACTLY ONE prompt.
    target_counts: dict[str, int] = {rid: 0 for rid in nondistractor_ids}
    for p in prompts:
        pid = p.get("id", "<no-id>")
        m = p.get("match")
        if m is None:
            continue
        if m not in all_response_ids:
            out.append(Finding(
                "4/match-unresolved",
                f"prompt '{pid}' has match '{m}' that resolves to no response id "
                f"(known: {sorted(all_response_ids) or 'none'}).",
                item_id=iid,
            ))
            continue
        if m not in nondistractor_ids:
            out.append(Finding(
                "4/match-distractor",
                f"prompt '{pid}' matches '{m}', which is a distractor response; "
                "prompts must match non-distractor responses.",
                item_id=iid,
            ))
            continue
        target_counts[m] += 1

    for rid in sorted(nondistractor_ids):
        c = target_counts.get(rid, 0)
        if c == 0:
            out.append(Finding(
                "4/response-untargeted",
                f"non-distractor response '{rid}' is matched by no prompt "
                "(every non-distractor response must be targeted exactly once).",
                item_id=iid,
            ))
        elif c > 1:
            out.append(Finding(
                "4/response-overtargeted",
                f"non-distractor response '{rid}' is matched by {c} prompts "
                "(must be exactly one).",
                item_id=iid,
            ))


def _check_multi_blank(item: dict, iid: str, out: list[Finding]) -> None:
    stem = item.get("stem", "") or ""
    blanks = item.get("blanks", []) or []
    blank_ids = [b.get("id") for b in blanks if isinstance(b, dict) and b.get("id")]

    spans = _math_spans(stem)

    # Collect every {{token}} occurrence in the stem, with position + math flag.
    token_positions: dict[str, list[int]] = {}
    tokens_in_math: list[tuple[str, int]] = []
    for mt in _TOKEN_RE.finditer(stem):
        name = mt.group(1)
        pos = mt.start()
        token_positions.setdefault(name, []).append(pos)
        if _inside_any_span(pos, spans):
            tokens_in_math.append((name, pos))

    seen_tokens = set(token_positions)
    blank_id_set = set(blank_ids)

    # (5a) every blank id appears EXACTLY once as a {{id}} token in the stem
    for bid in blank_ids:
        occ = token_positions.get(bid, [])
        if len(occ) == 0:
            out.append(Finding(
                "5/blank-token-missing",
                f"blank '{bid}' has no '{{{{{bid}}}}}' token in the stem.",
                item_id=iid,
            ))
        elif len(occ) > 1:
            out.append(Finding(
                "5/blank-token-repeated",
                f"blank '{bid}' appears {len(occ)} times as '{{{{{bid}}}}}' in the "
                "stem; it must appear exactly once.",
                item_id=iid,
            ))

    # (5b) every {{token}} in the stem has a matching blank
    for name in sorted(seen_tokens):
        if name not in blank_id_set:
            out.append(Finding(
                "5/token-no-blank",
                f"stem token '{{{{{name}}}}}' has no matching blank id "
                f"(blanks: {sorted(blank_id_set) or 'none'}).",
                item_id=iid,
            ))

    # (5c) no {{token}} sits inside a $...$ / $$...$$ math span
    for name, pos in tokens_in_math:
        out.append(Finding(
            "5/token-in-math",
            f"token '{{{{{name}}}}}' (stem offset {pos}) sits inside a math span "
            "($...$ or $$...$$); blank tokens must live in prose.",
            item_id=iid,
        ))

    # (6) each numeric blank needs a valid window (min<=max; window exists)
    for b in blanks:
        if not isinstance(b, dict):
            continue
        if b.get("kind") == "numeric":
            bid = b.get("id", "<no-id>")
            _check_numeric_window(b, iid, out, label=f"numeric blank '{bid}'")


def _check_numeric_window(node: dict, iid: str, out: list[Finding],
                          label: str) -> None:
    """Rules (6)+(7) for a numeric item or a numeric blank.

    A window must exist (`tolerance` and/or `accept_range`); if `accept_range`
    is present, `min <= max`. Disjoint tolerance+accept_range -> warning only.
    `tolerance: 0` / `0.0` is a valid (degenerate, exact) window — presence is
    tested by KEY, not truthiness, so a zero tolerance is not mistaken for
    "no window".
    """
    has_tolerance = "tolerance" in node
    accept_range = node.get("accept_range")
    has_range = isinstance(accept_range, dict)

    # (6a) accept_range.min <= max
    rng_lo = rng_hi = None
    if has_range:
        rng_lo = accept_range.get("min")
        rng_hi = accept_range.get("max")
        if isinstance(rng_lo, (int, float)) and isinstance(rng_hi, (int, float)):
            if rng_lo > rng_hi:
                out.append(Finding(
                    "6/range-inverted",
                    f"{label}: accept_range.min ({rng_lo}) > max ({rng_hi}).",
                    item_id=iid,
                ))

    # (6b) a window must exist (tolerance or accept_range). The JSON Schema
    # already enforces this via anyOf, but we re-assert it so the relational
    # report is self-contained and catches any future schema relaxation.
    if not has_tolerance and not has_range:
        out.append(Finding(
            "6/no-window",
            f"{label}: no acceptance window — needs `tolerance` and/or "
            "`accept_range`.",
            item_id=iid,
        ))

    # (7) WARNING: tolerance window and accept_range present but DISJOINT.
    if has_tolerance and has_range:
        tol = node.get("tolerance")
        answer = node.get("answer")
        if (isinstance(tol, (int, float)) and isinstance(answer, (int, float))
                and isinstance(rng_lo, (int, float))
                and isinstance(rng_hi, (int, float)) and rng_lo <= rng_hi):
            tol_lo, tol_hi = answer - tol, answer + tol
            if not _ranges_overlap(tol_lo, tol_hi, rng_lo, rng_hi):
                out.append(Finding(
                    "7/disjoint-windows",
                    f"{label}: tolerance window [{tol_lo}, {tol_hi}] and "
                    f"accept_range [{rng_lo}, {rng_hi}] are disjoint; the "
                    "accepted set is their union, so this is likely an error.",
                    item_id=iid,
                    is_warning=True,
                ))


# --------------------------------------------------------------------------- #
# Per-bank pipeline: load YAML -> JSON-Schema validate -> relational checks.
# Returns (bank_dict_or_None, errors, warnings).
# A YAML/parse failure short-circuits with the parse error (no further checks).
# --------------------------------------------------------------------------- #
def process_bank(path: Path, validator: Draft202012Validator,
                 seen_quiz_ids: dict[str, str]) -> tuple[dict | None,
                                                          list[Finding],
                                                          list[Finding]]:
    errors: list[Finding] = []
    warnings: list[Finding] = []

    # ---- load YAML -------------------------------------------------------- #
    try:
        raw = path.read_text(encoding="utf-8")
        bank = yaml.safe_load(raw)
    except yaml.YAMLError as exc:
        errors.append(Finding("0/yaml-parse", f"YAML parse error: {exc}"))
        return None, errors, warnings
    except OSError as exc:
        errors.append(Finding("0/read", f"cannot read file: {exc}"))
        return None, errors, warnings

    if not isinstance(bank, dict):
        errors.append(Finding(
            "0/not-mapping",
            f"top-level YAML is {type(bank).__name__}, expected a mapping/object.",
        ))
        return None, errors, warnings

    # ---- (a) JSON-Schema validation (Draft 2020-12) ----------------------- #
    schema_errors = sorted(validator.iter_errors(bank), key=lambda e: list(e.path))
    for err in schema_errors:
        loc = "/".join(str(p) for p in err.absolute_path) or "<root>"
        # Try to attribute the error to the nearest enclosing item id.
        item_id = _nearest_item_id(bank, err.absolute_path)
        errors.append(Finding(
            "schema",
            f"at `{loc}`: {err.message}",
            item_id=item_id,
        ))

    # If the bank is not schema-valid, the relational checks may dereference
    # missing/ill-typed fields. They are written defensively, but we still skip
    # them on schema failure to keep the report focused on the root cause.
    if schema_errors:
        return bank, errors, warnings

    # ---- cross-bank (2) quiz_id uniqueness -------------------------------- #
    qid = bank.get("quiz_id")
    if isinstance(qid, str):
        if qid in seen_quiz_ids:
            errors.append(Finding(
                "2/dup-quiz-id",
                f"quiz_id '{qid}' is already used by bank "
                f"'{seen_quiz_ids[qid]}' (quiz_id must be unique across banks).",
            ))
        else:
            seen_quiz_ids[qid] = path.name

    # ---- (b) relational checks -------------------------------------------- #
    found: list[Finding] = []
    relational_checks(bank, found)
    for f in found:
        (warnings if f.is_warning else errors).append(f)

    return bank, errors, warnings


def _nearest_item_id(bank: dict, abs_path) -> str | None:
    """Best-effort: if a schema error path goes through items[N], return its id."""
    path_parts = list(abs_path)
    try:
        for i, part in enumerate(path_parts):
            if part == "items" and i + 1 < len(path_parts):
                idx = path_parts[i + 1]
                if isinstance(idx, int):
                    items = bank.get("items", [])
                    if 0 <= idx < len(items) and isinstance(items[idx], dict):
                        return items[idx].get("id")
    except Exception:
        pass
    return None


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def parse_args(argv: list[str]) -> argparse.Namespace:
    ap = argparse.ArgumentParser(
        description=("Validate BER 640 student-quiz YAML banks against the JSON "
                     "Schema + relational rules, then convert them to JSON. "
                     "Exits non-zero (failing the build) if any bank fails."),
    )
    ap.add_argument(
        "banks", nargs="*", type=Path,
        help=("specific bank YAML files to process; default = every "
              "practice/banks/*.yml"),
    )
    ap.add_argument(
        "--out-dir", type=Path, default=DEFAULT_OUT_DIR,
        help=f"output directory for quizN.json (default: {DEFAULT_OUT_DIR}).",
    )
    ap.add_argument(
        "--schema", type=Path, default=SCHEMA_PATH,
        help=f"path to the JSON Schema (default: {SCHEMA_PATH}).",
    )
    ap.add_argument(
        "--quiet", action="store_true",
        help="suppress per-bank PASS lines; print only the final summary.",
    )
    ap.add_argument(
        "--no-write", action="store_true",
        help="validate only; never write JSON (dry run).",
    )
    return ap.parse_args(argv)


def discover_banks(explicit: list[Path]) -> list[Path]:
    if explicit:
        return [p.resolve() for p in explicit]
    return sorted(BANKS_DIR.glob("*.yml"))


def main(argv: list[str]) -> int:
    args = parse_args(argv)

    # ---- load + compile the schema once ----------------------------------- #
    try:
        schema = json.loads(args.schema.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        sys.stderr.write(f"FATAL: cannot load schema {args.schema}: {exc}\n")
        return 2
    try:
        Draft202012Validator.check_schema(schema)
    except Exception as exc:  # schema itself is malformed
        sys.stderr.write(f"FATAL: schema is not a valid Draft 2020-12 schema: {exc}\n")
        return 2
    validator = Draft202012Validator(schema)

    banks = discover_banks(args.banks)
    if not banks:
        sys.stderr.write(
            f"FATAL: no bank files found (looked in {BANKS_DIR} / given args).\n")
        return 2

    print(f"build_banks_b: validating {len(banks)} bank(s) against {args.schema.name}")
    print("=" * 72)

    seen_quiz_ids: dict[str, str] = {}
    results: list[tuple[Path, dict | None, list[Finding], list[Finding]]] = []
    total_errors = 0
    total_warnings = 0

    for path in banks:
        bank, errors, warnings = process_bank(path, validator, seen_quiz_ids)
        results.append((path, bank, errors, warnings))
        total_errors += len(errors)
        total_warnings += len(warnings)

        status = "FAIL" if errors else "PASS"
        if errors:
            n_items = len(bank.get("items", [])) if isinstance(bank, dict) else "?"
            print(f"[{status}] {path.name}  ({len(errors)} error(s), "
                  f"{len(warnings)} warning(s), items={n_items})")
            for f in errors:
                print(f.render())
            for f in warnings:
                print(f.render())
        elif warnings:
            n_items = len(bank.get("items", [])) if isinstance(bank, dict) else "?"
            if not args.quiet:
                print(f"[{status}] {path.name}  (items={n_items}, "
                      f"{len(warnings)} warning(s))")
                for f in warnings:
                    print(f.render())
        else:
            if not args.quiet:
                n_items = len(bank.get("items", [])) if isinstance(bank, dict) else "?"
                print(f"[{status}] {path.name}  (items={n_items})")

    print("=" * 72)
    n_pass = sum(1 for (_, _, e, _) in results if not e)
    n_fail = len(results) - n_pass

    # ---- gate: write JSON only if EVERY bank passed ----------------------- #
    if total_errors:
        print(f"RESULT: FAIL — {n_fail}/{len(results)} bank(s) failed, "
              f"{total_errors} error(s), {total_warnings} warning(s). "
              "No JSON written.")
        return 1

    if args.no_write:
        print(f"RESULT: PASS — {n_pass}/{len(results)} bank(s) valid, "
              f"{total_warnings} warning(s). (--no-write: no JSON written.)")
        return 0

    # All banks valid -> convert each YAML bank to JSON.
    args.out_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for path, bank, _err, _warn in results:
        qid = bank.get("quiz_id")
        # File name keys on quiz_id (stable, slug-validated); fall back to stem.
        name = f"{qid}.json" if isinstance(qid, str) and qid else f"{path.stem}.json"
        out_path = args.out_dir / name
        text = json.dumps(bank, indent=2, ensure_ascii=False, sort_keys=False)
        # Trailing newline; idempotent (only rewrite if content changed).
        text = text + "\n"
        if not (out_path.exists() and out_path.read_text(encoding="utf-8") == text):
            out_path.write_text(text, encoding="utf-8")
        written.append(out_path)

    print(f"RESULT: PASS — {n_pass}/{len(results)} bank(s) valid, "
          f"{total_warnings} warning(s). Wrote {len(written)} JSON file(s) to "
          f"{args.out_dir}:")
    for out_path in written:
        try:
            rel = out_path.relative_to(Path.cwd())
        except ValueError:
            rel = out_path
        print(f"  - {rel}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
