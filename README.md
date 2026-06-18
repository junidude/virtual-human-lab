# Virtual Human Lab Website

Static first-launch website for `www.virtualhumanlab.com`.

## Run Locally

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Files

- `index.html` - page structure and English site copy
- `styles.css` - core visual system
- `sections.css` - section-specific and responsive rules
- `script.js` - navigation behavior and animated RNA/cell-state canvas
- `404.html`, `robots.txt`, `sitemap.xml` - static hosting and SEO helpers
- `favicon.svg`, `assets/og-image.png` - browser and social preview assets
- `reports/` - generated visual QA screenshots
- `CNAME` - custom domain for GitHub Pages-style static deployment

## Deployment Notes

This site is static and does not require a backend, build step, or secrets. It can be deployed to
GitHub Pages, Cloudflare Pages, Netlify, Vercel static hosting, or any object-storage/CDN setup.
