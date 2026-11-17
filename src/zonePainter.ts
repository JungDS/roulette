// 효과 구역(부스터, 슬로우, 블랙홀·화이트홀) 그리기. 장애물 아래에 월드 좌표로 그린다.
// 움직임은 물리 시간(time) 을 따라가므로 슬로모션 때는 같이 느려진다.

import type { BlackHoleZone, ForceZone, SlowZone, Zone } from './data/maps';
import type { ColorTheme } from './types/ColorTheme';

const TAU = Math.PI * 2;

/** 화살표 무늬 간격 (월드 단위) */
const CHEVRON_GAP = 1.3;
const CHEVRON_SIZE = 0.38;
/** 화이트홀 반지름 */
export const WARP_EXIT_RADIUS = 0.9;

/** 같은 입력이면 같은 값이 나오는 난수 (0 ~ 1). 거품 위치처럼 매 프레임 같아야 하는 무늬에 쓴다 */
function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
  else ctx.rect(x, y, w, h);
}

function paintForce(ctx: CanvasRenderingContext2D, zone: ForceZone, time: number) {
  const [fx, fy] = zone.force;
  const strength = Math.hypot(fx, fy);
  if (strength === 0) return;
  // 위로 띄우는 바람은 하늘색, 그 밖의 부스터는 주황색
  const lifting = fy < 0 && Math.abs(fy) >= Math.abs(fx);
  const rgb = lifting ? '14, 165, 233' : '249, 115, 22';
  const left = zone.x - zone.w / 2;
  const top = zone.y - zone.h / 2;

  ctx.save();
  roundedRect(ctx, left, top, zone.w, zone.h, 0.5);
  ctx.fillStyle = `rgba(${rgb}, 0.14)`;
  ctx.fill();
  ctx.clip();

  // 힘 방향으로 흐르는 화살표 무늬. 구역 가운데를 원점으로 힘 방향 축(u) 과 그 수직 축(v) 으로 깐다
  const ux = fx / strength;
  const uy = fy / strength;
  const reach = Math.hypot(zone.w, zone.h) / 2 + CHEVRON_GAP;
  const offset = (time * Math.min(9, 1.5 + strength * 0.12)) % CHEVRON_GAP;
  ctx.translate(zone.x, zone.y);
  ctx.transform(ux, uy, -uy, ux, 0, 0);
  ctx.strokeStyle = `rgba(${rgb}, 0.6)`;
  ctx.lineWidth = 0.13;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let u = -reach + offset; u <= reach; u += CHEVRON_GAP) {
    for (let v = -reach; v <= reach; v += CHEVRON_GAP) {
      ctx.moveTo(u - CHEVRON_SIZE, v - CHEVRON_SIZE);
      ctx.lineTo(u, v);
      ctx.lineTo(u - CHEVRON_SIZE, v + CHEVRON_SIZE);
    }
  }
  ctx.stroke();
  ctx.restore();

  ctx.save();
  roundedRect(ctx, left, top, zone.w, zone.h, 0.5);
  ctx.strokeStyle = `rgba(${rgb}, 0.55)`;
  ctx.lineWidth = 0.06;
  ctx.setLineDash([0.35, 0.3]);
  ctx.stroke();
  ctx.restore();
}

function paintSlow(ctx: CanvasRenderingContext2D, zone: SlowZone, time: number) {
  const left = zone.x - zone.w / 2;
  const top = zone.y - zone.h / 2;
  ctx.save();
  roundedRect(ctx, left, top, zone.w, zone.h, 0.7);
  ctx.fillStyle = 'rgba(168, 85, 247, 0.22)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(126, 34, 206, 0.6)';
  ctx.lineWidth = 0.08;
  ctx.stroke();
  ctx.clip();

  // 천천히 떠오르는 거품
  const count = Math.max(4, Math.round(zone.w * zone.h * 0.35));
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.strokeStyle = 'rgba(126, 34, 206, 0.35)';
  ctx.lineWidth = 0.03;
  for (let i = 0; i < count; i++) {
    const radius = 0.08 + hash(i * 3 + 1) * 0.16;
    const speed = 0.25 + hash(i * 3 + 2) * 0.35;
    const x = left + hash(i * 3) * zone.w;
    const travel = (hash(i * 7 + 5) * zone.h + time * speed) % (zone.h + 0.6);
    const y = top + zone.h + 0.3 - travel;
    ctx.beginPath();
    ctx.arc(x + Math.sin(time * 1.3 + i) * 0.08, y, radius, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function paintBlackHole(ctx: CanvasRenderingContext2D, zone: BlackHoleZone, time: number) {
  ctx.save();
  ctx.translate(zone.x, zone.y);

  // 끌려 들어가는 범위
  const halo = ctx.createRadialGradient(0, 0, zone.core, 0, 0, zone.radius);
  halo.addColorStop(0, 'rgba(46, 16, 101, 0.78)');
  halo.addColorStop(0.45, 'rgba(91, 33, 182, 0.3)');
  halo.addColorStop(1, 'rgba(124, 58, 237, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(0, 0, zone.radius, 0, TAU);
  ctx.fill();

  // 안쪽으로 감겨 드는 소용돌이
  ctx.lineCap = 'round';
  const arms = 4;
  for (let arm = 0; arm < arms; arm++) {
    ctx.beginPath();
    const steps = 22;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const r = zone.core + (zone.radius * 0.92 - zone.core) * t;
      const angle = (arm / arms) * TAU + time * 1.6 + t * 2.6;
      const px = Math.cos(angle) * r;
      const py = Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = 'rgba(196, 181, 253, 0.55)';
    ctx.lineWidth = 0.1;
    ctx.stroke();
  }

  // 가운데 (삼키는 곳)
  ctx.beginPath();
  ctx.arc(0, 0, zone.core, 0, TAU);
  ctx.fillStyle = '#0d0420';
  ctx.fill();
  ctx.strokeStyle = '#f0abfc';
  ctx.lineWidth = 0.12 + 0.03 * Math.sin(time * 5);
  ctx.stroke();
  ctx.restore();

  for (const exit of zone.exits) paintWarpExit(ctx, exit.x, exit.y, time);
}

/** 화이트홀: 블랙홀에 삼켜진 구슬이 튀어나오는 곳 */
function paintWarpExit(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  const r = WARP_EXIT_RADIUS;
  ctx.save();
  ctx.translate(x, y);
  const glow = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.7);
  glow.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
  glow.addColorStop(0.5, 'rgba(103, 232, 249, 0.45)');
  glow.addColorStop(1, 'rgba(103, 232, 249, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.7, 0, TAU);
  ctx.fill();

  ctx.rotate(-time * 1.2);
  ctx.strokeStyle = '#0891b2';
  ctx.lineWidth = 0.1;
  ctx.setLineDash([0.45, 0.3]);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

export function paintZones(ctx: CanvasRenderingContext2D, zones: Zone[], time: number, _theme: ColorTheme) {
  for (const zone of zones) {
    switch (zone.type) {
      case 'force':
        paintForce(ctx, zone, time);
        break;
      case 'slow':
        paintSlow(ctx, zone, time);
        break;
      case 'blackhole':
        paintBlackHole(ctx, zone, time);
        break;
    }
  }
}

/** 미니맵용. 구역이 어디 있는지만 색으로 표시한다 */
export function paintZonesFlat(ctx: CanvasRenderingContext2D, zones: Zone[]) {
  for (const zone of zones) {
    if (zone.type === 'blackhole') {
      ctx.fillStyle = 'rgba(91, 33, 182, 0.35)';
      ctx.beginPath();
      ctx.arc(zone.x, zone.y, zone.radius, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#2e1065';
      ctx.beginPath();
      ctx.arc(zone.x, zone.y, Math.max(zone.core, 1), 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#22d3ee';
      for (const exit of zone.exits) {
        ctx.beginPath();
        ctx.arc(exit.x, exit.y, 1, 0, TAU);
        ctx.fill();
      }
    } else {
      const lifting = zone.type === 'force' && zone.force[1] < 0;
      ctx.fillStyle =
        zone.type === 'slow'
          ? 'rgba(168, 85, 247, 0.4)'
          : lifting
            ? 'rgba(14, 165, 233, 0.35)'
            : 'rgba(249, 115, 22, 0.35)';
      ctx.fillRect(zone.x - zone.w / 2, zone.y - zone.h / 2, zone.w, zone.h);
    }
  }
}
