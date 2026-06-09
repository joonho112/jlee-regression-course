#!/usr/bin/env python3
"""Regression test for quiz-schema.json (BER 640 quiz bank, draft 2020-12).

Run:  python3 test-schema.py
Asserts (a) the schema is itself valid, (b) ../banks/example-bank.yml validates,
and (c) 12 deliberately-broken mutations are each rejected. Re-run after any
schema edit. Requires: pyyaml, jsonschema (>=4.18).
"""
import json, sys, copy, os
import yaml
from jsonschema import Draft202012Validator

HERE = os.path.dirname(os.path.abspath(__file__))
schema = json.load(open(os.path.join(HERE, "quiz-schema.json")))
bank = yaml.safe_load(open(os.path.join(HERE, "..", "banks", "example-bank.yml")))

Draft202012Validator.check_schema(schema)
v = Draft202012Validator(schema)

pos_errs = sorted(v.iter_errors(bank), key=lambda e: list(e.path))
print("SCHEMA valid: PASS")
print("POSITIVE example-bank.yml:", "PASS" if not pos_errs else "FAIL")
for e in pos_errs[:25]:
    print("   x", list(e.path), "::", e.message)

nfail = 0
def expect_fail(name, mutate):
    global nfail
    b = copy.deepcopy(bank); mutate(b)
    ok = len(list(v.iter_errors(b))) > 0
    print(f"NEGATIVE {name:28s}:", "PASS (rejected)" if ok else "FAIL (accepted)")
    nfail += (not ok)

expect_fail("mc_two_correct",         lambda b: b["items"][0]["options"][0].__setitem__("correct", True))
expect_fail("numeric_no_window",      lambda b: [b["items"][3].pop("tolerance", None), b["items"][3].pop("accept_range", None)])
expect_fail("wrong_opt_no_rationale", lambda b: b["items"][0]["options"][2].pop("rationale", None))
expect_fail("mc_with_blanks",         lambda b: b["items"][0].__setitem__("blanks", [{"id":"x","kind":"text","accept":["y"],"rationale":"z"}]))
expect_fail("distractor_no_rational", lambda b: [r.pop("rationale", None) for r in b["items"][5]["responses"] if r.get("distractor")])
expect_fail("bad_slug_id",            lambda b: b["items"][0].__setitem__("id", "Bad ID!"))
expect_fail("tf_three_options",       lambda b: b["items"][1]["options"].append({"id":"m","text":"Maybe","correct":False,"rationale":"no"}))
expect_fail("unknown_item_prop",      lambda b: b["items"][0].__setitem__("bogus", 1))
expect_fail("missing_why_correct",    lambda b: b["items"][0].pop("why_correct", None))
expect_fail("source_no_anchor",       lambda b: b["items"][0]["source"].__setitem__("href", "../../notes/chapters/01.html"))
expect_fail("bad_difficulty",         lambda b: b["items"][0].__setitem__("difficulty", "hard"))
expect_fail("mc_one_option",          lambda b: b["items"][0].__setitem__("options", [b["items"][0]["options"][1]]))
expect_fail("ma_partial_credit_field", lambda b: b["items"][2].__setitem__("partial_credit", True))

ok = (not pos_errs) and (nfail == 0)
print("\nOVERALL:", "ALL GREEN" if ok else "NEEDS FIX")
sys.exit(0 if ok else 1)
