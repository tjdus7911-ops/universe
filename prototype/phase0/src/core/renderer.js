import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// 품질 단계 — 모바일은 처음부터 '중간'으로 시작 (PHASE 1에서 FPS 기반 자동 조절로 확장)
export const QUALITY = {
  high: { name: '고', dpr: 2, msaa: 4, bloom: true, bloomScale: 0.5, shadows: 2048, stars: 7000 },
  medium: { name: '중', dpr: 1.5, msaa: 2, bloom: true, bloomScale: 0.35, shadows: 1024, stars: 4500 },
  low: { name: '저', dpr: 1, msaa: 0, bloom: false, bloomScale: 0.25, shadows: 0, stars: 2500 },
};

export function detectQuality() {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 600;
  return coarse || small ? 'medium' : 'high';
}

export function createRenderer(canvas, qualityKey) {
  let q = QUALITY[qualityKey];
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = q.shadows > 0;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: q.msaa });
  const composer = new EffectComposer(renderer, target);
  const renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.55, 0.85);
  const output = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(bloom);
  composer.addPass(output);

  let w = 1, h = 1;
  const api = {
    renderer,
    composer,
    bloom,
    get quality() { return q; },
    setQuality(key) {
      q = QUALITY[key];
      renderer.shadowMap.enabled = q.shadows > 0;
      target.samples = q.msaa;
      bloom.enabled = q.bloom;
      api.setSize(w, h);
    },
    setSize(width, height) {
      w = Math.max(1, Math.floor(width));
      h = Math.max(1, Math.floor(height));
      const dpr = Math.min(window.devicePixelRatio || 1, q.dpr);
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      composer.setPixelRatio(dpr);
      composer.setSize(w, h);
      bloom.resolution.set(w * dpr * q.bloomScale, h * dpr * q.bloomScale);
    },
    render(scene, camera, opts = {}) {
      renderPass.scene = scene;
      renderPass.camera = camera;
      bloom.enabled = q.bloom && opts.bloom !== false;
      bloom.strength = opts.bloomStrength ?? 0.55;
      bloom.threshold = opts.bloomThreshold ?? 0.85;
      bloom.radius = opts.bloomRadius ?? 0.55;
      renderer.toneMappingExposure = opts.exposure ?? 1.0;
      composer.render();
    },
  };
  bloom.enabled = q.bloom;
  return api;
}

// 캔버스로 만든 텍스처 (라벨·패널·광고판 화면 등)
export function canvasTexture(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (opts.repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  t.needsUpdate = true;
  return t;
}

export const FONT = '"Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", "Noto Sans CJK KR", "Malgun Gothic", system-ui, sans-serif';

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
