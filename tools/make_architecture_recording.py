"""Export a small, lossless subset of an already published diffusion recording.

No model execution. One cell, the first 12 genes of each of the 8 existing
gene blocks; the same order and 0–8.5 log1p(CP10k) scale in every frame.
"""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "research/pbisc-diffusion/assets/one-cell-v2"
DEST = ROOT / "research/architecture/diffusion-recording.json"


def main() -> None:
    meta_bytes = (SOURCE / "meta.json").read_bytes()
    meta = json.loads(meta_bytes)
    cell = next(c for c in meta["cells"] if c["slug"] == "monocyte")
    raw = (SOURCE / cell["file"]).read_bytes()
    assert hashlib.sha256(raw).hexdigest() == cell["sha256"]
    count, frames = len(meta["genes"]["symbols"]), meta["frames"]
    assert len(raw) == 2 * frames * count
    selected = [b["start"] + i for b in meta["blocks"] for i in range(12)]
    assert all(b["count"] >= 12 for b in meta["blocks"])
    data = {
        "schema": "vhl.architecture.diffusion.v1",
        "frames": frames,
        "cell": {k: cell[k] for k in ("slug", "label", "tracked_index")},
        "checkpoint": meta["checkpoint"],
        "genes": [meta["genes"]["symbols"][i] for i in selected],
        "gene_indices": selected,
        "groups": [b["name"] for b in meta["blocks"]],
        "selection": "First 12 genes in each of the 8 published gene blocks; fixed across frames.",
        "value_max": meta["value_max"],
        "units": meta["value_units"],
        "quantization": meta["quantization"],
        "state_times": meta["state_times"],
        "prediction_times": meta["prediction_times"],
        "state": [[raw[f * count + i] for i in selected] for f in range(frames)],
        "prediction": [[raw[(frames + f) * count + i] for i in selected] for f in range(frames)],
        "semantics": {k: meta["rules"][k] for k in ("noisy_state", "prediction")},
        "source": {
            "file": "/research/pbisc-diffusion/assets/one-cell-v2/" + cell["file"],
            "sha256": cell["sha256"],
            "meta": "/research/pbisc-diffusion/assets/one-cell-v2/meta.json",
            "meta_sha256": hashlib.sha256(meta_bytes).hexdigest(),
            "checkpoint_sha256": meta["checkpoint_sha256"],
        },
    }
    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False) + "\n")
    print(f"Exported {frames} frames × {len(selected)} genes × 2 views; {DEST.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
