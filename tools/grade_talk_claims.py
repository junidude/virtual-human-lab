"""Grade expression assertions in frozen TALK answers, one mention at a time.

This is a bounded parser for the recorded demo and its caption templates, not a
general medical or biological judge. Unresolved claims stay explicitly ungraded.
No recorded answer, embedding, or raw count is changed; no model is called.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
import math
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "research/talk/data"
TEMPLATES = Path(__file__).with_name("talk_claim_templates.json")
BLOCKS = {
    "band_top3": ("rank", [0, 3]), "band_3_10": ("rank", [3, 10]),
    "band_10_25": ("rank", [10, 25]), "undetected": ("absent", None),
    "undetected_1": ("absent", None), "detect_most": ("majority", None),
    "detect_few": ("minority", None), "low_support": ("low_support", None),
    "housekeeping": ("corpus_high", None), "distinctive": ("corpus_higher", None),
    "top_expressed": ("context", None),
}
NOT_GENES = {"RNA", "DNA", "UMI", "CPM", "JSON", "CTRL", "STIM", "MONO",
             "TYPE", "CELL", "SET", "MAX", "CAT", "REST", "IMPACT", "CLOCK",
             "WAS", "SHE", "TANK", "ACE", "CAMP", "PIGS", "MARCH", "SEPT",
             "CD4_T", "CD8_T", "CD14_MONO", "CD16_MONO", "NK", "TALK", "IFN"}
TOKEN = re.compile(r"(?<![A-Za-z0-9_-])[A-Za-z][A-Za-z0-9]*(?:[.-][A-Za-z0-9]+)*(?![A-Za-z0-9_-])")
SENTENCE = re.compile(r"\S[\s\S]*?(?:[.!?](?=\s|$)|$)")


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def utf16_offset(text: str, index: int) -> int:
    """Browser string offsets must also work if a response contains emoji."""
    return len(text[:index].encode("utf-16-le")) // 2


def template_patterns() -> list[tuple[re.Pattern, str, list | None]]:
    patterns = []
    for block, templates in json.loads(TEMPLATES.read_text())["blocks"].items():
        kind, band = BLOCKS[block]
        for template in templates:
            if template.count("{genes}") != 1:
                continue
            pieces = []
            for part in re.split(r"(\{\w+\})", template.rstrip(".")):
                if part == "{genes}":
                    pieces.append(r"(?P<genes>.+?)")
                elif part == "{n}":
                    pieces.append(r"\d+")
                elif part.startswith("{"):
                    pieces.append(r".+?")
                else:
                    pieces.append(re.escape(part).replace(r"\ ", r"\s+"))
            patterns.append((re.compile("".join(pieces) + r"(?=[.!?](?:\s|$)|$)", re.I), kind, band))
    return patterns


def gene_tokens(text: str, symbols: set[str]) -> list[re.Match]:
    matches = []
    for match in TOKEN.finditer(text):
        gene = match[0]
        if gene in NOT_GENES:
            continue
        # Unknown gene-like names in a list are retained as missing, never zero.
        gene_like = re.fullmatch(r"[A-Z][A-Z0-9-]{2,}(?:\.\d+)?|C\d+orf\d+", gene)
        if gene in symbols or gene_like:
            matches.append(match)
    return matches


def clause_claim(sentence: str, start: int, end: int, patterns: list) -> dict:
    for pattern, kind, band in patterns:
        match = pattern.search(sentence)
        if match and match.start("genes") <= start and end <= match.end("genes"):
            result = {"kind": kind}
            if band is not None:
                result["range"] = band
            return result
    lower = sentence.lower()
    # Numerical values attach to the individual gene, not the whole list.
    if "measured log2cpm" in lower:
        value = re.match(r"\s+(-?\d+(?:\.\d+)?)\b", sentence[end:])
        if value:
            return {"kind": "log2cpm", "value": float(value[1])}
        if re.search(r"higher than.*typical|elevated.*(?:typical|corpus)", lower):
            return {"kind": "corpus_higher"}
        return {"kind": "context", "reason": "unsupported_claim"}
    if re.search(r"checked all \d+ cells;\s*none showed|has no detected genes at this depth for", lower):
        return {"kind": "absent"}
    if "only a few transcripts typically show up here:" in lower:
        return {"kind": "low_support"}
    # Observed paraphrase of a caption band; rank exclusion is not non-expression.
    percentages = sorted(set(float(x) for x in re.findall(r"(\d+(?:\.\d+)?)%", lower)))
    if percentages in ([3., 10.], [10., 25.]) and re.search(r"band|tier|slice|range|between|from|outside", lower):
        return {"kind": "rank", "range": percentages}
    if ("presence of" in lower and start > lower.index("presence of")
            and re.search(r"\bhere\b|\bthis (?:cell|readout)\b|\bthese cells\b", lower)
            and not re.search(r"\b(?:no|not|without|hypothetical)\b", lower)):
        return {"kind": "present"}
    # Recorded free-form variant of the high-here-and-in-corpus caption. Generic
    # 'B cells typically express ...' is not an assertion about the input group.
    if "the readings here are high, as a typical cell" in lower:
        return {"kind": "corpus_high"}
    return {"kind": "context", "reason": "context_only"}


def score(claim: dict, evidence: dict | None, scope: int, total: int) -> tuple[str, str]:
    kind = claim["kind"]
    if kind == "context":
        return "unscored", claim.get("reason", "context_only")
    if evidence is None or evidence.get("raw_count") is None:
        return "unscored", "missing_gene"
    if scope != total:
        return "unscored", "cell_count_mismatch"
    raw = evidence["raw_count"]
    detected = evidence["detected_cells"]
    if kind in ("corpus_higher", "corpus_high"):
        if raw <= 0:
            return "incorrect", "detection_mismatch"
        baseline = evidence.get("corpus_mean_log2cpm")
        delta = evidence.get("corpus_delta")
        if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in (baseline, delta)):
            return "unscored", "corpus_reference_missing"
        if kind == "corpus_higher":
            # Qualitative adjectives do not supply a numeric top-N cutoff.
            # Check the stated elevation direction, not the caption list budget.
            return ("correct", "corpus_match") if delta > 0 else ("incorrect", "corpus_lower")
        intervals = [evidence.get(k) for k in ("rank_interval", "group_rank_interval_ordinal", "corpus_rank_interval")]
        if not all(isinstance(v, list) and len(v) == 2 and all(isinstance(n, (int, float)) and math.isfinite(n) for n in v) for v in intervals):
            return "unscored", "corpus_reference_missing"
        local, ordinal, corpus = intervals
        # Original high-abundance thresholds, with the owner's tie-overlap rule.
        # Gene-name/housekeeping-family membership is not an abundance criterion.
        high_here = local[0] <= 3 + 1e-5 or ordinal[0] <= 20
        high_corpus = corpus[0] <= 1 + 1e-5
        return ("correct", "corpus_high_match") if high_here and high_corpus else ("rank_mismatch", "corpus_high_rank_mismatch")
    if kind == "rank":
        if raw <= 0:
            return "incorrect", "detection_mismatch"
        interval = evidence.get("rank_interval")
        if interval is None:
            return "unscored", "unsupported_claim"
        low, high = claim["range"]
        best, worst = interval
        eps = 1e-5
        # Retain caption bands, but accept any overlapping tie per the owner's
        # 2026-10-04 grading policy. Only disjoint intervals are rank errors.
        lower_inside = best > low + eps if low else best >= -eps
        if lower_inside and worst <= high + eps:
            return "correct", "match"
        if best > high + eps or (low and worst <= low + eps):
            return "rank_mismatch", "rank_mismatch"
        return "correct", "tie_overlap"
    if kind == "absent":
        correct = raw == 0
    elif kind == "present":
        correct = raw > 0
    elif kind == "majority":
        correct = detected * 2 > total
    elif kind == "minority":
        # The source caption selects positive genes seen in half or fewer cells.
        correct = 0 < detected * 2 <= total
    elif kind == "low_support":
        correct = 1 <= raw <= 3
        return ("correct", "match") if correct else ("incorrect", "low_support_mismatch")
    elif kind == "log2cpm":
        # Original captions print two decimals; allow only rounding tolerance.
        correct = abs(evidence["log2cpm"] - claim["value"]) <= .00501
        return ("correct", "match") if correct else ("incorrect", "numeric_mismatch")
    else:
        return "unscored", "unsupported_claim"
    return ("correct", "match") if correct else ("incorrect", "detection_mismatch")


def annotate(text: str, group: dict, symbols: set[str], patterns: list | None = None) -> list[dict]:
    patterns = template_patterns() if patterns is None else patterns
    total = len(group["cells"])
    scope = total
    mentions = []
    for sentence_match in SENTENCE.finditer(text):
        sentence = sentence_match[0]
        counts = [int(n) for n in re.findall(r"\b(\d+) cells\b", sentence)]
        if counts:
            scope = counts[-1]
        for token in gene_tokens(sentence, symbols):
            gene = token[0]
            # CD4/CD14 within a cell label are not measured gene assertions.
            label = bool(re.match(r"(?:-positive)?\s+(?:T\s+cells?|monocytes?)\b", sentence[token.end():], re.I))
            claim = {"kind": "context", "reason": "context_only"} if label else clause_claim(sentence, token.start(), token.end(), patterns)
            evidence = group["genes"].get(gene)
            status, reason = score(claim, evidence, scope, total)
            mention = {"gene": gene, "start": utf16_offset(text, sentence_match.start() + token.start()),
                       "end": utf16_offset(text, sentence_match.start() + token.end()),
                       "context": sentence, **claim, "status": status, "reason": reason,
                       "evidence": evidence, "scope_cells": scope}
            mentions.append(mention)
    return mentions


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--demo", type=Path, default=DATA / "talk-demo.json")
    parser.add_argument("--evidence", type=Path, default=DATA / "gene-evidence.json")
    parser.add_argument("--output", type=Path, default=DATA / "gene-claims.json")
    args = parser.parse_args()
    demo, facts = json.loads(args.demo.read_text()), json.loads(args.evidence.read_text())
    if facts["demo_sha256"] != sha(args.demo):
        raise ValueError("Gene evidence belongs to a different recorded demo")
    symbols = set(facts["symbols"])
    patterns = template_patterns()
    answers = {}
    overall = Counter()
    for key, answer in demo["answers"].items():
        group_key = key.split(":", 1)[1]
        group = facts["groups"][group_key]
        assert group["cells"] == demo["groups"][group_key]["cells"], key
        mentions = annotate(answer["reasoning"], group, symbols, patterns)
        counts = {s: sum(m["status"] == s for m in mentions) for s in ("correct", "incorrect", "rank_mismatch", "unscored")}
        overall.update(counts)
        answers[key] = {"reasoning_sha256": hashlib.sha256(answer["reasoning"].encode()).hexdigest(),
                        "mentions": mentions, "counts": counts}
    result = {"schema": "vhl.talk_gene_claims.v1", "source_sha256": sha(args.demo),
              "evidence_sha256": sha(args.evidence), "templates_sha256": sha(TEMPLATES),
              "methods": {"scope": "Gene expression assertions, not overall biological reasoning or final cell-type accuracy.",
                          "rank": "Pooled raw UMI; descending rank among detected input-matrix genes. Top% = 100*rank/(Ndet-1).",
                          "bands": "[0,3], (3,10], (10,25]. A tied rank interval overlapping the claimed band is accepted; only disjoint intervals are rank errors.",
                          "tie_policy": "Owner-requested permissive overlap rule, 2026-10-04. Acceptance means compatible with the tied ranks, not uniquely within that band.",
                          "numeric": "log2(1+1e6*pooled_gene_UMI/pooled_total_UMI); tolerance 0.00501 for two-decimal claims.",
                          "low_support": "1–3 pooled raw UMI, matching the original caption contract.",
                          "corpus_higher": "Detected and input log2(1+CPM) minus training corpus baseline > 0. Qualitative distinctive/most/greatest wording is checked for elevation direction only; no unstated top-N or biological specificity is graded.",
                          "corpus_high": "Corpus top 1% and (input top 3% or first 20 detected genes), using original caption thresholds. Overlapping tied intervals accepted; no gene-family eligibility gate.",
                          "corpus_units": "Corpus is the mean of log2(1+CPM) profiles of 32-cell training blocks. Delta is a difference on this scale, not an ordinary log fold change.",
                          "ungraded": "Generic examples, checking-for lists, unresolved clauses, mismatched group size and missing gene/reference mappings.",
                          "inference": False},
              "answers": answers, "counts": dict(overall)}
    args.output.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(json.dumps({"answers": len(answers), "mentions": sum(overall.values()), "counts": dict(overall)}))


if __name__ == "__main__":
    main()
