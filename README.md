# Virtual Human Lab website

Static website for `www.virtualhumanlab.com`.

## Run locally

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Public pages

- `/` and `/ko/` — English and Korean home pages
- `/research/` and `/research/ko/` — the three research projects: PBISC, RNA-LLM and case2RL
- `/research/pbisc-diffusion/` and `/research/pbisc-diffusion/ko/` — recorded diffusion sampling video with fixed PCA and UMAP views
- `/research/pbisc-diffusion/one-cell/` and its `/ko/` page — interactive step-by-step view of one generated cell
- `/research/talk/` and `/research/talk/ko/` — TALK playground: recorded RNA-LLM answers for real cells (data from `python tools/make_talk_demo.py`)
- `/research/case2rl/` and `/research/case2rl/ko/` — case2RL: case-report PDFs, diagnostic environments, pilot rollouts and review
- `/research/case2rl/review/` and its `/ko/` page — two recorded rollouts, blinded labels, turn-level review, browser snapshots and JSON import/export
- `/papers/` and `/papers/ko/` — blurred manuscript previews and email-draft access request
- `/blog/` and `/blog/ko/` — signed essays on research direction
- `/notes/` and `/notes/ko/` — what a technical note will contain (none are public yet)
- `/members/` and `/members/ko/` — active members, pre-active members, and advisors
- `/governance/`, `/research-integrity/`, `/disclosures/` and their `/ko/` counterparts — public records
- `/bylaws/` — English public summary; `/bylaws/ko/` — Korean bylaws original

## Design

Every page is kept simple and shares one stylesheet, `styles.css`: a white page, one large heading,
rounded image cards with centred text, pill buttons, and a small footer. The header (Research, Papers,
Blog, Members, Contact, language link) and the footer are identical on every page, so change them
everywhere at once. Bump the `?v=` cache key on `styles.css` and `script.js` in every page when either
changes.

Copy follows the owner's review: use simple, direct wording and keep useful English terms in
Korean sentences (for example, Digital Twin, bulk RNA, donor, cell type, inference and reward).
Do not translate every technical term merely to make the Korean page monolingual. Keep the
meaning aligned across languages, while allowing natural wording in each. Preserve recorded
model responses, source quotations, scientific values and formal bylaws. Apply copy edits to
the existing layout; remove retired pages when requested instead of redesigning them.

The home hero replays recorded PBISC-Diffusion sampling from `assets/home/hero-cells.bin` (see
`hero-cells.json`; `assets/home/hero.js` draws it and never runs a model). The research-card and essay
artworks in `assets/home/*.svg` are generated from published site data by
`python tools/make_home_visuals.py`.

The Diffusion and TALK pages include bilingual, responsive Figure 1 architecture diagrams.
`research/architecture/` contains their shared playback shell and separate model renderers.
The diffusion heatmaps replay a fixed 96-gene subset of one already published monocyte recording;
refresh the lossless subset with `python tools/make_architecture_recording.py`.
TALK animates the paper's two alternative encoder/Q-Former routes as a schematic. Its caption
distinguishes this architecture from the one-token-per-cell playground below it. Both diagrams
support pause, restart and keyboard scrubbing; autoplay stops offscreen and starts paused with
reduced-motion preferences. No model runs in the browser.

The three Diffusion recordings use the same white background, dark controls and Figtree font.
They render the published `interactive-v1` data at native 3840×2160, 30 fps, with fixed axes and
scientific colors. All 51 recorded states are shown without interpolation or new inference.
`tools/recording-scene.js` and `.css` define the capture layout. To create a new version:

```bash
uv run --with playwright --with av --with pillow python tools/render_recordings.py \
  --work-dir /path/outside/site/frames \
  --output-dir research/pbisc-diffusion/assets/recordings-NEW-VERSION
```

This uses software Chromium (`/snap/bin/chromium`) and CPU libx264, four encoder threads.
The output contains MP4s, posters, PNG/PDF keyframes and a manifest with source/code hashes.
Use a new output directory; existing videos are never overwritten. Update both language pages
after checking decoded playback and data parity. Original recordings and methods stay archived.

The case2RL explorer exports only the project's explicitly publishable synthetic fixture and
saved synthetic audit samples. Refresh it with
`uv run --with pyyaml python tools/make_case2rl_demo.py --source /path/to/case2RL`
(add `--check` to verify source parity without writing). This does not call a model or include
source papers, private case-derived material, candidate rollouts, or the local review backend.

The separate rollout reviewer contains two owner-requested recorded diagnostic runs. Its fixed,
hash-pinned export is built with `python tools/make_case2rl_review.py --source /path/to/case2RL`.
Original report PDFs and photos are not bundled; the overview links to the paper and uses an
original schematic. The public console is a static adaptation of the local reviewer, not its
unauthenticated server. Review drafts and append-only snapshots stay in the visitor's browser;
JSON export/import provides portability. Blinding is at the interface level. Recorded rewards
are preserved; the overview's reweighting controls are a separate what-if calculation.

TALK colors each gene mention by its claim in context: green for a supported claim, red for
a contradicted detection/count claim, yellow for a detected gene outside the claimed rank band.
Correct statements of non-detection are green. Generic examples, unknown
gene/reference mappings and unresolved clauses remain gray. This evaluates gene
expression claims, not the full biological reasoning or the final cell-type prediction.
Click a mention for its sentence, pooled raw UMI, detection count and measured rank interval.

The source caption contract pools selected cells' raw UMI and ranks all detected matrix genes,
including columns without gene symbols. Its bands are [0,3], (3,10], and (10,25] percent from
the top. Per the owner's 2026-10-04 policy, a tied interval overlapping the claimed band is
accepted as green; only a disjoint interval is a rank error. The evidence card explains overlap
acceptance. Low-support captions mean 1–3 pooled UMI.
Corpus-relative claims now compare the input's log2(1+CPM) with the frozen training corpus
baseline, aligned by Ensembl gene ID through `model_gene_index`. That baseline is the mean
of 119,174 logged profiles, each pooling 32 training cells. The displayed difference is a
subtraction on this scale, not an ordinary log fold change. Baseline, mapping and provenance
hashes are stored separately from the demo's nine original source hashes.

For qualitative “elevated / distinctive / most / greatest” claims, the interface explicitly
checks elevation direction: detected and input above corpus is green; zero or input at/below
corpus is red. It does not invent a top-N cutoff from the caption generator's list length.
“High here and in typical cells” uses the original abundance thresholds: corpus top 1% and
input top 3% or first 20 genes. Tied overlap is accepted; a detected gene outside these ranks
is yellow. Gene-family membership is not required for an abundance claim.
The separate evidence and annotation files preserve `talk-demo.json` and all recorded words:

```bash
uv run --with numpy --with scipy --with pyarrow python tools/make_talk_gene_evidence.py
python tools/grade_talk_claims.py
uv run --with numpy --with scipy --with pyarrow python -m unittest discover -s tools -p 'test_talk_*.py'
```

The exporter checks all nine original input hashes. The browser verifies the demo and each
answer hash plus literal occurrence spans; mismatches disable grading visibly. The parser is
bounded to the saved demo and caption templates. Review new wording before extending it.

The evaluation cards summarize the 24 answers given 8 cells each (8 groups × 3 models).
The gene card reports green / (green + red + yellow) mentions, with ungraded mentions shown
separately. It replaces the older raw-detection statistic. Refresh the cards and expanded
model tables in both languages from `gene-claims.json` whenever grading changes; repeated
mentions count separately, and this rate is not whole-answer accuracy.

## Bilingual publishing

Every visitor-facing page is available in English and Korean on separate URLs. English uses the
unprefixed route and Korean uses a route-local `/ko/` suffix. Each equivalent pair has an always-
visible header language switch, language-preserving navigation, localized metadata, a self-
canonical URL, and reciprocal `hreflang` links. The bylaws are the exception: the English page is a
summary and the Korean page is the full original, so the switch identifies them as different
document editions rather than equivalent translations.

## Deployment safety

Deploy tracked site files only. Do not deploy a raw workspace directory. Original manuscripts,
signed governance records, secrets, credentials, patient information, controlled-access data, and
other private research material must remain outside this website directory.

The site has no backend form. The manuscript request form builds a `mailto:` draft in the visitor's
email application; it does not send or store form data on the website.

## Publishing a blog post

Blog posts are static HTML pages. Every post must be published in English and Korean in the same
release, on separate URLs: `/blog/<slug>/` for English and `/blog/<slug>/ko/` for Korean. Do not put
both full texts on one page. Each pair needs reciprocal `hreflang` links, self-canonical URLs,
localized metadata and social images, a signed author and date, a listing on `/blog/`, and two
sitemap entries. Keep essays separate from technical Notes: Blog posts state arguments and research
direction, while Notes document methods, evidence, limitations, and corrections. Add a cover artwork for the
blog list and refresh the cache key and article social images with each new post.
