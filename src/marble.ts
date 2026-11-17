import { Skills, STUCK_DELAY, Themes } from './data/constants';
import type { IPhysics } from './IPhysics';
import options from './options';
import type { ColorTheme } from './types/ColorTheme';
import type { VectorLike } from './types/VectorLike';
import { transformGuard } from './utils/transformGuard';
import { rad } from './utils/utils';
import { Vector } from './utils/Vector';

export class Marble {
  type = 'marble' as const;
  name: string = '';
  size: number = 0.5;
  color: string = 'red';
  hue: number = 0;
  impact: number = 0;
  weight: number = 1;
  skill: Skills = Skills.None;
  isActive: boolean = false;
  /** 이 물리 시각까지 번개에 맞아 굼뜬 상태 (catchUp.ts) */
  stunUntil: number = 0;
  /** 이 물리 시각까지 터보 상태 (catchUp.ts) */
  boostUntil: number = 0;

  private _skillRate = 0.0005;
  private _coolTime = 5000;
  private _maxCoolTime = 5000;
  private _stuckTime = 0;
  private lastPosition: VectorLike = { x: 0, y: 0 };
  private theme: ColorTheme = Themes.light;

  private physics: IPhysics;

  id: number;

  get position() {
    return this.physics.getMarblePosition(this.id) || { x: 0, y: 0, angle: 0 };
  }

  get x() {
    return this.position.x;
  }

  set x(v: number) {
    this.position.x = v;
  }

  get y() {
    return this.position.y;
  }

  set y(v: number) {
    this.position.y = v;
  }

  get angle() {
    return this.position.angle;
  }

  constructor(physics: IPhysics, order: number, max: number, name?: string, weight: number = 1) {
    this.name = name || `M${order}`;
    this.weight = weight;
    this.physics = physics;

    this._maxCoolTime = 1000 + (1 - this.weight) * 4000;
    this._coolTime = this._maxCoolTime * Math.random();
    this._skillRate = 0.2 * this.weight;

    const maxLine = Math.ceil(max / 10);
    const line = Math.floor(order / 10);
    const lineDelta = -Math.max(0, Math.ceil(maxLine - 5));
    this.hue = (360 / max) * order;
    this.color = `hsl(${this.hue} 100% 70%)`;
    this.id = order;

    physics.createMarble(order, 10.25 + (order % 10) * 0.6, maxLine - line + lineDelta);
  }

  /**
   * @param deltaTime 벽시계 기준 경과(ms). 스킬 쿨타임 등 연출 시간에 쓴다
   * @param timeScale 이 틱에서 물리가 실제로 진행된 비율(슬로모션이면 1 미만).
   *   정지 판정은 이동 거리로 하므로 물리 시간에 맞춰 문턱을 줄여야 한다. 안 그러면 슬로모션 중
   *   천천히 구르는 구슬이 멈춘 것으로 오판되어 골인 직전에 랜덤으로 튕겨진다
   */
  update(deltaTime: number, timeScale: number = 1) {
    const stuckThreshold = 0.00001 * timeScale * timeScale;
    if (this.isActive && Vector.lenSq(Vector.sub(this.lastPosition, this.position)) < stuckThreshold) {
      // 누적에는 timeScale 을 곱하지 않는다. 이건 화면이 굳는 걸 막는 워치독이라 관객 체감 시간이 기준이다.
      // 물리 시간으로 바꾸면 슬로모션이 깊을수록 발동이 늦어지는데, 타겟 구슬이 멈추면 _goalDist 가 고정되어
      // 슬로모션이 풀리지 않으므로 교착을 깨야 할 상황에서 워치독이 오히려 무뎌진다
      this._stuckTime += deltaTime;

      if (this._stuckTime > STUCK_DELAY) {
        this.physics.shakeMarble(this.id);
        this._stuckTime = 0;
      }
    } else {
      this._stuckTime = 0;
    }
    this.lastPosition = { x: this.position.x, y: this.position.y };

    this.skill = Skills.None;
    if (this.impact) {
      this.impact = Math.max(0, this.impact - deltaTime);
    }
    if (!this.isActive) return;
    if (options.useSkills) {
      this._updateSkillInformation(deltaTime);
    }
  }

  private _updateSkillInformation(deltaTime: number) {
    if (this._coolTime > 0) {
      this._coolTime -= deltaTime;
    }

    if (this._coolTime <= 0) {
      this.skill = Math.random() < this._skillRate ? Skills.Impact : Skills.None;
      this._coolTime = this._maxCoolTime;
    }
  }

  render(
    ctx: CanvasRenderingContext2D,
    zoom: number,
    outline: boolean,
    isMinimap: boolean = false,
    skin: CanvasImageSource | undefined,
    viewPort: { x: number; y: number; w: number; h: number; zoom: number },
    theme: ColorTheme
  ) {
    this.theme = theme;
    const viewPortHw = viewPort.w / viewPort.zoom / 2;
    const viewPortHh = viewPort.h / viewPort.zoom / 2;
    const viewPortLeft = viewPort.x - viewPortHw;
    const viewPortRight = viewPort.x + viewPortHw;
    const viewPortTop = viewPort.y - viewPortHh;
    const viewPortBottom = viewPort.y + viewPortHh;
    const halfSize = this.size / 2;
    const isOutsideView = (
      this.x + halfSize < viewPortLeft ||
      this.x - halfSize > viewPortRight ||
      this.y + halfSize < viewPortTop ||
      this.y - halfSize > viewPortBottom
    );
    if (!isMinimap && isOutsideView) {
      return;
    }
    const transform = ctx.getTransform();
    if (isMinimap) {
      this._renderMinimap(ctx);
    } else {
      this._renderNormal(ctx, zoom, outline, skin);
    }
    ctx.setTransform(transform);
  }

  private _renderMinimap(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = this.theme.light ? `hsl(${this.hue} ${this.theme.marbleSaturation}% 48%)` : this.color;
    this._drawMarbleBody(ctx, true);
  }

  private _drawMarbleBody(ctx: CanvasRenderingContext2D, isMinimap: boolean) {
    ctx.beginPath();
    ctx.arc(this.x, this.y, isMinimap ? this.size : this.size / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  private _renderNormal(ctx: CanvasRenderingContext2D, zoom: number, outline: boolean, skin?: CanvasImageSource) {
    const hs = this.size / 2;
    const theme = this.theme;
    const lightness = theme.marbleLightness + 25 * Math.min(1, this.impact / 500);
    const now = this.physics.elapsed;

    if (now < this.boostUntil) this._drawBoost(ctx);

    if (theme.light) {
      // 바닥에 떨어지는 그림자
      ctx.fillStyle = theme.shadow;
      ctx.beginPath();
      ctx.arc(this.x + hs * 0.12, this.y + hs * 0.3, hs, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = `hsl(${this.hue} ${theme.marbleSaturation}% ${lightness}%)`;

    if (skin) {
      transformGuard(ctx, () => {
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.drawImage(skin, -hs, -hs, hs * 2, hs * 2);
      });
    } else {
      this._drawMarbleBody(ctx, false);
      if (theme.light) {
        // 짙은 테두리와 반사광으로 유리구슬처럼 보이게 한다
        ctx.strokeStyle = `hsl(${this.hue} ${theme.marbleSaturation}% ${lightness - 26}%)`;
        ctx.lineWidth = 1.5 / zoom;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.62)';
        ctx.beginPath();
        ctx.ellipse(this.x - hs * 0.32, this.y - hs * 0.36, hs * 0.34, hs * 0.2, -0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (now < this.stunUntil) this._drawStun(ctx, zoom, now);

    ctx.shadowColor = '';
    ctx.shadowBlur = 0;
    this._drawName(ctx, zoom);

    if (outline) {
      this._drawOutline(ctx, 2 / zoom);
    }

    if (options.useSkills) {
      this._renderCoolTime(ctx, zoom);
    }
  }

  /** 터보: 달리는 반대쪽으로 불꽃 꼬리를 단다 */
  private _drawBoost(ctx: CanvasRenderingContext2D) {
    const hs = this.size / 2;
    const v = this.physics.getMarbleVelocity(this.id);
    const speed = Math.hypot(v.x, v.y);
    const dx = speed > 0.01 ? -v.x / speed : 0;
    const dy = speed > 0.01 ? -v.y / speed : -1;
    const colors = ['rgba(250, 204, 21, 0.85)', 'rgba(249, 115, 22, 0.6)', 'rgba(239, 68, 68, 0.35)'];
    for (let i = colors.length - 1; i >= 0; i--) {
      const reach = hs * (0.7 + i * 0.75);
      ctx.fillStyle = colors[i];
      ctx.beginPath();
      ctx.arc(this.x + dx * reach, this.y + dy * reach, hs * (1.05 - i * 0.22), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** 번개에 맞음: 구슬을 어둡게 덮고 둘레에 전기 고리를 돌린다 */
  private _drawStun(ctx: CanvasRenderingContext2D, zoom: number, now: number) {
    const hs = this.size / 2;
    ctx.fillStyle = 'rgba(40, 40, 60, 0.4)';
    ctx.beginPath();
    ctx.arc(this.x, this.y, hs, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 2.5 / zoom;
    ctx.setLineDash([hs * 0.5, hs * 0.45]);
    ctx.lineDashOffset = now * 6;
    ctx.beginPath();
    ctx.arc(this.x, this.y, hs + 3.5 / zoom, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private _drawName(ctx: CanvasRenderingContext2D, zoom: number) {
    transformGuard(ctx, () => {
      const theme = this.theme;
      ctx.font = theme.light ? `bold 12pt sans-serif` : `12pt sans-serif`;
      ctx.strokeStyle = theme.nameStroke;
      ctx.lineWidth = theme.light ? 3.5 : 2;
      ctx.lineJoin = 'round';
      ctx.fillStyle = theme.light ? `hsl(${this.hue} 80% ${theme.nameLightness}%)` : this.color;
      ctx.shadowBlur = 0;
      ctx.translate(this.x, this.y + 0.25);
      ctx.scale(1 / zoom, 1 / zoom);
      ctx.strokeText(this.name, 0, 0);
      ctx.fillText(this.name, 0, 0);
    });
  }

  private _drawOutline(ctx: CanvasRenderingContext2D, lineWidth: number) {
    ctx.beginPath();
    ctx.strokeStyle = this.theme.marbleWinningBorder;
    ctx.lineWidth = lineWidth;
    ctx.arc(this.x, this.y, this.size / 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  private _renderCoolTime(ctx: CanvasRenderingContext2D, zoom: number) {
    ctx.strokeStyle = this.theme.coolTimeIndicator;
    ctx.lineWidth = 1 / zoom;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size / 2 + 2 / zoom, rad(270), rad(270 + (360 * this._coolTime) / this._maxCoolTime));
    ctx.stroke();
  }
}
