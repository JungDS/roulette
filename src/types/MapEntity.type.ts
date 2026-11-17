import type { VectorLike } from './VectorLike';

export type EntityShapeTypes = 'box' | 'circle' | 'polyline';

export interface EntityShapeBase {
  type: EntityShapeTypes;
  color?: string;
  bloomColor?: string;
}

export interface EntityBoxShape extends EntityShapeBase {
  type: 'box';
  width: number;
  height: number;
  rotation: number;
}

export interface EntityCircleShape extends EntityShapeBase {
  type: 'circle';
  radius: number;
}

export interface EntityPolylineShape extends EntityShapeBase {
  type: 'polyline';
  rotation: number;
  points: [number, number][];
}

export type EntityShape = EntityBoxShape | EntityCircleShape | EntityPolylineShape;

export type EntityPhysicalProps = {
  density: number;
  restitution: number;
  angularVelocity: number;
  life?: number;
};

/**
 * 왕복 운동. kinematic 장애물에만 쓴다.
 * 맵에 적힌 위치·각도에서 출발해 slide / swing 만큼 갔다가 period 초마다 제자리로 돌아온다
 */
export type EntityMotion = {
  /** 한 번 왕복하는 시간(초) */
  period: number;
  /** 시작 위상 (0 ~ 1). 같은 주기의 장애물을 엇박으로 움직일 때 쓴다 */
  phase?: number;
  /** 왕복 이동: 처음 위치에서 이 벡터만큼 갔다가 돌아온다 (움직이는 발판, 여닫이 문) */
  slide?: [number, number];
  /** 왕복 회전: 처음 각도에서 이 각도(라디안) 만큼 돌았다가 돌아온다 (플리퍼) */
  swing?: number;
  /** sine = 부드럽게 오간다 (기본), kick = 가만히 있다가 순간적으로 치고 돌아온다 */
  wave?: 'sine' | 'kick';
};

export interface MapEntity {
  position: VectorLike;
  type: 'static' | 'kinematic';
  shape: EntityShape;
  props: EntityPhysicalProps;
  motion?: EntityMotion;
}

/**
 * 장애물의 역할. 밝은 테마에서 역할마다 색을 달리해 한눈에 구분되게 한다
 * - static: 벽, 못, 고정 블록
 * - mover: 돌거나 움직이는 장애물
 * - bumper: 구슬을 튕겨 내는 장애물 (탄성 1 초과)
 * - breakable: 닿으면 부서지는 블록
 */
export type EntityRole = 'static' | 'mover' | 'bumper' | 'breakable';

export interface MapEntityState {
  x: number;
  y: number;
  angle: number;
  shape: EntityShape;
  life: number;
  role: EntityRole;
  /** 구슬이 방금 닿았는지 (1 → 0 으로 줄어든다). 범퍼가 번쩍이는 연출에 쓴다 */
  hit: number;
}
