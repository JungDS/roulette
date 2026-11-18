// 운명의 수레바퀴: 원작의 지그재그 시작부 뒤로 바퀴 보스 세 개를 지난다.
//
//   시작부        원작 그대로 (지그재그 길, 가운데 섬, 갈매기 무늬 못)
//   초반 보스     운명의 톱니바퀴: 맞물려 도는 스포크 바퀴 두 개 사이 "턱" 으로만 지나간다
//   다이아몬드 못 원작 그대로
//   중반 보스     타로의 수레바퀴: 살 끝에 범퍼가 달린 큰 바퀴가 모래(슬로우) 그릇을 쓸고 돈다
//   회전 막대 줄  원작의 작은 바퀴 다섯 개
//   마지막 보스   운명의 관람차: 바퀴에 매달린 컵에 실려 간다. 깊은 컵(초록) 은 결승으로,
//                 얕은 컵(빨강) 과 컵을 놓친 구슬은 오른쪽 바람 리프트로 올라가 한 바퀴 더 탄다.
//                 결승 입구는 진자 범퍼가 지킨다
//
// 구역마다 기준 높이(상수) 를 두고 그 기준으로 좌표를 적었다.

import type { BackgroundStop, StageDef } from './maps';
import { arc, type Pt, polygon, rotate, round, StageBuilder } from './stageBuilder';

const b = new StageBuilder();

const LEFT = 8.25;
const RIGHT = 24;
const MID = (LEFT + RIGHT) / 2;
const DEG = Math.PI / 180;

// 구역별 기준 높이
const GEAR_Y = 80;
const TAROT_Y = 111;
const SPINNER_Y = 127.5;
const FERRIS_Y = 142;

// ---------------------------------------------------------------------------------------------
// 마지막 보스의 치수 (바깥 벽이 결승 입구로 이어지므로 먼저 정한다)
// ---------------------------------------------------------------------------------------------
const FERRIS_X = 13.9;
const FERRIS_R = 3.4;
const FERRIS_SPIN = 0.7;
const MOUTH_Y = FERRIS_Y + 9;
const MOUTH_LEFT = 13;
const MOUTH_RIGHT = 14;
const GOAL_Y = MOUTH_Y + 4;

// ---------------------------------------------------------------------------------------------
// 바깥 벽 (시작부는 원작 좌표 그대로)
// ---------------------------------------------------------------------------------------------
b.wall([
  [16.5, -300],
  [9.25, -300],
  [9.25, 8.5],
  [2, 19.25],
  [2, 26],
  [9.75, 30],
  [9.75, 33.5],
  [1.25, 41],
  [1.25, 53.75],
  [8.25, 58.75],
  [8.25, 63],
  [9.25, 64],
  [8.25, 65],
  [LEFT, FERRIS_Y + 3],
  [MOUTH_LEFT, MOUTH_Y],
  [MOUTH_LEFT, GOAL_Y + 2],
]);
b.wall([
  [16.5, -300],
  [16.5, 9.25],
  [9.5, 20],
  [9.5, 22.5],
  [17.5, 26],
  [17.5, 33.5],
  [24, 38.5],
  [19, 45.5],
  [19, 55.5],
  [24, 59.25],
  [24, 63],
  [23, 64],
  [24, 65],
  [RIGHT, FERRIS_Y + 7.3],
]);

// 원작의 가운데 섬과 못
b.wall([
  [12.75, 37.5],
  [7, 43.5],
  [7, 49.75],
  [12.75, 53.75],
  [12.75, 37.5],
]);
b.wall([
  [14.75, 37.5],
  [14.75, 43],
  [17.5, 40.25],
  [14.75, 37.5],
]);
b.block(15.5, 30, 0.2, 0.2, -45, undefined, 1);
for (const [x, y] of [
  [15.5, 32],
  [15.5, 28],
  [12.5, 30],
  [12.5, 32],
  [12.5, 28],
]) {
  b.block(x, y, 0.2, 0.2, -45);
}
// 원작의 갈매기 무늬 못
for (const x of [9.4, 11.3, 13.2, 15.1, 17, 18.9, 20.7, 22.7]) {
  b.block(x, 66.6, 0.6, 0.1, 45);
  b.block(x, 69.1, 0.6, 0.1, -45);
}

// ---------------------------------------------------------------------------------------------
// 초반 보스: 운명의 톱니바퀴
// ---------------------------------------------------------------------------------------------
// 스포크 바퀴 두 개가 반대로 돌며 가운데서 살이 엇갈려 맞물린다. 위쪽은 가운데로, 가운데 턱은 아래로 움직여
// 구슬을 턱으로 끌어들이지만, 살에 맞으면 튕겨 나가 다시 올라간다. 바퀴 바깥쪽은 볼(뺨) 이 막고 있어
// 바퀴를 비켜 갈 수 없고, 바깥쪽 살이 구슬을 퍼 올려 다시 위로 넘긴다
const GEAR_R = 3.4;
const GEAR_GAP = 3; // 가운데에서 바퀴 중심까지
const GEAR_SPIN = 1.4;
const GEAR_COLOR = '#0f766e';
const gearLeft = MID - GEAR_GAP;
const gearRight = MID + GEAR_GAP;
b.label('GEARS OF FATE', MID, 72, 1.7);
for (let i = 0; i < 3; i++) {
  // 왼쪽은 30도 어긋나게 놓아 오른쪽 살과 엇갈리게 한다 (같은 속도로 반대로 도니 계속 엇갈린다)
  b.spinner(gearLeft, GEAR_Y, GEAR_R, GEAR_SPIN, (30 + i * 60) * DEG, GEAR_COLOR, 0.16);
  b.spinner(gearRight, GEAR_Y, GEAR_R, -GEAR_SPIN, i * 60 * DEG, GEAR_COLOR, 0.16);
}
b.disc(gearLeft, GEAR_Y, 0.7, GEAR_SPIN, '#134e4a');
b.disc(gearRight, GEAR_Y, 0.7, -GEAR_SPIN, '#134e4a');
// 바퀴 바깥쪽 볼. 살 끝과의 틈(0.3) 이 구슬보다 좁아 구슬이 끼지 않고 살에 실려 올라간다
const CHEEK_R = GEAR_R + 0.3;
b.solid([[LEFT, GEAR_Y - 5], ...arc(gearLeft, GEAR_Y, CHEEK_R, 250 * DEG, 100 * DEG), [LEFT, GEAR_Y + 5.5]]);
b.solid([[RIGHT, GEAR_Y - 5], ...arc(gearRight, GEAR_Y, CHEEK_R, -70 * DEG, 80 * DEG), [RIGHT, GEAR_Y + 5.5]]);
// 턱을 빠져나온 구슬을 흩뜨리는 범퍼
b.bumper(MID - 1.95, GEAR_Y + 7.5, 0.6, '#ff8a00');
b.bumper(MID + 1.95, GEAR_Y + 7.5, 0.6, '#ff8a00');

// 원작의 다이아몬드 못
for (const [y, xs] of [
  [92, [9.5, 12.75, 16, 19.25, 22.5]],
  [95, [11, 14.25, 17.5, 20.75]],
  [98, [9.5, 12.75, 16, 19.25, 22.5]],
] as [number, number[]][]) {
  for (const x of xs) b.block(x, y, 0.25, 0.25, Math.PI / 4);
}

// ---------------------------------------------------------------------------------------------
// 중반 보스: 타로의 수레바퀴와 시간의 모래
// ---------------------------------------------------------------------------------------------
// 테두리 없는 8살 바퀴. 살 끝마다 범퍼 손잡이가 달려 있고, 바퀴 아래 그릇에는 모래(슬로우) 가 깔려 있다.
// 먼저 온 구슬도 모래에서 느려져 뒤따른 구슬과 한데 모이고, 그릇 바닥을 쓸고 지나가는 손잡이가
// 누구를 출구로 밀고 누구를 튕겨 올릴지 정한다
const TAROT_R = 5.4;
const KNOB_R = 0.42;
const TAROT_SPIN = 0.75;
b.label('WHEEL OF TAROT', MID, 101.6, 1.7);
for (let i = 0; i < 4; i++) {
  b.spinner(MID, TAROT_Y, TAROT_R, TAROT_SPIN, i * 45 * DEG, '#7c3aed', 0.18);
}
for (let i = 0; i < 8; i++) {
  const [kx, ky] = rotate([0, -TAROT_R], i * 45 * DEG);
  b.rotatingLine(MID, TAROT_Y, polygon(kx, ky, KNOB_R), TAROT_SPIN, '#f59e0b', 1.4);
}
b.disc(MID, TAROT_Y, 1, TAROT_SPIN, '#5b21b6');
// 그릇: 바퀴와 같은 중심의 원호. 손잡이 끝과의 틈(0.48) 이 구슬보다 좁아 손잡이 아래로 빠지지 못한다
const BOWL_R = TAROT_R + KNOB_R + 0.48;
const BOWL_BOTTOM = TAROT_Y + 10;
// 바퀴는 시계 방향으로 돌아 왼쪽이 위로 올라간다. 왼쪽 벽과 바퀴 사이에 틈이 있으면 손잡이가 구슬을 계속 퍼 올려
// 그 틈에 가두므로, 왼쪽은 볼(뺨) 로 위쪽까지 감싸 퍼 올린 구슬이 꼭대기를 넘어 바퀴 안으로 떨어지게 한다
b.solid([
  [LEFT, TAROT_Y - 7.5],
  ...arc(MID, TAROT_Y, BOWL_R, 255 * DEG, 96 * DEG),
  [round(MID - BOWL_R * Math.cos(84 * DEG)), BOWL_BOTTOM],
  [LEFT, BOWL_BOTTOM],
]);
b.solid([
  [RIGHT, TAROT_Y - 0.5],
  ...arc(MID, TAROT_Y, BOWL_R, 0, 84 * DEG),
  [round(MID + BOWL_R * Math.cos(84 * DEG)), BOWL_BOTTOM],
  [RIGHT, BOWL_BOTTOM],
]);
b.zones.push({ type: 'slow', x: MID, y: TAROT_Y + 5, w: 9, h: 3.6, drag: 4 });
b.label('SANDS OF TIME', MID, TAROT_Y + 3.4, 0.8);

// 그릇 출구 아래 갈림 못. 아래 회전 막대가 구슬을 출구로 도로 쳐 올리지 않게 막는다
b.block(MID, TAROT_Y + 11.6, 0.4, 0.4, Math.PI / 4);

// 원작의 회전 막대 (원작의 이름이 된 "바퀴"). 벽에 붙은 양 끝 막대는 벽 구석에서 구슬을 계속 튕겨 올리므로 빼고,
// 그 자리에는 벽을 타고 내려오는 구슬을 안쪽으로 보내는 턱을 둔다
[12, 16, 20].forEach((x, i) => {
  b.spinner(x, SPINNER_Y, 2, i % 2 === 0 ? 3.5 : -3.5, 0, undefined, 0.1);
});
b.solid([
  [LEFT, SPINNER_Y - 2],
  [LEFT + 1.6, SPINNER_Y],
  [LEFT, SPINNER_Y + 0.6],
]);
b.solid([
  [RIGHT, SPINNER_Y - 2],
  [RIGHT - 1.6, SPINNER_Y],
  [RIGHT, SPINNER_Y + 0.6],
]);

// ---------------------------------------------------------------------------------------------
// 마지막 보스: 운명의 관람차
// ---------------------------------------------------------------------------------------------
b.label('FERRIS OF FORTUNE', MID, FERRIS_Y - 12.7, 1.7);
// 바퀴: 원판에 컵 6개가 바깥을 보고 붙어 시계 방향으로 돈다.
// 꼭대기에서 컵에 떨어진 구슬은 실려 가다가, 얕은 컵은 오른쪽(약 3시) 에서 쏟아져 리프트 쪽으로,
// 갈고리가 달린 깊은 컵은 바닥 가까이(약 5시) 까지 붙들고 가서 결승 쪽으로 쏟아진다
b.disc(FERRIS_X, FERRIS_Y, FERRIS_R, FERRIS_SPIN, '#fcd34d');
for (let i = 0; i < 6; i++) {
  b.rotatingLine(
    FERRIS_X,
    FERRIS_Y,
    [[0, 0], rotate([0, -FERRIS_R + 0.15], (30 + i * 60) * DEG)],
    FERRIS_SPIN,
    '#92400e'
  );
}
b.disc(FERRIS_X, FERRIS_Y, 0.6, FERRIS_SPIN, '#92400e');
// 테두리를 살(칸막이) 8개로 빈틈없이 나눠 칸 8개를 만든다. 깔때기에서 떨어진 구슬은 어느 칸에든 들어간다.
// 칸이 기울어 구슬이 쏟아지는 때는 그 칸의 앞쪽(도는 방향) 살이 정한다.
//   얕은 칸(빨강): 앞쪽 살이 짧아 약 3시에서 쏟아져 오른쪽 되돌이 칸으로
//   깊은 칸(초록): 앞쪽 살 끝에 갈고리가 있어 바닥을 지나 왼쪽까지 붙들고 가서 결승 쪽으로
const PADDLE_SHORT = 0.5;
const PADDLE_TALL = 1;
/** 깊은 칸 살 끝의 갈고리: 뒤로(칸 안쪽으로) 0.45, 바퀴 쪽으로 0.15 굽는다. 막힌 주머니로 만들면 구슬이 영영 나오지 못한다 */
const HOOK: Pt = [-0.45, -FERRIS_R - PADDLE_TALL + 0.15];
const BUCKETS = ['deep', 'shallow', 'deep', 'deep', 'shallow', 'deep', 'deep', 'shallow'] as const;
BUCKETS.forEach((kind, i) => {
  // i 번째 칸은 살 i 와 살 i+1 사이. 시계 방향으로 도니 살 i+1 이 앞쪽 살이다
  const angle = (i + 1) * 45 * DEG;
  const local: Pt[] =
    kind === 'deep'
      ? [[0, -FERRIS_R + 0.05], [0, -FERRIS_R - PADDLE_TALL], HOOK]
      : [
          [0, -FERRIS_R + 0.05],
          [0, -FERRIS_R - PADDLE_SHORT],
        ];
  b.rotatingLine(
    FERRIS_X,
    FERRIS_Y,
    local.map((pt) => rotate(pt, angle)),
    FERRIS_SPIN,
    kind === 'deep' ? '#16a34a' : '#e11d48'
  );
});
const FERRIS_REACH = FERRIS_R + PADDLE_TALL;

// 바퀴 위 깔때기. 출구는 바퀴 꼭대기 위
const FEED_Y = FERRIS_Y - FERRIS_REACH - 0.8;
const LIFT_LEFT = 22.3;
const LIFT_TOP = FERRIS_Y - 7.3;
b.solid([
  [LEFT, FERRIS_Y - 9],
  [FERRIS_X - 0.65, FEED_Y],
  [FERRIS_X - 0.65, FEED_Y + 0.45],
  [LEFT, FERRIS_Y - 8.5],
]);
b.solid([
  [LIFT_LEFT, LIFT_TOP],
  [FERRIS_X + 0.65, FEED_Y],
  [FERRIS_X + 0.65, FEED_Y + 0.45],
  [LIFT_LEFT, LIFT_TOP + 0.5],
]);
// 리프트 꼭대기를 덮는 지붕. 위에서 떨어지는 구슬은 깔때기로 흘려보내고, 올라온 구슬은 왼쪽으로 내보낸다
b.solid([
  [RIGHT, FERRIS_Y - 10.2],
  [20.6, FERRIS_Y - 8.6],
  [20.6, FERRIS_Y - 8.2],
  [RIGHT, FERRIS_Y - 9.75],
]);

// 칸막이: 왼쪽은 결승 깔때기, 오른쪽은 리프트로 가는 되돌이 칸
const DIVIDER_X = FERRIS_X + 3.25;
const dividerTop = round(FERRIS_Y + Math.sqrt((FERRIS_REACH + 0.25) ** 2 - 3.25 ** 2));
b.solid([
  [DIVIDER_X, dividerTop],
  [DIVIDER_X + 0.35, dividerTop],
  [DIVIDER_X + 0.35, FERRIS_Y + 5.55],
  [MOUTH_RIGHT, MOUTH_Y],
]);
// 되돌이 칸 바닥과 리프트
b.wall([
  [DIVIDER_X + 0.35, FERRIS_Y + 5.55],
  [LIFT_LEFT, FERRIS_Y + 7],
  [RIGHT, FERRIS_Y + 7.3],
]);
b.wall([
  [LIFT_LEFT, FERRIS_Y + 5.8],
  [LIFT_LEFT, LIFT_TOP],
]);
b.zones.push({
  type: 'force',
  x: (LIFT_LEFT + RIGHT) / 2,
  y: FERRIS_Y + 0,
  w: RIGHT - LIFT_LEFT,
  h: 14.4,
  force: [0, -24],
});
b.zones.push({ type: 'force', x: 22.3, y: FERRIS_Y - 8, w: 3.4, h: 1.6, force: [-16, -6] });

// 결승 통로와 진자 문지기
b.wall([
  [MOUTH_RIGHT, MOUTH_Y],
  [MOUTH_RIGHT, GOAL_Y + 2],
]);
const PENDULUM_LENGTH = 2;
const PENDULUM_SWING = 32 * DEG;
const pendulumX = (MOUTH_LEFT + MOUTH_RIGHT) / 2;
const pendulumY = FERRIS_Y + FERRIS_REACH + 0.8;
const pendulumMotion = { swing: PENDULUM_SWING * 2, period: 2.6 };
b.movingLine(pendulumX, pendulumY, [[0, 0], rotate([0, PENDULUM_LENGTH], -PENDULUM_SWING)], pendulumMotion, '#475569');
const [bobX, bobY] = rotate([0, PENDULUM_LENGTH], -PENDULUM_SWING);
b.movingLine(pendulumX, pendulumY, polygon(bobX, bobY, 0.4), pendulumMotion, '#ff4d8d', 1.5);

const background: BackgroundStop[] = [
  { y: 0, color: '#eef4ff' },
  { y: 60, color: '#f2f6ff' },
  { y: 80, color: '#e3f7f3' },
  { y: 100, color: '#f6f0ff' },
  { y: 116, color: '#fbf1dc' },
  { y: 130, color: '#fff7e0' },
  { y: GOAL_Y, color: '#fff1e6' },
];

export const wheelOfFortune: StageDef = {
  title: 'Wheel of fortune',
  goalY: GOAL_Y,
  zoomY: MOUTH_Y,
  // 보스 구간에서는 바퀴 전체가 보이게 비춘다 (결승 줌인 중에는 쓰지 않는다)
  cameraZones: [
    { x: MID, y: GEAR_Y, w: 17, h: 16 },
    { x: MID, y: TAROT_Y + 0.5, w: 17, h: 17 },
    { x: MID, y: FERRIS_Y, w: 17, h: 24 },
  ],
  entities: b.entities,
  zones: b.zones,
  labels: b.labels,
  background,
};
