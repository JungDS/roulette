// 추첨 제목. 무엇을 뽑는 중인지 화면 위쪽 가운데에 계속 보여 준다 (캔버스에 그리므로 녹화에도 담긴다).

import type { RenderParameters } from './rouletteRenderer';
import type { Rect } from './types/rect.type';
import type { UIObject } from './UIObject';

const TOP = 8;
const HEIGHT = 30;
const PADDING = 16;
/** 제목이 있을 때 그 아래의 다른 표시(스킬 알림) 가 내려가야 하는 만큼 */
export const TITLE_BANNER_SPACE = TOP + HEIGHT;

export class TitleBanner implements UIObject {
  text = '';

  update(): void {}

  render(ctx: CanvasRenderingContext2D, { theme }: RenderParameters, width: number): void {
    if (!this.text) return;
    ctx.save();
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const boxWidth = Math.min(width * 0.6, ctx.measureText(this.text).width + PADDING * 2);
    const x = (width - boxWidth) / 2;

    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(x, TOP, boxWidth, HEIGHT, HEIGHT / 2);
    else ctx.rect(x, TOP, boxWidth, HEIGHT);
    ctx.fillStyle = theme.light ? theme.winnerText : 'rgba(255, 255, 255, 0.9)';
    ctx.fill();

    ctx.fillStyle = theme.light ? '#ffffff' : '#111111';
    ctx.fillText(this.text, width / 2, TOP + HEIGHT / 2 + 1, boxWidth - PADDING);
    ctx.restore();
  }

  getBoundingBox(): Rect | null {
    return null;
  }
}
