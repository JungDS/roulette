// 이름 입력창의 글자를 다룬다. 한 사람은 `이름`, `이름*개수`, `이름/가중치`, `이름/가중치*개수` 로 적는다.

import { parseName } from './utils/utils';

export type NameEntry = { name: string; weight: number; count: number };

/** 쉼표나 줄바꿈으로 나눈 조각 */
export function splitNames(text: string): string[] {
  return text
    .trim()
    .split(/[,\r\n]/g)
    .map((piece) => piece.trim())
    .filter((piece) => !!piece);
}

/** 같은 이름(과 가중치) 을 하나로 합친 목록. 처음 나온 순서를 지킨다 */
export function parseEntries(text: string): NameEntry[] {
  const merged = new Map<string, NameEntry>();
  for (const piece of splitNames(text)) {
    const parsed = parseName(piece);
    if (!parsed) continue;
    const key = `${parsed.name}/${parsed.weight}`;
    const entry = merged.get(key);
    if (entry) entry.count += parsed.count;
    else merged.set(key, { ...parsed });
  }
  return Array.from(merged.values());
}

export function formatEntries(entries: NameEntry[]): string {
  return entries
    .filter((entry) => entry.count > 0)
    .map((entry) => {
      const base = entry.weight > 1 ? `${entry.name}/${entry.weight}` : entry.name;
      return entry.count > 1 ? `${base}*${entry.count}` : base;
    })
    .join(',');
}

/** 구슬 수 */
export function countMarbles(entries: NameEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.count, 0);
}

/** 뽑힌 이름을 한 번에 하나씩 뺀다 (같은 이름이 여러 개면 뽑힌 만큼만 준다) */
export function removeNames(entries: NameEntry[], names: string[]): NameEntry[] {
  const result = entries.map((entry) => ({ ...entry }));
  for (const name of names) {
    const entry = result.find((candidate) => candidate.name === name && candidate.count > 0);
    if (entry) entry.count--;
  }
  return result.filter((entry) => entry.count > 0);
}
