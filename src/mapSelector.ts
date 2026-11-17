// 설정창의 맵 선택. 고른 맵은 localStorage 에 기억해서 다음 방문에도 유지한다.

import { stages } from './data/maps';
import { translate } from './localization';
import type { Roulette } from './roulette';

const SELECTED_MAP_STORAGE_KEY = 'mbr_selected_map';

function loadSelection(): number | null {
  try {
    const saved = localStorage.getItem(SELECTED_MAP_STORAGE_KEY);
    return saved === null ? null : Number(saved);
  } catch {
    return null;
  }
}

function saveSelection(index: number) {
  try {
    localStorage.setItem(SELECTED_MAP_STORAGE_KEY, String(index));
  } catch {
    // 저장하지 못하면 다음 방문에 첫 맵으로 돌아갈 뿐이다
  }
}

/**
 * @param onMapChange 맵을 바꾼 뒤 이름 입력창에서 구슬을 다시 채운다
 */
export function initMapSelector(roulette: Roulette, onMapChange: () => void) {
  const select = document.querySelector<HTMLSelectElement>('#sltMap');
  if (!select) return;

  select.replaceChildren(
    ...stages.map((stage, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = translate(stage.title);
      return option;
    })
  );

  /** 맵을 바꾼다. 없는 번호면 false */
  function apply(index: number): boolean {
    if (!Number.isInteger(index) || index < 0 || index >= stages.length) return false;
    roulette.setMap(index);
    select!.value = String(index);
    onMapChange();
    return true;
  }

  select.addEventListener('change', () => {
    const index = Number(select.value);
    if (apply(index)) saveSelection(index);
  });

  // 처음 그리기: 기억해 둔 맵이 있으면 그 맵으로
  const current = roulette.getCurrentMap()?.index ?? 0;
  const saved = loadSelection();
  if (saved === null || saved === current || !apply(saved)) {
    select.value = String(current);
  }
}
