/* Render exact stored frames for 4K recordings; no interpolation or inference. */
(() => {
  "use strict";
  const ROOT = document.getElementById("recording");
  const KIND = new URLSearchParams(location.search).get("kind") || "cells";
  const URL_MANIFEST = new URL("/research/pbisc-diffusion/assets/interactive-v1/manifest.json", location.origin);
  const COLOR = { ink: "#19252d", muted: "#627078", line: "#dce3e7", grid: "#eff2f4", truth: "#b7bec5", hc: "#2563eb", sle: "#dc2626", neutral: "#9ca3af" };
  const DPR = 2;
  const cache = new Map();
  let meta, data, arrays, panels, progress, head, stepLabel, step = 0;
  window.recordingReady = false;

  function el(tag, className, text) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
  }
  function fetchData(url, json = false) {
    const key = String(url);
    if (!cache.has(key)) cache.set(key, fetch(url).then(response => {
      if (!response.ok) throw new Error(`Recorded data: HTTP ${response.status}`);
      return json ? response.json() : response.arrayBuffer();
    }));
    return cache.get(key);
  }
  async function loadArrays(descriptors) {
    const types = { float32: Float32Array, float64: Float64Array, uint8: Uint8Array };
    return Object.fromEntries(await Promise.all(Object.entries(descriptors).map(async ([key, d]) => {
      const Type = types[d.dtype];
      if (!Type) throw new Error(`Unsupported array ${d.dtype}`);
      const buffer = await fetchData(new URL(d.file, URL_MANIFEST));
      const offset = d.byte_offset || 0;
      if (offset + d.length * Type.BYTES_PER_ELEMENT > buffer.byteLength) throw new Error(`Incomplete array ${key}`);
      return [key, new Type(buffer, offset, d.length)];
    })));
  }
  function legend(label, color, ring = false) {
    const item = el("span", "rec-legend-item");
    const dot = el("i", `rec-dot${ring ? " rec-ring" : ""}`);
    if (color) dot.style.setProperty("--swatch", color);
    item.append(dot, document.createTextNode(label));
    return item;
  }
  function buildPanel(title, subtitle) {
    const box = el("figure", "rec-panel");
    const caption = el("figcaption", "rec-panel-head");
    const sub = el("span", "", subtitle);
    caption.append(el("strong", "", title), sub);
    const host = el("div", "rec-canvas-host");
    const canvas = el("canvas");
    canvas.setAttribute("aria-label", title);
    host.append(canvas); box.append(caption, host); panels.append(box);
    return { box, canvas, sub };
  }
  function build() {
    ROOT.className = `rec-${KIND}`;
    const top = el("div", "rec-top");
    top.append(el("span", "rec-brand", "Virtual Human Lab / PBISC-Diffusion"), el("span", "rec-top-meta", "Condition · Pseudobulk  /  ctx2048 · E12 · EMA"));
    const hero = el("div", "rec-hero");
    const title = { cells: "From noise to cells", single: "One cell, gene by gene", volcano: "SLE vs HC" }[KIND];
    hero.append(el("h1", "", title));
    const summary = el("div", "rec-summary");
    const labels = KIND === "cells" ? [`${data.count.toLocaleString()} generated cells`, `${data.real_count.toLocaleString()} ground-truth cells`] : KIND === "single" ? [data.label, `${data.genes.toLocaleString()} genes`, "1 cell"] : [`${Math.max(...data.eligible_SLE) + Math.max(...data.eligible_HC)} donors`, `${data.genes.toLocaleString()} genes / panel`, "PBMC5 + Other"];
    labels.forEach(label => summary.append(el("span", "", label)));
    hero.append(summary);
    const legends = el("div", "rec-legend");
    if (KIND === "cells") {
      meta.labels.forEach((label, i) => legends.append(legend(label, meta.colors[i])));
      legends.append(legend("Ground truth", COLOR.truth), el("span", "rec-legend-note", "Color = final cell type"));
    } else if (KIND === "single") {
      legends.append(el("span", "rec-legend-note", "One tile = one gene · Fixed gene order"));
    } else {
      legends.append(legend("HC higher", COLOR.hc), legend("SLE higher", COLOR.sle), legend(`IFNα · ${data.highlight.filter(Boolean).length}`, null, true), legend("Zero / not estimable", COLOR.neutral), el("span", "rec-legend-note", "Dot = gene · Ground truth · upper-right inset"));
    }
    panels = el("div", "rec-panels");
    const transport = el("div", "rec-transport");
    const track = el("div", "rec-progress");
    progress = el("div", "rec-progress-fill"); head = el("i", "rec-progress-head");
    track.append(progress, head); stepLabel = el("span", "rec-step");
    transport.append(el("span", "rec-recorded", "Recorded run"), track, stepLabel);
    ROOT.replaceChildren(top, hero, legends, panels, transport);
    if (KIND === "cells") return [buildPanel("PCA", ""), buildPanel("UMAP", "")];
    if (KIND === "single") {
      const generated = buildPanel("Noisy state", "");
      const truth = buildPanel("Ground truth", "Nearest real cell at final step");
      const footer = el("div", "rec-heat-footer");
      const scale = el("span", "rec-scale");
      const bar = el("i", "rec-scale-bar");
      bar.style.background = `linear-gradient(90deg, ${data.colormap.map(rgb => `rgb(${rgb.join(",")})`).join(",")})`;
      scale.append(document.createTextNode("0"), bar, document.createTextNode(`${data.vmax} · log1p(CP10k)`));
      footer.append(scale); generated.box.append(footer);
      const truthFooter = el("div", "rec-heat-footer");
      truthFooter.append(el("span", "", "Endpoint-matched · Fixed")); truth.box.append(truthFooter);
      const trace = el("div", "rec-trace");
      const traceLabel = el("div", "rec-trace-label");
      truth.cosine = el("span", "rec-cosine");
      traceLabel.append(el("span", "", "Cosine · All genes"), truth.cosine);
      const traceHost = el("div", "rec-canvas-host");
      truth.trace = el("canvas"); truth.trace.setAttribute("aria-label", "Cosine similarity to the fixed ground-truth cell");
      traceHost.append(truth.trace); trace.append(traceLabel, traceHost); ROOT.insertBefore(trace, transport);
      return [generated, truth];
    }
    return data.types.map((type, i) => buildPanel(type.label, `SLE ${data.eligible_SLE[i]} / HC ${data.eligible_HC[i]} donors`));
  }
  function context(canvas) {
    const host = canvas.parentElement.getBoundingClientRect();
    const width = host.width, height = host.height;
    canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
    if (canvas.width !== Math.round(width * DPR) || canvas.height !== Math.round(height * DPR)) {
      canvas.width = Math.round(width * DPR); canvas.height = Math.round(height * DPR);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, width, height);
    return { ctx, width, height };
  }
  function tick(v) { return Math.abs(v) < 100 ? v.toFixed(1).replace(/\.0$/, "") : Math.round(v).toLocaleString(); }
  function plotAxes(surface, bounds, xLabel, yLabel, equalAspect = false, compact = false) {
    const { ctx, width, height } = surface;
    let left = compact ? 42 : 58, right = width - 20, top = compact ? 8 : 15, bottom = height - (compact ? 39 : 47);
    if (equalAspect) {
      const dx = bounds.x[1] - bounds.x[0], dy = bounds.y[1] - bounds.y[0];
      const scale = Math.min((right - left) / dx, (bottom - top) / dy), cx = (left + right) / 2, cy = (top + bottom) / 2;
      left = cx - dx * scale / 2; right = cx + dx * scale / 2; top = cy - dy * scale / 2; bottom = cy + dy * scale / 2;
    }
    const x = v => left + (v - bounds.x[0]) / (bounds.x[1] - bounds.x[0]) * (right - left);
    const y = v => bottom - (v - bounds.y[0]) / (bounds.y[1] - bounds.y[0]) * (bottom - top);
    ctx.lineWidth = 1; ctx.font = `${compact ? 12 : 15}px "IBM Plex Mono", monospace`;
    for (let i = 0; i <= 4; i++) {
      const xv = bounds.x[0] + (bounds.x[1] - bounds.x[0]) * i / 4, yv = bounds.y[0] + (bounds.y[1] - bounds.y[0]) * i / 4;
      ctx.strokeStyle = COLOR.grid; ctx.beginPath(); ctx.moveTo(x(xv), top); ctx.lineTo(x(xv), bottom); ctx.moveTo(left, y(yv)); ctx.lineTo(right, y(yv)); ctx.stroke();
      ctx.fillStyle = COLOR.muted; ctx.textAlign = "center"; ctx.fillText(tick(xv), x(xv), bottom + (compact ? 16 : 21));
      ctx.textAlign = "right"; ctx.fillText(tick(yv), left - 8, y(yv) + 4);
    }
    ctx.strokeStyle = COLOR.line; ctx.strokeRect(left, top, right - left, bottom - top);
    ctx.fillStyle = COLOR.muted; ctx.textAlign = "center"; ctx.font = `${compact ? 13 : 16}px "Figtree", sans-serif`;
    ctx.fillText(xLabel, (left + right) / 2, height - 3);
    ctx.save(); ctx.translate(compact ? 11 : 15, (top + bottom) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(yLabel, 0, 0); ctx.restore();
    return { ...surface, left, right, top, bottom, x, y, bounds };
  }
  function dot(ctx, x, y, radius) { ctx.moveTo(x + radius, y); ctx.arc(x, y, radius, 0, Math.PI * 2); }
  function clip(plot) {
    const { ctx } = plot; ctx.save(); ctx.beginPath(); ctx.rect(plot.left, plot.top, plot.right - plot.left, plot.bottom - plot.top); ctx.clip();
  }
  function drawCells(views) {
    const counts = Array(meta.labels.length).fill(0); data.labels.forEach(i => counts[i]++);
    const results = {};
    ["pca", "umap"].forEach((key, index) => {
      const time = (index ? data.prediction_times : data.state_times)[step];
      views[index].sub.textContent = `${index ? "Expression estimate" : "Noisy state"} · t ${time.toFixed(2)}`;
      const plot = plotAxes(context(views[index].canvas), data.bounds[key], index ? "UMAP1" : "PC1", index ? "UMAP2" : "PC2", true);
      const { ctx, x, y } = plot;
      clip(plot); ctx.globalAlpha = .6; ctx.fillStyle = COLOR.truth; ctx.beginPath();
      const truth = arrays[`real_${key}`];
      for (let i = 0; i < data.real_count; i++) dot(ctx, x(truth[i * 2]), y(truth[i * 2 + 1]), 2.05);
      ctx.fill();
      const positions = arrays[key], offset = step * data.count * 2;
      for (let type = 0; type < meta.labels.length; type++) {
        ctx.fillStyle = meta.colors[type]; ctx.globalAlpha = .64; ctx.beginPath();
        for (let i = 0; i < data.count; i++) if (data.labels[i] === type) dot(ctx, x(positions[offset + i * 2]), y(positions[offset + i * 2 + 1]), 2.05);
        ctx.fill();
      }
      ctx.restore();
      results[key] = { time, generated: data.count, groundTruth: data.real_count, firstGenerated: Array.from(positions.slice(offset, offset + 2)), bounds: data.bounds[key], scaleX: (plot.right - plot.left) / (data.bounds[key].x[1] - data.bounds[key].x[0]), scaleY: (plot.bottom - plot.top) / (data.bounds[key].y[1] - data.bounds[key].y[0]) };
    });
    return { generated: data.count, groundTruth: data.real_count, typeCounts: counts, colors: meta.colors, groundTruthColor: COLOR.truth, panels: results };
  }
  function drawSingle(views) {
    const cols = 75, rows = Math.ceil(data.genes / cols);
    views[0].sub.textContent = `${data.label} · t ${data.state_times[step].toFixed(2)}`;
    views[1].cosine.textContent = data.similarity[step].toFixed(3);
    views.forEach((view, index) => {
      const { ctx, width, height } = context(view.canvas);
      const tile = Math.min((width - 20) / cols, (height - 8) / rows);
      const left = (width - tile * cols) / 2, top = (height - tile * rows) / 2;
      const values = index ? arrays.truth : arrays.expression, offset = index ? 0 : step * data.genes;
      for (let i = 0; i < rows * cols; i++) {
        if (i < data.genes) {
          const value = values[offset + data.order[i]];
          const rgb = data.colormap[Math.max(0, Math.min(255, Math.round(value / data.vmax * 255)))];
          ctx.fillStyle = `rgb(${rgb.join(",")})`;
        } else ctx.fillStyle = "#eff2f4";
        ctx.fillRect(left + (i % cols) * tile, top + Math.floor(i / cols) * tile, tile - .65, tile - .65);
      }
    });
    const { ctx, width, height } = context(views[1].trace);
    const left = 25, right = width - 15, top = 8, bottom = height - 20;
    const x = i => left + i / meta.steps * (right - left), y = value => bottom - value * (bottom - top);
    ctx.strokeStyle = COLOR.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(left, bottom); ctx.lineTo(right, bottom); ctx.stroke();
    ctx.font = '12px "IBM Plex Mono", monospace'; ctx.fillStyle = COLOR.muted; ctx.textAlign = "right";
    ctx.fillText("0", left - 8, y(0) + 4); ctx.fillText("1", left - 8, y(1) + 4);
    ctx.textAlign = "center"; ctx.fillText("0", left, height - 2); ctx.fillText("50", right, height - 2);
    ctx.strokeStyle = "#d2dbe0"; ctx.lineWidth = 2; ctx.beginPath();
    data.similarity.forEach((value, i) => i ? ctx.lineTo(x(i), y(value)) : ctx.moveTo(x(i), y(value))); ctx.stroke();
    ctx.strokeStyle = COLOR.ink; ctx.lineWidth = 2.3; ctx.beginPath();
    for (let i = 0; i <= step; i++) i ? ctx.lineTo(x(i), y(data.similarity[i])) : ctx.moveTo(x(i), y(data.similarity[i]));
    ctx.stroke(); ctx.fillStyle = COLOR.ink; ctx.beginPath(); dot(ctx, x(step), y(data.similarity[step]), 4); ctx.fill();
    return { cells: 1, generatedIndex: 0, groundTruth: 1, label: data.label, genes: data.genes, drawnGenes: data.order.length, grid: [rows, cols], padding: rows * cols - data.genes, stateTime: data.state_times[step], cosine: data.similarity[step], trace: { fullPoints: data.similarity.length, prefixPoints: step + 1, bounds: { x: [0, 50], y: [0, 1] } }, vmax: data.vmax, units: data.units, comparator: data.comparator, firstGeneIndex: data.order[0], firstExpression: arrays.expression[step * data.genes + data.order[0]], firstTruth: arrays.truth[data.order[0]] };
  }
  function volcanoPoints(plot, values, truth, status, radius) {
    const { ctx, x, y } = plot, offset = truth ? 0 : step * data.genes;
    const summary = { plotted: 0, highlighted: 0, hc: 0, sle: 0, neutral: 0, status };
    if (status === "insufficient_donors") return summary;
    const effect = values[truth ? "truth_effect" : "effect"], q = values[truth ? "truth_q" : "q"], estimable = values[truth ? "truth_estimable" : "estimable"];
    clip(plot);
    ctx.strokeStyle = "#b3bdc4"; ctx.lineWidth = 1; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(x(0), plot.top); ctx.lineTo(x(0), plot.bottom); ctx.moveTo(plot.left, y(-Math.log10(.05))); ctx.lineTo(plot.right, y(-Math.log10(.05))); ctx.stroke(); ctx.setLineDash([]);
    for (let highlighted = 0; highlighted <= 1; highlighted++) {
      for (let direction = -1; direction <= 1; direction++) {
        ctx.fillStyle = direction < 0 ? COLOR.hc : direction > 0 ? COLOR.sle : COLOR.neutral; ctx.globalAlpha = highlighted ? .95 : .48; ctx.beginPath();
        for (let i = 0; i < data.genes; i++) {
          if (Boolean(data.highlight[i]) !== Boolean(highlighted)) continue;
          const effectValue = effect[offset + i], qValue = q[offset + i];
          if (!Number.isFinite(effectValue) || !Number.isFinite(qValue) || (estimable[offset + i] ? Math.sign(effectValue) : 0) !== direction) continue;
          dot(ctx, x(effectValue), y(-Math.log10(Math.max(qValue, 1e-300))), radius * (highlighted ? 1.5 : 1));
          summary.plotted++; summary.highlighted += highlighted; summary[direction < 0 ? "hc" : direction > 0 ? "sle" : "neutral"]++;
        }
        ctx.fill();
        if (highlighted) { ctx.globalAlpha = 1; ctx.strokeStyle = COLOR.ink; ctx.lineWidth = radius < 1 ? .45 : .75; ctx.stroke(); }
      }
    }
    ctx.restore(); return summary;
  }
  function drawVolcano(views) {
    const results = data.types.map((type, index) => {
      const surface = context(views[index].canvas), { ctx, width } = surface;
      const plot = plotAxes(surface, data.bounds, "log₂ FC · SLE / HC", "−log₁₀ FDR", false, true);
      const generated = volcanoPoints(plot, arrays[index], false, type.status[step], 1.8);
      if (type.status[step] === "insufficient_donors") {
        ctx.fillStyle = COLOR.muted; ctx.textAlign = "center"; ctx.font = '21px "Figtree", sans-serif';
        ctx.fillText("N/A", (plot.left + plot.right) / 2, (plot.top + plot.bottom) / 2 - 3);
        ctx.font = '15px "Figtree", sans-serif'; ctx.fillText("Insufficient donors", (plot.left + plot.right) / 2, (plot.top + plot.bottom) / 2 + 23);
      }
      // The fixed reference inset uses the same data bounds as the main plot.
      const iw = 143, ih = 101, ix = width - iw - 22, iy = 6;
      ctx.fillStyle = "#fff"; ctx.fillRect(ix, iy, iw, ih); ctx.strokeStyle = COLOR.line; ctx.lineWidth = 1; ctx.strokeRect(ix, iy, iw, ih);
      ctx.fillStyle = COLOR.muted; ctx.font = '12px "Figtree", sans-serif'; ctx.textAlign = "left"; ctx.fillText("Ground truth", ix + 8, iy + 16);
      const inset = { ctx, left: ix + 8, right: ix + iw - 8, top: iy + 24, bottom: iy + ih - 8 };
      inset.x = v => inset.left + (v - data.bounds.x[0]) / (data.bounds.x[1] - data.bounds.x[0]) * (inset.right - inset.left);
      inset.y = v => inset.bottom - (v - data.bounds.y[0]) / (data.bounds.y[1] - data.bounds.y[0]) * (inset.bottom - inset.top);
      const truth = volcanoPoints(inset, arrays[index], true, type.truth_status, .72);
      if (type.truth_status === "insufficient_donors") { ctx.fillStyle = COLOR.muted; ctx.textAlign = "center"; ctx.font = '14px "Figtree", sans-serif'; ctx.fillText("N/A", ix + iw / 2, iy + 64); }
      return { label: type.label, donorsSLE: data.eligible_SLE[index], donorsHC: data.eligible_HC[index], generated, truth };
    });
    return { predictionTime: data.prediction_times[step], genes: data.genes, bounds: data.bounds, colors: { hc: COLOR.hc, sle: COLOR.sle, neutral: COLOR.neutral }, highlightCount: data.highlight.filter(Boolean).length, types: results };
  }
  async function init() {
    if (!ROOT || !["cells", "single", "volcano"].includes(KIND)) throw new Error("Invalid recording surface");
    ROOT.append(el("p", "rec-loading", "Loading recorded data…"));
    meta = await fetchData(URL_MANIFEST, true);
    if (meta.schema_version !== "pbisc.interactive_figures.v1") throw new Error("Unsupported recording data");
    data = meta[KIND];
    arrays = KIND === "volcano" ? await Promise.all(data.types.map(type => loadArrays(type.arrays))) : await loadArrays(data.arrays);
    const views = build();
    await Promise.all([document.fonts.load('500 48px "Figtree"'), document.fonts.load('400 20px "Figtree"'), document.fonts.load('400 20px "IBM Plex Mono"')]);
    await document.fonts.ready;
    window.setRecordingStep = requested => {
      if (!Number.isInteger(requested) || requested < 0 || requested > meta.steps) throw new RangeError("Recording step must be 0–50");
      step = requested;
      progress.style.width = `${step / meta.steps * 100}%`; head.style.left = `${step / meta.steps * 100}%`;
      stepLabel.textContent = `Step ${String(step).padStart(2, "0")} / ${meta.steps}${KIND === "volcano" ? ` · t ${data.prediction_times[step].toFixed(2)}` : ""}`;
      const detail = KIND === "cells" ? drawCells(views) : KIND === "single" ? drawSingle(views) : drawVolcano(views);
      window.recordingInfo = { kind: KIND, step, steps: meta.steps, frames: meta.frames, logicalSize: [1920, 1080], canvasDPR: DPR, background: "#fff", source: URL_MANIFEST.href, ...detail };
      ROOT.dataset.step = String(step);
      return window.recordingInfo;
    };
    // QA may inspect arbitrary source values without exporting entire arrays.
    window.recordingSample = (key, index, type = 0) => (KIND === "volcano" ? arrays[type] : arrays)[key][index];
    window.setRecordingStep(0);
    window.recordingReady = true;
  }
  init().catch(error => { window.recordingError = String(error); if (ROOT) ROOT.textContent = `Recording unavailable: ${error.message}`; throw error; });
})();
