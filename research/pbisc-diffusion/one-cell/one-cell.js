/* One cell, step by step: an interactive view of one recorded PBISC-Diffusion sampling run.
   Data: assets/one-cell-v2/ (built by prepare_one_cell_page.py from the recorded run; no new inference). */
(() => {
  "use strict";

  const root = document.querySelector("[data-one-cell]");
  if (!root) return;
  const BASE = root.dataset.assets;
  const KO = document.documentElement.lang === "ko";
  const TXT = KO ? {
    loading: "기록된 데이터를 불러오는 중…",
    failed: "데이터를 불러오지 못했습니다.",
    step: (s, n, t) => `${s} / ${n}단계 · t = ${t}`,
    play: "재생", pause: "일시정지",
    settledBoth: (type, a, b) => `예측은 ${a}단계에서 ${type}로 정해지고, 노이즈 상태는 ${b}단계에서야 따라옵니다.`,
    settledPred: (type, a) => `예측은 ${a}단계에서 ${type}로 정해집니다. 노이즈 상태는 끝까지 기준을 넘지 못합니다.`,
    notYet: "아직 정해진 세포 유형이 없습니다.",
    now: (type, s) => `${s}단계: 예측이 ${type}를 가리킵니다.`,
    noisy: "노이즈 상태", prediction: "예측", realAvg: "실제 평균",
    block: "블록", typical: "전형적인 실제 세포",
    band: (type) => `실제 ${type} 세포와 그 평균 (p10–p90)`,
    popSummary: (n, type, a, b) => `생성된 ${type} ${n.toLocaleString()}개 평균. 예측은 중앙값 ${a}단계, 노이즈 상태는 ${b}단계에서 유형이 정해집니다.`,
    threshold: "기준 0.5", refRow: (type) => `실제 ${type} 세포 평균 · 같은 donor`,
    stepAxis: "단계", cellOf: (type, i) => `${type} · 생성 세포 #${i}`,
  } : {
    loading: "Loading the recorded run…",
    failed: "The data could not be loaded.",
    step: (s, n, t) => `Step ${s} / ${n} · t = ${t}`,
    play: "Play", pause: "Pause",
    settledBoth: (type, a, b) => `The prediction settles on ${type} at step ${a}. The noisy state only catches up at step ${b}.`,
    settledPred: (type, a) => `The prediction settles on ${type} at step ${a}. The noisy state never passes the threshold.`,
    notYet: "No cell type has settled yet.",
    now: (type, s) => `Step ${s}: the prediction points to ${type}.`,
    noisy: "Noisy state", prediction: "Prediction", realAvg: "Real average",
    block: "block", typical: "typical real cell",
    band: (type) => `Real ${type} cells vs their average (p10–p90)`,
    popSummary: (n, type, a, b) => `Mean of all ${n.toLocaleString()} generated ${type}s. The prediction settles at step ${a} (median), the noisy state at step ${b}.`,
    threshold: "threshold 0.5", refRow: (type) => `Real ${type} cells, average · same donor`,
    stepAxis: "Step", cellOf: (type, i) => `${type} · generated cell #${i}`,
  };
  const COLOR = { "T cell": "#0072B2", "B cell": "#D55E00", "Monocyte": "#009E73", "NK cell": "#CC79A7", "DC": "#E69F00", "Other": "#56B4E9" };
  const BLOCK_COLOR = ["#0072B2", "#D55E00", "#009E73", "#CC79A7", "#E69F00", "#7C3AED", "#62645d", "#a7a498"];
  const BLOCK_SHORT = ["T", "B", "Mono", "NK", "DC", "IFN-α", "Shared", "Other"];
  const BLOCK_LABEL = ["T cell", "B cell", "Mono", "NK cell", "DC", "IFN-α", "Shared", "Other"];
  const KEY_BLOCKS = 7; // every block except "Other genes"
  const LABELS = ["T cell", "B cell", "Monocyte", "NK cell", "DC", "Other"];
  const INK = "#141512", MUTED = "#62645d", RULE = "#c5c3b9", PAPER = "#fffef8", ACCENT = "#f0522d";
  const SVGNS = "http://www.w3.org/2000/svg";

  const $ = (sel) => root.querySelector(sel);
  const el = (tag, attrs = {}, text) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const svg = (tag, attrs = {}) => {
    const node = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  };

  const S = { meta: null, ref: null, umap: null, bins: new Map(), cell: null, step: 0, genes: "key", source: "x0",
              playing: false, timer: null, hover: -1, layout: null };

  // ---------------------------------------------------------------- data
  const get = async (name, type) => {
    const res = await fetch(BASE + name);
    if (!res.ok) throw new Error(`${name}: ${res.status}`);
    return type === "json" ? res.json() : new Uint8Array(await res.arrayBuffer());
  };
  const G = () => S.meta.genes.symbols.length;
  const frames = () => S.meta.frames;
  const value = (byte) => byte / 255 * S.meta.value_max;
  const bytesOf = (row, step) => {  // row 0 = noisy state, 1 = prediction
    const g = G();
    const off = (row * frames() + step) * g;
    return S.bins.get(S.cell.slug).subarray(off, off + g);
  };
  const refBytes = (typeIndex) => S.ref.subarray(typeIndex * G(), (typeIndex + 1) * G());
  const typeIndex = (label) => S.meta.types.indexOf(label);

  // ---------------------------------------------------------------- heatmaps
  function layoutFor(width) {
    const narrow = width < 560;
    const gutter = narrow ? 50 : 76;
    const target = S.genes === "key" ? (narrow ? 11 : 15) : (narrow ? 5 : 7);
    const cols = Math.max(20, Math.floor((width - gutter) / target));
    const tile = (width - gutter) / cols;
    const blocks = S.meta.blocks.slice(0, S.genes === "key" ? KEY_BLOCKS : S.meta.blocks.length)
      .map((b, i) => ({ ...b, index: i })).filter((b) => b.count > 0);
    let y = 0;
    const gap = Math.max(4, Math.round(tile * 0.6));
    for (const b of blocks) {
      b.y = y;
      b.rows = Math.ceil(b.count / cols);
      y += b.rows * tile + gap;
    }
    return { width, gutter, cols, tile, blocks, height: Math.ceil(y - gap), narrow };
  }

  function sizeCanvas(canvas, w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.height = `${h}px`;
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  function drawMap(canvas, bytes) {
    const L = S.layout;
    const ctx = sizeCanvas(canvas, L.width, L.height);
    const lut = S.meta.colormap;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, L.width, L.height);
    const inset = L.tile >= 6 ? 1 : 0;
    ctx.font = `${L.narrow ? 10 : 11}px "IBM Plex Mono", monospace`;
    ctx.textBaseline = "top";
    for (const b of L.blocks) {
      ctx.fillStyle = BLOCK_COLOR[b.index];
      ctx.fillRect(0, b.y + 1, 3, Math.max(b.rows * L.tile - 2, 3));
      ctx.fillStyle = INK;
      ctx.fillText((L.narrow ? BLOCK_SHORT : BLOCK_LABEL)[b.index], 9, b.y + 1);
      ctx.fillStyle = MUTED;
      if (b.rows > 1) ctx.fillText(String(b.count), 9, b.y + 14);
      for (let j = 0; j < b.count; j++) {
        const gi = b.start + j;
        const x = L.gutter + (j % L.cols) * L.tile;
        const y = b.y + Math.floor(j / L.cols) * L.tile;
        ctx.fillStyle = lut[bytes[gi]];
        ctx.fillRect(x, y, L.tile - inset, L.tile - inset);
      }
    }
    if (S.hover >= 0) {
      const p = tileOf(S.hover);
      if (p) {
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 2;
        ctx.strokeRect(p.x - 1, p.y - 1, L.tile + 1, L.tile + 1);
      }
    }
  }

  function tileOf(gene) {
    const L = S.layout;
    const b = L.blocks.find((x) => gene >= x.start && gene < x.start + x.count);
    if (!b) return null;
    const j = gene - b.start;
    return { x: L.gutter + (j % L.cols) * L.tile, y: b.y + Math.floor(j / L.cols) * L.tile };
  }

  function geneAt(x, y) {
    const L = S.layout;
    if (x < L.gutter) return -1;
    const col = Math.floor((x - L.gutter) / L.tile);
    if (col < 0 || col >= L.cols) return -1;
    for (const b of L.blocks) {
      if (y >= b.y && y < b.y + b.rows * L.tile) {
        const j = Math.floor((y - b.y) / L.tile) * L.cols + col;
        return j < b.count ? b.start + j : -1;
      }
    }
    return -1;
  }

  const maps = () => [...root.querySelectorAll("canvas[data-map]")];

  function drawMaps() {
    const width = $(".one-cell-map").clientWidth;  // the figure: the panel's padding is not canvas
    if (!S.layout || S.layout.width !== width || S.layout.genes !== S.genes) {
      S.layout = layoutFor(width);
      S.layout.genes = S.genes;
    }
    const ti = typeIndex(S.cell.label);
    for (const c of maps()) {
      const kind = c.dataset.map;
      drawMap(c, kind === "xt" ? bytesOf(0, S.step) : kind === "x0" ? bytesOf(1, S.step) : refBytes(ti));
    }
  }

  function showTip(evt, canvas) {
    const r = canvas.getBoundingClientRect();
    const gene = geneAt(evt.clientX - r.left, evt.clientY - r.top);
    const tip = $(".one-cell-tip");
    if (gene !== S.hover) {
      S.hover = gene;
      drawMaps();
    }
    if (gene < 0) { tip.hidden = true; return; }
    const m = S.meta;
    const b = m.blocks[m.genes.block[gene]].name;
    const xt = value(bytesOf(0, S.step)[gene]).toFixed(2);
    const x0 = value(bytesOf(1, S.step)[gene]).toFixed(2);
    const rv = value(refBytes(typeIndex(S.cell.label))[gene]).toFixed(2);
    tip.replaceChildren(
      el("strong", {}, m.genes.symbols[gene]),
      el("span", {}, `${b} ${TXT.block}`),
      el("span", {}, `${TXT.noisy} ${xt} · ${TXT.prediction} ${x0} · ${TXT.realAvg} ${rv}`));
    tip.hidden = false;
    const host = $(".one-cell-maps").getBoundingClientRect();
    const x = Math.min(evt.clientX - host.left + 14, host.width - tip.offsetWidth - 4);
    tip.style.left = `${Math.max(4, x)}px`;
    tip.style.top = `${evt.clientY - host.top + 16}px`;
  }

  // ---------------------------------------------------------------- gauge
  const GAUGE_MAX = 1.4;
  function buildGauge() {
    const box = $(".one-cell-gauge-rows");
    box.replaceChildren();
    S.meta.types.forEach((type, k) => {
      const row = el("div", { class: "one-cell-gauge-row", "data-type": String(k) });
      row.style.setProperty("--type-color", COLOR[type]);
      const track = el("div", { class: "one-cell-gauge-track" });
      track.append(el("i", { class: "pred" }), el("i", { class: "noisy" }), el("b", { class: "tick", style: `left:${100 / GAUGE_MAX}%` }));
      row.append(el("span", { class: "one-cell-gauge-label" }, type), track, el("output", { class: "one-cell-gauge-value" }));
      box.append(row);
    });
  }

  function drawGauge() {
    const c = S.cell, s = S.step;
    const pred = c.gauge_x0[s], noisy = c.gauge_xt[s];
    const top = pred.indexOf(Math.max(...pred));
    root.querySelectorAll(".one-cell-gauge-row").forEach((row) => {
      const k = Number(row.dataset.type);
      const w = (v) => `${Math.max(0, Math.min(v, GAUGE_MAX)) / GAUGE_MAX * 100}%`;
      row.querySelector(".pred").style.width = w(pred[k]);
      row.querySelector(".noisy").style.width = w(noisy[k]);
      row.querySelector("output").textContent = pred[k].toFixed(2);
      row.classList.toggle("is-top", k === top && pred[k] >= 0.5);
    });
    const type = c.gauge_final_type;
    const callout = $(".one-cell-callout");
    if (s >= c.settled_x0) {
      callout.textContent = c.settled_xt <= S.meta.steps ? TXT.settledBoth(type, c.settled_x0, c.settled_xt) : TXT.settledPred(type, c.settled_x0);
    } else if (pred[top] >= 0.5) {
      callout.textContent = TXT.now(S.meta.types[top], s);
    } else {
      callout.textContent = TXT.notYet;
    }
  }

  // ---------------------------------------------------------------- UMAP inset
  let umapBackground = null;
  function umapFrame() {
    const pts = [...S.umap.reference, ...S.umap.generated];
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return { x0, x1, y0, y1 };
  }
  function drawUmap() {
    const canvas = $("canvas[data-umap]");
    const w = canvas.parentElement.clientWidth, h = Math.round(w * 0.78);
    const ctx = sizeCanvas(canvas, w, h);
    const f = S.umapFrame || (S.umapFrame = umapFrame());
    const pad = 12;
    const sc = Math.min((w - 2 * pad) / (f.x1 - f.x0), (h - 2 * pad) / (f.y1 - f.y0));
    const X = (x) => pad + (x - f.x0) * sc + ((w - 2 * pad) - (f.x1 - f.x0) * sc) / 2;
    const Y = (y) => h - pad - (y - f.y0) * sc - ((h - 2 * pad) - (f.y1 - f.y0) * sc) / 2;
    if (!umapBackground || umapBackground.w !== w) {
      const off = document.createElement("canvas");
      const octx = sizeCanvas(off, w, h);
      octx.fillStyle = PAPER;
      octx.fillRect(0, 0, w, h);
      octx.fillStyle = "rgba(156,163,175,0.35)";
      for (const [x, y] of S.umap.reference) octx.fillRect(X(x) - 1, Y(y) - 1, 2, 2);
      S.umap.generated.forEach(([x, y], i) => {
        octx.fillStyle = COLOR[LABELS[S.umap.generated_labels[i]]] + "40";
        octx.fillRect(X(x) - 1, Y(y) - 1, 2, 2);
      });
      umapBackground = { w, canvas: off };
    }
    ctx.drawImage(umapBackground.canvas, 0, 0, w, h);
    const path = S.cell.umap_path;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let s = 0; s <= S.step; s++) {
      const [x, y] = path[s];
      if (s === 0) ctx.moveTo(X(x), Y(y)); else ctx.lineTo(X(x), Y(y));
    }
    ctx.stroke();
    const [sx, sy] = path[0];
    ctx.strokeStyle = MUTED;
    ctx.strokeRect(X(sx) - 3, Y(sy) - 3, 6, 6);
    const [cx, cy] = path[S.step];
    ctx.fillStyle = PAPER;
    ctx.beginPath(); ctx.arc(X(cx), Y(cy), 6.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ACCENT;
    ctx.beginPath(); ctx.arc(X(cx), Y(cy), 4.5, 0, Math.PI * 2); ctx.fill();
  }

  // ---------------------------------------------------------------- line charts (SVG)
  function lineChart(host, { series, band, hlines = [], yMax = 1, yTicks = [0, 0.5, 1], label }) {
    const W = 360, H = 190, L = 34, R = 10, T = 10, B = 28;
    const n = S.meta.steps;
    const X = (s) => L + s / n * (W - L - R);
    const Y = (v) => T + (1 - Math.max(0, Math.min(v, yMax)) / yMax) * (H - T - B);
    const g = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": label });
    if (band) {
      g.append(svg("rect", { x: X(0), y: Y(band.p90), width: X(n) - X(0), height: Y(band.p10) - Y(band.p90), fill: "#9CA3AF", opacity: 0.25 }));
    }
    for (const t of yTicks) {
      g.append(svg("line", { x1: L, x2: W - R, y1: Y(t), y2: Y(t), stroke: RULE, "stroke-width": 0.6 }));
      const tx = svg("text", { x: L - 6, y: Y(t) + 3, "text-anchor": "end", class: "tick" }); tx.textContent = String(t); g.append(tx);
    }
    for (const h of hlines) {
      g.append(svg("line", { x1: L, x2: W - R, y1: Y(h.v), y2: Y(h.v), stroke: MUTED, "stroke-dasharray": "2 3", "stroke-width": 0.8 }));
      const tx = svg("text", { x: W - R, y: Y(h.v) - 4, "text-anchor": "end", class: "tick" }); tx.textContent = h.label; g.append(tx);
    }
    for (const s of [0, 10, 20, 30, 40, 50]) {
      const tx = svg("text", { x: X(s), y: H - 10, "text-anchor": "middle", class: "tick" }); tx.textContent = String(s); g.append(tx);
    }
    const ax = svg("text", { x: W - R, y: H - 1, "text-anchor": "end", class: "tick" }); ax.textContent = TXT.stepAxis; g.append(ax);
    for (const s of series) {
      const d = s.values.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
      g.append(svg("path", { d, fill: "none", stroke: s.color, "stroke-width": 2, "stroke-dasharray": s.dash || "none" }));
    }
    const cursor = svg("line", { y1: T, y2: H - B, stroke: ACCENT, "stroke-width": 1.2, class: "cursor" });
    g.append(cursor);
    const dots = series.map((s) => { const c = svg("circle", { r: 3.5, fill: s.color }); g.append(c); return c; });
    host.replaceChildren(g);
    return (step) => {
      cursor.setAttribute("x1", X(step)); cursor.setAttribute("x2", X(step));
      dots.forEach((c, i) => { c.setAttribute("cx", X(step)); c.setAttribute("cy", Y(series[i].values[step])); });
    };
  }

  let moveSimilarity = null, movePopulation = null;
  function buildCharts() {
    const c = S.cell, type = c.label, color = COLOR[type];
    const band = S.meta.similarity_band[type];
    moveSimilarity = lineChart($(".one-cell-similarity-chart"), {
      series: [{ values: c.similarity_x0, color }, { values: c.similarity_xt, color: MUTED, dash: "4 3" }],
      band, label: TXT.band(type) });
    $(".one-cell-similarity-band").textContent = TXT.band(type);
    const pop = S.meta.population;
    const curve = pop.mean_own_type_score_by_step[type];
    movePopulation = lineChart($(".one-cell-population-chart"), {
      series: [{ values: curve.prediction, color }, { values: curve.noisy_state, color: MUTED, dash: "4 3" }],
      yMax: 1.2, yTicks: [0, 0.5, 1], hlines: [{ v: 1, label: TXT.typical }], label: type });
    const n = pop.settle_step_prediction_by_type[type].n;
    $(".one-cell-population-summary").textContent = TXT.popSummary(n, type,
      pop.settle_step_prediction_by_type[type].median, pop.settle_step_noisy_by_type[type].median);
  }

  // ---------------------------------------------------------------- marker bars
  function buildMarkers() {
    const box = $(".one-cell-marker-grid");
    box.replaceChildren();
    let group = null, list = null;
    for (const m of S.meta.markers) {
      if (m.group !== group) {
        group = m.group;
        const g = el("div", { class: "one-cell-marker-group" });
        g.style.setProperty("--type-color", COLOR[group] || BLOCK_COLOR[5]);
        g.append(el("h4", {}, group));
        list = el("div", { class: "one-cell-marker-list" });
        g.append(list);
        box.append(g);
      }
      const row = el("div", { class: "one-cell-marker", "data-pos": String(m.position) });
      const track = el("div", { class: "one-cell-marker-track" });
      track.append(el("i", { class: "ghost" }), el("i", { class: "bar" }));
      row.append(el("span", { class: "sym" }, m.symbol), track, el("output"));
      list.append(row);
    }
  }

  function drawMarkers() {
    const bytes = bytesOf(S.source === "x0" ? 1 : 0, S.step);
    const ref = refBytes(typeIndex(S.cell.label));
    root.querySelectorAll(".one-cell-marker").forEach((row) => {
      const p = Number(row.dataset.pos);
      row.querySelector(".bar").style.width = `${bytes[p] / 255 * 100}%`;
      row.querySelector(".ghost").style.width = `${ref[p] / 255 * 100}%`;
      row.querySelector("output").textContent = value(bytes[p]).toFixed(1);
    });
    root.querySelectorAll(".one-cell-ref-label").forEach((n) => { n.textContent = TXT.refRow(S.cell.label); });
  }

  function fillStats() {
    const m = S.meta, p = m.population;
    const r = (v) => String(Math.round(v));
    const pct = (v) => `${(v * 100).toFixed(1)}%`;
    const values = {
      "cells": p.tracked_cells.toLocaleString(),
      "real-cells": p.observed_nearest_other_observed_cosine.n.toLocaleString(),
      "settle-pred": r(p.settle_step_prediction.median),
      "settle-pred-range": `${r(p.settle_step_prediction.p10)}–${r(p.settle_step_prediction.p90)}`,
      "settle-noisy": r(p.settle_step_noisy_state.median),
      "settle-noisy-range": `${r(p.settle_step_noisy_state.p10)}–${r(p.settle_step_noisy_state.p90)}`,
      "never": p.never_settled_prediction.toLocaleString(),
      "agree-real": pct(p.gauge_agrees_with_scanvi_observed),
      "agree-endpoint": pct(p.gauge_agrees_with_scanvi_endpoint),
      "nn-median": p.observed_nearest_other_observed_cosine.median.toFixed(2),
      "nn-max": p.observed_nearest_other_observed_max.toFixed(2),
      "vmax": String(m.value_max),
      "key-genes": m.blocks.slice(0, KEY_BLOCKS).reduce((a, b) => a + b.count, 0).toLocaleString(),
      "all-genes": G().toLocaleString(),
      "steps": String(m.steps),
    };
    root.querySelectorAll("[data-stat]").forEach((n) => {
      if (values[n.dataset.stat] !== undefined) n.textContent = values[n.dataset.stat];
    });
    document.querySelectorAll(".one-cell-methods [data-stat]").forEach((n) => {
      if (values[n.dataset.stat] !== undefined) n.textContent = values[n.dataset.stat];
    });
  }

  // ---------------------------------------------------------------- transport
  function render() {
    const t = S.meta.state_times[S.step].toFixed(2);
    $(".one-cell-readout").textContent = TXT.step(String(S.step).padStart(2, "0"), S.meta.steps, t);
    const slider = $(".one-cell-slider");
    slider.value = String(S.step);
    slider.setAttribute("aria-valuetext", TXT.step(S.step, S.meta.steps, t));
    drawMaps();
    drawGauge();
    drawUmap();
    drawMarkers();
    if (moveSimilarity) moveSimilarity(S.step);
    if (movePopulation) movePopulation(S.step);
  }

  function setStep(s) {
    S.step = Math.max(0, Math.min(S.meta.steps, s));
    render();
  }

  function setPlaying(on) {
    S.playing = on;
    const btn = $(".one-cell-play");
    btn.textContent = on ? TXT.pause : TXT.play;
    btn.setAttribute("aria-pressed", String(on));
    clearInterval(S.timer);
    if (on) {
      if (S.step >= S.meta.steps) setStep(0);
      S.timer = setInterval(() => {
        if (S.step >= S.meta.steps) { setPlaying(false); return; }
        setStep(S.step + 1);
      }, 140);
    }
  }

  async function selectCell(slug) {
    const cell = S.meta.cells.find((c) => c.slug === slug) || S.meta.cells.find((c) => c.slug === "monocyte") || S.meta.cells[0];
    if (!S.bins.has(cell.slug)) S.bins.set(cell.slug, await get(cell.file));
    S.cell = cell;
    root.querySelectorAll(".one-cell-picker button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.slug === cell.slug)));
    $(".one-cell-cell-title").textContent = TXT.cellOf(cell.label, cell.tracked_index);
    if (location.hash.slice(1) !== cell.slug) history.replaceState(null, "", `#${cell.slug}`);
    buildCharts();
    render();
  }

  function buildPicker() {
    const box = $(".one-cell-picker");
    box.replaceChildren();
    for (const c of S.meta.cells) {
      const b = el("button", { type: "button", "data-slug": c.slug, "aria-pressed": "false" });
      b.style.setProperty("--type-color", COLOR[c.label]);
      b.append(el("i", { "aria-hidden": "true" }), document.createTextNode(c.label));
      b.addEventListener("click", () => { setPlaying(false); selectCell(c.slug); });
      box.append(b);
    }
  }

  function bind() {
    $(".one-cell-play").addEventListener("click", () => setPlaying(!S.playing));
    $(".one-cell-prev").addEventListener("click", () => { setPlaying(false); setStep(S.step - 1); });
    $(".one-cell-next").addEventListener("click", () => { setPlaying(false); setStep(S.step + 1); });
    const slider = $(".one-cell-slider");
    slider.max = String(S.meta.steps);
    slider.addEventListener("input", () => { setPlaying(false); setStep(Number(slider.value)); });
    root.querySelectorAll("[data-genes]").forEach((b) => b.addEventListener("click", () => {
      S.genes = b.dataset.genes;
      root.querySelectorAll("[data-genes]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      S.hover = -1;
      $(".one-cell-tip").hidden = true;
      drawMaps();
    }));
    root.querySelectorAll("[data-source]").forEach((b) => b.addEventListener("click", () => {
      S.source = b.dataset.source;
      root.querySelectorAll("[data-source]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      drawMarkers();
    }));
    for (const c of maps()) {
      c.addEventListener("pointermove", (e) => showTip(e, c));
      c.addEventListener("pointerdown", (e) => showTip(e, c));
      c.addEventListener("pointerleave", () => { S.hover = -1; $(".one-cell-tip").hidden = true; drawMaps(); });
    }
    let raf = 0;
    new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { if (S.cell) { S.layout = null; render(); } });
    }).observe($(".one-cell-maps"));
    window.addEventListener("hashchange", () => {
      const slug = location.hash.slice(1);
      if (S.cell && slug && slug !== S.cell.slug && S.meta.cells.some((c) => c.slug === slug)) selectCell(slug);
    });
  }

  async function start() {
    const status = $(".one-cell-status");
    status.textContent = TXT.loading;
    try {
      [S.meta, S.ref, S.umap] = await Promise.all([get("meta.json", "json"), get("reference.bin"), get("umap.json", "json")]);
      fillStats();
      buildPicker();
      buildGauge();
      buildMarkers();
      bind();
      await selectCell(location.hash.slice(1));
      status.hidden = true;
      root.classList.add("is-ready");
    } catch (err) {
      status.textContent = `${TXT.failed} (${err.message})`;
    }
  }

  start();
})();
