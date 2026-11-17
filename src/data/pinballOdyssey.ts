// 핀볼 오디세이: 핀볼 기계의 요소들을 위에서 아래로 차례로 지나가는 긴 맵.
//
// 다른 기본 맵은 좌표를 그대로 적어 두었지만, 이 맵은 구역이 많고 길어서 도형을 만드는 함수로 조립한다.
// 구역마다 시작 높이(상수) 를 기준으로 좌표를 적었으니, 구역을 고칠 때는 그 구역 안의 숫자만 보면 된다.
//
//   0 발사대        좁은 통로에서 출발해 회전 막대에 흩어진다
//   1 드롭 타깃     못 사이를 지나 부서지는 블록 두 줄을 뚫는다 (앞선 구슬이 길을 터 준다)
//   2 범퍼 가든     범퍼·슬링샷에 튕기다 플리퍼 사이로 빠진다
//   3 지그재그 램프 여닫이 다리(지름길), 부스터, 회전 막대, 플리퍼가 있는 경사로 네 개
//   4 블랙홀        삼켜지면 앞·제자리·뒤 중 한 곳의 화이트홀로 나온다
//   5 젤리 늪       젤리에 빠지면 느리게 가라앉는다
//   6 바람 리프트   바람을 타고 굴뚝을 올라가 반대편으로 넘어간다
//   7 행운의 드럼   돌아가는 드럼에 갇히면 틈이 아래로 올 때까지 기다린다
//   8 라스트 찬스   주기적으로 열리는 문에서 한데 모였다가, 마지막 블랙홀을 지난다 (결승 앞으로 가거나 드럼 위로 되돌아간다)
//   9 결승          돌아가는 고리의 틈이 지나갈 때만 빠져나간다

import type { EntityMotion, MapEntity } from '../types/MapEntity.type';
import type { BackgroundStop, StageDef, StageLabel, Zone } from './maps';

type Pt = [number, number];

const LEFT = 2;
const RIGHT = 24;
const CENTER = 13;

// 밝은 배경에서 잘 보이는 색. 벽은 테마 기본색(남색) 을 쓰고, 역할이 다른 것만 색을 준다
const COLOR = {
  peg: '#f59e0b',
  target: ['#22c55e', '#14b8a6', '#0ea5e9'],
  bumper: '#ff8a00',
  bumperAlt: '#ff4d8d',
  band: '#ff4d8d',
  spinner: '#ef4444',
  flipper: '#7c3aed',
  drum: '#d97706',
  bridge: '#0ea5e9',
  island: '#6366f1',
} as const;

const entities: MapEntity[] = [];
const zones: Zone[] = [];
const labels: StageLabel[] = [];

const round = (v: number) => Math.round(v * 1000) / 1000;

function rotate([x, y]: Pt, angle: number): Pt {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [round(x * cos - y * sin), round(x * sin + y * cos)];
}

/** 벽 (꺾은선) */
function wall(points: Pt[], color?: string) {
  entities.push({
    type: 'static',
    position: { x: 0, y: 0 },
    shape: { type: 'polyline', rotation: 0, points, color },
    props: { density: 1, angularVelocity: 0, restitution: 0 },
  });
}

/** 속이 찬 덩어리 (닫힌 꺾은선). 화면에서는 안이 채워진다 */
function solid(points: Pt[], color?: string) {
  wall([...points, points[0]], color);
}

/** 못 */
function peg(x: number, y: number, radius = 0.3) {
  entities.push({
    type: 'static',
    position: { x, y },
    shape: { type: 'circle', radius, color: COLOR.peg },
    props: { density: 1, angularVelocity: 0, restitution: 0.4 },
  });
}

/** 가로로 늘어선 못 한 줄 */
function pegRow(y: number, from: number, to: number, gap: number, radius = 0.3) {
  for (let x = from; x <= to + 0.001; x += gap) peg(round(x), y, radius);
}

/** 범퍼: 닿으면 세게 튕겨 낸다 */
function bumper(x: number, y: number, radius: number, color: string = COLOR.bumper, restitution = 1.6) {
  entities.push({
    type: 'static',
    position: { x, y },
    shape: { type: 'circle', radius, color },
    props: { density: 1, angularVelocity: 0, restitution },
  });
}

/** 고정 블록 (가운데, 반폭, 반높이, 회전) */
function block(x: number, y: number, halfWidth: number, halfHeight: number, rotation = 0, color?: string) {
  entities.push({
    type: 'static',
    position: { x, y },
    shape: { type: 'box', width: halfWidth, height: halfHeight, rotation, color },
    props: { density: 1, angularVelocity: 0, restitution: 0 },
  });
}

const BAND_HALF_THICKNESS = 0.14;
/** 띠가 붙은 면 위로 튀어나오는 높이. 높으면 띠 끝이 턱이 되어 구슬이 걸린다 */
const BAND_PROTRUSION = 0.04;

/**
 * 튕겨 내는 띠 (슬링샷의 고무줄). 덩어리의 한 면(a → b) 에 붙인다.
 * inside 는 덩어리 안쪽의 아무 점. 띠를 그쪽으로 묻어서 면 위로는 살짝만 나오게 한다
 */
function band(a: Pt, b: Pt, inside: Pt, restitution = 1.5) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  let nx = -(b[1] - a[1]) / length;
  let ny = (b[0] - a[0]) / length;
  if ((inside[0] - a[0]) * nx + (inside[1] - a[1]) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  const sink = BAND_HALF_THICKNESS - BAND_PROTRUSION;
  entities.push({
    type: 'static',
    position: { x: round((a[0] + b[0]) / 2 + nx * sink), y: round((a[1] + b[1]) / 2 + ny * sink) },
    shape: {
      type: 'box',
      width: round(length / 2),
      height: BAND_HALF_THICKNESS,
      rotation: round(Math.atan2(b[1] - a[1], b[0] - a[0])),
      color: COLOR.band,
    },
    props: { density: 1, angularVelocity: 0, restitution },
  });
}

/** 드롭 타깃: 구슬이 닿으면 튕겨 내고 사라진다 */
function target(x: number, y: number, halfWidth: number, halfHeight: number, color: string) {
  entities.push({
    type: 'static',
    position: { x, y },
    shape: { type: 'box', width: halfWidth, height: halfHeight, rotation: 0, color },
    props: { density: 1, angularVelocity: 0, restitution: 1.2, life: 1 },
  });
}

/** 회전 막대. angularVelocity 가 양수면 화면에서 시계 방향 */
function spinner(x: number, y: number, halfLength: number, angularVelocity: number, rotation = 0) {
  entities.push({
    type: 'kinematic',
    position: { x, y },
    shape: { type: 'box', width: halfLength, height: 0.12, rotation, color: COLOR.spinner },
    props: { density: 1, angularVelocity, restitution: 0 },
  });
}

/** 십자 회전문 */
function turnstile(x: number, y: number, halfLength: number, angularVelocity: number) {
  spinner(x, y, halfLength, angularVelocity, 0);
  spinner(x, y, halfLength, angularVelocity, Math.PI / 2);
}

/**
 * 플리퍼. restAngle 방향(0 = 오른쪽, 양수 = 아래쪽으로 기울어짐) 을 보고 있다가 주기마다 swing 만큼 휘둘러 구슬을 쳐 낸다.
 * anchor 는 플리퍼 뿌리의 위쪽 모서리가 놓일 자리다. 경사면 끝에 맞추면 구슬이 턱 없이 플리퍼 위로 굴러 올라간다
 */
function flipper(anchor: Pt, length: number, restAngle: number, swing: number, period: number, phase = 0) {
  const outline: Pt[] = [
    [0, -0.3],
    [length, -0.15],
    [length + 0.15, 0],
    [length, 0.15],
    [0, 0.3],
    [0, -0.3],
  ];
  const corner = rotate([0, Math.cos(restAngle) >= 0 ? -0.3 : 0.3], restAngle);
  entities.push({
    type: 'kinematic',
    position: { x: round(anchor[0] - corner[0]), y: round(anchor[1] - corner[1]) },
    shape: { type: 'polyline', rotation: 0, points: outline.map((p) => rotate(p, restAngle)), color: COLOR.flipper },
    props: { density: 1, angularVelocity: 0, restitution: 0 },
    motion: { swing, period, phase, wave: 'kick' },
  });
}

/** 좌우로 오가는 범퍼 */
function movingBumper(x: number, y: number, radius: number, slide: Pt, period: number, phase = 0) {
  entities.push({
    type: 'kinematic',
    position: { x, y },
    shape: { type: 'circle', radius, color: COLOR.bumperAlt },
    props: { density: 1, angularVelocity: 0, restitution: 1.5 },
    motion: { slide, period, phase },
  });
}

/** 왕복하는 블록 (여닫이 다리, 밀어내는 피스톤) */
function slider(
  x: number,
  y: number,
  halfWidth: number,
  halfHeight: number,
  rotation: number,
  motion: EntityMotion,
  color: string = COLOR.bridge
) {
  entities.push({
    type: 'kinematic',
    position: { x, y },
    shape: { type: 'box', width: halfWidth, height: halfHeight, rotation, color },
    props: { density: 1, angularVelocity: 0, restitution: 0 },
    motion,
  });
}

/** 원호 위의 점들 (각도는 라디안, 0 = 오른쪽, 양수 = 시계 방향) */
function arc(cx: number, cy: number, radius: number, from: number, to: number, stepDeg = 10): Pt[] {
  const steps = Math.max(1, Math.ceil(Math.abs(to - from) / ((stepDeg * Math.PI) / 180)));
  const points: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps;
    points.push([round(cx + Math.cos(a) * radius), round(cy + Math.sin(a) * radius)]);
  }
  return points;
}

/**
 * 틈이 난 채로 도는 고리 (드럼). 틈은 gapCount 개가 같은 간격으로 나 있고 첫 틈은 맨 위에 있다.
 * finLength 가 있으면 고리 조각마다 안쪽으로 날개를 달아 안에 든 구슬을 퍼 올린다
 */
function ring(
  x: number,
  y: number,
  radius: number,
  gapCount: number,
  gapAngle: number,
  angularVelocity: number,
  finLength = 0
) {
  const sector = (Math.PI * 2) / gapCount;
  for (let i = 0; i < gapCount; i++) {
    const from = -Math.PI / 2 + sector * i + gapAngle / 2;
    const to = -Math.PI / 2 + sector * (i + 1) - gapAngle / 2;
    const pieces: Pt[][] = [arc(0, 0, radius, from, to)];
    if (finLength > 0) {
      for (const t of [0.25, 0.75]) {
        const a = from + (to - from) * t;
        pieces.push([
          [round(Math.cos(a) * radius), round(Math.sin(a) * radius)],
          [round(Math.cos(a) * (radius - finLength)), round(Math.sin(a) * (radius - finLength))],
        ]);
      }
    }
    for (const points of pieces) {
      entities.push({
        type: 'kinematic',
        position: { x, y },
        shape: { type: 'polyline', rotation: 0, points, color: COLOR.drum },
        props: { density: 1, angularVelocity, restitution: 0 },
      });
    }
  }
}

function label(text: string, y: number, size = 2.4, x = CENTER) {
  labels.push({ x, y, text, size });
}

// ---------------------------------------------------------------------------------------------
// 0. 발사대
// ---------------------------------------------------------------------------------------------
// 구역별 시작 높이
const RAMP = 97;
const HOLE = 150;
const SWAMP = 196;
const LIFT = 240;
const DRUM = 292;
const LAST = 330;
// 결승: V 자 바닥에 반지름 VALVE_R 인 고리가 꼭 맞게 얹힌다 (바닥 기울기 45도)
const VALVE_R = 2.4;
const VALVE_Y = LAST + 72;
const VERTEX_Y = round(VALVE_Y + VALVE_R * Math.SQRT2);
const FINISH_TUBE_TOP = round(VERTEX_Y - 0.5);
const GOAL_Y = round(FINISH_TUBE_TOP + 6);

// 바깥 벽. 구역마다 필요한 구조물은 이 벽 안쪽에 따로 붙인다.
// 구슬은 x 10.25 ~ 15.65 에 줄지어 놓이고 (marble.ts) 많으면 위로 길게 쌓이므로 통로를 높이 올려 둔다
wall([
  [9.25, -300],
  [9.25, 6],
  [LEFT, 13],
  [LEFT, round(VERTEX_Y - (CENTER - LEFT))],
  [12.5, FINISH_TUBE_TOP],
  [12.5, GOAL_Y + 1],
]);
wall([
  [16.5, -300],
  [16.5, 6],
  [RIGHT, 13],
  [RIGHT, round(VERTEX_Y - (RIGHT - CENTER))],
  [13.5, FINISH_TUBE_TOP],
  [13.5, GOAL_Y + 1],
]);
label('PINBALL ODYSSEY', 9.2, 1.7, 12.9);
spinner(12.9, 12.5, 2.3, 2.6);

// ---------------------------------------------------------------------------------------------
// 1. 드롭 타깃
// ---------------------------------------------------------------------------------------------
label('DROP TARGETS', 31, 2.2);
pegRow(18, 4.6, 21.4, 2.8);
pegRow(21, 3.2, 22.8, 2.8);
pegRow(24, 4.6, 21.4, 2.8);
pegRow(27, 3.2, 22.8, 2.8);
// 벽에서 벽까지 틈 없이 막은 블록 두 줄. 틈(0.2) 은 구슬(지름 0.5) 이 못 지나간다
for (let row = 0; row < 2; row++) {
  for (let i = 0; i < 11; i++) {
    target(3 + i * 2, 35 + row * 4.5, 0.9, 0.35, COLOR.target[(i + row) % 3]);
  }
}
pegRow(44, 4.6, 21.4, 2.8);
// 가운데로 모으는 깔때기
solid([
  [LEFT, 46],
  [9.5, 52.5],
  [LEFT, 52.5],
]);
solid([
  [RIGHT, 46],
  [16.5, 52.5],
  [RIGHT, 52.5],
]);

// ---------------------------------------------------------------------------------------------
// 2. 범퍼 가든
// ---------------------------------------------------------------------------------------------
label('BUMPER GARDEN', 60.5, 2.2);
bumper(CENTER, 56.5, 1.3);
bumper(7.6, 63, 1.3, COLOR.bumperAlt);
bumper(18.4, 63, 1.3, COLOR.bumperAlt);
bumper(CENTER, 68.5, 1.5);
bumper(4.6, 70.5, 1.0);
bumper(21.4, 70.5, 1.0);
bumper(9, 75, 1.0, COLOR.bumperAlt);
bumper(17, 75, 1.0, COLOR.bumperAlt);
turnstile(CENTER, 78.5, 1.5, 2.2);
// 슬링샷: 양쪽 벽에 붙은 삼각형. 빗변의 띠가 구슬을 튕겨 낸다
solid(
  [
    [LEFT, 76],
    [5.2, 83.5],
    [LEFT, 83.5],
  ],
  COLOR.island
);
// 띠는 꼭대기에서 조금 내려와 시작한다. 벽을 타고 내려온 구슬이 띠 끝에 얹혀 제자리에서 계속 튀지 않게
band([2.77, 77.8], [5.03, 83.1], [LEFT, 83.5]);
solid(
  [
    [RIGHT, 76],
    [20.8, 83.5],
    [RIGHT, 83.5],
  ],
  COLOR.island
);
band([23.23, 77.8], [20.97, 83.1], [RIGHT, 83.5]);
// 가운데 배수구로 모으는 바닥과, 구슬을 다시 쳐 올리는 플리퍼 한 쌍
solid([
  [LEFT, 85],
  [10.2, 93],
  [LEFT, 93],
]);
solid([
  [RIGHT, 85],
  [15.8, 93],
  [RIGHT, 93],
]);
flipper([10.2, 93], 2.3, 0.42, -0.95, 2.3, 0);
flipper([15.8, 93], 2.3, Math.PI - 0.42, 0.95, 2.9, 0.4);

// ---------------------------------------------------------------------------------------------
// 3. 지그재그 램프
// ---------------------------------------------------------------------------------------------
label('ZIGZAG RAMPS', RAMP + 1.6, 2.2, 7.5);
const RAMP_SLOPE = 0.45;
const RAMP_ANGLE = Math.atan(RAMP_SLOPE);
/** 오른쪽 벽에서 왼쪽으로 내려가는 경사로 위의 높이 */
const leftwardY = (top: number, x: number) => round(top + (RIGHT - x) * RAMP_SLOPE);
/** 왼쪽 벽에서 오른쪽으로 내려가는 경사로 위의 높이 */
const rightwardY = (top: number, x: number) => round(top + (x - LEFT) * RAMP_SLOPE);
/** 경사로 판 한 조각 (두께 0.5). surface 는 그 경사로의 높이 함수 */
function rampPiece(surface: (x: number) => number, from: number, to: number) {
  solid([
    [from, surface(from)],
    [to, surface(to)],
    [to, round(surface(to) + 0.5)],
    [from, round(surface(from) + 0.5)],
  ]);
}

// 램프 1 (←): 가운데에 구멍이 있고 여닫이 다리가 주기적으로 덮는다. 열렸을 때 떨어지면 램프 2 의 중간으로 질러간다
const ramp1 = (x: number) => leftwardY(RAMP + 4, x);
rampPiece(ramp1, RIGHT, 11.2);
rampPiece(ramp1, 9.2, 6.5);
slider(10.2, round(ramp1(10.2) + 0.13), 1.25, 0.12, -RAMP_ANGLE, {
  slide: [2.3, round(-2.3 * RAMP_SLOPE)],
  period: 4.2,
});
spinner(18.5, round(ramp1(18.5) - 1.5), 1.1, 3.2);
// 램프 2 (→): 부스터
const ramp2 = (x: number) => rightwardY(RAMP + 16, x);
rampPiece(ramp2, LEFT, 19.5);
zones.push({ type: 'force', x: 12.5, y: round(ramp2(12.5) - 1.3), w: 7, h: 2.6, force: [16, 5] });
// 램프 3 (←): 회전 막대가 구슬을 쳐 낸다
const ramp3 = (x: number) => leftwardY(RAMP + 28, x);
rampPiece(ramp3, RIGHT, 6.5);
spinner(14, round(ramp3(14) - 1.5), 1.1, 2.6);
bumper(4, RAMP + 30.5, 0.9, COLOR.bumperAlt);
// 램프 4 (→): 끝에서 플리퍼가 쳐 낸다
const ramp4 = (x: number) => rightwardY(RAMP + 40, x);
rampPiece(ramp4, LEFT, 19.5);
flipper([19.5, ramp4(19.5)], 2.1, 0.35, -0.9, 2.6, 0.2);
bumper(22, RAMP + 37.5, 0.9);

// ---------------------------------------------------------------------------------------------
// 4. 블랙홀
// ---------------------------------------------------------------------------------------------
label('BLACK HOLE', HOLE + 44.5, 2.2, 6.5);
// 램프에서 내려온 구슬을 가운데로 보낸다
solid([
  [LEFT, HOLE + 1],
  [11.3, HOLE + 8.5],
  [LEFT, HOLE + 8.5],
]);
solid([
  [RIGHT, HOLE + 3],
  [14.7, HOLE + 8.5],
  [RIGHT, HOLE + 8.5],
]);
// 옆에서 굴러온 속도를 죽이는 짧은 통로. 그 아래 범퍼가 구슬을 양옆으로 고르게 흩는다.
// 가운데로 떨어질수록 블랙홀에 삼켜지기 쉽다
wall([
  [11.3, HOLE + 8.5],
  [11.3, HOLE + 10.6],
]);
wall([
  [14.7, HOLE + 8.5],
  [14.7, HOLE + 10.6],
]);
bumper(CENTER, HOLE + 13.6, 1.2);
peg(9.4, HOLE + 16, 0.4);
peg(16.6, HOLE + 16, 0.4);
const HOLE_Y = HOLE + 25;
zones.push({
  type: 'blackhole',
  x: CENTER,
  y: HOLE_Y,
  radius: 8,
  core: 1.1,
  strength: 55,
  exits: [
    // 제자리: 바로 아래로 나온다
    { x: CENTER, y: HOLE + 44, weight: 4 },
    // 점프: 젤리 늪을 건너뛴다
    { x: CENTER, y: 244, weight: 3 },
    // 되돌이: 지그재그 램프를 다시 탄다
    { x: 21.5, y: RAMP + 1.5, velocity: [-2, 0], weight: 3 },
  ],
});
// 바닥: 가운데 배수구로 모은다
solid([
  [LEFT, HOLE + 33],
  [10.6, HOLE + 40.5],
  [LEFT, HOLE + 40.5],
]);
solid([
  [RIGHT, HOLE + 33],
  [15.4, HOLE + 40.5],
  [RIGHT, HOLE + 40.5],
]);

// ---------------------------------------------------------------------------------------------
// 5. 젤리 늪
// ---------------------------------------------------------------------------------------------
label('JELLY SWAMP', SWAMP + 14.2, 2.2);
pegRow(SWAMP + 2, 4.6, 21.4, 2.8, 0.35);
// 윗줄: 젤리 셋, 그 사이가 빠른 길
zones.push({ type: 'slow', x: 4.9, y: SWAMP + 8, w: 5, h: 7, drag: 7 });
zones.push({ type: 'slow', x: CENTER, y: SWAMP + 8, w: 4.6, h: 7, drag: 7 });
zones.push({ type: 'slow', x: 21.1, y: SWAMP + 8, w: 5, h: 7, drag: 7 });
peg(8.9, SWAMP + 5, 0.35);
peg(17.1, SWAMP + 5, 0.35);
pegRow(SWAMP + 17, 3.2, 22.8, 2.8, 0.35);
// 아랫줄: 윗줄의 빠른 길 바로 아래에 젤리
zones.push({ type: 'slow', x: 8.9, y: SWAMP + 24, w: 5.4, h: 7, drag: 7 });
zones.push({ type: 'slow', x: 17.1, y: SWAMP + 24, w: 5.4, h: 7, drag: 7 });
peg(CENTER, SWAMP + 21, 0.35);
// 젤리 사이를 가르며 밀어 주는 피스톤
slider(4.2, SWAMP + 30.5, 1.2, 0.25, 0, { slide: [3.4, 0], period: 3.6 });
slider(21.8, SWAMP + 30.5, 1.2, 0.25, 0, { slide: [-3.4, 0], period: 3.6, phase: 0.5 });
// 가운데로 모아 바람 리프트 입구로
solid([
  [LEFT, SWAMP + 33],
  [10.5, SWAMP + 40.5],
  [LEFT, SWAMP + 40.5],
]);
solid([
  [RIGHT, SWAMP + 33],
  [15.5, SWAMP + 40.5],
  [RIGHT, SWAMP + 40.5],
]);

// ---------------------------------------------------------------------------------------------
// 6. 바람 리프트
// ---------------------------------------------------------------------------------------------
// 들어온 구슬은 지붕을 타고 왼쪽 통로로 내려가 굴뚝 밑으로 모인다. 굴뚝 안의 바람이 구슬을 위로 올려
// 지붕 밑에서 오른쪽 갑판으로 넘기고, 구슬은 오른쪽 통로로 내려간다
label('WIND LIFT', LIFT + 37, 2.2, 16.5);
// 지붕 (→ 왼쪽으로 내려간다)
solid([
  [RIGHT, LIFT + 7],
  [6, LIFT + 15],
  [6, LIFT + 15.5],
  [RIGHT, LIFT + 7.5],
]);
// 왼쪽 통로와 굴뚝 사이 벽, 굴뚝 왼쪽 벽 (지붕까지 막혀 있다)
solid([
  [6, LIFT + 15.5],
  [9, LIFT + 14.2],
  [9, LIFT + 36],
  [6, LIFT + 34],
]);
// 아래 방 바닥과 굴뚝 오른쪽 벽, 오른쪽 갑판을 한 덩어리로
solid([
  [LEFT, LIFT + 38],
  [9, LIFT + 43],
  [13, LIFT + 43],
  [13, LIFT + 21],
  [20, LIFT + 27],
  [20, LIFT + 47],
  [LEFT, LIFT + 47],
]);
zones.push({ type: 'force', x: 11, y: LIFT + 30, w: 4, h: 27, force: [0, -19] });
zones.push({ type: 'force', x: 11.6, y: LIFT + 17.6, w: 5.2, h: 6.4, force: [16, -8] });

// ---------------------------------------------------------------------------------------------
// 7. 행운의 드럼
// ---------------------------------------------------------------------------------------------
label('LUCKY DRUM', DRUM + 35.8, 2.2);
// 드럼 꼭대기로 모으는 깔때기
solid([
  [LEFT, DRUM + 1],
  [8.6, DRUM + 8],
  [LEFT, DRUM + 8],
]);
solid([
  [RIGHT, DRUM + 1],
  [17.4, DRUM + 8],
  [RIGHT, DRUM + 8],
]);
ring(CENTER, DRUM + 19, 5.2, 2, 1.0, 0.9, 1.3);
// 드럼을 비켜 간 구슬은 옆길의 범퍼에 걸린다
bumper(4.3, DRUM + 17, 0.9, COLOR.bumperAlt);
bumper(21.7, DRUM + 17, 0.9, COLOR.bumperAlt);
bumper(5.6, DRUM + 24.5, 0.9);
bumper(20.4, DRUM + 24.5, 0.9);
solid([
  [LEFT, DRUM + 27],
  [10.4, DRUM + 34],
  [LEFT, DRUM + 34],
]);
solid([
  [RIGHT, DRUM + 27],
  [15.6, DRUM + 34],
  [RIGHT, DRUM + 34],
]);

// ---------------------------------------------------------------------------------------------
// 8. 라스트 찬스
// ---------------------------------------------------------------------------------------------
label('LAST CHANCE', LAST + 22.2, 2.2);
bumper(CENTER, LAST + 5, 1.2);
bumper(8, LAST + 10, 1.1, COLOR.bumperAlt);
bumper(18, LAST + 10, 1.1, COLOR.bumperAlt);
spinner(4.6, LAST + 15.5, 1.6, 3);
spinner(21.4, LAST + 15.5, 1.6, -3);
for (let i = 0; i < 8; i++) {
  target(round(4.4 + i * 2.46), LAST + 19, 1.0, 0.35, COLOR.target[i % 3]);
}
pegRow(LAST + 23, 3.2, 22.8, 2.8, 0.35);
movingBumper(5, LAST + 26.5, 0.9, [5, 0], 4);
movingBumper(21, LAST + 26.5, 0.9, [-5, 0], 4);
// 잠금 문: 깔때기 끝을 막고 있다가 주기적으로 열린다. 앞서 온 구슬이 여기서 기다리는 동안 뒤따라온 구슬이 따라붙는다
solid([
  [LEFT, LAST + 29],
  [11.6, LAST + 36],
  [LEFT, LAST + 36],
]);
solid([
  [RIGHT, LAST + 29],
  [14.4, LAST + 36],
  [RIGHT, LAST + 36],
]);
slider(CENTER, LAST + 36.25, 1.6, 0.22, 0, { slide: [3.1, 0], period: 5, wave: 'kick' });
// 문에서 쏟아진 구슬을 양옆으로 갈라 블랙홀 가장자리로 보낸다
block(CENTER, LAST + 39, 0.55, 0.55, Math.PI / 4);
peg(9.2, LAST + 41.5, 0.4);
peg(16.8, LAST + 41.5, 0.4);
zones.push({
  type: 'blackhole',
  x: CENTER,
  y: LAST + 47.5,
  radius: 5.5,
  core: 1,
  strength: 50,
  exits: [
    // 결승 고리 바로 위
    { x: CENTER, y: LAST + 66.5, weight: 3 },
    // 드럼 위로 되돌아간다
    { x: CENTER, y: DRUM - 2.5, weight: 1 },
  ],
});
pegRow(LAST + 55, 3.2, 22.8, 2.8, 0.35);
pegRow(LAST + 57.2, 4.6, 21.4, 2.8, 0.35);
turnstile(6.5, LAST + 61, 1.4, -2.4);
turnstile(CENTER, LAST + 61, 1.4, 2.4);
turnstile(19.5, LAST + 61, 1.4, 2.4);

// ---------------------------------------------------------------------------------------------
// 9. 결승
// ---------------------------------------------------------------------------------------------
// V 자 바닥(바깥 벽의 아랫부분) 에 고리가 꼭 맞게 얹혀 돈다. 고리와 바닥이 맞닿은 곳은 막혀 있고,
// 고리의 틈이 그 자리를 지나는 동안에만 구슬이 바닥을 타고 결승 통로로 빠져나간다
//
// 고리는 시계 방향으로 돈다. 오른쪽에서는 고리가 아래로 움직여 틈에 걸린 구슬을 통로 쪽으로 밀어 주지만
// 왼쪽에서는 위로 움직여 도로 밀어 올린다. 그래서 왼쪽 바닥은 고리 위쪽까지 덮어서, 왼쪽으로 온 구슬이
// 고리 꼭대기로 올라타 틈으로 떨어지거나 오른쪽으로 넘어가게 한다
label('FINISH', VALVE_Y - 6.5, 2.4);
const WEDGE_GAP = 0.3;
const wedgeFrom = (205 * Math.PI) / 180;
const wedgeTo = (135 * Math.PI) / 180 + Math.acos(VALVE_R / (VALVE_R + WEDGE_GAP));
solid([[LEFT, round(VERTEX_Y - (CENTER - LEFT))], ...arc(CENTER, VALVE_Y, VALVE_R + WEDGE_GAP, wedgeFrom, wedgeTo, 6)]);
ring(CENTER, VALVE_Y, VALVE_R, 4, 0.55, 1.5);

const background: BackgroundStop[] = [
  { y: 0, color: '#eef4ff' },
  { y: 40, color: '#eafaf1' },
  { y: 75, color: '#fff4e2' },
  { y: 120, color: '#eaf3ff' },
  { y: 172, color: '#ece7ff' },
  { y: 215, color: '#f8e9ff' },
  { y: 262, color: '#e4f7ff' },
  { y: 310, color: '#fff3d6' },
  { y: 362, color: '#ffe9ef' },
  { y: 404, color: '#fffbe0' },
];

export const pinballOdyssey: StageDef = {
  title: 'Pinball Odyssey',
  goalY: GOAL_Y,
  zoomY: FINISH_TUBE_TOP,
  // 블랙홀은 구슬이 휘돌다 삼켜지는 모습이 한 화면에 보이도록 구역 전체를 비춘다
  cameraZones: [{ x: CENTER, y: HOLE_Y, w: 26, h: 30 }],
  entities,
  zones,
  background,
  labels,
};
