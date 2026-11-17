// 저장해 둔 명단과 추첨 기록. 둘 다 이 브라우저에만 남는다 (storage.ts).
// localStorage 는 사용자가 손댈 수 있으므로 읽을 때마다 모양을 확인한다.

import type { DrawMode } from './drawModes';
import { isDrawMode } from './drawModes';
import { loadJson, save } from './storage';

export type Roster = {
  name: string;
  /** 이름 입력창에 들어가는 글자 그대로 */
  text: string;
};

export type HistoryEntry = {
  /** 추첨이 끝난 시각 (ms) */
  at: number;
  title: string;
  mode: DrawMode;
  map: string;
  lines: string[];
};

export const MAX_ROSTERS = 20;
export const MAX_HISTORY = 50;
const MAX_TEXT = 20000;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function isRosterList(value: unknown): value is Roster[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_ROSTERS &&
    value.every((r) => isObject(r) && typeof r.name === 'string' && typeof r.text === 'string')
  );
}

function isHistory(value: unknown): value is HistoryEntry[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        isObject(entry) &&
        typeof entry.at === 'number' &&
        typeof entry.title === 'string' &&
        isDrawMode(entry.mode) &&
        typeof entry.map === 'string' &&
        Array.isArray(entry.lines) &&
        entry.lines.every((line) => typeof line === 'string')
    )
  );
}

export function getRosters(): Roster[] {
  return loadJson('rosters', isRosterList, []);
}

/** 같은 이름의 명단이 있으면 덮어쓴다. 꽉 찼으면 false */
export function saveRoster(name: string, text: string): boolean {
  const rosters = getRosters();
  const roster: Roster = { name, text: text.slice(0, MAX_TEXT) };
  const index = rosters.findIndex((r) => r.name === name);
  if (index >= 0) rosters[index] = roster;
  else if (rosters.length >= MAX_ROSTERS) return false;
  else rosters.push(roster);
  save('rosters', JSON.stringify(rosters));
  return true;
}

export function removeRoster(name: string) {
  save('rosters', JSON.stringify(getRosters().filter((r) => r.name !== name)));
}

/** 최근 것이 앞에 온다 */
export function getHistory(): HistoryEntry[] {
  return loadJson('history', isHistory, []);
}

export function addHistory(entry: HistoryEntry) {
  save('history', JSON.stringify([entry, ...getHistory()].slice(0, MAX_HISTORY)));
}

export function clearHistory() {
  save('history', '[]');
}
