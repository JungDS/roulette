// 장애물 그리기. 본 화면(RouletteRenderer) 과 미니맵이 함께 쓴다.
//
// - 어두운 테마: 원래 모습 그대로다. 선과 테두리에 네온 번짐(bloom) 을 넣는다.
// - 밝은 테마: 도형을 채우고 짙은 테두리와 그림자를 넣는다. 역할(움직임, 범퍼, 부서지는 블록) 마다 색이 다르고,
//   맵에 적힌 색이 어두운 배경용(파스텔, 흰색) 이면 밝은 배경에서 보이게 어둡게 고쳐 쓴다.

import type { ColorTheme, ShapeColor } from './types/ColorTheme';
import type { EntityBoxShape, EntityPolylineShape, MapEntityState } from './types/MapEntity.type';
import { darken, lighten, readableOnLight } from './utils/color';

/** 맵에 적힌 색으로 닫힌 도형 안쪽을 채울 때 흰색을 섞는 정도 */
const TINT_FILL = 0.72;
/** 채운 도형의 테두리를 채움 색보다 어둡게 하는 정도 */
const OUTLINE_DARKEN = 0.38;
/** 밝은 테마에서 그림자의 번짐과 아래쪽 어긋남 (기본 해상도 픽셀) */
const SHADOW_BLUR = 5;
const SHADOW_OFFSET = 2.5;
const MOVER_LINE_SCALE = 1.6;
const BOX_CORNER_RATIO = 0.3;
const BOX_CORNER_MAX = 0.22;

export function entityStyle(entity: MapEntityState, theme: ColorTheme): ShapeColor {
  const shape = entity.shape;
  const base = theme.roles[entity.role] ?? theme.entity[shape.type];
  if (!theme.light) {
    return {
      fill: shape.color ?? base.fill,
      outline: shape.color ?? base.outline,
      bloom: shape.bloomColor ?? shape.color ?? base.bloom,
      bloomRadius: base.bloomRadius,
    };
  }
  if (!shape.color) return base;
  const color = readableOnLight(shape.color);
  if (shape.type === 'polyline') {
    // 벽은 선 색으로 쓰고 닫힌 도형 안은 옅게 채운다. 움직이는 도형(플리퍼) 은 눈에 띄게 진하게 채운다
    if (entity.role === 'mover' && isClosed(shape)) {
      return { fill: color, outline: darken(color, OUTLINE_DARKEN), bloom: base.bloom, bloomRadius: 0 };
    }
    return { fill: lighten(color, TINT_FILL), outline: color, bloom: base.bloom, bloomRadius: 0 };
  }
  return { fill: color, outline: darken(color, OUTLINE_DARKEN), bloom: base.bloom, bloomRadius: 0 };
}

/** 첫 점과 끝 점이 같은 선은 닫힌 도형으로 보고 안을 채운다 */
export function isClosed(shape: EntityPolylineShape): boolean {
  const points = shape.points;
  if (points.length < 4) return false;
  const first = points[0];
  const last = points[points.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}

function tracePolyline(ctx: CanvasRenderingContext2D, shape: EntityPolylineShape) {
  ctx.beginPath();
  ctx.moveTo(shape.points[0][0], shape.points[0][1]);
  for (let i = 1; i < shape.points.length; i++) {
    ctx.lineTo(shape.points[i][0], shape.points[i][1]);
  }
}

function traceBox(ctx: CanvasRenderingContext2D, shape: EntityBoxShape) {
  const w = shape.width * 2;
  const h = shape.height * 2;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(BOX_CORNER_MAX, Math.min(w, h) * BOX_CORNER_RATIO));
  } else {
    ctx.rect(-w / 2, -h / 2, w, h);
  }
}

function setShadow(ctx: CanvasRenderingContext2D, theme: ColorTheme, pixelScale: number, on: boolean) {
  if (on && theme.shadow) {
    ctx.shadowColor = theme.shadow;
    ctx.shadowBlur = SHADOW_BLUR * pixelScale;
    ctx.shadowOffsetY = SHADOW_OFFSET * pixelScale;
  } else {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }
}

/**
 * 월드 좌표계에서 장애물 하나를 그린다.
 * @param pixelScale shadowBlur 는 변환 행렬을 따르지 않는 물리 픽셀 값이라 해상도 배율을 따로 받는다
 * @param hairline 어두운 테마의 선 두께 (월드 단위)
 */
export function paintEntity(
  ctx: CanvasRenderingContext2D,
  entity: MapEntityState,
  theme: ColorTheme,
  pixelScale: number,
  hairline: number
) {
  const shape = entity.shape;
  if (shape.type === 'polyline' && shape.points.length === 0) return;
  const style = entityStyle(entity, theme);

  ctx.save();
  ctx.translate(entity.x, entity.y);
  ctx.rotate(entity.angle);
  ctx.fillStyle = style.fill;
  ctx.strokeStyle = style.outline;

  if (!theme.light) {
    ctx.lineWidth = hairline;
    ctx.shadowBlur = style.bloomRadius * pixelScale;
    ctx.shadowColor = style.bloom;
    switch (shape.type) {
      case 'polyline':
        tracePolyline(ctx, shape);
        ctx.stroke();
        break;
      case 'box': {
        const w = shape.width * 2;
        const h = shape.height * 2;
        ctx.rotate(shape.rotation);
        ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.strokeRect(-w / 2, -h / 2, w, h);
        break;
      }
      case 'circle':
        ctx.beginPath();
        ctx.arc(0, 0, shape.radius, 0, Math.PI * 2, false);
        ctx.stroke();
        break;
    }
    ctx.restore();
    return;
  }

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  switch (shape.type) {
    case 'polyline': {
      // 움직이는 선(드럼, 플리퍼) 은 벽보다 굵게 그려 눈에 띄게 한다
      ctx.lineWidth = entity.role === 'mover' ? theme.wallWidth * MOVER_LINE_SCALE : theme.wallWidth;
      tracePolyline(ctx, shape);
      setShadow(ctx, theme, pixelScale, true);
      if (isClosed(shape)) {
        ctx.fill();
        setShadow(ctx, theme, pixelScale, false);
      }
      ctx.stroke();
      break;
    }
    case 'box': {
      ctx.rotate(shape.rotation);
      traceBox(ctx, shape);
      if (entity.hit > 0) ctx.fillStyle = lighten(style.fill, 0.6 * entity.hit);
      setShadow(ctx, theme, pixelScale, true);
      ctx.fill();
      setShadow(ctx, theme, pixelScale, false);
      ctx.lineWidth = Math.min(0.07, Math.min(shape.width, shape.height) * 0.5);
      ctx.stroke();
      break;
    }
    case 'circle': {
      const isBumper = entity.role === 'bumper';
      const radius = shape.radius * (1 + 0.1 * entity.hit);
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2, false);
      setShadow(ctx, theme, pixelScale, true);
      ctx.fill();
      setShadow(ctx, theme, pixelScale, false);
      ctx.lineWidth = Math.min(0.09, radius * 0.25);
      ctx.stroke();
      if (isBumper && radius >= 0.4) {
        // 핀볼 범퍼처럼 흰 고리와 가운데 뚜껑을 얹는다
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.62, 0, Math.PI * 2, false);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = radius * 0.14;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.3, 0, Math.PI * 2, false);
        ctx.fillStyle = style.outline;
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(-radius * 0.3, -radius * 0.32, radius * 0.22, 0, Math.PI * 2, false);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.fill();
      }
      if (entity.hit > 0) {
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2, false);
        ctx.fillStyle = `rgba(255, 255, 255, ${0.7 * entity.hit})`;
        ctx.fill();
      }
      break;
    }
  }
  ctx.restore();
}

/** 미니맵용. 작게 그리므로 그림자와 장식 없이 모양만 그린다 */
export function paintEntityFlat(ctx: CanvasRenderingContext2D, entity: MapEntityState, theme: ColorTheme) {
  const shape = entity.shape;
  const style = entityStyle(entity, theme);
  ctx.save();
  ctx.translate(entity.x, entity.y);
  ctx.rotate(entity.angle);
  ctx.fillStyle = style.fill;
  ctx.strokeStyle = style.outline;
  switch (shape.type) {
    case 'box': {
      const w = shape.width * 2;
      const h = shape.height * 2;
      ctx.rotate(shape.rotation);
      ctx.fillRect(-w / 2, -h / 2, w, h);
      break;
    }
    case 'circle':
      ctx.beginPath();
      ctx.arc(0, 0, shape.radius, 0, Math.PI * 2, false);
      if (theme.light) ctx.fill();
      else ctx.stroke();
      break;
    case 'polyline':
      if (shape.points.length > 0) {
        tracePolyline(ctx, shape);
        if (theme.light && isClosed(shape)) ctx.fill();
        ctx.stroke();
      }
      break;
  }
  ctx.restore();
}
