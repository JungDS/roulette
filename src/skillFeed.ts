// 스킬 알림: 누가 누구에게 무슨 스킬을 썼는지 화면 위쪽 가운데에 잠깐 띄운다.
// 이모지는 글꼴이 없는 환경(일부 프로젝터용 PC) 에서 깨지므로 아이콘은 직접 그린다.

import type { CatchUpEvent, CatchUpSkill } from './catchUp';
import { translate } from './localization';
import type { RenderParameters } from './rouletteRenderer';
import type { Rect } from './types/rect.type';
import type { UIObject } from './UIObject';

const MAX_ENTRIES = 4;
const LIFETIME_MS = 3800;
const FADE_MS = 500;
const ROW_HEIGHT = 28;
const ROW_GAP = 5;
const ICON_SIZE = 18;
const PADDING = 9;

const SKILL_STYLE: Record<CatchUpSkill, { label: string; color: string }> = {
  turbo: { label: 'Turbo', color: '#f97316' },
  lightning: { label: 'Lightning', color: '#eab308' },
  swap: { label: 'Swap', color: '#9333ea' },
  gravity: { label: 'Gravity well', color: '#4c1d95' },
};

type Entry = {
  skill: CatchUpSkill;
  caster: { name: string; hue: number };
  target?: { name: string; hue: number };
  age: number;
};

/** 가운데 (0, 0), 한 변 ICON_SIZE 인 칸 안에 흰색으로 스킬 아이콘을 그린다 */
function drawIcon(ctx: CanvasRenderingContext2D, skill: CatchUpSkill) {
  const s = ICON_SIZE / 2;
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  switch (skill) {
    case 'lightning':
      ctx.moveTo(s * 0.15, -s * 0.7);
      ctx.lineTo(-s * 0.45, s * 0.1);
      ctx.lineTo(-s * 0.02, s * 0.1);
      ctx.lineTo(-s * 0.2, s * 0.7);
      ctx.lineTo(s * 0.45, -s * 0.15);
      ctx.lineTo(s * 0.02, -s * 0.15);
      ctx.closePath();
      ctx.fill();
      break;
    case 'turbo':
      for (const dx of [-s * 0.38, s * 0.12]) {
        ctx.moveTo(dx, -s * 0.45);
        ctx.lineTo(dx + s * 0.42, 0);
        ctx.lineTo(dx, s * 0.45);
      }
      ctx.stroke();
      break;
    case 'swap':
      ctx.moveTo(-s * 0.5, -s * 0.25);
      ctx.lineTo(s * 0.5, -s * 0.25);
      ctx.lineTo(s * 0.2, -s * 0.55);
      ctx.moveTo(s * 0.5, s * 0.25);
      ctx.lineTo(-s * 0.5, s * 0.25);
      ctx.lineTo(-s * 0.2, s * 0.55);
      ctx.stroke();
      break;
    case 'gravity':
      ctx.arc(0, 0, s * 0.55, 0.4, Math.PI * 1.7);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.18, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
}

export class SkillFeed implements UIObject {
  private entries: Entry[] = [];

  push(event: CatchUpEvent) {
    this.entries.unshift({
      skill: event.skill,
      caster: { name: event.caster.name, hue: event.caster.hue },
      target: 'target' in event ? { name: event.target.name, hue: event.target.hue } : undefined,
      age: 0,
    });
    if (this.entries.length > MAX_ENTRIES) this.entries.length = MAX_ENTRIES;
  }

  clear() {
    this.entries = [];
  }

  update(deltaTime: number): void {
    if (this.entries.length === 0) return;
    for (const entry of this.entries) entry.age += deltaTime;
    this.entries = this.entries.filter((entry) => entry.age < LIFETIME_MS);
  }

  render(ctx: CanvasRenderingContext2D, { theme }: RenderParameters, width: number): void {
    if (this.entries.length === 0) return;
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const nameFont = 'bold 13px sans-serif';
    const labelFont = '13px sans-serif';
    const nameColor = (hue: number) => `hsl(${hue} ${theme.marbleSaturation}% ${theme.rankLightness}%)`;
    const labelColor = theme.light ? theme.hudText : '#ddd';

    this.entries.forEach((entry, row) => {
      const style = SKILL_STYLE[entry.skill];
      const label = translate(style.label);
      // 가운데 글: "쓴 구슬  스킬 이름  → 맞은 구슬"
      const parts: { text: string; font: string; color: string }[] = [
        { text: entry.caster.name, font: nameFont, color: nameColor(entry.caster.hue) },
        { text: ` ${label}`, font: labelFont, color: labelColor },
      ];
      if (entry.target) {
        parts.push({ text: ' → ', font: labelFont, color: labelColor });
        parts.push({ text: entry.target.name, font: nameFont, color: nameColor(entry.target.hue) });
      }
      let textWidth = 0;
      const widths = parts.map((part) => {
        ctx.font = part.font;
        const w = ctx.measureText(part.text).width;
        textWidth += w;
        return w;
      });

      const rowWidth = PADDING + ICON_SIZE + 6 + textWidth + PADDING;
      const x = (width - rowWidth) / 2;
      const y = 10 + row * (ROW_HEIGHT + ROW_GAP);
      const appear = Math.min(1, entry.age / 150);
      ctx.globalAlpha = appear * Math.min(1, (LIFETIME_MS - entry.age) / FADE_MS);

      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, rowWidth, ROW_HEIGHT, ROW_HEIGHT / 2);
      else ctx.rect(x, y, rowWidth, ROW_HEIGHT);
      ctx.fillStyle = theme.light ? 'rgba(255, 255, 255, 0.94)' : 'rgba(0, 0, 0, 0.7)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = style.color;
      ctx.stroke();

      const iconX = x + PADDING + ICON_SIZE / 2;
      const centerY = y + ROW_HEIGHT / 2;
      ctx.beginPath();
      ctx.arc(iconX, centerY, ICON_SIZE / 2 + 1, 0, Math.PI * 2);
      ctx.fillStyle = style.color;
      ctx.fill();
      ctx.save();
      ctx.translate(iconX, centerY);
      drawIcon(ctx, entry.skill);
      ctx.restore();

      let textX = x + PADDING + ICON_SIZE + 6;
      parts.forEach((part, i) => {
        ctx.font = part.font;
        ctx.fillStyle = part.color;
        ctx.fillText(part.text, textX, centerY + 1);
        textX += widths[i];
      });
    });
    ctx.restore();
  }

  getBoundingBox(): Rect | null {
    return null;
  }
}
