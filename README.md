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
