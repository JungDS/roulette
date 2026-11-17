// 설정 창과 공지의 동작.
//
// 예전에는 index.html 안에 인라인 스크립트로 있었다. 인라인 스크립트가 남아 있으면
// CSP 에서 'unsafe-inline' 을 허용해야 해서, 페이지에 끼어든 스크립트를 막을 수 없다. 그래서 번들로 옮겼다.
// 화면에 넣는 글자는 모두 textContent 나 value 로 넣는다 (innerHTML 을 쓰지 않는다).

import { translate } from './localization';
import { initMapSelector } from './mapSelector';
import options from './options';
import type { Roulette } from './roulette';
import type { RenderResolution } from './rouletteRenderer';
import { parseName } from './utils/utils';

type WinnerType = 'first' | 'last' | 'custom' | 'multi';

const NAMES_STORAGE_KEY = 'mbr_names';
const NOTICE_STORAGE_KEY = 'lastViewedNotification';
/** 공지 내용을 바꾸면 올린다. 이보다 낮은 번호까지만 본 사람에게 공지를 다시 띄운다 */
const CURRENT_NOTICE = 10;
const TOAST_MS = 1200;
/** 결과가 나온 뒤 설정 창을 다시 보여 주기까지의 시간 */
const SETTINGS_RETURN_MS = 3000;

function element<T extends HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing element: ${selector}`);
  return found;
}

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 저장소를 못 쓰는 환경(사생활 보호 모드 등) 에서도 추첨은 되어야 한다
  }
}

/**
 * 주소로 넘겨받은 이름 목록. `#names=a,b,c` 를 먼저 보고, 없으면 `?names=a,b,c` 를 본다.
 * `#` 뒤는 서버로 전송되지 않으므로 이름을 주소에 실어 보낼 때는 `#names=` 쪽이 안전하다
 */
function namesFromAddress(): string | null {
  const fromHash = new URLSearchParams(location.hash.replace(/^#/, '')).get('names');
  return fromHash ?? new URLSearchParams(location.search).get('names');
}

function showToast(message: string) {
  const toast = document.createElement('div');
  toast.classList.add('toast');
  toast.textContent = translate(message);
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), TOAST_MS);
}

export function initUi(roulette: Roulette) {
  // 물리 엔진(wasm) 을 다 불러온 뒤에 시작한다
  if (!roulette.isReady) {
    setTimeout(() => initUi(roulette), 100);
    return;
  }

  const namesInput = element<HTMLTextAreaElement>('#in_names');
  const settings = element('#settings');
  const rankInput = element<HTMLInputElement>('#in_winningRank');
  const rangeStartInput = element<HTMLInputElement>('#in_rangeStart');
  const rangeEndInput = element<HTMLInputElement>('#in_rangeEnd');

  let ready = false;
  let winnerType: WinnerType = 'first';

  function getNames(): string[] {
    return namesInput.value
      .trim()
      .split(/[,\r\n]/g)
      .map((name) => name.trim())
      .filter((name) => !!name);
  }

  // 구슬 수가 바뀔 때마다 다시 호출된다. 범위 클리핑은 roulette 이 하고, 잘린 결과를 input 에 되돌려 쓴다.
  // edited 는 사용자가 방금 고친 범위 input
  function applyWinnerSetting(edited?: 'start' | 'end') {
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
    element('.row-range').classList.toggle('active', winnerType === 'multi');
  }

  function selectWinnerType(type: WinnerType, edited?: 'start' | 'end') {
    winnerType = type;
    applyWinnerSetting(edited);
  }

  function getReady() {
    const names = getNames();
    roulette.setMarbles(names);
    ready = names.length > 0;
    writeStorage(NAMES_STORAGE_KEY, names.join(','));
    applyWinnerSetting();
  }

  const addressNames = namesFromAddress();
  if (addressNames) {
    namesInput.value = addressNames.replace(/,/g, '\n');
  } else {
    const savedNames = readStorage(NAMES_STORAGE_KEY);
    if (savedNames) namesInput.value = savedNames;
  }

  namesInput.addEventListener('input', getReady);

  // 입력을 마치면 같은 이름을 하나로 합쳐 `이름/가중치*개수` 꼴로 정리한다
  namesInput.addEventListener('blur', () => {
    const counts = new Map<string, number>();
    for (const source of getNames()) {
      const parsed = parseName(source);
      if (!parsed) continue;
      const key = parsed.weight > 1 ? `${parsed.name}/${parsed.weight}` : parsed.name;
      counts.set(key, (counts.get(key) ?? 0) + parsed.count);
    }
    const normalized = Array.from(counts, ([key, count]) => (count > 1 ? `${key}*${count}` : key)).join(',');
    if (namesInput.value !== normalized) {
      namesInput.value = normalized;
      getReady();
    }
  });

  element('#btnShuffle').addEventListener('click', getReady);

  element('#btnStart').addEventListener('click', () => {
    if (!ready) return;
    settings.classList.add('hide');
    roulette.start();
  });

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

  roulette.addEventListener('goal', () => {
    ready = false;
    setTimeout(() => settings.classList.remove('hide'), SETTINGS_RETURN_MS);
  });

  roulette.addEventListener('message', (e) => {
    showToast(String((e as CustomEvent).detail));
  });

  const toggleButton = element('#btnToggleSettings');
  const collapsible = element('.collapsible-rows');
  toggleButton.addEventListener('click', () => {
    collapsible.classList.toggle('collapsed');
    element('.toggle-arrow').textContent = collapsible.classList.contains('collapsed') ? '▲' : '▼';
  });

  getReady();

  // 맵을 바꾸면 살아남은 구슬에서 이름을 뽑아 재구성하는데, 골인한 구슬이 사라지고
  // 무게(/n) 도 날아가므로 원본인 이름 입력창에서 다시 채운다
  initMapSelector(roulette, getReady);

  const notice = element('#notice');
  element('#closeNotice').addEventListener('click', () => {
    notice.style.display = 'none';
    writeStorage(NOTICE_STORAGE_KEY, String(CURRENT_NOTICE));
  });
  element('#btnNotice').addEventListener('click', () => {
    notice.style.display = 'flex';
  });
  const lastViewed = readStorage(NOTICE_STORAGE_KEY);
  if (lastViewed === null || Number(lastViewed) < CURRENT_NOTICE) {
    notice.style.display = 'flex';
  }
}
