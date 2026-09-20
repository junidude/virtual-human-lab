/* Exact recorded frames: no interpolation, inference, or point synthesis. */
(() => {
  "use strict";
  const mounts = [...document.querySelectorAll(".pbx[data-kind][data-manifest]")];
  if (!mounts.length) return;
  const KO = document.documentElement.lang.startsWith("ko");
  const T = KO ? {
    loading: "데이터 로딩…", failed: "로딩 실패 · 아래 원본 영상 이용", retry: "다시 시도",
    play: "재생", pause: "정지", previous: "이전 단계", next: "다음 단계", speed: "재생 속도", step: "단계",
    all: "전체", groundTruth: "Ground truth", generated: "Generated", fixed: "고정", cells: "세포",
    noisy: "노이즈 상태", estimate: "발현 예측", named: "주요 유전자 · 416", allGenes: "전체 · 2,980",
    search: "유전자 검색", find: "찾기", clear: "해제", select: "유전자 선택 · Hover / Tap / 검색",
    notFound: "일치하는 유전자 없음", nearest: "최종 최근접 세포 · 1개", cosine: "Cosine · 전체 유전자",
    allTested: "전체 유전자", ifna: "IFNα · 61", gene: "점 = 유전자", donors: "donor", unavailable: "N/A · donor 부족",
    hc: "HC 높음", sle: "SLE 높음", ifnaOutline: "IFNα 테두리", neutral: "동일 / 미정",
  } : {
    loading: "Loading recorded data…", failed: "Data unavailable · Original video below", retry: "Retry",
    play: "Play", pause: "Pause", previous: "Previous step", next: "Next step", speed: "Playback speed", step: "Step",
    all: "All", groundTruth: "Ground truth", generated: "Generated", fixed: "Fixed", cells: "cells",
    noisy: "Noisy state", estimate: "Expression estimate", named: "Key genes · 416", allGenes: "All · 2,980",
    search: "Find a gene", find: "Find", clear: "Clear", select: "Select a gene · Hover / Tap / Search",
    notFound: "No matching gene", nearest: "Nearest endpoint cell · 1 cell", cosine: "Cosine · All genes",
    allTested: "All genes", ifna: "IFNα · 61", gene: "Dot = gene", donors: "donors", unavailable: "N/A · Insufficient donors",
    hc: "HC higher", sle: "SLE higher", ifnaOutline: "IFNα outline", neutral: "Equal / undefined",
  };
  const C = { ink: "#19252d", muted: "#627078", line: "#dce3e7", blue: "#2563eb", red: "#dc2626", gray: "#9ca3af" };
  const BLOCK_COLORS = ["#0072B2", "#D55E00", "#009E73", "#CC79A7", "#E69F00", "#7C3AED", "#627078", "#9ca3af"];
  const BLOCK_NAMES = ["T", "B", "Mono", "NK", "DC", "IFNα", "Shared", "Other"];
  const cache = new Map();
  const widgets = new Set();
  let serial = 0;
  function node(tag, attrs = {}, text) {
    const result = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) result.setAttribute(key, value);
    if (text !== undefined) result.textContent = text;
    return result;
  }
  function button(text, action, attrs = {}) {
    const result = node("button", { type: "button", ...attrs }, text);
    result.addEventListener("click", action);
    return result;
  }
  function cached(url, json = false) {
    const key = `${json ? "json" : "bin"}:${url}`;
    if (!cache.has(key)) cache.set(key, fetch(url).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return json ? response.json() : response.arrayBuffer();
    }).catch((error) => { cache.delete(key); throw error; }));
    return cache.get(key);
  }
  function canvasContext(canvas, height) {
    const width = Math.max(1, canvas.getBoundingClientRect().width);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(width * dpr), h = Math.round(height * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return { ctx, width, height };
  }
  function axes(canvas, bounds, xLabel, yLabel, height = null, equalAspect = false) {
    const parentWidth = canvas.parentElement.clientWidth;
    const plot = canvasContext(canvas, height || Math.max(240, Math.min(390, parentWidth * .8)));
    const { ctx, width } = plot;
    let left = 48, right = width - 16, top = 13, bottom = plot.height - 39;
    if (equalAspect) {
      const dx = bounds.x[1] - bounds.x[0], dy = bounds.y[1] - bounds.y[0];
      const scale = Math.min((right - left) / dx, (bottom - top) / dy);
      const centerX = (left + right) / 2, centerY = (top + bottom) / 2;
      left = centerX - dx * scale / 2; right = centerX + dx * scale / 2;
      top = centerY - dy * scale / 2; bottom = centerY + dy * scale / 2;
    }
    const x = (v) => left + (v - bounds.x[0]) / (bounds.x[1] - bounds.x[0]) * (right - left);
    const y = (v) => bottom - (v - bounds.y[0]) / (bounds.y[1] - bounds.y[0]) * (bottom - top);
    ctx.font = '10px "IBM Plex Mono", monospace';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const xv = bounds.x[0] + (bounds.x[1] - bounds.x[0]) * i / 4;
      const yv = bounds.y[0] + (bounds.y[1] - bounds.y[0]) * i / 4;
      ctx.strokeStyle = "#eef1f4";
      ctx.beginPath(); ctx.moveTo(x(xv), top); ctx.lineTo(x(xv), bottom); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(left, y(yv)); ctx.lineTo(right, y(yv)); ctx.stroke();
      ctx.fillStyle = C.muted;
      ctx.textAlign = "center"; ctx.fillText(formatTick(xv), x(xv), bottom + 16);
      ctx.textAlign = "right"; ctx.fillText(formatTick(yv), left - 7, y(yv) + 3);
    }
    ctx.strokeStyle = C.line; ctx.strokeRect(left, top, right - left, bottom - top);
    ctx.fillStyle = C.muted; ctx.textAlign = "center";
    ctx.fillText(xLabel, (left + right) / 2, plot.height - 4);
    ctx.save(); ctx.translate(11, (top + bottom) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(yLabel, 0, 0); ctx.restore();
    return { ...plot, left, right, top, bottom, x, y };
  }
  function formatTick(value) { return Math.abs(value) < 100 ? value.toFixed(1).replace(/\.0$/, "") : Math.round(value).toLocaleString(); }
  function num(value) { return Number.isFinite(value) ? value.toFixed(2) : "N/A"; }
  function qtext(value) { return Number.isFinite(value) ? (value < .001 ? value.toExponential(1) : value.toFixed(3)) : "N/A"; }
  function circle(ctx, x, y, radius) { ctx.moveTo(x + radius, y); ctx.arc(x, y, radius, 0, Math.PI * 2); }
  function legendItem(text, color, ring = false) {
    const item = node("span");
    const swatch = node("i", { class: ring ? "pbx-ring" : "pbx-dot", "aria-hidden": "true" });
    if (color) swatch.style.setProperty("--dot-color", color);
    item.append(swatch, document.createTextNode(text));
    return item;
  }

  class Figure {
    constructor(root) {
      this.root = root; this.kind = root.dataset.kind; this.id = `pbx-${++serial}`;
      this.step = 0; this.speed = 1; this.playing = false; this.selectedGene = -1;
      this.loaded = false; this.initializing = false; this.request = 0;
      this.status = node("p", { class: "pbx-status", role: "status" }, T.loading);
      root.replaceChildren(this.status); root.dataset.step = "0";
      widgets.add(this);
    }
    async array(descriptor) {
      const types = { float32: Float32Array, float64: Float64Array, uint8: Uint8Array };
      const Type = types[descriptor.dtype];
      if (!Type) throw new Error("Unsupported array type");
      const data = await cached(new URL(descriptor.file, this.url).href);
      const offset = descriptor.byte_offset || 0;
      if (offset + descriptor.length * Type.BYTES_PER_ELEMENT > data.byteLength) throw new Error("Incomplete data");
      return new Type(data, offset, descriptor.length);
    }
    async arrays(descriptors) {
      return Object.fromEntries(await Promise.all(Object.entries(descriptors).map(async ([key, value]) => [key, await this.array(value)])));
    }
    async init() {
      if (this.loaded || this.initializing) return;
      this.initializing = true; this.status.textContent = T.loading;
      try {
        this.url = new URL(this.root.dataset.manifest, location.href);
        this.meta = await cached(this.url.href, true);
        if (this.meta.schema_version !== "pbisc.interactive_figures.v1") throw new Error("Unsupported manifest");
        this.data = this.meta[this.kind]; this.steps = this.meta.steps;
        if (this.kind === "volcano") { this.type = 0; this.dataArrays = await this.arrays(this.data.types[0].arrays); }
        else this.dataArrays = await this.arrays(this.data.arrays);
        this.build(); this.loaded = true; this.root.classList.add("is-ready"); this.status.hidden = true;
        this.resize = new ResizeObserver(() => this.draw()); this.resize.observe(this.root);
        this.draw();
      } catch (error) {
        this.root.classList.remove("is-ready");
        this.status.hidden = false;
        this.status.replaceChildren(document.createTextNode(`${T.failed} `), button(T.retry, () => this.init()));
      } finally { this.initializing = false; }
    }
    build() {
      this.controls = node("div", { class: "pbx-controls" });
      this.toolbar = node("div", { class: "pbx-toolbar" });
      this.controls.append(this.toolbar);
      this.transport = node("div", { class: "pbx-transport" });
      this.playButton = button(T.play, () => this.playing ? this.pause() : this.play(), { class: "pbx-play", "aria-pressed": "false" });
      this.previous = button("‹", () => this.seek(this.step - 1), { class: "pbx-arrow", "aria-label": T.previous });
      this.next = button("›", () => this.seek(this.step + 1), { class: "pbx-arrow", "aria-label": T.next });
      this.slider = node("input", { type: "range", min: "0", max: String(this.steps), value: "0", step: "1", class: "pbx-slider", "aria-label": T.step });
      this.slider.addEventListener("input", () => this.seek(Number(this.slider.value)));
      this.speedSelect = node("select", { class: "pbx-speed", "aria-label": T.speed });
      for (const value of [.5, 1, 2]) this.speedSelect.append(node("option", { value, ...(value === 1 ? { selected: "" } : {}) }, `${value}×`));
      this.speedSelect.addEventListener("change", () => { this.speed = Number(this.speedSelect.value); if (this.playing) this.schedule(); });
      this.readout = node("output", { class: "pbx-readout" });
      this.transport.append(this.playButton, this.previous, this.slider, this.next, this.speedSelect, this.readout);
      this.controls.append(this.transport);
      this.stage = node("div", { class: "pbx-stage" });
      this.panels = node("div", { class: "pbx-panels" }); this.stage.append(this.panels);
      this.footer = node("div", { class: "pbx-footer" });
      this.root.replaceChildren(this.status, this.controls, this.stage);
      if (this.kind === "cells") this.buildCells();
      else if (this.kind === "single") this.buildSingle();
      else this.buildVolcano();
    }
    panel(title, subtitle, key, gene = false) {
      const panel = node("figure", { class: "pbx-panel" });
      const caption = node("figcaption", { class: "pbx-panel-head" });
      caption.append(node("strong", {}, title), node("span", {}, subtitle));
      const host = node("div");
      const canvas = node("canvas", { "data-panel": key, role: "img", "aria-label": `${title} · ${subtitle}`, ...(gene ? { class: "pbx-gene-canvas" } : {}) });
      host.append(canvas); panel.append(caption, host); this.panels.append(panel);
      if (gene) {
        canvas.addEventListener("pointermove", (event) => { if (event.pointerType !== "touch") this.pointGene(event, canvas); });
        canvas.addEventListener("click", (event) => this.pointGene(event, canvas));
      }
      return canvas;
    }
    pills(labels, selected, onChange, colors = null) {
      const group = node("div", { class: "pbx-pills", role: "group" });
      labels.forEach((label, index) => {
        const pill = button(label, () => { this.pause(); group.querySelectorAll("button").forEach((b, i) => b.setAttribute("aria-pressed", String(i === index))); onChange(index); }, { "aria-pressed": String(index === selected) });
        if (colors && colors[index]) { const dot = node("i", { class: "pbx-dot", "aria-hidden": "true" }); dot.style.setProperty("--dot-color", colors[index]); pill.prepend(dot); }
        group.append(pill);
      });
      return group;
    }
    search() {
      const form = node("form", { class: "pbx-search", role: "search" });
      const input = node("input", { type: "search", placeholder: "ISG15", "aria-label": T.search, list: `${this.id}-genes`, autocomplete: "off" });
      const list = node("datalist", { id: `${this.id}-genes` });
      for (const symbol of [...new Set(this.data.symbols)]) list.append(node("option", { value: symbol }));
      const submit = node("button", { type: "submit" }, T.find);
      const clear = button(T.clear, () => { input.value = ""; this.selectedGene = -1; this.draw(); });
      form.append(input, list, submit, clear);
      form.addEventListener("submit", (event) => {
        event.preventDefault(); this.pause();
        const query = input.value.trim().toUpperCase();
        const index = this.data.symbols.findIndex((symbol, i) => symbol.toUpperCase() === query || this.data.gene_ids[i].toUpperCase() === query);
        if (index < 0) { this.selectedGene = -1; this.draw(); this.detail.textContent = T.notFound; return; }
        this.selectedGene = index;
        if (this.kind === "single" && this.geneMode === 0 && this.data.order.indexOf(index) >= 416) { this.geneMode = 1; this.genePills.children[1].click(); }
        if (this.kind === "volcano" && this.ifnaOnly && !this.data.highlight[index]) { this.filterPills.children[0].click(); }
        this.draw();
      });
      return form;
    }
    addDetail() {
      this.detail = node("div", { class: "pbx-detail", role: "status", "aria-live": "polite", "aria-atomic": "true" }, T.select);
      this.stage.append(this.detail);
    }
    buildCells() {
      this.filter = -1; this.showTruth = true;
      const group = this.pills([T.all, ...this.meta.labels], 0, (index) => { this.filter = index - 1; this.draw(); }, [null, ...this.meta.colors]);
      group.setAttribute("aria-label", KO ? "생성 세포형" : "Generated type");
      const label = node("span", { class: "pbx-meta" }, KO ? "생성 세포형" : "Generated type");
      this.toolbar.append(label, group);
      const toggle = button(T.groundTruth, () => { this.showTruth = !this.showTruth; toggle.setAttribute("aria-pressed", String(this.showTruth)); this.draw(); }, { "aria-pressed": "true", "data-action": "ground-truth" });
      toggle.prepend(node("i", { class: "pbx-dot", "aria-hidden": "true" })); this.toolbar.append(toggle);
      this.pca = this.panel("PCA", T.noisy, "pca"); this.umap = this.panel("UMAP", T.estimate, "umap");
      this.umap.closest("figure").append(node("p", { class: "pbx-panel-note" }, KO ? "현재 단계의 최종 발현 예측" : "Predicted final expression at this step"));
      this.cellSummary = node("span");
      this.truthSummary = legendItem(`${T.groundTruth} · ${this.data.real_count.toLocaleString()}`, C.gray);
      this.footer.append(this.cellSummary, this.truthSummary);
      this.stage.append(this.footer);
    }
    buildSingle() {
      this.geneMode = 0;
      this.genePills = this.pills([T.named, T.allGenes], 0, (index) => { this.geneMode = index; this.draw(); });
      this.genePills.setAttribute("aria-label", KO ? "표시 유전자" : "Displayed genes");
      this.toolbar.append(this.genePills, this.search());
      this.expressionCanvas = this.panel(T.noisy, `${this.data.label} · 1 ${KO ? "세포" : "cell"}`, "expression", true);
      this.truthCanvas = this.panel(T.groundTruth, T.nearest, "truth", true);
      const colorbar = node("span", { class: "pbx-colorbar" });
      const gradient = node("i", { "aria-hidden": "true" });
      gradient.style.background = `linear-gradient(90deg, ${this.data.colormap.filter((_, i) => i % 32 === 0 || i === 255).map((rgb) => `rgb(${rgb.join(",")})`).join(",")})`;
      colorbar.append(document.createTextNode("0"), gradient, document.createTextNode(`${this.data.vmax} · log1p(CP10k)`));
      this.footer.append(node("span", {}, KO ? "한 칸 = 유전자" : "One tile = one gene"), colorbar);
      this.stage.append(this.footer); this.addDetail();
      const trace = node("div", { class: "pbx-trace" });
      const head = node("div", { class: "pbx-trace-head" });
      this.cosineReadout = node("span"); head.append(node("span", {}, T.cosine), this.cosineReadout);
      this.traceCanvas = node("canvas", { role: "img", "aria-label": T.cosine });
      trace.append(head, this.traceCanvas); this.stage.append(trace);
      this.orderedIndex = new Map(this.data.order.map((gene, index) => [gene, index]));
    }
    buildVolcano() {
      this.ifnaOnly = false;
      const typePills = this.pills(this.meta.labels, 0, (index) => this.changeType(index), this.meta.colors);
      typePills.setAttribute("aria-label", KO ? "세포형" : "Cell type");
      this.toolbar.append(typePills);
      const secondary = node("div", { class: "pbx-toolbar" });
      this.filterPills = this.pills([T.allTested, T.ifna], 0, (index) => { this.ifnaOnly = index === 1; this.draw(); });
      this.filterPills.setAttribute("aria-label", KO ? "표시 유전자" : "Displayed genes");
      secondary.append(this.filterPills, this.search()); this.controls.insertBefore(secondary, this.transport);
      this.generatedCanvas = this.panel(T.generated, "SLE / HC", "generated", true);
      this.truthCanvas = this.panel(T.groundTruth, T.fixed, "truth", true);
      const legend = node("div", { class: "pbx-legend" });
      legend.append(legendItem(T.hc, C.blue), legendItem(T.sle, C.red), legendItem(T.ifnaOutline, null, true), legendItem(T.neutral, C.gray));
      this.donors = node("span"); this.geneSummary = node("span"); this.footer.append(legend, this.donors, this.geneSummary); this.stage.append(this.footer); this.addDetail();
    }
    async changeType(index) {
      const request = ++this.request; this.pause(); this.type = index; this.loadingType = true;
      this.root.setAttribute("aria-busy", "true");
      this.root.classList.add("is-loading"); this.status.hidden = false; this.status.textContent = T.loading;
      this.transport.querySelectorAll("button, input, select").forEach((item) => { item.disabled = true; });
      try {
        const arrays = await this.arrays(this.data.types[index].arrays);
        if (request !== this.request) return;
        this.dataArrays = arrays; this.loadingType = false; this.root.classList.remove("is-loading"); this.status.hidden = true;
        this.root.setAttribute("aria-busy", "false");
        this.transport.querySelectorAll("button, input, select").forEach((item) => { item.disabled = false; });
        this.draw();
      } catch (error) {
        if (request !== this.request) return;
        this.root.setAttribute("aria-busy", "false");
        this.status.replaceChildren(document.createTextNode(`${T.failed} `), button(T.retry, () => this.changeType(index)));
        this.detail.textContent = T.failed;
      }
    }
    pause() { this.playing = false; clearTimeout(this.timer); if (this.playButton) { this.playButton.textContent = T.play; this.playButton.setAttribute("aria-pressed", "false"); } }
    play() {
      if (!this.loaded || this.loadingType) return;
      widgets.forEach((other) => { if (other !== this) other.pause(); });
      if (this.step === this.steps) this.step = 0;
      this.playing = true; this.playButton.textContent = T.pause; this.playButton.setAttribute("aria-pressed", "true"); this.draw(); this.schedule();
    }
    schedule() {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => { if (!this.playing) return; this.step++; this.draw(); if (this.step >= this.steps) this.pause(); else this.schedule(); }, 360 / this.speed);
    }
    seek(step) { this.pause(); this.step = Math.max(0, Math.min(this.steps, step)); this.draw(); }
    draw() {
      if (!this.loaded || this.loadingType) return;
      this.root.dataset.step = String(this.step); this.slider.value = String(this.step);
      const times = this.kind === "volcano" ? this.data.prediction_times : this.data.state_times;
      const time = times && this.kind !== "cells" ? Number(times[this.step]).toFixed(2) : "";
      const text = `${T.step} ${String(this.step).padStart(2, "0")} / ${this.steps}${time ? ` · t ${time}` : ""}`;
      this.readout.textContent = text; this.slider.setAttribute("aria-valuetext", text);
      this.previous.disabled = this.step === 0; this.next.disabled = this.step === this.steps;
      if (this.kind === "cells") this.drawCells();
      else if (this.kind === "single") this.drawSingle();
      else this.drawVolcano();
      this.updateDetail();
    }
    drawCells() {
      const n = this.data.count, labels = this.data.labels;
      const shown = this.filter < 0 ? n : labels.filter((label) => label === this.filter).length;
      this.root.dataset.type = this.filter < 0 ? "all" : this.meta.labels[this.filter];
      this.root.dataset.generatedCount = String(shown);
      this.root.dataset.truthCount = String(this.showTruth ? this.data.real_count : 0);
      this.cellSummary.textContent = `${T.generated} · ${shown.toLocaleString()} / ${n.toLocaleString()} ${T.cells}`;
      this.truthSummary.lastChild.textContent = `${T.groundTruth} · ${(this.showTruth ? this.data.real_count : 0).toLocaleString()}`;
      for (const [kind, canvas] of [["pca", this.pca], ["umap", this.umap]]) {
        const panelTime = (kind === "pca" ? this.data.state_times : this.data.prediction_times)[this.step];
        canvas.closest("figure").querySelector(".pbx-panel-head span").textContent = `${kind === "pca" ? T.noisy : T.estimate} · t ${Number(panelTime).toFixed(2)}`;
        const plot = axes(canvas, this.data.bounds[kind], kind === "pca" ? "PC1" : "UMAP1", kind === "pca" ? "PC2" : "UMAP2", null, true);
        const { ctx, x, y } = plot;
        ctx.save(); ctx.beginPath(); ctx.rect(plot.left, plot.top, plot.right - plot.left, plot.bottom - plot.top); ctx.clip();
        if (this.showTruth) {
          const truth = this.dataArrays[`real_${kind}`]; ctx.fillStyle = "#b7bec5"; ctx.globalAlpha = .60; ctx.beginPath();
          for (let i = 0; i < this.data.real_count; i++) circle(ctx, x(truth[i * 2]), y(truth[i * 2 + 1]), 1.55);
          ctx.fill();
        }
        const points = this.dataArrays[kind], offset = this.step * n * 2;
        ctx.globalAlpha = .60;
        for (let type = 0; type < this.meta.labels.length; type++) {
          if (this.filter >= 0 && type !== this.filter) continue;
          ctx.fillStyle = this.meta.colors[type]; ctx.beginPath();
          for (let i = 0; i < n; i++) if (labels[i] === type) circle(ctx, x(points[offset + i * 2]), y(points[offset + i * 2 + 1]), 1.55);
          ctx.fill();
        }
        ctx.restore();
      }
    }
    heatLayout(width) {
      const gutter = 49, columns = Math.max(14, Math.floor((width - gutter) / (this.geneMode ? 6 : 12)));
      const tile = (width - gutter) / columns;
      const blocks = this.data.blocks.slice(0, this.geneMode ? this.data.blocks.length : 7).map((block, index) => ({ ...block, index }));
      let y = 0;
      for (const block of blocks) { block.y = y; block.rows = Math.ceil(block.count / columns); y += block.rows * tile + 8; }
      return { width, gutter, columns, tile, blocks, height: Math.ceil(Math.max(1, y - 8)) };
    }
    drawSingle() {
      this.root.dataset.geneCount = String(this.geneMode ? this.data.genes : 416);
      this.heatLayouts = new Map();
      for (const [canvas, truth] of [[this.expressionCanvas, false], [this.truthCanvas, true]]) {
        const layout = this.heatLayout(canvas.parentElement.clientWidth); this.heatLayouts.set(canvas, layout);
        const { ctx } = canvasContext(canvas, layout.height);
        const values = truth ? this.dataArrays.truth : this.dataArrays.expression;
        const offset = truth ? 0 : this.step * this.data.genes;
        ctx.font = '10px "IBM Plex Mono", monospace'; ctx.textBaseline = "top";
        for (const block of layout.blocks) {
          ctx.fillStyle = BLOCK_COLORS[block.index % BLOCK_COLORS.length]; ctx.fillRect(0, block.y, 3, Math.max(3, block.rows * layout.tile - 1));
          ctx.fillStyle = C.ink; ctx.fillText(BLOCK_NAMES[block.index] || block.name, 8, block.y);
          if (block.rows > 1) { ctx.fillStyle = C.muted; ctx.fillText(String(block.count), 8, block.y + 14); }
          for (let j = 0; j < block.count; j++) {
            const gene = this.data.order[block.start + j], value = values[offset + gene];
            const colorIndex = Math.max(0, Math.min(255, Math.round(value / this.data.vmax * 255)));
            const rgb = this.data.colormap[colorIndex]; ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
            const x = layout.gutter + j % layout.columns * layout.tile, y = block.y + Math.floor(j / layout.columns) * layout.tile;
            ctx.fillRect(x, y, layout.tile - (layout.tile >= 6 ? .8 : 0), layout.tile - (layout.tile >= 6 ? .8 : 0));
            if (gene === this.selectedGene) { ctx.strokeStyle = C.blue; ctx.lineWidth = 2; ctx.strokeRect(x - 1, y - 1, layout.tile + 1, layout.tile + 1); }
          }
        }
      }
      const { ctx, width, height } = canvasContext(this.traceCanvas, 76);
      const values = this.data.similarity, left = 24, right = width - 16, top = 9, bottom = height - 19;
      const lo = Math.min(0, ...values), hi = 1;
      const x = (i) => left + i / this.steps * (right - left), y = (v) => bottom - (v - lo) / (hi - lo) * (bottom - top);
      ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(left, bottom); ctx.lineTo(right, bottom); ctx.stroke();
      ctx.strokeStyle = "#c3cdda"; ctx.lineWidth = 1.5; ctx.beginPath(); values.forEach((v, i) => i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))); ctx.stroke();
      ctx.strokeStyle = C.blue; ctx.lineWidth = 2; ctx.beginPath(); for (let i = 0; i <= this.step; i++) i ? ctx.lineTo(x(i), y(values[i])) : ctx.moveTo(x(i), y(values[i])); ctx.stroke();
      ctx.fillStyle = C.blue; ctx.beginPath(); circle(ctx, x(this.step), y(values[this.step]), 3.5); ctx.fill();
      ctx.fillStyle = C.muted; ctx.font = '10px "IBM Plex Mono", monospace'; ctx.fillText("0", left, height - 3); ctx.fillText(String(this.steps), right - 10, height - 3);
      ctx.textAlign = "right"; ctx.fillText("0", left - 8, y(0) + 3); ctx.fillText("1", left - 8, y(1) + 3);
      this.cosineReadout.textContent = num(values[this.step]);
    }
    drawVolcano() {
      const n = this.data.genes, type = this.data.types[this.type]; this.volcanoPlots = new Map();
      this.root.dataset.type = this.meta.labels[this.type];
      const count = type.status[this.step] === "insufficient_donors" ? 0 : this.ifnaOnly ? this.data.highlight.filter(Boolean).length : n;
      this.root.dataset.geneCount = String(count);
      this.geneSummary.textContent = `${count.toLocaleString()} ${KO ? "유전자" : "genes"}`;
      this.donors.textContent = `${T.gene} · SLE ${this.data.eligible_SLE[this.type]} / HC ${this.data.eligible_HC[this.type]} ${T.donors}`;
      for (const [canvas, truth] of [[this.generatedCanvas, false], [this.truthCanvas, true]]) {
        const plot = axes(canvas, this.data.bounds, "log₂ FC · SLE / HC", "−log₁₀ q"); this.volcanoPlots.set(canvas, { ...plot, truth });
        const { ctx, x, y } = plot;
        const status = truth ? type.truth_status : type.status[this.step];
        if (status === "insufficient_donors") { ctx.textAlign = "center"; ctx.fillStyle = C.muted; ctx.font = '12px "IBM Plex Mono", monospace'; ctx.fillText(T.unavailable, (plot.left + plot.right) / 2, (plot.top + plot.bottom) / 2); continue; }
        const effect = this.dataArrays[truth ? "truth_effect" : "effect"], q = this.dataArrays[truth ? "truth_q" : "q"], estimable = this.dataArrays[truth ? "truth_estimable" : "estimable"];
        const offset = truth ? 0 : this.step * n;
        ctx.save(); ctx.beginPath(); ctx.rect(plot.left, plot.top, plot.right - plot.left, plot.bottom - plot.top); ctx.clip();
        ctx.strokeStyle = "#a4adb4"; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(x(0), plot.top); ctx.lineTo(x(0), plot.bottom); ctx.moveTo(plot.left, y(-Math.log10(.05))); ctx.lineTo(plot.right, y(-Math.log10(.05))); ctx.stroke(); ctx.setLineDash([]);
        for (let highlight = 0; highlight <= 1; highlight++) {
          if (this.ifnaOnly && !highlight) continue;
          for (let direction = -1; direction <= 1; direction++) {
            ctx.fillStyle = direction < 0 ? C.blue : direction > 0 ? C.red : C.gray; ctx.globalAlpha = highlight ? .95 : .48; ctx.beginPath();
            for (let i = 0; i < n; i++) {
              if (Boolean(this.data.highlight[i]) !== Boolean(highlight)) continue;
              const effectValue = effect[offset + i], qValue = q[offset + i];
              if (!Number.isFinite(effectValue) || !Number.isFinite(qValue)) continue;
              if ((estimable[offset + i] ? Math.sign(effectValue) : 0) !== direction) continue;
              circle(ctx, x(effectValue), y(-Math.log10(Math.max(qValue, 1e-300))), highlight ? 3.1 : 2);
            }
            ctx.fill();
            if (highlight) { ctx.globalAlpha = 1; ctx.strokeStyle = C.ink; ctx.lineWidth = .8; ctx.stroke(); }
          }
        }
        if (this.selectedGene >= 0 && (!this.ifnaOnly || this.data.highlight[this.selectedGene])) {
          const i = offset + this.selectedGene; ctx.globalAlpha = 1; ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); circle(ctx, x(effect[i]), y(-Math.log10(Math.max(q[i], 1e-300))), 6); ctx.stroke();
        }
        ctx.restore();
      }
    }
    pointGene(event, canvas) {
      if (!this.loaded || this.loadingType) return;
      const rect = canvas.getBoundingClientRect(), px = event.clientX - rect.left, py = event.clientY - rect.top;
      let gene = -1;
      if (this.kind === "single") {
        const layout = this.heatLayouts.get(canvas), column = Math.floor((px - layout.gutter) / layout.tile);
        if (column < 0 || column >= layout.columns) return;
        for (const block of layout.blocks) if (py >= block.y && py < block.y + block.rows * layout.tile) {
          const j = Math.floor((py - block.y) / layout.tile) * layout.columns + column;
          if (j < block.count) gene = this.data.order[block.start + j];
        }
      } else {
        const plot = this.volcanoPlots.get(canvas), type = this.data.types[this.type];
        if ((plot.truth ? type.truth_status : type.status[this.step]) === "insufficient_donors") return;
        const effect = this.dataArrays[plot.truth ? "truth_effect" : "effect"], q = this.dataArrays[plot.truth ? "truth_q" : "q"];
        const offset = plot.truth ? 0 : this.step * this.data.genes; let distance = 12 * 12;
        for (let i = 0; i < this.data.genes; i++) {
          if (this.ifnaOnly && !this.data.highlight[i]) continue;
          const dx = plot.x(effect[offset + i]) - px, dy = plot.y(-Math.log10(Math.max(q[offset + i], 1e-300))) - py, d = dx * dx + dy * dy;
          if (d < distance) { distance = d; gene = i; }
        }
      }
      if (gene >= 0 && gene !== this.selectedGene) { this.selectedGene = gene; this.draw(); }
    }
    updateDetail() {
      if (!this.detail) return;
      const gene = this.selectedGene;
      this.detail.dataset.geneIndex = String(gene);
      if (gene < 0) { this.detail.textContent = T.select; return; }
      let text;
      if (this.kind === "single") text = `${T.noisy} ${num(this.dataArrays.expression[this.step * this.data.genes + gene])} · ${T.groundTruth} ${num(this.dataArrays.truth[gene])}`;
      else {
        const i = this.step * this.data.genes + gene, arrays = this.dataArrays, type = this.data.types[this.type];
        const generated = type.status[this.step] === "insufficient_donors" || !arrays.estimable[i] ? "N/A" : `log₂ FC ${num(arrays.effect[i])} · q ${qtext(arrays.q[i])}`;
        const truth = type.truth_status === "insufficient_donors" || !arrays.truth_estimable[gene] ? "N/A" : `log₂ FC ${num(arrays.truth_effect[gene])} · q ${qtext(arrays.truth_q[gene])}`;
        text = `${T.generated}: ${generated}  /  ${T.groundTruth}: ${truth}`;
      }
      this.detail.replaceChildren(node("strong", {}, this.data.symbols[gene]), document.createTextNode(` · ${text}`));
    }
  }
  const figures = mounts.map((root) => new Figure(root));
  const lazy = new IntersectionObserver((entries) => { for (const entry of entries) if (entry.isIntersecting) { figures.find((figure) => figure.root === entry.target).init(); lazy.unobserve(entry.target); } }, { rootMargin: "150px" });
  const visibility = new IntersectionObserver((entries) => { for (const entry of entries) if (!entry.isIntersecting) figures.find((figure) => figure.root === entry.target).pause(); });
  for (const figure of figures) { lazy.observe(figure.root); visibility.observe(figure.root); }
  document.addEventListener("visibilitychange", () => { if (document.hidden) widgets.forEach((figure) => figure.pause()); });
})();
