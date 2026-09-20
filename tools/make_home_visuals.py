"""Build the three research-card artworks (SVG) from published site data.

Run from the repository root:
    python tools/make_home_visuals.py

Inputs are already on the site:
  assets/home/hero-cells.bin            recorded PBISC-Diffusion states (see hero-cells.json)
  research/pbisc-diffusion/assets/one-cell-v2/cell-monocyte.bin   one generated cell, 2,980 genes
Outputs: assets/home/{pbisc,rna-llm,case2rl}.svg (research cards) and
         assets/home/essay-{trusting-parameters,virtual-human}.svg (blog covers)
"""

import json
import math
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "home"
W, H = 2400, 1200
COLORS = ["#3AA0FF", "#FF8A3D", "#1FD1A0", "#F08BD0", "#FFC23D", "#9BD8FF"]


def svg(body, bg, extra_defs="", w=W, h=H, lift=True):
    if lift:  # research cards carry centred text in their lower half, so draw the art small and high
        body = f'<g transform="translate({w / 2} 330) scale(.8) translate({-w / 2} -470)">{body}</g>'
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" preserveAspectRatio="xMidYMid slice">'
        f'<defs><radialGradient id="glow" cx="50%" cy="38%" r="60%"><stop offset="0" stop-color="#ffffff" stop-opacity=".07"/>'
        f'<stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>{extra_defs}</defs>'
        f'<rect width="{w}" height="{h}" fill="{bg}"/><rect width="{w}" height="{h}" fill="url(#glow)"/>{body}</svg>'
    )


def hero_cells():
    meta = json.loads((OUT / "hero-cells.json").read_text())
    raw = (OUT / "hero-cells.bin").read_bytes()
    n, steps = meta["cells"], len(meta["steps"])
    labels = np.frombuffer(raw[:n], dtype=np.uint8)
    xy = np.frombuffer(raw[n:], dtype="<i2").reshape(steps, n, 2) / 32767 * meta["scale"]
    return labels, xy[-1]


def pbisc():
    """One bulk profile (a stacked bar of cell-type shares) streaming into generated cells."""
    labels, final = hero_cells()
    rng = np.random.default_rng(7)
    cx, cy, scale = 1500, 470, 470
    px = cx + final[:, 0] * scale
    py = cy - final[:, 1] * scale
    shares = np.bincount(labels, minlength=6) / len(labels)
    bar_x, bar_top, bar_h, bar_w = 430, 250, 440, 56
    parts, y = [], bar_top
    order = np.argsort(-shares)
    seg_mid = {}
    for k in order:
        h = shares[k] * bar_h
        parts.append(f'<rect x="{bar_x}" y="{y:.1f}" width="{bar_w}" height="{max(h, 2):.1f}" fill="{COLORS[k]}"/>')
        seg_mid[k] = (y, y + h)
        y += h
    streams = []
    for i in rng.choice(len(labels), size=260, replace=False):
        k = labels[i]
        y0 = rng.uniform(*seg_mid[k])
        x0 = bar_x + bar_w
        x1, y1 = px[i], py[i]
        mx = (x0 + x1) / 2
        streams.append(
            f'<path d="M{x0:.0f} {y0:.1f} C{mx:.0f} {y0:.1f} {mx:.0f} {y1:.1f} {x1:.0f} {y1:.1f}" '
            f'stroke="{COLORS[k]}" stroke-opacity=".16" stroke-width="1.4" fill="none"/>'
        )
    dots = "".join(
        f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3.1" fill="{COLORS[k]}" fill-opacity=".85"/>'
        for x, y, k in zip(px, py, labels)
    )
    body = "".join(streams) + f'<g>{"".join(parts)}</g>' + dots
    return svg(body, "#0b1220")


def rna_llm():
    """A 2,980-gene expression mosaic of one cell folding into a single token among word tokens."""
    cell = np.fromfile(
        ROOT / "research/pbisc-diffusion/assets/one-cell-v2/cell-monocyte.bin", dtype=np.uint8
    ).reshape(2, 51, 2980)[1, -1].astype(float)
    cell = cell[np.random.default_rng(3).permutation(cell.size)]
    cols, rows, size, gap = 80, 38, 11, 3
    x0, y0 = 180, 470 - rows * (size + gap) / 2
    tiles = []
    for g, v in enumerate(cell):
        r, c = divmod(g, cols)
        x, y = x0 + c * (size + gap), y0 + r * (size + gap)
        if v > 0:
            t = min(1.0, v / 160)
            color = f"hsl({300 - 60 * t:.0f},{70 + 25 * t:.0f}%,{40 + 30 * t:.0f}%)"
            tiles.append(f'<rect x="{x:.0f}" y="{y:.0f}" width="{size}" height="{size}" rx="2" fill="{color}"/>')
        else:
            tiles.append(f'<rect x="{x:.0f}" y="{y:.0f}" width="{size}" height="{size}" rx="2" fill="#ffffff" fill-opacity=".06"/>')
    token_x, token_y, token = 1560, 470, 88
    rng = np.random.default_rng(11)
    streams = []
    right = x0 + cols * (size + gap)
    on = np.flatnonzero(cell > 0)
    for g in rng.choice(on, size=min(90, len(on)), replace=False):
        r, c = divmod(g, cols)
        sx, sy = x0 + c * (size + gap) + size / 2, y0 + r * (size + gap) + size / 2
        streams.append(
            f'<path d="M{sx:.0f} {sy:.0f} C{right + 120:.0f} {sy:.0f} {token_x - 200:.0f} {token_y:.0f} {token_x - token / 2:.0f} {token_y:.0f}" '
            f'stroke="#E58BFF" stroke-opacity=".13" stroke-width="1.5" fill="none"/>'
        )
    words = []
    x = token_x + token / 2 + 36
    for w in (150, 96, 190, 120):
        words.append(f'<rect x="{x}" y="{token_y - 26}" width="{w}" height="52" rx="26" fill="none" stroke="#ffffff" stroke-opacity=".28" stroke-width="3"/>')
        x += w + 28
    tok = (
        f'<rect x="{token_x - token / 2 - 22}" y="{token_y - token / 2 - 22}" width="{token + 44}" height="{token + 44}" rx="34" fill="#E58BFF" fill-opacity=".12"/>'
        f'<rect x="{token_x - token / 2}" y="{token_y - token / 2}" width="{token}" height="{token}" rx="22" fill="#E58BFF"/>'
    )
    return svg("".join(streams) + "".join(tiles) + tok + "".join(words), "#120d1f")


def case2rl():
    """A branching decision tree: ask, examine, test, decide; one scored path highlighted."""
    rng = np.random.default_rng(5)
    levels = [1, 3, 7, 12, 16]
    xs = [360, 790, 1220, 1650, 2080]
    nodes = []
    for n, x in zip(levels, xs):
        spread = min(760, 150 * n)
        ys = [470] if n == 1 else list(np.linspace(470 - spread / 2, 470 + spread / 2, n))
        nodes.append([(x, y) for y in ys])
    edges = []
    for d in range(1, len(levels)):
        prev, cur = nodes[d - 1], nodes[d]
        for j, (x, y) in enumerate(cur):
            i = int(round(j * (len(prev) - 1) / max(1, len(cur) - 1)))
            i = int(np.clip(i + rng.integers(-1, 2), 0, len(prev) - 1))
            edges.append((d, i, j))
    best = {0: 0}
    for d in range(1, len(levels)):
        choices = [j for (dd, i, j) in edges if dd == d and i == best[d - 1]]
        best[d] = choices[len(choices) // 2] if choices else int(len(nodes[d]) // 2)
        if not choices:
            edges.append((d, best[d - 1], best[d]))
    parts = []
    for d, i, j in edges:
        (x0, y0), (x1, y1) = nodes[d - 1][i], nodes[d][j]
        mx = (x0 + x1) / 2
        on = best[d - 1] == i and best[d] == j
        parts.append(
            f'<path d="M{x0:.0f} {y0:.0f} C{mx:.0f} {y0:.0f} {mx:.0f} {y1:.0f} {x1:.0f} {y1:.0f}" fill="none" '
            + ('stroke="url(#route)" stroke-width="7" stroke-linecap="round"/>' if on else 'stroke="#ffffff" stroke-opacity=".16" stroke-width="2.5"/>')
        )
    for d, level in enumerate(nodes):
        for j, (x, y) in enumerate(level):
            on = best[d] == j
            if on:
                parts.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="30" fill="#1FD1A0" fill-opacity=".14"/>')
            parts.append(
                f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{13 if on else 8}" fill="{"#1FD1A0" if on else "#0a1716"}" '
                f'stroke="{"#1FD1A0" if on else "#ffffff"}" stroke-opacity="{1 if on else .35}" stroke-width="3"/>'
            )
    fx, fy = nodes[-1][best[len(levels) - 1]]
    parts.append(f'<circle cx="{fx:.0f}" cy="{fy:.0f}" r="44" fill="none" stroke="#1FD1A0" stroke-width="3" stroke-opacity=".6"/>')
    defs = '<linearGradient id="route" gradientUnits="userSpaceOnUse" x1="360" y1="0" x2="2080" y2="0"><stop offset="0" stop-color="#3AA0FF"/><stop offset="1" stop-color="#1FD1A0"/></linearGradient>'
    return svg("".join(parts), "#0a1716", defs)


def essay_trusting_parameters():
    """A population of dots stacked as a histogram around the average, with one individual set apart."""
    w, h = 1600, 900
    rng = np.random.default_rng(14)
    values = rng.normal(0, 1, 300)
    bins = np.clip(np.round(values / 0.3).astype(int), -9, 9)
    parts = [f'<line x1="{w / 2}" y1="120" x2="{w / 2}" y2="720" stroke="#ffffff" stroke-opacity=".3" stroke-width="2" stroke-dasharray="6 8"/>']
    counts = {}
    for b in bins:
        k = counts.get(b, 0)
        counts[b] = k + 1
        x, y = w / 2 + b * 34, 700 - k * 13
        parts.append(f'<circle cx="{x:.0f}" cy="{y:.1f}" r="5" fill="#9aabbb" fill-opacity=".5"/>')
    ix, iy = w / 2 + 11 * 34, 700
    parts.append(f'<circle cx="{ix:.0f}" cy="{iy:.0f}" r="26" fill="#3AA0FF" fill-opacity=".16"/>')
    parts.append(f'<circle cx="{ix:.0f}" cy="{iy:.0f}" r="9" fill="#3AA0FF"/>')
    return svg("".join(parts), "#0b1220", w=w, h=h, lift=False)


def essay_virtual_human():
    """One individual at the centre, surrounded by rings of measurements linked back to it."""
    w, h = 1600, 900
    rng = np.random.default_rng(13)
    cx, cy = w / 2, 430
    parts = []
    palette = ["#3AA0FF", "#1FD1A0", "#FF8A3D", "#E58BFF"]
    for ring, (radius, n) in enumerate(((130, 14), (230, 26), (330, 40))):
        for j in range(n):
            a = 2 * math.pi * j / n + ring * 0.21
            x, y = cx + radius * math.cos(a), cy + radius * 0.8 * math.sin(a)
            lit = rng.random() < 0.28
            if lit:
                parts.append(f'<line x1="{cx:.0f}" y1="{cy:.0f}" x2="{x:.0f}" y2="{y:.0f}" stroke="{palette[ring % 4]}" stroke-opacity=".22" stroke-width="1.5"/>')
            parts.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{5 if lit else 3.5}" fill="{palette[ring % 4] if lit else "#9aabbb"}" fill-opacity="{.95 if lit else .35}"/>')
    parts.append(f'<circle cx="{cx:.0f}" cy="{cy:.0f}" r="40" fill="#ffffff" fill-opacity=".08"/>')
    parts.append(f'<circle cx="{cx:.0f}" cy="{cy:.0f}" r="14" fill="#ffffff"/>')
    return svg("".join(parts), "#120d1f", w=w, h=h, lift=False)


def main():
    for name, build in (("pbisc", pbisc), ("rna-llm", rna_llm), ("case2rl", case2rl),
                        ("essay-trusting-parameters", essay_trusting_parameters), ("essay-virtual-human", essay_virtual_human)):
        path = OUT / f"{name}.svg"
        path.write_text(build())
        print(path.relative_to(ROOT), f"{path.stat().st_size / 1024:.0f} KiB")


if __name__ == "__main__":
    main()
