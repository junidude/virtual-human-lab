# Architecture figures

Native HTML/SVG adaptations of the two manuscripts' Figure 1, using the site's typography,
spacing and palette. Original manuscript pages and images are not bundled.

## PBISC-Diffusion

Source: `nature-communications-overleaf/figures/fig01_architecture.svg` and
`sections/overview_figure.tex`, checked against `pbisc_sdd/model.py` and `diffusion.py`.

- Gene-aligned state: G values + G support coordinates, 2G throughout sampling.
- Concatenate noisy state and soft self-conditioning: 4G denoiser input.
- Seven conditioned MLP blocks and three skip additions; every sampling step uses all blocks.
- Independent value and support-logit heads; soft joint estimate feeds both DDIM and self-conditioning.
- DDIM depends on both the current state and the clean estimate.
- Rescaling, support threshold and assay mask produce final expression.
- The displayed run is ctx2048 E12 EMA, not the 512-context illustration in the paper.

Heatmaps are decoded expression views, **not raw 2G tensors**. Data are the original uint8
values for the first 12 genes in each of eight fixed gene blocks from one monocyte recording.
Each tile is a gene of that same cell. Both panels use the same fixed 0–8.5 log1p(CP10k) scale.
No framewise normalization, endpoint interpolation or observed-cell target is used.
The final estimate is the existing t=0.02 prediction; it is not an extra t=0 evaluation.

`diffusion-recording.json` contains source paths, SHA-256, gene indices, frame times and units.
Rebuild from already-public site assets using `tools/make_architecture_recording.py`.

## TALK

Source: `TALK-kdd-submission_gb_change/figures/figure_1/talk_architecture_integrated.svg`,
`figures/architecture.tex` and `sections/methods.tex`.

- One alternative input route per profile: frozen BulkFormer or frozen TF-Sapiens.
- Each route has its own trained Q-Former, yielding K continuous RNA embeddings.
- RNA prefix precedes experiment-context/question embeddings; these are sequence concatenation.
- Trained Qwen3 generates rationale, then answer. The response drawing is a schematic.
- This paper architecture is distinct from the live page's saved playground: one token/cell
  through a linear projector. The visible caption makes that distinction explicit.

## Playback

`architecture.js` owns time, visibility and accessibility; each model supplies deterministic
`draw(frame)`, `frameLabel(frame)`, `stageLabel(frame)` and `frameCount`.
Both modules are lazy-imported by model. The only diffusion payload added is about 28 KB.
All changes to modules, styles or data must bump the corresponding HTML/import cache keys.
