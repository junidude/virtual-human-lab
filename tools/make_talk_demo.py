"""Build the data for the TALK playground page from recorded TALK-PTG evaluation runs.

Run from the repository root (CPU only; nothing here runs the model):
    python tools/make_talk_demo.py [--source /home/sj_server_1/gblee/downloads/TALK-PTG-final/evaluation]

Inputs (homogeneous group-size evaluation, 2026-09-11):
  fixtures/homogeneous_groups_20260911/encoding_input.npz   raw UMI counts of the 256 Kang PBMC cells
  fixtures/homogeneous_groups_20260911/selected_cells.csv   stratum and order of each cell
  provenance/homogeneous_groups_20260911/encoding_retry1/cell_embeddings.f32.npy   the RNA vectors the model read
  results/homogeneous_groups_20260911/{sft,grpo,dapo}_homogeneous_think16384.jsonl   recorded generations
  fixtures/homogeneous_groups_20260911/questions.jsonl       the prompt text, identical for every group size
  results/homogeneous_groups_20260911/homogeneous_comparison.json   frozen grading of those generations
Output: research/talk/data/talk-demo.json
"""

import argparse
import csv
import hashlib
import json
import re
from pathlib import Path

import numpy as np
import scipy.sparse as sp

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path("/home/sj_server_1/gblee/downloads/TALK-PTG-final/evaluation")
# Same Ensembl-to-symbol table the evaluation fixtures used (prepare_kang_basic.py); ambiguous symbols are dropped.
DEFAULT_GENE_TABLE = Path("/home/sj_server_1/gblee/TALK-PTG/v7/TALK-PTG-StageB-Data/10_cells/gene_table.parquet")
OUT = ROOT / "research" / "talk" / "data" / "talk-demo.json"
MODELS = ["SFT", "GRPO", "DAPO"]
SIZES = [1, 8, 16, 32]
TYPES = ["B", "CD14_MONO", "CD4_T", "NK"]
STATES = ["CTRL", "STIM"]
PANEL = ["MS4A1", "CD79A", "CD14", "LYZ", "CD3E", "IL7R", "NKG7", "GNLY", "ISG15", "IFIT1"]
# Upper-case words the model uses as prose or answer codes that also exist as gene symbols.
NOT_GENES = {"CTRL", "STIM", "RNA", "DNA", "UMI", "CPM", "JSON", "MONO", "TYPE", "CELL", "SET", "MAX", "CAT",
             "REST", "IMPACT", "CLOCK", "WAS", "SHE", "TANK", "ACE", "CAMP", "PIGS", "MARCH", "SEPT"}
UMAP_SEED = 20260919


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def split_generation(text):
    """Reasoning inside <think>…</think> and the final text after it; final is None when thinking never closed."""
    body = text.split("<think>", 1)[-1]
    if "</think>" not in body:
        return body.strip(), None
    reasoning, final = body.split("</think>", 1)
    final = re.sub(r"<\|im_end\|>|</?answer>", "", final).strip()
    return reasoning.strip(), final


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    ap.add_argument("--gene-table", type=Path, default=DEFAULT_GENE_TABLE)
    args = ap.parse_args()
    src = args.source
    fx = src / "fixtures/homogeneous_groups_20260911"
    res = src / "results/homogeneous_groups_20260911"
    emb_path = src / "provenance/homogeneous_groups_20260911/encoding_retry1/cell_embeddings.f32.npy"

    z = np.load(fx / "encoding_input.npz", allow_pickle=False)
    counts = sp.csr_matrix((z["data"], z["indices"], z["indptr"]), shape=tuple(z["shape"]))
    import collections

    import pyarrow.parquet as pq

    table = pq.read_table(args.gene_table, columns=["gene_id", "symbol"]).to_pydict()
    n_symbol = collections.Counter(s for s in table["symbol"] if s)
    to_symbol = {g: s for g, s in zip(table["gene_id"], table["symbol"]) if s and n_symbol[s] == 1}
    genes = [to_symbol.get(str(g), "") for g in z["genes"]]
    gene_col = {g: i for i, g in enumerate(genes) if g}
    lib = np.asarray(counts.sum(axis=1)).ravel()
    norm = sp.diags(1e4 / lib) @ counts
    norm.data = np.log1p(norm.data)
    norm = norm.tocsc()
    counts_csc = counts.tocsc()

    rows = list(csv.DictReader(open(fx / "selected_cells.csv")))
    assert [int(r["embedding_row"]) for r in rows] == list(range(len(rows))) == list(range(counts.shape[0]))
    stratum_of = [r["stratum_id"] for r in rows]

    emb = np.load(emb_path)
    assert emb.shape == (len(rows), 2048), emb.shape
    import umap

    xy = umap.UMAP(n_neighbors=15, min_dist=0.35, metric="cosine", random_state=UMAP_SEED).fit_transform(emb)
    xy = (xy - xy.min(axis=0)) / (xy.max(axis=0) - xy.min(axis=0))

    questions = [json.loads(line) for line in open(fx / "questions.jsonl")]
    headers = {q["prompt"].split("\n\n", 1)[0].splitlines()[0] for q in questions}
    instructions = {q["prompt"].split("\n\n", 1)[1] for q in questions}
    assert len(headers) == len(instructions) == 1, (headers, instructions)
    # One wording was used for every group size, including a single cell.
    prompt = {"header": headers.pop(), "instruction": instructions.pop()}

    comparison = json.load(open(res / "homogeneous_comparison.json"))
    graded = {(r["model"], r["id"]): r for r in comparison["replies"]}
    generations = {}
    for m in MODELS:
        for line in open(res / f"{m.lower()}_homogeneous_think16384.jsonl"):
            rec = json.loads(line)
            generations[(m, rec["id"])] = rec

    def expression(cells, gene):
        col = gene_col.get(gene)
        if col is None:
            return None
        detected = int((counts_csc[cells, col].toarray().ravel() > 0).sum())
        mean = float(norm[cells, col].toarray().mean())
        return detected, round(mean, 3)

    answers = {}
    groups = {}
    mention_stats = {m: [0, 0] for m in MODELS}  # [detected in input cells, mentioned]
    for stratum in sorted(set(stratum_of)):
        for n in SIZES:
            qid = f"homogeneous:{stratum}:n{n:02d}"
            cells = graded[("SFT", qid)]["cells"]
            assert all(stratum_of[c] == stratum for c in cells) and len(cells) == n
            groups[f"{stratum}:{n}"] = {
                "cells": cells,
                "panel": [expression(cells, g)[1] for g in PANEL],
            }
            for m in MODELS:
                g = graded[(m, qid)]
                rec = generations[(m, qid)]
                assert rec["cells"] == cells and rec["gold"] == g["gold"]
                reasoning, final = split_generation(rec["generation"])
                nat = g["natural"]
                pred = nat.get("parsed_object") or {}
                mentions = {}
                for tok in re.findall(r"(?<![A-Za-z0-9_-])[A-Z][A-Z0-9-]{2,}(?:\.[0-9]+)?(?![A-Za-z0-9_-])", reasoning):
                    if tok in NOT_GENES or tok in mentions:
                        continue
                    ex = expression(cells, tok)
                    if ex is not None:
                        mentions[tok] = ex[0]
                mention_stats[m][0] += sum(1 for v in mentions.values() if v > 0)
                mention_stats[m][1] += len(mentions)
                answers[f"{m}:{stratum}:{n}"] = {
                    "reasoning": reasoning,
                    "final": final,
                    "type": pred.get("type") if isinstance(pred, dict) else None,
                    "state": pred.get("state") if isinstance(pred, dict) else None,
                    "type_ok": bool(nat["type_success"]),
                    "state_ok": bool(nat["state_success"]),
                    "complete": bool(rec["generation_complete"] and rec["generation_has_usable_final"]),
                    "tokens": int(rec["generation_tokens"]),
                    "seconds": round(float(rec["generation_seconds"]), 1),
                    "genes": mentions,
                }

    # Specificity check: are the genes an answer names detected more often in its own cells than in
    # same-size groups of the other seven strata? Mean fraction of cells with >=1 UMI, over named genes.
    specificity = {m: {} for m in MODELS}
    for m in MODELS:
        for n in SIZES:
            own, other = [], []
            for stratum in sorted(set(stratum_of)):
                named = [g for g in answers[f"{m}:{stratum}:{n}"]["genes"]]
                if not named:
                    continue
                cols = [gene_col[g] for g in named]
                def rate(cells):
                    return float((counts_csc[cells][:, cols].toarray() > 0).mean())
                own.append(rate(groups[f"{stratum}:{n}"]["cells"]))
                other.append(np.mean([rate(groups[f"{o}:{n}"]["cells"]) for o in sorted(set(stratum_of)) if o != stratum]))
            specificity[m][str(n)] = {"answers": len(own), "own_cells": round(float(np.mean(own)), 3) if own else None,
                                      "other_cells": round(float(np.mean(other)), 3) if other else None}

    summary = {
        m: {str(n): comparison["models"][m]["by_group_size"][str(n)]["natural"]["counts"] for n in SIZES}
        for m in MODELS
    }
    out = {
        "schema": "vhl.talk_demo.v1",
        "note": "Recorded TALK-PTG generations; no model runs on the page. Kang et al. 2018 PBMC (GSE96583), control vs 6 h IFN-beta.",
        "settings": {"thinking": True, "temperature": 0.6, "top_p": 0.95, "top_k": 20, "max_new_tokens": 16384,
                     "seed": "one fixed seed per cell group, shared across models and group sizes"},
        "types": TYPES, "states": STATES, "sizes": SIZES, "models": MODELS,
        "prompt": prompt,
        "panel": PANEL,
        "cells": [{"x": round(float(a), 4), "y": round(float(b), 4), "s": s} for (a, b), s in zip(xy, stratum_of)],
        "groups": groups,
        "answers": answers,
        "summary": summary,
        "gene_mentions": {m: {"detected": d, "mentioned": t} for m, (d, t) in mention_stats.items()},
        "gene_specificity": specificity,
        "sources": {p.name: sha256(p) for p in [fx / "encoding_input.npz", fx / "selected_cells.csv", emb_path, args.gene_table,
                                                fx / "questions.jsonl", res / "homogeneous_comparison.json",
                                                *[res / f"{m.lower()}_homogeneous_think16384.jsonl" for m in MODELS]]},
        "umap": {"input": "cell_embeddings.f32.npy (256 x 2048)", "metric": "cosine", "n_neighbors": 15,
                 "min_dist": 0.35, "random_state": UMAP_SEED},
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print(OUT.relative_to(ROOT), f"{OUT.stat().st_size / 1024:.0f} KiB")
    for m in MODELS:
        d, t = mention_stats[m]
        print(m, "type", [summary[m][str(n)]["type_success"] for n in SIZES],
              "state", [summary[m][str(n)]["state_success"] for n in SIZES],
              f"genes named in reasoning detected in input cells: {d}/{t}", "specificity", specificity[m])


if __name__ == "__main__":
    main()
