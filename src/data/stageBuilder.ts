// 맵을 도형 함수로 조립할 때 쓰는 도구. 좌표는 모두 월드 단위 (구슬 지름 0.5).

import type { EntityMotion, EntityShape, MapEntity } from '../types/MapEntity.type';
import type { StageLabel, Zone } from './maps';

export type Pt = [number, number];

export const round = (v: number) => Math.round(v * 1000) / 1000;

/** 원점을 중심으로 돌린다. 각도는 라디안, 양수 = 화면에서 시계 방향 */
export function rotate([x, y]: Pt, angle: number): Pt {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [round(x * cos - y * sin), round(x * sin + y * cos)];
}

/** 원호 위의 점들 (각도는 라디안, 0 = 오른쪽, 양수 = 시계 방향) */
export function arc(cx: number, cy: number, radius: number, from: number, to: number, stepDeg = 8): Pt[] {
  const steps = Math.max(1, Math.ceil(Math.abs(to - from) / ((stepDeg * Math.PI) / 180)));
  const points: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps;
    points.push([round(cx + Math.cos(a) * radius), round(cy + Math.sin(a) * radius)]);
  }
  return points;
}

/** 가운데가 (0, 0) 인 정다각형 (원 모양의 선 장애물을 회전체에 붙일 때) */
export function polygon(cx: number, cy: number, radius: number, sides = 8): Pt[] {
  const points: Pt[] = [];
  for (let i = 0; i <= sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    points.push([round(cx + Math.cos(a) * radius), round(cy + Math.sin(a) * radius)]);
  }
  return points;
}

export class StageBuilder {
  readonly entities: MapEntity[] = [];
  readonly zones: Zone[] = [];
  readonly labels: StageLabel[] = [];

  private push(
    type: MapEntity['type'],
    x: number,
    y: number,
    shape: EntityShape,
    restitution: number,
    angularVelocity = 0,
    extra: Partial<MapEntity> = {},
    life?: number
  ) {
    this.entities.push({
      type,
      position: { x, y },
      shape,
      props: { density: 1, angularVelocity, restitution, ...(life !== undefined ? { life } : {}) },
      ...extra,
    });
  }

  /** 벽 (꺾은선) */
  wall(points: Pt[], color?: string) {
    this.push('static', 0, 0, { type: 'polyline', rotation: 0, points, color }, 0);
  }

  /** 속이 찬 덩어리 (닫힌 꺾은선). 화면에서는 안이 채워진다 */
  solid(points: Pt[], color?: string) {
    this.wall([...points, points[0]], color);
  }

  /** 고정 블록 (가운데, 반폭, 반높이, 회전) */
  block(x: number, y: number, halfWidth: number, halfHeight: number, rotation = 0, color?: string, restitution = 0) {
    this.push('static', x, y, { type: 'box', width: halfWidth, height: halfHeight, rotation, color }, restitution);
  }

  /** 범퍼: 닿으면 세게 튕겨 낸다 */
  bumper(x: number, y: number, radius: number, color: string, restitution = 1.5) {
    this.push('static', x, y, { type: 'circle', radius, color }, restitution);
  }

  /** (x, y) 를 축으로 도는 막대. angularVelocity 가 양수면 시계 방향 */
  spinner(
    x: number,
    y: number,
    halfLength: number,
    angularVelocity: number,
    rotation = 0,
    color?: string,
    halfThickness = 0.12
  ) {
    this.push(
      'kinematic',
      x,
      y,
      { type: 'box', width: halfLength, height: halfThickness, rotation, color },
      0,
      angularVelocity
    );
  }

  /** (x, y) 를 축으로 왕복 회전하는 막대 */
  swingingBar(
    x: number,
    y: number,
    halfLength: number,
    halfThickness: number,
    rotation: number,
    motion: EntityMotion,
    color?: string
  ) {
    this.push('kinematic', x, y, { type: 'box', width: halfLength, height: halfThickness, rotation, color }, 0, 0, {
      motion,
    });
  }

  /** (x, y) 를 축으로 도는 원판 */
  disc(x: number, y: number, radius: number, angularVelocity: number, color: string, restitution = 0) {
    this.push('kinematic', x, y, { type: 'circle', radius, color }, restitution, angularVelocity);
  }

  /** (x, y) 를 축으로 함께 도는 선. points 는 (x, y) 기준 좌표 */
  rotatingLine(x: number, y: number, points: Pt[], angularVelocity: number, color: string, restitution = 0) {
    this.push('kinematic', x, y, { type: 'polyline', rotation: 0, points, color }, restitution, angularVelocity);
  }

  /** (x, y) 를 축으로 왕복 운동하는 선 (진자, 플리퍼) */
  movingLine(x: number, y: number, points: Pt[], motion: EntityMotion, color: string, restitution = 0) {
    this.push('kinematic', x, y, { type: 'polyline', rotation: 0, points, color }, restitution, 0, { motion });
  }

  label(text: string, x: number, y: number, size: number) {
    this.labels.push({ x, y, text, size });
  }
}
