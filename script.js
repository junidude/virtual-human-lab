const header = document.querySelector("[data-header]");
const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelectorAll(".site-nav a");
const canvas = document.querySelector("#cell-field");
const context = canvas ? canvas.getContext("2d") : null;
const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

const palette = ["#f4efe4", "#d5a84f", "#a94731", "#6fb0a2", "#81a9c4"];
let points = [];
let clusters = [];
let animationFrame = 0;
let pointer = { active: false, x: 0, y: 0 };

function shouldReduceMotion() {
  return reduceMotionQuery.matches;
}

function resizeCanvas() {
  if (!canvas || !context) return;

  const rect = canvas.getBoundingClientRect();
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(rect.width * scale);
  canvas.height = Math.floor(rect.height * scale);
  context.setTransform(scale, 0, 0, scale, 0, 0);
  seedField(rect.width, rect.height);
}

function seedField(width, height) {
  clusters = [
    { x: width * 0.68, y: height * 0.25, rx: width * 0.12, ry: height * 0.08, spin: 0.2 },
    { x: width * 0.82, y: height * 0.56, rx: width * 0.1, ry: height * 0.16, spin: 1.1 },
    { x: width * 0.52, y: height * 0.62, rx: width * 0.14, ry: height * 0.11, spin: 2.0 },
    { x: width * 0.86, y: height * 0.18, rx: width * 0.07, ry: height * 0.07, spin: 3.2 },
    { x: width * 0.62, y: height * 0.82, rx: width * 0.11, ry: height * 0.08, spin: 4.1 },
  ];

  const count = Math.max(120, Math.floor((width * height) / 8500));
  points = Array.from({ length: count }, (_, index) => {
    const clusterIndex = index % clusters.length;
    const cluster = clusters[clusterIndex];
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.sqrt(Math.random());
    const lane = index % palette.length;

    return {
      x: cluster.x + Math.cos(angle) * cluster.rx * distance,
      y: cluster.y + Math.sin(angle) * cluster.ry * distance,
      anchorX: cluster.x + Math.cos(angle) * cluster.rx * distance,
      anchorY: cluster.y + Math.sin(angle) * cluster.ry * distance,
      radius: 1.2 + Math.random() * 3.4,
      speed: 0.09 + Math.random() * 0.25,
      phase: Math.random() * Math.PI * 2,
      cluster: clusterIndex,
      color: palette[(lane + Math.floor(Math.random() * palette.length)) % palette.length],
    };
  });
}

function drawClusterContours(time) {
  clusters.forEach((cluster, index) => {
    const pulse = shouldReduceMotion() ? 0 : Math.sin(time * 0.001 + index) * 6;
    context.globalAlpha = 0.1;
    context.strokeStyle = palette[(index + 1) % palette.length];
    context.lineWidth = 1.25;
    context.beginPath();
    context.ellipse(cluster.x, cluster.y, cluster.rx + pulse, cluster.ry + pulse, index * 0.22, 0, Math.PI * 2);
    context.stroke();
  });
}

function drawSignalBands(time, width, height) {
  if (shouldReduceMotion()) return;

  context.save();
  context.globalCompositeOperation = "screen";

  clusters.forEach((cluster, index) => {
    const progress = ((time * 0.00016 + index * 0.19) % 1) * Math.PI * 2;
    const x = cluster.x + Math.cos(progress + cluster.spin) * cluster.rx;
    const y = cluster.y + Math.sin(progress + cluster.spin) * cluster.ry;

    context.globalAlpha = 0.24;
    context.strokeStyle = palette[(index + 2) % palette.length];
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(width * 0.28, height * (0.18 + index * 0.13));
    context.bezierCurveTo(width * 0.46, y * 0.7, x * 0.92, y, x, y);
    context.stroke();

    context.globalAlpha = 0.88;
    context.fillStyle = palette[(index + 2) % palette.length];
    context.beginPath();
    context.arc(x, y, 3.5 + Math.sin(time * 0.006 + index) * 1.2, 0, Math.PI * 2);
    context.fill();
  });

  context.restore();
}

function drawCoordinateGrid(time, width, height) {
  context.save();
  context.globalAlpha = 0.08;
  context.strokeStyle = "#f4efe4";
  context.lineWidth = 1;

  const offset = shouldReduceMotion() ? 0 : (time * 0.018) % 46;
  for (let x = width * 0.44 + offset; x < width; x += 46) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x - width * 0.08, height);
    context.stroke();
  }

  for (let y = -offset; y < height; y += 46) {
    context.beginPath();
    context.moveTo(width * 0.36, y);
    context.lineTo(width, y + height * 0.12);
    context.stroke();
  }

  context.restore();
}

function drawField(time = 0) {
  if (!canvas || !context) return;

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#101414";
  context.fillRect(0, 0, width, height);
  drawCoordinateGrid(time, width, height);
  drawClusterContours(time);
  drawSignalBands(time, width, height);

  context.globalAlpha = 0.18;
  context.strokeStyle = "#f4efe4";
  context.lineWidth = 1;

  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const a = points[i];
      const b = points[j];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);

      if (distance < 92 && a.cluster === b.cluster) {
        context.globalAlpha = (1 - distance / 92) * 0.12;
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.stroke();
      }
    }
  }

  points.forEach((point, index) => {
    if (!shouldReduceMotion()) {
      const cluster = clusters[point.cluster];
      const orbitalX = Math.cos(point.phase + time * 0.00034) * cluster.rx * 0.07;
      const orbitalY = Math.sin(point.phase + time * 0.00041) * cluster.ry * 0.09;
      const targetX = point.anchorX + orbitalX + Math.sin(time * 0.0002 + cluster.spin) * 7;
      const targetY = point.anchorY + orbitalY + Math.cos(time * 0.00024 + cluster.spin) * 7;

      point.x += (targetX - point.x) * 0.015 + Math.cos(point.phase + time * 0.0018) * point.speed;
      point.y += (targetY - point.y) * 0.015 + Math.sin(point.phase + time * 0.0016) * point.speed;

      if (pointer.active) {
        const dx = point.x - pointer.x;
        const dy = point.y - pointer.y;
        const distance = Math.hypot(dx, dy);

        if (distance < 180 && distance > 0) {
          const force = (1 - distance / 180) * 1.8;
          point.x += (dx / distance) * force;
          point.y += (dy / distance) * force;
        }
      }
    }

    if (point.x < -20) point.x = width + 20;
    if (point.x > width + 20) point.x = -20;
    if (point.y < -20) point.y = height + 20;
    if (point.y > height + 20) point.y = -20;

    context.globalAlpha = index % 9 === 0 ? 0.95 : 0.68;
    context.fillStyle = point.color;
    context.beginPath();
    context.arc(point.x, point.y, point.radius + Math.sin(time * 0.004 + point.phase) * 0.45, 0, Math.PI * 2);
    context.fill();
  });

  context.globalAlpha = 1;

  if (!shouldReduceMotion()) {
    animationFrame = window.requestAnimationFrame(drawField);
  }
}

function setupRevealMotion() {
  if (shouldReduceMotion() || !("IntersectionObserver" in window)) return;

  document.body.classList.add("motion-enhanced");

  const revealSelectors = [
    ".section-grid > *",
    ".library-lede",
    ".shelf-card",
    ".problem-item",
    ".section-heading",
    ".artifact-panel",
    ".artifact-step",
    ".program-card",
    ".model-item",
    ".member-card",
    ".advisor-card",
    ".collaborator-card",
    ".collaborate-copy",
    ".collaborate .button",
    ".collection-lede > *",
    ".entry-card",
    ".empty-state",
  ].join(",");

  const revealItems = document.querySelectorAll(revealSelectors);
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
  );

  revealItems.forEach((item, index) => {
    item.classList.add("motion-reveal");
    item.style.setProperty("--motion-delay", `${Math.min((index % 6) * 70, 350)}ms`);
    observer.observe(item);
  });
}

function updateHeader() {
  if (!header) return;

  header.classList.toggle("is-scrolled", window.scrollY > 18);
}

if (header && navToggle) {
  navToggle.addEventListener("click", () => {
    const isOpen = header.classList.toggle("nav-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });
}

navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    if (!header || !navToggle) return;

    header.classList.remove("nav-open");
    navToggle.setAttribute("aria-expanded", "false");
  });
});

window.addEventListener("scroll", updateHeader, { passive: true });
window.addEventListener("resize", () => {
  window.cancelAnimationFrame(animationFrame);
  resizeCanvas();
  drawField();
});

if (canvas) {
  canvas.addEventListener("pointermove", (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer = {
      active: true,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  });

  canvas.addEventListener("pointerleave", () => {
    pointer.active = false;
  });
}

resizeCanvas();
drawField();
updateHeader();
setupRevealMotion();
