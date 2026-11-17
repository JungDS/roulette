import type { StageDef } from './data/maps';
import type { MapEntityState } from './types/MapEntity.type';
import type { VectorLike } from './types/VectorLike';

/** 잠깐 생겼다 사라지는 중력장 (스킬). radius 안의 구슬을 가운데로 끌어당긴다 */
export type GravityWell = {
  x: number;
  y: number;
  radius: number;
  strength: number;
  /** 유지 시간 (물리 시간, 초) */
  duration: number;
  /** 영향을 받지 않는 구슬 (스킬을 쓴 구슬) */
  immune?: number;
};

/** 물리 스텝 중에 일어난 일. 화면 연출에 쓴다 */
export type PhysicsEvent =
  | { type: 'warp'; id: number; from: VectorLike; to: VectorLike }
  | { type: 'break'; x: number; y: number; color?: string };

export interface IPhysics {
  init(): Promise<void>;

  clear(): void;

  clearMarbles(): void;

  createStage(stage: StageDef): void;

  createMarble(id: number, x: number, y: number): void;

  shakeMarble(id: number): void;

  removeMarble(id: number): void;

  getMarblePosition(id: number): { x: number; y: number; angle: number };

  getMarbleVelocity(id: number): { x: number; y: number };

  getEntities(): MapEntityState[];

  impact(id: number): void;

  /** 구슬에 감속을 건다 (0 이면 푼다). 구역이 거는 감속과는 따로 관리된다 */
  setMarbleDrag(id: number, drag: number): void;

  /** 구슬에 매 스텝 더할 가속도를 정한다 (0, 0 이면 푼다) */
  setMarbleThrust(id: number, ax: number, ay: number): void;

  /** 구슬의 속도를 한 번 바꾼다 (지금 속도에 더한다) */
  nudgeMarble(id: number, vx: number, vy: number): void;

  /** 두 구슬의 위치와 속도를 맞바꾼다 */
  swapMarbles(a: number, b: number): void;

  addGravityWell(well: GravityWell): void;

  /** 지난번 호출 뒤에 쌓인 이벤트를 꺼낸다 */
  drainEvents(): PhysicsEvent[];

  /** 맵을 불러온 뒤 흐른 물리 시간(초) */
  readonly elapsed: number;

  start(): void;

  step(deltaSeconds: number): void;
}
