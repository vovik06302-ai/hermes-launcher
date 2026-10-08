'use strict';

const canvas = document.getElementById('bg-sphere');
const ctx = canvas.getContext('2d');
const NUM_POINTS = 420;
const points = [];
const galaxyStars = Array.from({ length: 760 }, () => ({
  arm: Math.floor(Math.random() * 4),
  distance: Math.pow(Math.random(), 0.68),
  spread: (Math.random() - 0.5) * 0.42,
  size: 0.45 + Math.random() * 1.45,
  phase: Math.random() * Math.PI * 2,
  color: Math.random() > 0.72 ? '#d5b5ff' : (Math.random() > 0.45 ? '#8bdcff' : '#ffffff')
}));
const planets = [
  { name: 'Меркурий', color: '#b9a99b', size: 5, speed: 0.82, phase: 0.2 },
  { name: 'Венера', color: '#f5c27a', size: 7, speed: 0.62, phase: 1.7 },
  { name: 'Земля', color: '#54a8ff', size: 8, speed: 0.48, phase: 3.1 },
  { name: 'Марс', color: '#ff715b', size: 6.5, speed: 0.39, phase: 4.4 },
  { name: 'Юпитер', color: '#e7b783', size: 14, speed: 0.27, phase: 5.3 },
  { name: 'Сатурн', color: '#f1d49a', size: 12, speed: 0.21, phase: 2.3, ring: true },
  { name: 'Уран', color: '#8ce4e8', size: 9, speed: 0.16, phase: 0.9 },
  { name: 'Нептун', color: '#668cff', size: 9, speed: 0.13, phase: 3.8 }
];

let rotation = 0;
let time = 0;
let isAnimated = true;
let animFrameId = null;
let lastFrameTime = 0;
const FPS_INTERVAL = 1000 / 30; // ~30 FPS

for (let index = 0; index < NUM_POINTS; index += 1) {
  const phi = Math.acos(-1 + (2 * index) / NUM_POINTS);
  const theta = Math.sqrt(NUM_POINTS * Math.PI) * phi;
  points.push({ phi, theta, hue: Math.random() * 360, hueSpeed: 0.2 + Math.random() * 0.5, pulseOffset: Math.random() * Math.PI * 2 });
}

function resize() {
  const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
  canvas.width = Math.floor(window.innerWidth * ratio);
  canvas.height = Math.floor(window.innerHeight * ratio);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  if (!shouldAnimate()) {
    renderFrame();
  }
}

function isReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function shouldAnimate() {
  return isAnimated && !document.hidden && !isReducedMotion();
}

function renderFrame() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  ctx.clearRect(0, 0, width, height);
  const cx = width / 2;
  const cy = height / 2;
  const baseRadius = Math.min(width, height) * 0.38;
  
  if (shouldAnimate()) {
    rotation += 0.003;
    time += 0.02;
  }
  
  const spherePulse = 1 + 0.055 * Math.sin(time * 1.8);
  drawMilkyWay(width, height);
  
  const projected = points.map(point => {
    const theta = point.theta + rotation;
    const pulse = 1 + 0.08 * Math.sin(time + point.pulseOffset);
    const radius = baseRadius * spherePulse * pulse;
    const x = radius * Math.sin(point.phi) * Math.cos(theta);
    const y = radius * Math.sin(point.phi) * Math.sin(theta);
    const z = radius * Math.cos(point.phi);
    if (shouldAnimate()) {
      point.hue = (point.hue + point.hueSpeed) % 360;
    }
    return { x: cx + x, y: cy + y, z, hue: point.hue };
  });
  
  projected.sort((a, b) => a.z - b.z);
  for (const point of projected) {
    const scale = (point.z + baseRadius) / (2 * baseRadius);
    const size = 1.5 + scale * 3;
    const alpha = 0.3 + scale * 0.7;
    ctx.beginPath();
    ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
    ctx.fillStyle = `hsla(${point.hue}, 90%, 65%, ${alpha})`;
    ctx.shadowBlur = 8;
    ctx.shadowColor = `hsla(${point.hue}, 90%, 65%, ${alpha})`;
    ctx.fill();
  }
  drawSolarSystem(width, height);
}

function tick(now) {
  if (!shouldAnimate()) {
    animFrameId = null;
    return;
  }
  animFrameId = requestAnimationFrame(tick);
  if (now - lastFrameTime < FPS_INTERVAL) return;
  lastFrameTime = now;
  renderFrame();
}

function startLoop() {
  if (!isAnimated) {
    canvas.style.display = 'none';
    stopLoop();
    return;
  }
  canvas.style.display = 'block';
  if (shouldAnimate()) {
    if (!animFrameId) {
      animFrameId = requestAnimationFrame(tick);
    }
  } else {
    renderFrame();
  }
}

function stopLoop() {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
}

function drawMilkyWay(width, height) {
  const centerX = width * 0.29;
  const centerY = height * 0.52;
  const radiusX = Math.min(width * 0.39, 460);
  const radiusY = Math.min(height * 0.35, 310);
  const rotationAngle = time * 0.012;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.translate(centerX, centerY);
  ctx.rotate(-0.18);

  const core = ctx.createRadialGradient(0, 0, 2, 0, 0, radiusX * 0.72);
  core.addColorStop(0, 'rgba(255, 219, 184, 0.3)');
  core.addColorStop(0.2, 'rgba(177, 143, 255, 0.17)');
  core.addColorStop(0.58, 'rgba(72, 154, 255, 0.075)');
  core.addColorStop(1, 'rgba(30, 79, 180, 0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.ellipse(0, 0, radiusX * 0.82, radiusY * 0.82, 0, 0, Math.PI * 2);
  ctx.fill();

  galaxyStars.forEach(star => {
    const armAngle = star.arm * Math.PI / 2 + star.distance * 4.7 + star.spread + rotationAngle;
    const radial = star.distance;
    const x = Math.cos(armAngle) * radial * radiusX;
    const y = Math.sin(armAngle) * radial * radiusY;
    const twinkle = 0.48 + 0.52 * Math.sin(time * 1.7 + star.phase);
    const density = 1 - radial * 0.5;

    ctx.globalAlpha = (0.2 + twinkle * 0.58) * density;
    ctx.fillStyle = star.color;
    ctx.shadowColor = star.color;
    ctx.shadowBlur = star.size * 3.5;
    ctx.beginPath();
    ctx.arc(x, y, star.size * (0.65 + twinkle * 0.45), 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

function drawSolarSystem(width, height) {
  const scale = Math.min(width * 0.32, height * 0.36, 330);
  const centerX = width * 0.29;
  const centerY = height * 0.52;
  const orbitYScale = 0.48;

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.lineWidth = 1;

  planets.forEach((planet, index) => {
    const orbit = scale * (0.18 + index * 0.105);
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, orbit, orbit * orbitYScale, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(166, 203, 255, 0.22)';
    ctx.stroke();
  });

  const sunRadius = Math.max(15, scale * 0.09) * (1 + 0.12 * Math.sin(time * 2.1));
  const sunGlow = ctx.createRadialGradient(centerX, centerY, sunRadius * 0.25, centerX, centerY, sunRadius * 4.2);
  sunGlow.addColorStop(0, 'rgba(255, 248, 190, 0.96)');
  sunGlow.addColorStop(0.18, 'rgba(255, 177, 65, 0.8)');
  sunGlow.addColorStop(1, 'rgba(255, 119, 35, 0)');
  ctx.fillStyle = sunGlow;
  ctx.beginPath();
  ctx.arc(centerX, centerY, sunRadius * 4.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff2a8';
  ctx.shadowColor = '#ffb347';
  ctx.shadowBlur = 24;
  ctx.beginPath();
  ctx.arc(centerX, centerY, sunRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  planets.forEach((planet, index) => {
    const orbit = scale * (0.18 + index * 0.105);
    const angle = planet.phase + time * planet.speed * 0.035;
    const x = centerX + Math.cos(angle) * orbit;
    const y = centerY + Math.sin(angle) * orbit * orbitYScale;
    const radius = Math.max(5, planet.size * Math.min(1.35, scale / 150));

    if (planet.ring) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-0.22);
      ctx.strokeStyle = 'rgba(250, 220, 157, 0.86)';
      ctx.lineWidth = Math.max(1.5, radius * 0.32);
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * 1.8, radius * 0.62, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    const body = ctx.createRadialGradient(
      x - radius * 0.35, y - radius * 0.4, radius * 0.08,
      x, y, radius * 1.35
    );
    body.addColorStop(0, '#ffffff');
    body.addColorStop(0.24, planet.color);
    body.addColorStop(1, 'rgba(20, 28, 52, 0.92)');
    ctx.fillStyle = body;
    ctx.shadowColor = planet.color;
    ctx.shadowBlur = radius * 2.4;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  });

  ctx.restore();
}

window.addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopLoop();
  else startLoop();
});

window.setBgAnimated = function(enabled) {
  isAnimated = Boolean(enabled);
  if (isAnimated) {
    startLoop();
  } else {
    stopLoop();
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    canvas.style.display = 'none';
  }
};

resize();
startLoop();
