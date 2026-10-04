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
DEFAULT_CORPUS = DEFAULT_METHOD_SOURCE.parents[1] / "out/pop/corpus_mean_train.npy"
DEFAULT_CORPUS_MAPPING = DEFAULT_METHOD_SOURCE.parents[2] / "share_v2/gene_rank_v2.parquet"
DEFAULT_CORPUS_METHOD = DEFAULT_METHOD_SOURCE.with_name("x4_corpus_mean.py")
DEFAULT_CORPUS_MANIFEST = Path("/home/sj_server_1/gblee/TALK-PTG/v7/stage_b/align/out/pop/corpus_mean_manifest.json")
DEFAULT_DEMO = ROOT / "research/talk/data/talk-demo.json"
DEFAULT_OUT = ROOT / "research/talk/data/gene-evidence.json"

# Exact measured-house rule from lib_align.py. Membership is evidence only;
# the browser's grader decides whether a particular sentence actually claims it.
HOUSE = re.compile(
    r"^(MT-[A-Z0-9]+|MTRNR[0-9]+L?[0-9]*|RP[LS][0-9]+[A-Z]?|RPLP[0-9]|RPSA"
    r"|EEF1A1|EEF1B2|EEF1D|EEF1G|EEF2|ACTB|GAPDH|B2M|TMSB4X|TMSB10|MALAT1|FTL|FTH1"
    r"|UBA52|NACA|BTF3|SERF2|UBC|UBB)$"
)


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


def ordinal_intervals(values: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """One-based best/worst ranks of each complete tied value block."""
    values = np.asarray(values)
    order = np.argsort(-values, kind="stable")
    if not len(values):
        return np.array([], dtype=np.int64), np.array([], dtype=np.int64)
    sorted_values = values[order]
    head = np.flatnonzero(np.concatenate(([True], sorted_values[1:] != sorted_values[:-1])))
    tail = np.append(head[1:], len(values)) - 1
    best, worst = np.empty(len(values), np.int64), np.empty(len(values), np.int64)
    best[order] = np.repeat(head + 1, tail - head + 1)
    worst[order] = np.repeat(tail + 1, tail - head + 1)
    return best, worst


def corpus_evidence(gene_ids: list[str], baseline: np.ndarray, mapping: dict[str, list]) -> dict[int, dict]:
    """Align by Ensembl ID, never by fixture column or parquet row position.

    corpus_percentile ranks every reference column, including zeros and unnamed
    genes. Its arbitrary double-argsort tie point is kept separately from the
    complete tie interval used when examining a rank claim.
    """
    baseline = np.asarray(baseline)
    if baseline.ndim != 1 or not len(baseline):
        raise ValueError("Corpus baseline must be a nonempty one-dimensional vector")
    if not np.isfinite(baseline).all() or np.any(baseline < 0) or np.any(baseline > np.log2(1e6 + 1) + 1e-5):
        raise ValueError("Corpus baseline must contain finite log2(1+CPM) values in valid bounds")
    if len(set(gene_ids)) != len(gene_ids):
        raise ValueError("Duplicate fixture gene IDs")
    if any(len(mapping.get(key, [])) != len(baseline) for key in ("gene_id", "symbol", "model_gene_index")):
        raise ValueError("Corpus mapping dimension must equal baseline dimension")
    reference_ids = mapping["gene_id"]
    if any(not isinstance(gene, str) or not gene for gene in reference_ids) or len(set(reference_ids)) != len(reference_ids):
        raise ValueError("Corpus mapping has empty or duplicate gene IDs")
    indices = mapping["model_gene_index"]
    if any(isinstance(index, (bool, np.bool_)) or not isinstance(index, (int, np.integer))
           or not 0 <= index < len(baseline) for index in indices):
        raise ValueError("Corpus model_gene_index must be integer and within baseline bounds")
    if len(set(indices)) != len(baseline):
        raise ValueError("Corpus mapping contains duplicate model_gene_index values")
    by_id = dict(zip(reference_ids, indices))
    symbols = np.full(len(baseline), "", dtype=object)
    for index, symbol in zip(indices, mapping["symbol"]):
        if symbol and not re.fullmatch(r"ENSG\d+", str(symbol)):
            symbols[index] = str(symbol)
    source_rank = np.argsort(np.argsort(-np.asarray(baseline, dtype=np.float64)))
    denominator = max(len(baseline) - 1, 1)
    percentile = 1.0 - source_rank / denominator
    best, worst = ordinal_intervals(baseline)
    output = {}
    for column, gene_id in enumerate(gene_ids):
        index = by_id.get(gene_id)
        if index is None:
            continue
        named = bool(symbols[index])
        output[column] = {
            "corpus_mean_log2cpm": float(baseline[index]),
            "corpus_rank_pct": 100 * (1 - float(percentile[index])) if named else None,
            "corpus_rank_interval": [100 * int(rank[index] - 1) / denominator for rank in (best, worst)] if named else None,
            "corpus_high_house": bool(HOUSE.match(symbols[index]) and percentile[index] >= 0.99) if named else None,
        }
    return output


def export_group(counts: sp.csr_matrix, cells: list[int], columns: dict[str, int],
                 symbols: list[str], corpus: dict[int, dict] | None = None) -> dict:
    stats = block_stats(counts, cells)
    detected_columns = np.flatnonzero(stats["total"] > 0)
    ordinal_best, ordinal_worst = ordinal_intervals(stats["profile"][detected_columns])
    ordinals = {int(column): [int(best), int(worst)]
                for column, best, worst in zip(detected_columns, ordinal_best, ordinal_worst)}
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
            "group_rank_interval_ordinal": ordinals.get(column),
            "corpus_mean_log2cpm": None,
            "corpus_delta": None,
            "corpus_rank_pct": None,
            "corpus_rank_interval": None,
            "corpus_high_house": None,
        }
        if corpus is not None and column in corpus:
            genes[symbol].update(corpus[column])
            # render_describe uses float32 prof - cm; this is a log-expression
            # difference, not a fold change of pooled UMI or a DEG statistic.
            genes[symbol]["corpus_delta"] = float(stats["profile"][column] - np.float32(corpus[column]["corpus_mean_log2cpm"]))
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
    parser.add_argument("--corpus", type=Path, default=DEFAULT_CORPUS)
    parser.add_argument("--corpus-mapping", type=Path, default=DEFAULT_CORPUS_MAPPING)
    parser.add_argument("--corpus-method", type=Path, default=DEFAULT_CORPUS_METHOD)
    parser.add_argument("--corpus-manifest", type=Path, default=DEFAULT_CORPUS_MANIFEST)
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
    baseline = np.load(args.corpus, allow_pickle=False)
    mapping = pq.read_table(args.corpus_mapping, columns=["gene_id", "symbol", "model_gene_index"]).to_pydict()
    corpus = corpus_evidence(gene_ids, baseline, mapping)
    # The shipped corpus omits the small generation manifest. Bind the original
    # manifest by proving that the baseline alongside it is byte-identical.
    if sha256(args.corpus_manifest.with_name("corpus_mean_train.npy")) != sha256(args.corpus):
        raise ValueError("Corpus manifest belongs to a different baseline file")
    corpus_manifest = json.loads(args.corpus_manifest.read_text())
    if corpus_manifest.get("block") != 32 or corpus_manifest.get("n_profiles", 0) <= 0:
        raise ValueError("Unexpected corpus generation manifest")
    corpus_sources = {path.name: sha256(path) for path in (
        args.corpus, args.corpus_mapping, args.corpus_method, args.corpus_manifest,
        args.corpus.parent / "split_studies.json", args.method_source,
    )}
    groups = {}
    for key, group in demo["groups"].items():
        cells = group["cells"]
        stratum, size = key.rsplit(":", 1)
        if len(cells) != int(size) or len(set(cells)) != len(cells):
            raise ValueError(f"Invalid selected cell count: {key}")
        if not all(0 <= cell < counts.shape[0] and rows[cell]["stratum_id"] == stratum for cell in cells):
            raise ValueError(f"Invalid selected cells: {key}")
        groups[key] = export_group(counts, cells, columns, mentions, corpus)
    legacy_checks = validate_legacy_detection(demo, groups)

    out = {
        "schema": "vhl.talk_gene_evidence.v1",
        "demo_sha256": demo_hash,
        "sources": sources,
        "corpus": {
            "sources": corpus_sources,
            "reference_genes": len(baseline),
            "aligned_fixture_genes": len(corpus),
            "missing_fixture_genes": len(gene_ids) - len(corpus),
            "n_profiles": corpus_manifest["n_profiles"],
            "n_train_groups": corpus_manifest["n_train_groups"],
            "block_cells": corpus_manifest["block"],
            "excludes": corpus_manifest["excludes"],
            "units": "Arithmetic mean of float32 log2(1+CPM) profiles, each made by pooling 32 raw-count cells within a training group; not log2 of mean CPM.",
            "alignment": "Fixture gene_id to gene_rank_v2.parquet gene_id, then model_gene_index into corpus_mean_train.npy; missing mappings stay null.",
            "delta": "float32(group log2(1+CPM) minus corpus_mean_log2cpm); not a differential-expression fold change.",
            "rank": "All reference columns, including zero and unnamed genes. corpus_rank_pct reproduces corpus_percentile double argsort; corpus_rank_interval spans every tied baseline value, expressed as top percent (0 is highest). Unnamed reference ranks are null.",
            "high_house": "Exact lib_align.HOUSE symbol pattern AND corpus_percentile >= 0.99; reported as evidence, with no routing/training-pool eligibility filter.",
            "manifest_note": "Generation manifest from stage_b/align/out/pop; its adjacent baseline SHA-256 exactly matches the stage_b_SHIP baseline used here.",
        },
        "methods": {
            "scope": "Sample expression uses only selected input cells pooled by raw UMI. Separately labelled corpus fields use the frozen training baseline. No new inference.",
            "expression": "log2(1 + pooled_gene_UMI / pooled_total_UMI * 1000000), float32",
            "rank": "Detected matrix genes only, including unmapped columns; stable descending expression rank; rank_pct = 100 * (1 - pr), pr = float32(1 - zero_based_rank / max(Ndet - 1, 1)).",
            "rank_interval": "Best and worst rank_pct of the entire tied float32 expression block. Grading policy is defined separately in gene-claims.json.",
            "group_rank_interval_ordinal": "One-based best and worst ranks among detected matrix genes, including unnamed columns; null for undetected genes.",
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
