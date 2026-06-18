const header = document.querySelector("[data-header]");
const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelectorAll(".site-nav a");
const canvas = document.querySelector("#cell-field");
const context = canvas ? canvas.getContext("2d") : null;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const palette = ["#f4efe4", "#d5a84f", "#a94731", "#6fb0a2", "#81a9c4"];
let points = [];
let clusters = [];
let animationFrame = 0;

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
    { x: width * 0.68, y: height * 0.25, rx: width * 0.12, ry: height * 0.08 },
    { x: width * 0.82, y: height * 0.56, rx: width * 0.1, ry: height * 0.16 },
    { x: width * 0.52, y: height * 0.62, rx: width * 0.14, ry: height * 0.11 },
    { x: width * 0.86, y: height * 0.18, rx: width * 0.07, ry: height * 0.07 },
    { x: width * 0.62, y: height * 0.82, rx: width * 0.11, ry: height * 0.08 },
  ];

  const count = Math.max(90, Math.floor((width * height) / 11000));
  points = Array.from({ length: count }, (_, index) => {
    const clusterIndex = index % clusters.length;
    const cluster = clusters[clusterIndex];
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.sqrt(Math.random());
    const lane = index % palette.length;

    return {
      x: cluster.x + Math.cos(angle) * cluster.rx * distance,
      y: cluster.y + Math.sin(angle) * cluster.ry * distance,
      radius: 1.6 + Math.random() * 3.2,
      speed: 0.04 + Math.random() * 0.14,
      phase: Math.random() * Math.PI * 2,
      cluster: clusterIndex,
      color: palette[(lane + Math.floor(Math.random() * palette.length)) % palette.length],
    };
  });
}

function drawClusterContours(time) {
  clusters.forEach((cluster, index) => {
    const pulse = reduceMotion ? 0 : Math.sin(time * 0.001 + index) * 3;
    context.globalAlpha = 0.1;
    context.strokeStyle = palette[(index + 1) % palette.length];
    context.lineWidth = 1.25;
    context.beginPath();
    context.ellipse(cluster.x, cluster.y, cluster.rx + pulse, cluster.ry + pulse, index * 0.22, 0, Math.PI * 2);
    context.stroke();
  });
}

function drawField(time = 0) {
  if (!canvas || !context) return;

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#101414";
  context.fillRect(0, 0, width, height);
  drawClusterContours(time);

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
    if (!reduceMotion) {
      point.x += Math.cos(point.phase + time * 0.00018) * point.speed;
      point.y += Math.sin(point.phase + time * 0.00022) * point.speed;
    }

    if (point.x < -20) point.x = width + 20;
    if (point.x > width + 20) point.x = -20;
    if (point.y < -20) point.y = height + 20;
    if (point.y > height + 20) point.y = -20;

    context.globalAlpha = index % 9 === 0 ? 0.92 : 0.64;
    context.fillStyle = point.color;
    context.beginPath();
    context.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
    context.fill();
  });

  context.globalAlpha = 1;

  if (!reduceMotion) {
    animationFrame = window.requestAnimationFrame(drawField);
  }
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

resizeCanvas();
drawField();
updateHeader();
