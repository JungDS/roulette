// 결과판: 순서, 자리, 모둠, 간식 결과를 화면 가운데에 크게 보여 준다.
// 이름은 사용자가 입력한 글자이므로 모두 textContent 로 넣는다.

import type { Board } from './drawModes';
import { translate } from './localization';

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** n 번째 모둠의 이름 ("1모둠", "Team 1") */
export function teamLabel(index: number): string {
  return translate('Team {n}').replace('{n}', String(index));
}

function renderBody(board: Board): HTMLElement {
  switch (board.kind) {
    case 'list': {
      const list = element('ol', 'board-list');
      for (const row of board.rows) {
        const item = element('li');
        item.append(element('span', 'rank', String(row.rank)), element('span', 'name', row.name));
        if (row.note) item.append(element('span', 'note', row.note));
        list.append(item);
      }
      return list;
    }
    case 'seats': {
      const wrap = element('div');
      const grid = element('div', 'board-seats');
      // 줄마다 앉는 사람 수는 실행 중에 정해지므로 스타일시트가 아니라 여기서 넣는다 (CSSOM 은 CSP 가 막지 않는다)
      grid.style.gridTemplateColumns = `repeat(${board.columns}, minmax(0, 1fr))`;
      board.seats.forEach((name, i) => {
        const seat = element('div', name === null ? 'seat empty' : 'seat');
        seat.append(element('small', undefined, String(i + 1)), document.createTextNode(name ?? '-'));
        grid.append(seat);
      });
      wrap.append(element('div', 'board-front', translate('Front of the room')), grid);
      return wrap;
    }
    case 'teams': {
      const wrap = element('div', 'board-teams');
      board.teams.forEach((members, i) => {
        const team = element('div', 'team');
        const list = element('ul');
        for (const name of members) list.append(element('li', undefined, name));
        team.append(element('h3', undefined, teamLabel(i + 1)), list);
        wrap.append(team);
      });
      return wrap;
    }
  }
}

export function showBoard(title: string, subtitle: string, board: Board) {
  const root = document.querySelector<HTMLElement>('#resultBoard');
  if (!root) return;
  root.querySelector('#boardTitle')!.textContent = title;
  root.querySelector('#boardSubtitle')!.textContent = subtitle;
  root.querySelector('#boardBody')!.replaceChildren(renderBody(board));
  root.hidden = false;
}

export function hideBoard() {
  const root = document.querySelector<HTMLElement>('#resultBoard');
  if (root) root.hidden = true;
}
