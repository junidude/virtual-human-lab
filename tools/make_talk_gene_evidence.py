"""Export raw-count evidence for the frozen TALK answers (CPU only).

    python tools/make_talk_gene_evidence.py

This never runs TALK or UMAP and never rewrites talk-demo.json. All selected
cell indices and answer text come from that file. Input hashes must match its
source manifest. Rank calculations follow stage_b_SHIP/align/gen/lib_align.py
block_stats: pool raw UMI, log2(1+CPM), then rank detected genes only. Unmapped
matrix columns still participate in the denominator and rank population.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

import numpy as np
import scipy.sparse as sp

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path("/home/sj_server_1/gblee/downloads/TALK-PTG-final/evaluation")
DEFAULT_GENE_TABLE = Path("/home/sj_server_1/gblee/TALK-PTG/v7/TALK-PTG-StageB-Data/10_cells/gene_table.parquet")
DEFAULT_METHOD_SOURCE = Path("/home/sj_server_1/gblee/TALK-PTG/v7/stage_b_SHIP/align/gen/lib_align.py")
DEFAULT_DEMO = ROOT / "research/talk/data/talk-demo.json"
DEFAULT_OUT = ROOT / "research/talk/data/gene-evidence.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_sources(paths: list[Path], expected: dict[str, str]) -> dict[str, str]:
    """Fail before export if any source changed since talk-demo was made."""
    actual = {path.name: sha256(path) for path in paths}
    if actual != expected:
        changed = sorted(key for key in actual.keys() | expected.keys()
                         if actual.get(key) != expected.get(key))
        raise ValueError(f"Frozen TALK source hash mismatch: {', '.join(changed)}")
    return actual


def symbol_index(gene_ids: list[str], table: dict[str, list]) -> tuple[dict[str, int], list[str]]:
    """Use the exact unambiguous symbol mapping used by make_talk_demo.py."""
    frequency = Counter(symbol for symbol in table["symbol"] if symbol)
    mapping = {gene: symbol for gene, symbol in zip(table["gene_id"], table["symbol"])
               if symbol and frequency[symbol] == 1}
    columns = {mapping[gene]: col for col, gene in enumerate(gene_ids) if gene in mapping}
    return columns, sorted(frequency)


def mentioned_symbols(answers: dict, vocabulary: list[str]) -> list[str]:
    """Literal, case-sensitive dictionary matching also recognizes C1orfNN.

    Keep ambiguous prose words in the evidence vocabulary: deciding whether a
    token is a factual gene claim belongs to the context parser. Longest-first
    alternatives preserve hyphenated symbols such as HLA-DRA.
    """
    pattern = re.compile(r"(?<![A-Za-z0-9_])(?:" + "|".join(
        re.escape(symbol) for symbol in sorted(vocabulary, key=lambda value: (-len(value), value))
    ) + r")(?![A-Za-z0-9_])")
    return sorted({match.group(0) for answer in answers.values()
                   for field in ("reasoning", "final")
                   for match in pattern.finditer(answer.get(field) or "")})


def block_stats(counts: sp.csr_matrix, cells: list[int]) -> dict[str, np.ndarray]:
    """Mirror the upstream float32 percentile and tie interval contract."""
    selected = counts[cells]
    total = np.asarray(selected.sum(axis=0), dtype=np.float64).ravel()
    detected = np.asarray((selected > 0).sum(axis=0), dtype=np.int32).ravel()
    profile = np.log2(1.0 + total / max(float(total.sum()), 1.0) * 1e6).astype(np.float32)
    seen = np.flatnonzero(total > 0)
    percentile = np.full(counts.shape[1], -1.0, np.float32)
    percentile_low = percentile.copy()
    percentile_high = percentile.copy()
    if len(seen):
        values = profile[seen]
        order = np.argsort(-values, kind="stable")
        rank = np.empty(len(seen), np.int64)
        rank[order] = np.arange(len(seen))
        denominator = max(len(seen) - 1, 1)
        percentile[seen] = 1.0 - rank / denominator
        sorted_values = -values[order]
        head = np.flatnonzero(np.concatenate(([True], sorted_values[1:] != sorted_values[:-1])))
        tail = np.append(head[1:], len(seen)) - 1
        first = np.repeat(head, tail - head + 1)
        last = np.repeat(tail, tail - head + 1)
        percentile_high[seen[order]] = 1.0 - first / denominator
        percentile_low[seen[order]] = 1.0 - last / denominator
    return {"total": total, "detected": detected, "profile": profile,
            "percentile": percentile, "percentile_low": percentile_low,
            "percentile_high": percentile_high}


def export_group(counts: sp.csr_matrix, cells: list[int], columns: dict[str, int],
                 symbols: list[str]) -> dict:
    stats = block_stats(counts, cells)
    genes = {}
    for symbol in symbols:
        if symbol not in columns:
            continue  # Missing/ambiguous mapping is not measured zero.
        column = columns[symbol]
        raw = int(stats["total"][column])
        present = raw > 0
        genes[symbol] = {
            "detected_cells": int(stats["detected"][column]),
            "total_cells": len(cells),
            "raw_count": raw,
            "rank_pct": 100 * (1 - float(stats["percentile"][column])) if present else None,
            "rank_interval": [100 * (1 - float(stats[key][column]))
                              for key in ("percentile_high", "percentile_low")] if present else None,
            "log2cpm": float(stats["profile"][column]),
            "low_support": 1 <= raw <= 3,
        }
    return {"cells": cells, "total_cells": len(cells),
            "detected_gene_count": int(np.count_nonzero(stats["total"])),
            "raw_total_count": int(stats["total"].sum()), "genes": genes}


def validate_legacy_detection(demo: dict, groups: dict) -> int:
    checked = 0
    for answer_key, answer in demo["answers"].items():
        group_key = answer_key.split(":", 1)[1]
        for symbol, expected in answer["genes"].items():
            actual = groups[group_key]["genes"][symbol]["detected_cells"]
            if actual != expected:
                raise ValueError(f"Legacy detection mismatch: {answer_key}/{symbol}")
            checked += 1
    return checked


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--gene-table", type=Path, default=DEFAULT_GENE_TABLE)
    parser.add_argument("--method-source", type=Path, default=DEFAULT_METHOD_SOURCE)
    parser.add_argument("--demo", type=Path, default=DEFAULT_DEMO)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    demo_hash = sha256(args.demo)
    demo = json.loads(args.demo.read_text())
    fixtures = args.source / "fixtures/homogeneous_groups_20260911"
    results = args.source / "results/homogeneous_groups_20260911"
    embeddings = args.source / "provenance/homogeneous_groups_20260911/encoding_retry1/cell_embeddings.f32.npy"
    paths = [fixtures / "encoding_input.npz", fixtures / "selected_cells.csv", embeddings,
             args.gene_table, fixtures / "questions.jsonl", results / "homogeneous_comparison.json",
             *[results / f"{model.lower()}_homogeneous_think16384.jsonl" for model in demo["models"]]]
    sources = verify_sources(paths, demo["sources"])

    with np.load(fixtures / "encoding_input.npz", allow_pickle=False) as fixture:
        counts = sp.csr_matrix((fixture["data"], fixture["indices"], fixture["indptr"]),
                               shape=tuple(fixture["shape"]))
        gene_ids = [str(gene) for gene in fixture["genes"]]
    if not np.isfinite(counts.data).all() or np.any(counts.data <= 0) or np.any(counts.data % 1):
        raise ValueError("Expected positive, finite integer raw UMI in sparse nonzero entries")
    if not counts.has_canonical_format:
        raise ValueError("Expected canonical CSR without duplicate column indices")
    if counts.shape[0] != len(demo["cells"]) or counts.shape[1] != len(gene_ids):
        raise ValueError("Frozen cell/gene dimension mismatch")
    with (fixtures / "selected_cells.csv").open() as stream:
        rows = list(csv.DictReader(stream))
    if [int(row["embedding_row"]) for row in rows] != list(range(counts.shape[0])):
        raise ValueError("Selected cell order mismatch")
    if [row["stratum_id"] for row in rows] != [cell["s"] for cell in demo["cells"]]:
        raise ValueError("Selected cell stratum mismatch")

    import pyarrow.parquet as pq
    table = pq.read_table(args.gene_table, columns=["gene_id", "symbol"]).to_pydict()
    columns, vocabulary = symbol_index(gene_ids, table)
    mentions = mentioned_symbols(demo["answers"], vocabulary)
    groups = {}
    for key, group in demo["groups"].items():
        cells = group["cells"]
        stratum, size = key.rsplit(":", 1)
        if len(cells) != int(size) or len(set(cells)) != len(cells):
            raise ValueError(f"Invalid selected cell count: {key}")
        if not all(0 <= cell < counts.shape[0] and rows[cell]["stratum_id"] == stratum for cell in cells):
            raise ValueError(f"Invalid selected cells: {key}")
        groups[key] = export_group(counts, cells, columns, mentions)
    legacy_checks = validate_legacy_detection(demo, groups)

    out = {
        "schema": "vhl.talk_gene_evidence.v1",
        "demo_sha256": demo_hash,
        "sources": sources,
        "methods": {
            "scope": "Only the selected input cells, pooled by raw UMI; no other groups, no new inference.",
            "expression": "log2(1 + pooled_gene_UMI / pooled_total_UMI * 1000000), float32",
            "rank": "Detected matrix genes only, including unmapped columns; stable descending expression rank; rank_pct = 100 * (1 - pr), pr = float32(1 - zero_based_rank / max(Ndet - 1, 1)).",
            "rank_interval": "Best and worst rank_pct of the entire tied float32 expression block. Grading policy is defined separately in gene-claims.json.",
            "bands": [
                {"label": "Top 3%", "pr_min_inclusive": 0.97, "pr_max_exclusive": 1.01},
                {"label": "3–10%", "pr_min_inclusive": 0.90, "pr_max_exclusive": 0.97},
                {"label": "10–25%", "pr_min_inclusive": 0.75, "pr_max_exclusive": 0.90},
            ],
            "low_support": "Pooled UMI from 1 through 3 inclusive; zero is not low support.",
            "undetected": "Zero raw UMI in these selected cells; not proof of biological absence.",
            "symbol_mapping": "Exact, case-sensitive gene_table.parquet symbols; ambiguous symbols omitted from matrix lookup, as in talk-demo.json. Missing entries must remain unscored, never treated as raw count zero.",
            "source": "stage_b_SHIP/align/gen/lib_align.py:block_stats",
            "source_sha256": sha256(args.method_source),
            "rounding": "Full float precision retained; use the float32 percentile convention when testing band boundaries.",
        },
        "symbols": vocabulary,
        "unavailable_symbols": sorted(set(vocabulary) - columns.keys()),
        "mentioned_symbols": mentions,
        "matrix": {"cells": counts.shape[0], "genes": counts.shape[1],
                   "unambiguous_symbols": len(columns)},
        "groups": groups,
        "verification": {"source_hashes_matched": len(sources),
                         "legacy_gene_detection_checks": legacy_checks,
                         "answer_text_unchanged": True, "new_inference": False},
    }
    if sha256(args.demo) != demo_hash:
        raise ValueError("talk-demo.json changed during export")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n")
    print(json.dumps({"output": str(args.out), "bytes": args.out.stat().st_size,
                      "groups": len(groups), "mentioned_symbols": len(mentions),
                      "legacy_detection_checks": legacy_checks, "demo_sha256": demo_hash}))


if __name__ == "__main__":
    main()
