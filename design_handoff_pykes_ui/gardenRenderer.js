// Deterministic pixel-art garden renderer. Same seed + stage always produces
// the same layout; `progress` (0-1) animates the newest layer growing in.

export const STAGE_COUNT = 6; // stages 0..5

export function strHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h >>> 0;
}

function hash01(seed, i) {
  let h = (seed ^ Math.imul(i + 1, 2654435761)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295;
}

const PAL = {
  skyTop: '#241d38', skyBot: '#463758',
  soilBase: '#4a3728', soilDark: '#3a2a1d', soilLight: '#5c4530',
  grass: '#4f8f4a', grassHi: '#6bb85f',
  flowerA: '#e8823c', flowerB: '#c95d8f', flowerC: '#e0c34a', flowerCenter: '#fff4d6',
  rock: '#6b6b73', rockDark: '#54545c',
  bush: '#3f7a45', bushDark: '#2f5c35',
  trunk: '#5c4530', canopy: '#3d6a42', canopyHi: '#4f8a52',
  shedWall: '#7a6a55', shedRoof: '#8a3f3f',
  fence: '#6b5540',
  pond: '#3a6ea5', pondHi: '#6fb3d8',
  sparkle: '#ffe9a8', sparkleGreen: '#a6e28a',
};

function px(ctx, cell, gx, gy, w, h, color, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(gx * cell), Math.round(gy * cell), Math.ceil(w * cell), Math.ceil(h * cell));
  ctx.globalAlpha = 1;
}

function drawSky(ctx, size, groundY, cell) {
  const g = ctx.createLinearGradient(0, 0, 0, groundY * cell);
  g.addColorStop(0, PAL.skyTop);
  g.addColorStop(1, PAL.skyBot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, groundY * cell);
}

function drawSoil(ctx, cell, G, groundY, seed) {
  for (let x = 0; x < G; x++) {
    for (let y = groundY; y < G; y++) {
      const r = hash01(seed, x * 97 + y * 13);
      let c = PAL.soilBase;
      if (r < 0.14) c = PAL.soilDark;
      else if (r > 0.9) c = PAL.soilLight;
      px(ctx, cell, x, y, 1, 1, c);
    }
  }
}

function withGrowth(ctx, cell, cx, cy, amount, drawFn) {
  ctx.save();
  const px_ = cx * cell, py_ = cy * cell;
  ctx.globalAlpha = 0.2 + 0.8 * amount;
  ctx.translate(px_, py_);
  const s = 0.55 + 0.45 * amount;
  ctx.scale(s, s);
  ctx.translate(-px_, -py_);
  drawFn();
  ctx.restore();
}

function drawGrassSprouts(ctx, cell, G, groundY, seed, amount) {
  for (let x = 0; x < G; x++) {
    const r = hash01(seed + 11, x);
    if (r < 0.5) {
      const h = r < 0.2 ? 2 : 1;
      withGrowth(ctx, cell, x + 0.5, groundY, amount, () => {
        px(ctx, cell, x, groundY - h, 1, h, PAL.grass);
        px(ctx, cell, x, groundY - h, 1, 1, PAL.grassHi);
      });
    }
  }
}

function drawFlowersPlants(ctx, cell, G, groundY, seed, amount) {
  const colors = [PAL.flowerA, PAL.flowerB, PAL.flowerC];
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(hash01(seed + 21, i) * (G - 2)) + 1;
    const col = colors[Math.floor(hash01(seed + 22, i) * colors.length)];
    withGrowth(ctx, cell, x + 0.5, groundY - 1, amount, () => {
      px(ctx, cell, x, groundY - 1, 1, 1, PAL.grass);
      px(ctx, cell, x, groundY - 2, 1, 1, col);
      px(ctx, cell, x, groundY - 2, 1, 1, PAL.flowerCenter, 0.5);
    });
  }
  for (let i = 0; i < 3; i++) {
    const x = Math.floor(hash01(seed + 23, i) * (G - 3)) + 1;
    withGrowth(ctx, cell, x + 1, groundY - 1, amount, () => {
      px(ctx, cell, x, groundY - 2, 2, 2, PAL.bush);
      px(ctx, cell, x, groundY - 2, 1, 1, PAL.bushDark);
    });
  }
}

function drawRocksBushes(ctx, cell, G, groundY, seed, amount) {
  for (let i = 0; i < 3; i++) {
    const x = Math.floor(hash01(seed + 31, i) * (G - 3)) + 1;
    withGrowth(ctx, cell, x + 1, groundY - 0.5, amount, () => {
      px(ctx, cell, x, groundY - 1, 2, 1, PAL.rock);
      px(ctx, cell, x, groundY - 1, 1, 1, PAL.rockDark);
    });
  }
  for (let i = 0; i < 2; i++) {
    const x = Math.floor(hash01(seed + 32, i) * (G - 4)) + 1;
    withGrowth(ctx, cell, x + 1.5, groundY - 1, amount, () => {
      px(ctx, cell, x, groundY - 2, 3, 2, PAL.bush);
      px(ctx, cell, x, groundY - 2, 1, 1, PAL.bushDark);
      px(ctx, cell, x + 2, groundY - 1, 1, 1, PAL.bushDark);
    });
  }
}

function drawTreeAndShed(ctx, cell, G, groundY, seed, amount) {
  const tx = Math.floor(hash01(seed + 41, 0) * (G - 6)) + 2;
  withGrowth(ctx, cell, tx + 0.5, groundY - 3, amount, () => {
    px(ctx, cell, tx, groundY - 3, 1, 3, PAL.trunk);
    px(ctx, cell, tx - 2, groundY - 6, 5, 3, PAL.canopy);
    px(ctx, cell, tx - 1, groundY - 7, 3, 1, PAL.canopy);
    px(ctx, cell, tx - 2, groundY - 6, 2, 1, PAL.canopyHi);
  });
  const sx = G - Math.floor(hash01(seed + 42, 0) * 4) - 5;
  withGrowth(ctx, cell, sx + 1.5, groundY - 2, amount, () => {
    px(ctx, cell, sx, groundY - 2, 4, 2, PAL.shedWall);
    px(ctx, cell, sx - 1, groundY - 3, 6, 1, PAL.shedRoof);
    px(ctx, cell, sx + 1, groundY - 1, 1, 1, PAL.soilDark);
  });
}

function drawFenceExtras(ctx, cell, G, groundY, seed, amount) {
  withGrowth(ctx, cell, G / 2, groundY, amount, () => {
    for (let x = 0; x < G; x += 3) {
      px(ctx, cell, x, groundY - 1, 1, 1, PAL.fence);
    }
  });
  const px0 = Math.floor(hash01(seed + 51, 0) * (G - 6)) + 2;
  withGrowth(ctx, cell, px0 + 2, groundY - 0.5, amount, () => {
    px(ctx, cell, px0, groundY - 1, 4, 1, PAL.pond);
    px(ctx, cell, px0, groundY - 1, 2, 1, PAL.pondHi, 0.6);
  });
}

function drawSparkles(ctx, size, cell, G, seed, stage, progress) {
  const alpha = Math.sin(Math.min(progress, 1) * Math.PI);
  if (alpha <= 0.02) return;
  for (let i = 0; i < 8; i++) {
    const x = hash01(seed + stage * 7, i) * size;
    const y = hash01(seed + stage * 7 + 3, i) * size * 0.75;
    const c = i % 2 === 0 ? PAL.sparkle : PAL.sparkleGreen;
    ctx.globalAlpha = alpha * (0.4 + 0.6 * hash01(seed + stage, i + 9));
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
  }
  ctx.globalAlpha = 1;
}

export function drawGarden(ctx, { stage = 0, seed = 0, progress = 1, size = 256 } = {}) {
  const clamped = Math.max(0, Math.min(5, stage));
  const G = 20;
  const groundY = 12;
  const cell = size / G;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, size, size);
  drawSky(ctx, size, groundY, cell);
  drawSoil(ctx, cell, G, groundY, seed);

  const layers = [
    { min: 1, draw: drawGrassSprouts },
    { min: 2, draw: drawFlowersPlants },
    { min: 3, draw: drawRocksBushes },
    { min: 4, draw: drawTreeAndShed },
    { min: 5, draw: drawFenceExtras },
  ];
  layers.forEach((l) => {
    if (l.min > clamped) return;
    const animated = l.min === clamped && progress < 1;
    l.draw(ctx, cell, G, groundY, seed, animated ? progress : 1);
  });

  if (progress < 1 && clamped >= 1) drawSparkles(ctx, size, cell, G, seed, clamped, progress);
}
