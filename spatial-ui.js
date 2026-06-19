const THREE_MODULE_URL = "https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js";
const spatialCanvases = Array.from(document.querySelectorAll("[data-spatial-scene]"));
const spatialMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

const spatialColors = {
  ink: "#171411",
  paper: "#f4efe4",
  field: "#101414",
  green: "#466f56",
  red: "#8f3426",
  blue: "#2f6d8a",
  yellow: "#d5a84f",
};

function seededRandom(seed) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;

  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function colorFromDataset(canvas) {
  return canvas.dataset.spatialAccent || spatialColors.yellow;
}

function shouldReduceSpatialMotion() {
  return spatialMotionQuery.matches;
}

async function bootSpatialUi() {
  if (!spatialCanvases.length) return;

  try {
    const THREE = await import(THREE_MODULE_URL);
    spatialCanvases.forEach((canvas, index) => {
      const scene = new SpatialScene(THREE, canvas, index + 1);
      scene.start();
    });
  } catch {
    document.body.classList.add("spatial-static");
  }
}

class SpatialScene {
  constructor(THREE, canvas, index) {
    this.THREE = THREE;
    this.canvas = canvas;
    this.index = index;
    this.type = canvas.dataset.spatialScene || "program";
    this.accent = colorFromDataset(canvas);
    this.pointer = { x: 0, y: 0, active: false };
    this.visible = true;
    this.frame = 0;
    this.dynamicObjects = [];
    this.seed = seededRandom(1947 + index * 101);

    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      canvas,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.root = new THREE.Group();
    this.scene.add(this.root);
  }

  start() {
    this.addLighting();
    this.buildScene();
    this.resize();
    this.bindEvents();
    this.render(0);

    if (!shouldReduceSpatialMotion()) {
      this.frame = window.requestAnimationFrame((time) => this.tick(time));
    }
  }

  addLighting() {
    const { THREE } = this;
    const ambient = new THREE.AmbientLight(0xffffff, 0.62);
    const key = new THREE.DirectionalLight(0xffffff, 1.05);
    const fill = new THREE.PointLight(this.accent, 1.8, 16);

    key.position.set(3.5, 4.5, 5);
    fill.position.set(-3, -1.5, 3);
    this.scene.add(ambient, key, fill);
  }

  buildScene() {
    if (this.type === "workflow") {
      this.buildWorkflow();
      return;
    }

    this.buildProgram();
  }

  makeNode(radius, color, position) {
    const { THREE } = this;
    const geometry = new THREE.SphereGeometry(radius, 22, 16);
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.14,
      metalness: 0.2,
      roughness: 0.42,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    return mesh;
  }

  makeLine(points, color, opacity = 0.48) {
    const { THREE } = this;
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color,
      opacity,
      transparent: true,
    });
    return new THREE.Line(geometry, material);
  }

  makePointCloud(count, spread, color) {
    const { THREE } = this;
    const positions = new Float32Array(count * 3);

    for (let index = 0; index < count; index += 1) {
      const theta = this.seed() * Math.PI * 2;
      const radius = Math.sqrt(this.seed()) * spread;
      const z = (this.seed() - 0.5) * spread * 0.72;
      positions[index * 3] = Math.cos(theta) * radius;
      positions[index * 3 + 1] = Math.sin(theta) * radius * 0.58;
      positions[index * 3 + 2] = z;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color,
      opacity: 0.62,
      size: this.type === "program" ? 0.035 : 0.045,
      transparent: true,
    });
    const points = new THREE.Points(geometry, material);
    this.dynamicObjects.push({ object: points, rate: 0.00022 + this.seed() * 0.00012 });
    return points;
  }

  makeRing(radius, color, position, rotation) {
    const { THREE } = this;
    const geometry = new THREE.TorusGeometry(radius, 0.008, 8, 72);
    const material = new THREE.MeshBasicMaterial({
      color,
      opacity: 0.34,
      transparent: true,
    });
    const ring = new THREE.Mesh(geometry, material);
    ring.position.copy(position);
    ring.rotation.set(rotation.x, rotation.y, rotation.z);
    this.dynamicObjects.push({ object: ring, rate: 0.00032 + this.seed() * 0.00018 });
    return ring;
  }

  buildWorkflow() {
    const { THREE } = this;
    this.camera.position.set(0, 0.4, 7.2);

    const positions = [
      new THREE.Vector3(-3.15, -0.68, 0.2),
      new THREE.Vector3(-1.05, 0.76, -0.28),
      new THREE.Vector3(1.15, -0.2, 0.52),
      new THREE.Vector3(3.05, 0.82, -0.08),
    ];
    const colors = [spatialColors.yellow, spatialColors.green, spatialColors.red, spatialColors.blue];

    this.root.add(this.makeLine(positions, spatialColors.paper, 0.36));
    positions.forEach((position, index) => {
      const node = this.makeNode(index === 1 ? 0.19 : 0.16, colors[index], position);
      const ring = this.makeRing(0.46 + index * 0.06, colors[index], position, {
        x: Math.PI * 0.56,
        y: index * 0.44,
        z: index * 0.28,
      });
      this.root.add(node, ring);
    });

    const cloud = this.makePointCloud(180, 3.4, spatialColors.paper);
    cloud.position.set(0, 0.05, -0.35);
    this.root.add(cloud);
  }

  buildProgram() {
    const { THREE } = this;
    this.camera.position.set(0, 0, 4.2);

    const center = new THREE.Vector3(0, 0, 0);
    const group = new THREE.Group();
    const positions = [];
    const nodeCount = 7;

    for (let index = 0; index < nodeCount; index += 1) {
      const angle = (index / nodeCount) * Math.PI * 2;
      const depth = index % 2 === 0 ? 0.3 : -0.32;
      positions.push(new THREE.Vector3(Math.cos(angle) * 1.08, Math.sin(angle) * 0.54, depth));
    }

    group.add(this.makeNode(0.18, this.accent, center));
    positions.forEach((position, index) => {
      const nodeColor = index % 3 === 0 ? spatialColors.paper : this.accent;
      group.add(this.makeNode(index % 2 === 0 ? 0.07 : 0.055, nodeColor, position));
      group.add(this.makeLine([center, position], this.accent, 0.26));
    });

    group.add(this.makeRing(1.16, this.accent, center, { x: Math.PI * 0.58, y: 0.35, z: 0.1 }));
    group.add(this.makePointCloud(64, 1.36, spatialColors.ink));
    this.root.add(group);
  }

  bindEvents() {
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.canvas);

    if ("IntersectionObserver" in window) {
      this.visibilityObserver = new IntersectionObserver(
        ([entry]) => {
          this.visible = entry.isIntersecting;
          if (this.visible) this.render(performance.now());
        },
        { rootMargin: "20% 0px" },
      );
      this.visibilityObserver.observe(this.canvas);
    }

    this.canvas.addEventListener("pointermove", (event) => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer = {
        active: true,
        x: ((event.clientX - rect.left) / rect.width - 0.5) * 2,
        y: ((event.clientY - rect.top) / rect.height - 0.5) * -2,
      };
    });

    this.canvas.addEventListener("pointerleave", () => {
      this.pointer.active = false;
    });
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));

    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.render(performance.now());
  }

  tick(time) {
    if (this.visible) this.render(time);
    this.frame = window.requestAnimationFrame((nextTime) => this.tick(nextTime));
  }

  render(time) {
    const pulse = shouldReduceSpatialMotion() ? 0 : time;
    const pointerX = this.pointer.active ? this.pointer.x * 0.18 : 0;
    const pointerY = this.pointer.active ? this.pointer.y * 0.12 : 0;

    this.root.rotation.y = Math.sin(pulse * 0.00022 + this.index) * 0.24 + pointerX;
    this.root.rotation.x = Math.cos(pulse * 0.00018 + this.index) * 0.1 + pointerY;
    this.root.rotation.z = this.type === "program" ? Math.sin(pulse * 0.0002) * 0.08 : 0;

    this.dynamicObjects.forEach(({ object, rate }, index) => {
      object.rotation.y = pulse * rate + index * 0.4;
      object.rotation.x = pulse * rate * 0.5;
    });

    this.renderer.render(this.scene, this.camera);
  }
}

bootSpatialUi();
