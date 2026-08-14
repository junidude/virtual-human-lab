# Virtual Human Lab website

Static website for `www.virtualhumanlab.com`.

## Run locally

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Public pages

- `/` and `/ko/` — English and Korean home pages
- `/research/` and `/research/ko/` — long-term virtual-human research agenda and current RNA work
- `/papers/` and `/papers/ko/` — blurred manuscript previews and email-draft access request
- `/blog/` and `/blog/ko/` — signed essays on research direction
- `/notes/` and `/notes/ko/` — technical-note scope and current evidence register
- `/members/` and `/members/ko/` — active members, pre-active members, and advisors
- `/governance/`, `/research-integrity/`, `/disclosures/` and their `/ko/` counterparts — public records
- `/bylaws/` — English public summary; `/bylaws/ko/` — Korean bylaws original

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
direction, while Notes document methods, evidence, limitations, and corrections. Refresh the shared
navigation, cache key, article social images, and responsive screenshots with each new post.
