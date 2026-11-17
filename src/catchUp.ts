// 역전 스킬: 뒤처진 구슬에게 무작위로 스킬을 준다.
//
// 일정한 간격으로 하위권 구슬 가운데 하나를 뽑아(뒤에 있을수록 잘 뽑힌다) 스킬 하나를 바로 쓰게 한다.
//   - turbo     자기 버프. 잠깐 동안 결승 쪽으로 추진력을 받는다
//   - lightning 선두 방해. 선두권 구슬 하나가 번개를 맞아 잠깐 굼떠진다
//   - swap      선두 방해 + 자기 버프. 앞쪽 구슬 하나와 자리를 맞바꾼다 (잠깐 예고한 뒤에 바뀐다)
//   - gravity   선두 방해. 선두가 있는 자리에 중력장이 생겨 주변 구슬을 붙잡는다
//
// 시간은 모두 물리 시간 기준이다. 결승 직전 슬로모션 중에도 게임 속 시간으로는 같은 간격으로 터진다.
// 화면 연출과 무관하게 돌아가도록 DOM 을 쓰지 않는다 (scripts/simulate.ts 에서도 돌린다).

import type { IPhysics } from './IPhysics';
import type { ProgressMap } from './progressMap';

export type CatchUpSkill = 'turbo' | 'lightning' | 'swap' | 'gravity';

/** 스킬을 쓰거나 맞을 수 있는 구슬. Marble 이 이 모양을 만족한다 */
export interface RacingMarble {
  id: number;
  name: string;
  hue: number;
  readonly x: number;
  readonly y: number;
  /** 이 물리 시각까지 번개에 맞아 굼뜬 상태 */
  stunUntil: number;
  /** 이 물리 시각까지 터보 상태 */
  boostUntil: number;
}

export type CatchUpEvent =
  | { skill: 'turbo'; caster: RacingMarble }
  | { skill: 'lightning'; caster: RacingMarble; target: RacingMarble }
  | { skill: 'swap'; caster: RacingMarble; target: RacingMarble; delay: number }
  | {
      skill: 'gravity';
      caster: RacingMarble;
      target: RacingMarble;
      x: number;
      y: number;
      radius: number;
      until: number;
    };

/** 출발한 뒤 첫 스킬까지 기다리는 시간 (초) */
const FIRST_DELAY = 6;
/** 스킬과 스킬 사이 간격 (초). 이 범위에서 무작위 */
const MIN_INTERVAL = 3;
const MAX_INTERVAL = 5.5;
/** 구슬이 이만큼 늘 때마다 한 번에 스킬을 쓰는 구슬이 하나씩 는다 */
const MARBLES_PER_EXTRA_CAST = 40;
const MAX_CASTS = 4;

const SKILL_WEIGHTS: [CatchUpSkill, number][] = [
  ['turbo', 3],
  ['lightning', 3],
  ['swap', 2],
  ['gravity', 2],
];

const TURBO_SECONDS = 2.5;
/** 터보 추진 가속도 (중력은 10) */
const TURBO_THRUST = 22;
const STUN_SECONDS = 1.8;
const STUN_DRAG = 9;
/** 번개에 맞는 순간 위로 살짝 튕기는 속도 */
const STUN_KICK = 3;
/** 자리 바꾸기를 예고하고 실제로 바꾸기까지의 시간 (초) */
const SWAP_DELAY = 0.7;
const WELL_SECONDS = 2.2;
const WELL_RADIUS = 4.5;
const WELL_STRENGTH = 38;
/** 진행도 지도에서 결승 방향을 구할 때 좌우·위아래로 재 보는 거리 */
const GRADIENT_STEP = 0.5;
/** 진행도 지도가 "결승과 이어지지 않은 곳" 에 주는 값 (progressMap.ts 의 UNREACHABLE) 은 이보다 크다 */
const REACHABLE_LIMIT = 1e5;

function pickWeighted<T>(items: T[], weightOf: (item: T, index: number) => number): T | undefined {
  let total = 0;
  for (let i = 0; i < items.length; i++) total += weightOf(items[i], i);
  if (total <= 0) return undefined;
  let pick = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    pick -= weightOf(items[i], i);
    if (pick < 0) return items[i];
  }
  return items[items.length - 1];
}

export class CatchUpSkills {
  private nextAt = Infinity;
  private pendingSwaps: { a: RacingMarble; b: RacingMarble; at: number }[] = [];
  private stunned = new Set<RacingMarble>();
  private boosted = new Set<RacingMarble>();

  constructor(private physics: IPhysics) {}

  /** 경주를 시작할 때 부른다 */
  start() {
    this.clear();
    this.nextAt = this.physics.elapsed + FIRST_DELAY;
  }

  /** 걸려 있는 효과를 모두 푼다 (맵이나 구슬을 다시 만들 때) */
  clear() {
    for (const marble of this.stunned) this.physics.setMarbleDrag(marble.id, 0);
    for (const marble of this.boosted) this.physics.setMarbleThrust(marble.id, 0, 0);
    this.stunned.clear();
    this.boosted.clear();
    this.pendingSwaps = [];
    this.nextAt = Infinity;
  }

  /**
   * 물리 스텝마다 부른다.
   * @param racing 아직 달리고 있는 구슬. 순위 순서 (0 = 선두)
   * @param map 지금 맵의 진행도 지도. 터보가 결승 방향을 찾는 데 쓴다
   */
  update(racing: RacingMarble[], map: ProgressMap): CatchUpEvent[] {
    const now = this.physics.elapsed;
    const events: CatchUpEvent[] = [];

    for (const marble of this.stunned) {
      if (now < marble.stunUntil && racing.includes(marble)) continue;
      this.physics.setMarbleDrag(marble.id, 0);
      this.stunned.delete(marble);
    }
    for (const marble of this.boosted) {
      if (now < marble.boostUntil && racing.includes(marble)) {
        const [dx, dy] = this.goalDirection(map, marble.x, marble.y);
        this.physics.setMarbleThrust(marble.id, dx * TURBO_THRUST, dy * TURBO_THRUST);
        continue;
      }
      this.physics.setMarbleThrust(marble.id, 0, 0);
      this.boosted.delete(marble);
    }

    if (this.pendingSwaps.length > 0) {
      this.pendingSwaps = this.pendingSwaps.filter((swap) => {
        if (now < swap.at) return true;
        // 예고하는 사이에 한쪽이 골인했으면 불발
        if (racing.includes(swap.a) && racing.includes(swap.b)) this.physics.swapMarbles(swap.a.id, swap.b.id);
        return false;
      });
    }

    if (now < this.nextAt) return events;
    this.nextAt = now + MIN_INTERVAL + Math.random() * (MAX_INTERVAL - MIN_INTERVAL);
    if (racing.length < 2) return events;

    const casts = Math.min(MAX_CASTS, 1 + Math.floor(racing.length / MARBLES_PER_EXTRA_CAST));
    const firstTrailing = Math.floor(racing.length / 2);
    const used = new Set<RacingMarble>();
    for (let i = 0; i < casts; i++) {
      // 하위 절반에서, 뒤에 있을수록 잘 뽑힌다
      const caster = pickWeighted(racing, (marble, index) =>
        index < firstTrailing || used.has(marble) || this.boosted.has(marble) ? 0 : index - firstTrailing + 1
      );
      if (!caster) break;
      used.add(caster);
      const event = this.cast(caster, racing, firstTrailing, used, now);
      if (event) events.push(event);
    }
    return events;
  }

  private cast(
    caster: RacingMarble,
    racing: RacingMarble[],
    firstTrailing: number,
    used: Set<RacingMarble>,
    now: number
  ): CatchUpEvent | null {
    const skill = pickWeighted(SKILL_WEIGHTS, ([, weight]) => weight)?.[0] ?? 'turbo';
    const ahead = racing.slice(0, Math.max(1, firstTrailing)).filter((marble) => marble !== caster);

    switch (skill) {
      case 'turbo': {
        caster.boostUntil = now + TURBO_SECONDS;
        this.boosted.add(caster);
        return { skill, caster };
      }
      case 'lightning': {
        // 대개 선두를 노리고, 가끔 2 ~ 3등을 맞힌다
        const target = Math.random() < 0.6 ? ahead[0] : ahead[Math.floor(Math.random() * Math.min(3, ahead.length))];
        if (!target) return null;
        target.stunUntil = now + STUN_SECONDS;
        this.stunned.add(target);
        this.physics.setMarbleDrag(target.id, STUN_DRAG);
        this.physics.nudgeMarble(target.id, 0, -STUN_KICK);
        return { skill, caster, target };
      }
      case 'swap': {
        const candidates = ahead.filter((marble) => !used.has(marble));
        const target = candidates[Math.floor(Math.random() * candidates.length)];
        if (!target) return null;
        used.add(target);
        this.pendingSwaps.push({ a: caster, b: target, at: now + SWAP_DELAY });
        return { skill, caster, target, delay: SWAP_DELAY };
      }
      case 'gravity': {
        const target = ahead[0];
        if (!target) return null;
        const x = target.x;
        const y = target.y;
        this.physics.addGravityWell({
          x,
          y,
          radius: WELL_RADIUS,
          strength: WELL_STRENGTH,
          duration: WELL_SECONDS,
          immune: caster.id,
        });
        return { skill, caster, target, x, y, radius: WELL_RADIUS, until: now + WELL_SECONDS };
      }
    }
  }

  /** (x, y) 에서 결승까지 남은 거리가 가장 빨리 줄어드는 방향 (길이 1). 알 수 없으면 아래쪽 */
  private goalDirection(map: ProgressMap, x: number, y: number): [number, number] {
    const h = GRADIENT_STEP;
    const left = map.distanceAt(x - h, y);
    const right = map.distanceAt(x + h, y);
    const up = map.distanceAt(x, y - h);
    const down = map.distanceAt(x, y + h);
    if (Math.max(left, right, up, down) > REACHABLE_LIMIT) return [0, 1];
    const gx = left - right;
    const gy = up - down;
    const length = Math.hypot(gx, gy);
    if (length < 1e-6) return [0, 1];
    return [gx / length, gy / length];
  }
}
