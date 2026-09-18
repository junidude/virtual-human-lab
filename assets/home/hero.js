// Home hero: replays recorded PBISC-Diffusion noisy states (2,048 generated cells) from noise to cell types.
// Data layout is described in hero-cells.json; nothing here runs the model.
(() => {
  const hero = document.querySelector("[data-hero]");
  if (!hero) return;
  const canvas = hero.querySelector("canvas");
  const button = hero.querySelector(".hero-pause");
  const readout = hero.querySelector("[data-hero-step]");
  const ctx = canvas.getContext("2d");
  const COLORS = ["#3AA0FF", "#FF8A3D", "#1FD1A0", "#F08BD0", "#FFC23D", "#9BD8FF"];
  const n = Number(hero.dataset.cells);
  const recorded = hero.dataset.steps.split(",").map(Number);
  const scale = Number(hero.dataset.scale);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const RUN = 5600;
  const HOLD = 2800;
  const FADE = 900;
  const CYCLE = RUN + HOLD + FADE;

  let labels = null;
  let xy = null;
  let width = 0;
  let height = 0;
  let playing = !reduce;
  let onScreen = true;
  let clock = reduce ? RUN : 0;
  let last = 0;
  let raf = 0;

  const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = hero.clientWidth;
    height = hero.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function draw() {
    if (!xy) return;
    const t = clock % CYCLE;
    const progress = ease(Math.min(1, t / RUN));
    const alpha = t < 400 ? t / 400 : t > RUN + HOLD ? Math.max(0, 1 - (t - RUN - HOLD) / FADE) : 1;
    const f = progress * (recorded.length - 1);
    const i = Math.min(recorded.length - 2, Math.floor(f));
    const a = f - i;
    const narrow = width < 720;
    const s = Math.min((width * (narrow ? 0.46 : 0.34)) / 1.27, (height * (narrow ? 0.19 : 0.22)) / 0.69);
    const cx = width / 2;
    const cy = height * (narrow ? 0.32 : 0.34);
    const r = Math.max(1.2, s * 0.0068);
    const k = scale / 32767;
    const p0 = i * n * 2;
    const p1 = (i + 1) * n * 2;
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = 0.9 * alpha;
    for (let c = 0; c < COLORS.length; c += 1) {
      ctx.fillStyle = COLORS[c];
      ctx.beginPath();
      for (let j = 0; j < n; j += 1) {
        if (labels[j] !== c) continue;
        const x = (xy[p0 + 2 * j] * (1 - a) + xy[p1 + 2 * j] * a) * k;
        const y = (xy[p0 + 2 * j + 1] * (1 - a) + xy[p1 + 2 * j + 1] * a) * k;
        const px = cx + x * s;
        const py = cy - y * s;
        ctx.moveTo(px + r, py);
        ctx.arc(px, py, r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (readout) readout.textContent = String(Math.round(recorded[0] + (recorded[recorded.length - 1] - recorded[0]) * progress));
  }

  function frame(now) {
    raf = 0;
    if (!playing || !onScreen || document.hidden) return;
    if (last) clock += Math.min(64, now - last);
    last = now;
    draw();
    raf = requestAnimationFrame(frame);
  }

  function run() {
    if (raf || !playing || !onScreen || document.hidden || !xy) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  function setPlaying(next) {
    playing = next;
    if (button) {
      button.setAttribute("aria-label", next ? button.dataset.pause : button.dataset.play);
      button.innerHTML = next
        ? '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="2" width="3.5" height="12" rx="1" fill="currentColor"/><rect x="9.5" y="2" width="3.5" height="12" rx="1" fill="currentColor"/></svg>'
        : '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.2v11.6a.6.6 0 0 0 .9.5l9.3-5.8a.6.6 0 0 0 0-1L4.9 1.7a.6.6 0 0 0-.9.5Z" fill="currentColor"/></svg>';
    }
    if (next) run();
  }

  if (button) button.addEventListener("click", () => setPlaying(!playing));
  new ResizeObserver(resize).observe(hero);
  new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    run();
  }).observe(hero);
  document.addEventListener("visibilitychange", run);

  fetch(hero.dataset.src)
    .then((response) => {
      if (!response.ok) throw new Error(response.status);
      return response.arrayBuffer();
    })
    .then((buffer) => {
      labels = new Uint8Array(buffer, 0, n);
      xy = new Int16Array(buffer.slice(n));
      resize();
      setPlaying(playing);
    })
    .catch(() => hero.classList.add("is-static"));
})();
