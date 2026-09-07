import * as THREE from 'three';

const TEXTURE_WIDTH = 4096;
const TEXTURE_HEIGHT = 512;

export async function createTextTexture() {
  await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = TEXTURE_WIDTH;
  canvas.height = TEXTURE_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');

  ctx.clearRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
  ctx.font = '700 106px Doto, ui-monospace, monospace';
  ctx.fillStyle = '#1739EF';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  const rows = [
    { text: 'CUT THE NOISE  ·  FIND THE SIGNAL  ·  CUT THE NOISE  ·  FIND THE SIGNAL  ·  ', y: 188 },
    { text: 'SHIP THE MVP  ·  MAKE IT REAL  ·  SHIP THE MVP  ·  MAKE IT REAL  ·  ', y: 324 },
  ];

  rows.forEach(({ text, y }) => {
    const measured = ctx.measureText(text).width;
    const scale = TEXTURE_WIDTH / measured;
    ctx.save();
    ctx.scale(scale, 1);
    ctx.fillText(text, 0, y);
    ctx.restore();
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(1, 1);
  texture.offset.set(0, 0);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}
