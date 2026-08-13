# Virtual Human Lab website

Static website for `www.virtualhumanlab.com`.

## Run locally

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Public pages

- `/` — virtual-human vision, current RNA programs, manuscript status, people, and contact
- `/research/` — long-term virtual-human research agenda and current RNA work
- `/papers/` — blurred manuscript previews and email-draft access request
- `/blog/` — signed essays on research direction; each post has its own nested route
- `/notes/` — technical-note scope and current evidence register
- `/members/` — active members, pre-active members, and advisors
- `/governance/`, `/bylaws/`, `/research-integrity/`, `/disclosures/` — public records
- `/bylaws/ko/` — Korean bylaws original

## Deployment safety

Deploy tracked site files only. Do not deploy a raw workspace directory. Original manuscripts,
signed governance records, secrets, credentials, patient information, controlled-access data, and
other private research material must remain outside this website directory.

The site has no backend form. The manuscript request form builds a `mailto:` draft in the visitor's
email application; it does not send or store form data on the website.

## Publishing a blog post

Blog posts are static HTML pages. Each post should have a folder under `/blog/`, a signed author and
date, a listing on `/blog/`, and a sitemap entry. Keep essays separate from technical Notes: Blog
posts state arguments and research direction, while Notes document methods, evidence, limitations,
and corrections. Refresh the shared navigation, cache key, article social image, and responsive
screenshots with each new post.
