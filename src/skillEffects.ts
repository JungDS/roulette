// 스킬과 맵 요소의 화면 연출 (번개, 자리 바꾸기, 중력장, 블랙홀 워프, 부서지는 블록).
// 모두 월드 좌표에 그리고, zoom 으로 나눠 선 두께가 화면에서 일정하게 보이게 한다.

import type { GameObject } from './gameObject';
import type { VectorLike } from './types/VectorLike';

const TAU = Math.PI * 2;

/** 번개: 쏜 구슬에서 맞은 구슬까지 지그재그 선 */
export class LightningEffect implements GameObject {
  isDestroy = false;
  private elapsed = 0;
  private path: [number, number][] = [];
  private pathAge = Infinity;

  constructor(
    private from: VectorLike,
    private to: VectorLike
  ) {}

  update(deltaTime: number) {
    this.elapsed += deltaTime;
    this.pathAge += deltaTime;
    if (this.elapsed > 520) this.isDestroy = true;
  }

  private rebuild() {
    const { x: ax, y: ay } = this.from;
    const { x: bx, y: by } = this.to;
    const length = Math.hypot(bx - ax, by - ay);
    const segments = Math.max(4, Math.min(24, Math.round(length / 1.2)));
    const nx = length > 0 ? -(by - ay) / length : 0;
    const ny = length > 0 ? (bx - ax) / length : 0;
    this.path = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const jitter = i === 0 || i === segments ? 0 : (Math.random() - 0.5) * Math.min(1.6, length * 0.12);
      this.path.push([ax + (bx - ax) * t + nx * jitter, ay + (by - ay) * t + ny * jitter]);
    }
    this.pathAge = 0;
  }

  render(ctx: CanvasRenderingContext2D, zoom: number) {
    if (this.pathAge > 70) this.rebuild();
    const fade = 1 - Math.max(0, (this.elapsed - 320) / 200);
    ctx.save();
    ctx.globalAlpha = Math.max(0, fade);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    this.path.forEach(([x, y], i) => {
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#b45309';
    ctx.lineWidth = 7 / zoom;
    ctx.stroke();
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 3.5 / zoom;
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2 / zoom;
    ctx.stroke();

    // 맞은 자리의 번쩍임
    ctx.beginPath();
    ctx.arc(this.to.x, this.to.y, 0.5 + (this.elapsed / 520) * 1.2, 0, TAU);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3 / zoom;
    ctx.stroke();
    ctx.restore();
  }
}

/** 자리 바꾸기 예고: 두 구슬을 잇는 선과 조여드는 고리 */
export class SwapEffect implements GameObject {
  isDestroy = false;
  private elapsed = 0;

  constructor(
    private a: VectorLike,
    private b: VectorLike,
    private delayMs: number
  ) {}

  update(deltaTime: number) {
    this.elapsed += deltaTime;
    if (this.elapsed > this.delayMs + 350) this.isDestroy = true;
  }

  render(ctx: CanvasRenderingContext2D, zoom: number) {
    const charge = Math.min(1, this.elapsed / this.delayMs);
    const after = Math.max(0, (this.elapsed - this.delayMs) / 350);
    ctx.save();
    ctx.globalAlpha = 1 - after;
    ctx.strokeStyle = '#9333ea';
    ctx.lineCap = 'round';

    ctx.setLineDash([0.5, 0.35]);
    ctx.lineDashOffset = -this.elapsed / 60;
    ctx.lineWidth = 3 / zoom;
    ctx.beginPath();
    ctx.moveTo(this.a.x, this.a.y);
    ctx.lineTo(this.b.x, this.b.y);
    ctx.stroke();
    ctx.setLineDash([]);

    for (const p of [this.a, this.b]) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 0.45 + (1 - charge) * 1.3 + after * 1.5, 0, TAU);
      ctx.lineWidth = 4 / zoom;
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** 스킬이 만든 중력장. 물리 시각이 until 을 지날 때까지 남는다 */
export class GravityWellEffect implements GameObject {
  isDestroy = false;
  private elapsed = 0;

  constructor(
    private x: number,
    private y: number,
    private radius: number,
    private clock: () => number,
    private until: number
  ) {}

  update(deltaTime: number) {
    this.elapsed += deltaTime;
    if (this.clock() >= this.until) this.isDestroy = true;
  }

  render(ctx: CanvasRenderingContext2D, zoom: number) {
    const appear = Math.min(1, this.elapsed / 200);
    const remaining = this.until - this.clock();
    const alpha = appear * Math.min(1, Math.max(0, remaining / 0.3));
    const time = this.elapsed / 1000;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(this.x, this.y);
    const halo = ctx.createRadialGradient(0, 0, 0.2, 0, 0, this.radius);
    halo.addColorStop(0, 'rgba(46, 16, 101, 0.85)');
    halo.addColorStop(0.5, 'rgba(91, 33, 182, 0.3)');
    halo.addColorStop(1, 'rgba(124, 58, 237, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(196, 181, 253, 0.7)';
    ctx.lineWidth = 2.5 / zoom;
    ctx.lineCap = 'round';
    for (let arm = 0; arm < 3; arm++) {
      ctx.beginPath();
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        const r = 0.3 + (this.radius * 0.9 - 0.3) * t;
        const angle = (arm / 3) * TAU + time * 4 + t * 2.4;
        if (i === 0) ctx.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
        else ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

/** 블랙홀에 삼켜지거나(into) 화이트홀에서 튀어나올 때의 고리 */
export class WarpEffect implements GameObject {
  isDestroy = false;
  private elapsed = 0;

  constructor(
    private x: number,
    private y: number,
    private into: boolean
  ) {}

  update(deltaTime: number) {
    this.elapsed += deltaTime;
    if (this.elapsed > 380) this.isDestroy = true;
  }

  render(ctx: CanvasRenderingContext2D, zoom: number) {
    const t = Math.min(1, this.elapsed / 380);
    ctx.save();
    ctx.globalAlpha = 1 - t * t;
    ctx.strokeStyle = this.into ? '#c084fc' : '#06b6d4';
    ctx.lineWidth = 4 / zoom;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.into ? 1.6 * (1 - t) + 0.2 : 0.3 + 1.9 * t, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }
}

/** 부서진 블록의 조각 */
export class BreakEffect implements GameObject {
  isDestroy = false;
  private elapsed = 0;
  private shards: { angle: number; speed: number; spin: number }[] = [];

  constructor(
    private x: number,
    private y: number,
    private color: string
  ) {
    for (let i = 0; i < 7; i++) {
      this.shards.push({ angle: Math.random() * TAU, speed: 2 + Math.random() * 4, spin: (Math.random() - 0.5) * 12 });
    }
  }

  update(deltaTime: number) {
    this.elapsed += deltaTime;
    if (this.elapsed > 450) this.isDestroy = true;
  }

  render(ctx: CanvasRenderingContext2D) {
    const t = this.elapsed / 1000;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - this.elapsed / 450);
    ctx.fillStyle = this.color;
    for (const shard of this.shards) {
      const px = this.x + Math.cos(shard.angle) * shard.speed * t;
      const py = this.y + Math.sin(shard.angle) * shard.speed * t + 5 * t * t;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(shard.spin * t);
      ctx.fillRect(-0.14, -0.09, 0.28, 0.18);
      ctx.restore();
    }
    ctx.restore();
  }
}
