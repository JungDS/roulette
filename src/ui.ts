// 설정 창, 결과판, 명단 · 기록 창, 공지의 동작.
//
// 예전에는 index.html 안에 인라인 스크립트로 있었다. 인라인 스크립트가 남아 있으면
// CSP 에서 'unsafe-inline' 을 허용해야 해서, 페이지에 끼어든 스크립트를 막을 수 없다. 그래서 번들로 옮겼다.
// 화면에 넣는 글자는 모두 textContent 나 value 로 넣는다 (innerHTML 을 쓰지 않는다).

import {
  type Board,
  boardToLines,
  buildBoard,
  type DrawMode,
  type DrawOptions,
  expandPrizes,
  isDrawMode,
  MAX_COLUMNS,
  MAX_TEAMS,
  ranksNeeded,
} from './drawModes';
import { translate } from './localization';
import { initMapSelector } from './mapSelector';
import { countMarbles, formatEntries, parseEntries, removeNames, splitNames } from './names';
import options from './options';
import {
  addHistory,
  clearHistory,
  getHistory,
  getRosters,
  type HistoryEntry,
  MAX_ROSTERS,
  removeRoster,
  saveRoster,
} from './records';
import { hideBoard, showBoard, teamLabel } from './resultBoard';
import type { Roulette } from './roulette';
import type { RenderResolution } from './rouletteRenderer';
import { clearAll, isPersonalDataSaved, load, save, setPersonalDataSaved } from './storage';

type WinnerType = 'first' | 'last' | 'custom' | 'multi';

/** 공지 내용을 바꾸면 올린다. 이보다 낮은 번호까지만 본 사람에게 공지를 다시 띄운다 */
const CURRENT_NOTICE = 1;
const TOAST_MS = 1600;
/** 결과가 나온 뒤 설정 창을 다시 보여 주기까지의 시간 */
const SETTINGS_RETURN_MS = 3000;
const DEFAULT_COLUMNS = 6;
const DEFAULT_TEAMS = 4;

const MODE_LABELS: Record<DrawMode, string> = {
  winner: 'Pick winners',
  order: 'Decide an order',
  seat: 'Assign seats',
  team: 'Split into teams',
  prize: 'Hand out snacks',
};

function element<T extends HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing element: ${selector}`);
  return found;
}

function make<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * 주소로 넘겨받은 이름 목록 (`#names=가,나,다`).
 * `#` 뒤는 서버로 전송되지 않고 브라우저 안에만 머문다. `?names=` 는 서버 접속 기록에 남을 수 있어 받지 않는다
 */
function namesFromAddress(): string | null {
  return new URLSearchParams(location.hash.replace(/^#/, '')).get('names');
}

function showToast(message: string) {
  const toast = make('div', 'toast', translate(message));
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), TOAST_MS);
}

function copyText(text: string) {
  if (!navigator.clipboard) return;
  navigator.clipboard.writeText(text).then(
    () => showToast('Copied'),
    () => {}
  );
}

function formatTime(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function initUi(roulette: Roulette) {
  // 물리 엔진(wasm) 을 다 불러온 뒤에 시작한다
  if (!roulette.isReady) {
    setTimeout(() => initUi(roulette), 100);
    return;
  }

  const namesInput = element<HTMLTextAreaElement>('#in_names');
  const titleInput = element<HTMLInputElement>('#in_title');
  const modeSelect = element<HTMLSelectElement>('#sltMode');
  const columnsInput = element<HTMLInputElement>('#in_columns');
  const teamsInput = element<HTMLInputElement>('#in_teams');
  const prizesInput = element<HTMLInputElement>('#in_prizes');
  const settings = element('#settings');
  const rankInput = element<HTMLInputElement>('#in_winningRank');
  const rangeStartInput = element<HTMLInputElement>('#in_rangeStart');
  const rangeEndInput = element<HTMLInputElement>('#in_rangeEnd');
  const dropWinnersButton = element<HTMLButtonElement>('#btnDropWinners');
  const openSettingsButton = element<HTMLButtonElement>('#btnOpenSettings');

  let ready = false;
  let winnerType: WinnerType = 'first';
  let mode: DrawMode = 'winner';
  /** 방금 끝난 추첨에서 뽑힌 이름 ("당첨자 빼기" 용) */
  let lastWinners: string[] = [];
  /** 결과판에 떠 있는 내용을 글자로 옮긴 것 (복사용) */
  let boardText = '';

  /** 설정 창을 띄운다. 당첨 표시가 창 뒤에 가리지 않게 창 높이만큼 올려 그리게 한다 */
  function showSettings() {
    openSettingsButton.hidden = true;
    settings.classList.remove('hide');
    roulette.setBottomInset(window.innerHeight - settings.getBoundingClientRect().top);
  }

  function hideSettings() {
    openSettingsButton.hidden = true;
    settings.classList.add('hide');
    roulette.setBottomInset(0);
  }

  function drawOptions(): DrawOptions {
    return {
      columns: Math.max(1, Math.min(MAX_COLUMNS, parseInt(columnsInput.value, 10) || DEFAULT_COLUMNS)),
      teams: Math.max(2, Math.min(MAX_TEAMS, parseInt(teamsInput.value, 10) || DEFAULT_TEAMS)),
      prizes: expandPrizes(prizesInput.value),
    };
  }

  // 구슬 수나 추첨 종류가 바뀔 때마다 다시 호출된다. 범위 클리핑은 roulette 이 하고, 잘린 결과를 input 에 되돌려 쓴다.
  // edited 는 사용자가 방금 고친 범위 input
  function applyWinnerSetting(edited?: 'start' | 'end') {
    // 당첨자 뽑기가 아니면 종류에 따라 정해진 등수까지 모두 가린다
    const needed = ranksNeeded(mode, roulette.getCount(), drawOptions());
    if (needed !== null) {
      roulette.setWinnerRange(0, needed - 1);
      return;
    }

    let start: number;
    let end: number;
    switch (winnerType) {
      case 'first':
        start = end = 1;
        break;
      case 'last':
        start = end = roulette.getCount();
        break;
      case 'multi':
        start = parseInt(rangeStartInput.value, 10) || 1;
        end = parseInt(rangeEndInput.value, 10) || 1;
        // 뒤집힌 범위는 방금 고친 쪽을 존중하고 반대쪽을 따라오게 한다
        if (end < start) {
          if (edited === 'end') start = end;
          else end = start;
        }
        break;
      default:
        start = end = parseInt(rankInput.value, 10) || 1;
    }

    roulette.setWinnerRange(start - 1, end - 1);
    const clipped = roulette.getWinnerRange();
    // 범위 input 은 여러명 모드일 때만 건드린다. 다른 모드가 덮어쓰면 사용자가 넣어둔 범위가 날아간다
    if (winnerType === 'multi') {
      rangeStartInput.value = String(clipped.start + 1);
      rangeEndInput.value = String(clipped.end + 1);
    } else {
      rankInput.value = String(clipped.start + 1);
    }

    element('.btn-first-winner').classList.toggle('active', winnerType === 'first');
    element('.btn-last-winner').classList.toggle('active', winnerType === 'last');
    element('.btn-multi-winner').classList.toggle('active', winnerType === 'multi');
    rankInput.classList.toggle('active', winnerType === 'custom');
  }

  /** 추첨 종류에 맞는 설정 줄만 보여 준다 */
  function syncModeRows() {
    for (const row of Array.from(document.querySelectorAll<HTMLElement>('.row-mode'))) {
      row.classList.toggle('active', row.dataset.mode === mode);
    }
    element('.row-range').classList.toggle('active', mode === 'winner' && winnerType === 'multi');
  }

  function selectWinnerType(type: WinnerType, edited?: 'start' | 'end') {
    winnerType = type;
    applyWinnerSetting(edited);
    syncModeRows();
  }

  function getReady() {
    const names = splitNames(namesInput.value);
    roulette.setMarbles(names);
    ready = names.length > 0;
    element('#nameCount').textContent = ready ? `(${roulette.getCount()})` : '';
    save('names', names.join(','));
    applyWinnerSetting();
    // 명단이 바뀌면 지난 추첨의 당첨자는 더 뺄 수 없다
    lastWinners = [];
    dropWinnersButton.hidden = true;
  }

  // ----- 이름 -----
  const addressNames = namesFromAddress();
  if (addressNames) {
    namesInput.value = addressNames.replace(/,/g, '\n');
  } else {
    const savedNames = load('names');
    if (savedNames) namesInput.value = savedNames;
  }

  namesInput.addEventListener('input', getReady);

  // 입력을 마치면 같은 이름을 하나로 합쳐 `이름/가중치*개수` 꼴로 정리한다
  namesInput.addEventListener('blur', () => {
    const normalized = formatEntries(parseEntries(namesInput.value));
    if (namesInput.value !== normalized) {
      namesInput.value = normalized;
      getReady();
    }
  });

  element('#btnShuffle').addEventListener('click', getReady);

  dropWinnersButton.addEventListener('click', () => {
    if (lastWinners.length === 0) return;
    namesInput.value = formatEntries(removeNames(parseEntries(namesInput.value), lastWinners));
    getReady();
  });

  // ----- 제목과 추첨 종류 -----
  titleInput.value = load('title') ?? '';
  roulette.setTitle(titleInput.value.trim());
  titleInput.addEventListener('input', () => {
    roulette.setTitle(titleInput.value.trim());
    save('title', titleInput.value);
  });

  const savedMode = load('mode');
  if (isDrawMode(savedMode)) mode = savedMode;
  modeSelect.value = mode;
  columnsInput.value = load('columns') ?? String(DEFAULT_COLUMNS);
  teamsInput.value = load('teams') ?? String(DEFAULT_TEAMS);
  prizesInput.value = load('prizes') ?? '';

  modeSelect.addEventListener('change', () => {
    if (!isDrawMode(modeSelect.value)) return;
    mode = modeSelect.value;
    save('mode', mode);
    applyWinnerSetting();
    syncModeRows();
  });
  columnsInput.addEventListener('change', () => save('columns', String(drawOptions().columns)));
  teamsInput.addEventListener('change', () => save('teams', String(drawOptions().teams)));
  prizesInput.addEventListener('input', () => {
    save('prizes', prizesInput.value);
    applyWinnerSetting();
  });

  // ----- 시작과 결과 -----
  element('#btnStart').addEventListener('click', () => {
    if (!ready) return;
    if (mode === 'prize' && drawOptions().prizes.length === 0) {
      showToast('Enter the snack list first');
      return;
    }
    applyWinnerSetting();
    hideBoard();
    dropWinnersButton.hidden = true;
    // 결과판을 따로 띄우는 추첨에서는 캔버스의 당첨자 목록을 끈다
    roulette.setWinnerListVisible(mode === 'winner');
    hideSettings();
    roulette.start();
  });

  roulette.addEventListener('goal', (e) => {
    ready = false;
    const ranking: string[] = (e as CustomEvent<{ winners: string[] }>).detail.winners;
    const title = titleInput.value.trim();
    const modeName = translate(MODE_LABELS[mode]);
    const firstRank = roulette.getWinnerRange().start + 1;
    const board: Board = buildBoard(mode, ranking, drawOptions(), firstRank);
    const lines = boardToLines(board, teamLabel);
    boardText = [title || modeName, ...lines].join('\n');

    addHistory({
      at: Date.now(),
      title,
      mode,
      map: translate(roulette.getCurrentMap()?.title ?? ''),
      lines,
    });

    if (mode === 'winner') {
      // 당첨자는 캔버스가 보여 준다. 뽑힌 사람을 빼고 다시 돌릴 수 있게 기억해 둔다
      lastWinners = ranking;
      dropWinnersButton.hidden = false;
    } else {
      // 캔버스의 당첨자 목록 대신 종류에 맞는 결과판을 띄운다
      showBoard(title || modeName, title ? modeName : '', board);
    }
    // 남은 구슬이 달리는 동안은 설정 창으로 경기를 가리지 않는다. 작은 버튼만 두고,
    // 마지막 구슬까지 들어오면('finish') 창을 다시 띄운다
    setTimeout(() => {
      if (roulette.getCount() > 0) openSettingsButton.hidden = false;
      else showSettings();
    }, SETTINGS_RETURN_MS);
  });

  roulette.addEventListener('finish', () => {
    setTimeout(showSettings, SETTINGS_RETURN_MS);
  });
  openSettingsButton.addEventListener('click', showSettings);

  roulette.addEventListener('message', (e) => {
    showToast(String((e as CustomEvent).detail));
  });

  element('#btnBoardClose').addEventListener('click', hideBoard);
  element('#btnBoardCopy').addEventListener('click', () => copyText(boardText));

  // ----- 그 밖의 설정 -----
  element<HTMLInputElement>('#chkAutoRecording').addEventListener('change', (e) => {
    options.autoRecording = (e.target as HTMLInputElement).checked;
    roulette.setAutoRecording(options.autoRecording);
  });

  const resolutionButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.btn-resolution'));
  const syncResolutionButtons = () => {
    const current = roulette.getResolution();
    for (const button of resolutionButtons) {
      button.classList.toggle('active', button.dataset.resolution === current);
    }
  };
  for (const button of resolutionButtons) {
    button.addEventListener('click', () => {
      // 알 수 없는 값이면 roulette 이 무시한다
      roulette.setResolution(button.dataset.resolution as RenderResolution);
      syncResolutionButtons();
    });
  }
  syncResolutionButtons();

  element<HTMLInputElement>('#chkSkill').addEventListener('change', (e) => {
    options.useSkills = (e.target as HTMLInputElement).checked;
  });

  rankInput.addEventListener('change', () => selectWinnerType('custom'));
  element('.btn-last-winner').addEventListener('click', () => selectWinnerType('last'));
  element('.btn-first-winner').addEventListener('click', () => selectWinnerType('first'));
  element('.btn-multi-winner').addEventListener('click', () => selectWinnerType('multi'));
  rangeStartInput.addEventListener('change', () => selectWinnerType('multi', 'start'));
  rangeEndInput.addEventListener('change', () => selectWinnerType('multi', 'end'));

  const toggleButton = element('#btnToggleSettings');
  const collapsible = element('.collapsible-rows');
  toggleButton.addEventListener('click', () => {
    collapsible.classList.toggle('collapsed');
    element('.toggle-arrow').textContent = collapsible.classList.contains('collapsed') ? '▲' : '▼';
  });

  element('#btnFullscreen').addEventListener('click', () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  });

  // ----- 명단 창 -----
  const rosterDialog = element<HTMLDialogElement>('#dlgRoster');
  const rosterNameInput = element<HTMLInputElement>('#in_rosterName');
  const persistCheckbox = element<HTMLInputElement>('#chkPersist');

  function renderRosters() {
    const rosters = getRosters();
    element('#rosterEmpty').hidden = rosters.length > 0;
    element('#rosterList').replaceChildren(
      ...rosters.map((roster) => {
        const item = make('li');
        const info = make('div', 'grow');
        const count = countMarbles(parseEntries(roster.text));
        info.append(
          make('div', 'main', roster.name),
          make('div', 'sub', translate('{n} names').replace('{n}', String(count)))
        );
        const loadButton = make('button', undefined, translate('Load'));
        loadButton.addEventListener('click', () => {
          namesInput.value = roster.text;
          getReady();
          rosterDialog.close();
        });
        const removeButton = make('button', 'ghost', translate('Delete'));
        removeButton.addEventListener('click', () => {
          removeRoster(roster.name);
          renderRosters();
        });
        item.append(info, loadButton, removeButton);
        return item;
      })
    );
  }

  function saveCurrentRoster() {
    const name = rosterNameInput.value.trim();
    if (!name) {
      rosterNameInput.focus();
      return;
    }
    if (!isPersonalDataSaved()) {
      showToast('Saving is turned off');
      return;
    }
    if (!saveRoster(name, formatEntries(parseEntries(namesInput.value)))) {
      showToast(translate('You can keep up to {n} lists').replace('{n}', String(MAX_ROSTERS)));
      return;
    }
    rosterNameInput.value = '';
    renderRosters();
  }

  element('#btnRoster').addEventListener('click', () => {
    persistCheckbox.checked = isPersonalDataSaved();
    renderRosters();
    rosterDialog.showModal();
  });
  element('#btnSaveRoster').addEventListener('click', saveCurrentRoster);
  rosterNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveCurrentRoster();
  });

  persistCheckbox.addEventListener('change', () => {
    setPersonalDataSaved(persistCheckbox.checked);
    // 다시 켜면 지금 화면에 있는 것부터 저장한다
    if (persistCheckbox.checked) {
      save('names', splitNames(namesInput.value).join(','));
      save('title', titleInput.value);
      save('prizes', prizesInput.value);
    }
    renderRosters();
  });

  element('#btnClearAll').addEventListener('click', () => {
    clearAll();
    namesInput.value = '';
    titleInput.value = '';
    prizesInput.value = '';
    roulette.setTitle('');
    getReady();
    renderRosters();
    persistCheckbox.checked = isPersonalDataSaved();
    showToast('Everything saved here has been erased');
  });

  // ----- 기록 창 -----
  const historyDialog = element<HTMLDialogElement>('#dlgHistory');

  function renderHistory() {
    const history = getHistory();
    element('#historyEmpty').hidden = history.length > 0;
    element<HTMLButtonElement>('#btnClearHistory').hidden = history.length === 0;
    element('#historyList').replaceChildren(
      ...history.map((entry: HistoryEntry) => {
        const item = make('li');
        const info = make('div', 'grow');
        const heading = entry.title || translate(MODE_LABELS[entry.mode]);
        const detail = [formatTime(entry.at), entry.title ? translate(MODE_LABELS[entry.mode]) : '', entry.map];
        info.append(
          make('div', 'main', heading),
          make('div', 'sub', detail.filter((part) => !!part).join(' · ')),
          make('div', 'lines', entry.lines.join('\n'))
        );
        const copyButton = make('button', undefined, translate('Copy'));
        copyButton.addEventListener('click', () => copyText([heading, ...entry.lines].join('\n')));
        item.append(info, copyButton);
        return item;
      })
    );
  }

  element('#btnHistory').addEventListener('click', () => {
    renderHistory();
    historyDialog.showModal();
  });
  element('#btnClearHistory').addEventListener('click', () => {
    clearHistory();
    renderHistory();
  });

  for (const dialog of [rosterDialog, historyDialog]) {
    dialog.querySelector('[data-close]')?.addEventListener('click', () => dialog.close());
    // 창 바깥(어두운 부분) 을 누르면 닫는다
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close();
    });
  }

  // ----- 처음 그리기 -----
  getReady();
  syncModeRows();

  // 맵을 바꾸면 살아남은 구슬에서 이름을 뽑아 재구성하는데, 골인한 구슬이 사라지고
  // 무게(/n) 도 날아가므로 원본인 이름 입력창에서 다시 채운다
  initMapSelector(roulette, getReady);

  const notice = element('#notice');
  element('#closeNotice').addEventListener('click', () => {
    notice.style.display = 'none';
    save('notice', String(CURRENT_NOTICE));
  });
  element('#btnNotice').addEventListener('click', () => {
    notice.style.display = 'flex';
  });
  const lastViewed = load('notice');
  if (lastViewed === null || Number(lastViewed) < CURRENT_NOTICE) {
    notice.style.display = 'flex';
  }
}
