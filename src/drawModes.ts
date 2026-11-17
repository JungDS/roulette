// 추첨 종류. 구슬이 골인한 순서(ranking) 를 받아 종류에 맞는 결과판을 만든다.
//
//   winner 당첨자 뽑기   정해 둔 등수만 뽑는다 (첫번째, 마지막, n번째, 여러명)
//   order  순서 정하기   모두의 순서를 정한다 (발표 순서 등)
//   seat   자리 배치     들어온 순서대로 앞줄 왼쪽부터 앉힌다
//   team   모둠 나누기   들어온 순서대로 한 명씩 돌아가며 모둠에 넣는다 (모둠 크기 차이는 1명 이하)
//   prize  간식 나누기   들어온 순서대로 목록의 간식을 하나씩 준다
//
// 화면과 무관하게 돌아가도록 DOM 을 쓰지 않는다.

import { splitNames } from './names';
import { parseName } from './utils/utils';

export type DrawMode = 'winner' | 'order' | 'seat' | 'team' | 'prize';

export const DRAW_MODES: readonly DrawMode[] = ['winner', 'order', 'seat', 'team', 'prize'];

export function isDrawMode(value: unknown): value is DrawMode {
  return typeof value === 'string' && (DRAW_MODES as readonly string[]).includes(value);
}

export type DrawOptions = {
  /** 자리 배치: 한 줄에 앉는 사람 수 */
  columns: number;
  /** 모둠 나누기: 모둠 수 */
  teams: number;
  /** 간식 나누기: 나눠 줄 간식 (하나씩 펼친 목록) */
  prizes: string[];
};

export type Board =
  | { kind: 'list'; rows: { rank: number; name: string; note?: string }[] }
  | { kind: 'seats'; columns: number; seats: (string | null)[] }
  | { kind: 'teams'; teams: string[][] };

export const MAX_COLUMNS = 20;
export const MAX_TEAMS = 20;

/** "초코파이*3, 사탕*2" → ['초코파이', '초코파이', '초코파이', '사탕', '사탕'] */
export function expandPrizes(text: string): string[] {
  const prizes: string[] = [];
  for (const piece of splitNames(text)) {
    const parsed = parseName(piece);
    if (!parsed) continue;
    for (let i = 0; i < parsed.count; i++) prizes.push(parsed.name.trim());
  }
  return prizes;
}

/**
 * 이 추첨에서 몇 등까지 가려야 하는지. 당첨자 뽑기는 사용자가 정한 등수를 쓰므로 null.
 * 간식은 간식 수만큼만 가리면 되고, 나머지는 모두의 순서가 필요하다
 */
export function ranksNeeded(mode: DrawMode, marbleCount: number, options: DrawOptions): number | null {
  if (mode === 'winner') return null;
  if (mode === 'prize') return Math.max(1, Math.min(marbleCount, options.prizes.length));
  return Math.max(1, marbleCount);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value) || min));
}

/**
 * @param ranking 골인한 순서대로의 이름
 * @param firstRank ranking 의 첫 사람이 몇 등인지 (당첨자 뽑기에서 3 ~ 5등을 뽑으면 3)
 */
export function buildBoard(mode: DrawMode, ranking: string[], options: DrawOptions, firstRank = 1): Board {
  switch (mode) {
    case 'seat': {
      const columns = clamp(options.columns, 1, MAX_COLUMNS);
      const seats: (string | null)[] = [...ranking];
      while (seats.length % columns !== 0) seats.push(null);
      return { kind: 'seats', columns, seats };
    }
    case 'team': {
      const count = clamp(options.teams, 1, Math.min(MAX_TEAMS, Math.max(1, ranking.length)));
      const teams: string[][] = Array.from({ length: count }, () => []);
      ranking.forEach((name, i) => {
        teams[i % count].push(name);
      });
      return { kind: 'teams', teams };
    }
    case 'prize':
      return {
        kind: 'list',
        rows: ranking.map((name, i) => ({ rank: firstRank + i, name, note: options.prizes[i] })),
      };
    default:
      return { kind: 'list', rows: ranking.map((name, i) => ({ rank: firstRank + i, name })) };
  }
}

/** 결과판을 글자로 옮긴다 (복사, 기록용). teamLabel(1) → "1모둠" */
export function boardToLines(board: Board, teamLabel: (index: number) => string): string[] {
  switch (board.kind) {
    case 'list':
      return board.rows.map((row) => `${row.rank}. ${row.name}${row.note ? ` - ${row.note}` : ''}`);
    case 'seats': {
      const lines: string[] = [];
      for (let i = 0; i < board.seats.length; i += board.columns) {
        lines.push(
          board.seats
            .slice(i, i + board.columns)
            .map((name) => name ?? '-')
            .join('\t')
        );
      }
      return lines;
    }
    case 'teams':
      return board.teams.map((members, i) => `${teamLabel(i + 1)}: ${members.join(', ')}`);
  }
}
