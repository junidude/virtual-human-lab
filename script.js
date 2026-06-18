const header = document.querySelector("[data-header]");
const navToggle = document.querySelector(".nav-toggle");
const navLinks = document.querySelectorAll(".site-nav a");
const canvas = document.querySelector("#cell-field");
const context = canvas ? canvas.getContext("2d") : null;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const palette = ["#f4efe4", "#d5a84f", "#a94731", "#6fb0a2", "#81a9c4"];
let points = [];
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
  const count = Math.max(68, Math.floor((width * height) / 13500));
  points = Array.from({ length: count }, (_, index) => {
    const lane = index % 4;
    return {
      x: Math.random() * width,
      y: Math.random() * height,
      radius: 1.4 + Math.random() * 3.8,
      speed: 0.08 + Math.random() * 0.22,
      phase: Math.random() * Math.PI * 2,
      color: palette[(lane + Math.floor(Math.random() * palette.length)) % palette.length],
    };
  });
}

function drawField(time = 0) {
  if (!canvas || !context) return;

  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  context.clearRect(0, 0, width, height);
  context.fillStyle = "#101414";
  context.fillRect(0, 0, width, height);

  context.globalAlpha = 0.18;
  context.strokeStyle = "#f4efe4";
  context.lineWidth = 1;

  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const a = points[i];
      const b = points[j];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);

      if (distance < 116) {
        context.globalAlpha = (1 - distance / 116) * 0.16;
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
