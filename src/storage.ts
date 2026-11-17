// 이 브라우저에만 남기는 데이터 (localStorage). 어디로도 보내지 않는다.
//
// 이름이 들어가는 항목(PERSONAL) 은 "이 브라우저에 저장" 을 끄면 읽지도 쓰지도 않는다.
// 공용 PC 에서 쓸 때 명단이 남지 않게 하려는 것이다. 맵, 해상도 같은 설정은 그와 상관없이 기억한다.
// GitHub Pages 는 같은 계정의 다른 페이지와 저장소를 함께 쓰므로 키 앞에 이름을 붙여 섞이지 않게 한다.

const PREFIX = 'busanban.';

export type StorageKey =
  | 'names'
  | 'title'
  | 'rosters'
  | 'history'
  | 'prizes'
  | 'persist'
  | 'map'
  | 'resolution'
  | 'notice'
  | 'mode'
  | 'columns'
  | 'teams';

const PERSONAL: readonly StorageKey[] = ['names', 'title', 'rosters', 'history', 'prizes'];

function read(key: StorageKey): string | null {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    // 저장소를 못 쓰는 환경(사생활 보호 모드 등)
    return null;
  }
}

function write(key: StorageKey, value: string) {
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    // 저장하지 못해도 추첨은 되어야 한다
  }
}

function remove(key: StorageKey) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // 지울 것이 없는 것과 같다
  }
}

/** 이름이 들어가는 항목(명단, 기록 등) 을 이 브라우저에 저장하는지 */
export function isPersonalDataSaved(): boolean {
  return read('persist') !== '0';
}

/** 끄면 이미 저장된 명단과 기록도 함께 지운다 */
export function setPersonalDataSaved(on: boolean) {
  write('persist', on ? '1' : '0');
  if (!on) PERSONAL.forEach(remove);
}

export function load(key: StorageKey): string | null {
  if (PERSONAL.includes(key) && !isPersonalDataSaved()) return null;
  return read(key);
}

/** 빈 문자열을 넣으면 그 항목을 지운다 */
export function save(key: StorageKey, value: string) {
  if (PERSONAL.includes(key) && !isPersonalDataSaved()) return;
  if (value === '') remove(key);
  else write(key, value);
}

/** 저장해 둔 JSON 을 읽는다. 없거나 깨졌거나 모양이 다르면 fallback */
export function loadJson<T>(key: StorageKey, isValid: (value: unknown) => value is T, fallback: T): T {
  const raw = load(key);
  if (raw === null) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isValid(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/** 이 페이지가 저장한 것을 전부 지운다 (설정 포함). "저장 안 함" 으로 해 둔 선택만 남긴다 */
export function clearAll() {
  const keepOff = !isPersonalDataSaved();
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    // 저장소를 못 쓰면 지울 것도 없다
  }
  if (keepOff) write('persist', '0');
}
