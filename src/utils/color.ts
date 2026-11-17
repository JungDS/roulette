// 색 계산. 맵에 적힌 색은 CSS 색 문자열('#fff4b7', 'cyan', 'hsl(...)') 이라 캔버스에 한 번 넣어 보고 읽어서 숫자로 바꾼다.

export type RGB = [number, number, number];

const parsed = new Map<string, RGB | null>();
let probe: CanvasRenderingContext2D | null | undefined;

export function parseColor(color: string): RGB | null {
  const cached = parsed.get(color);
  if (cached !== undefined) return cached;
  const rgb = parseWithCanvas(color);
  parsed.set(color, rgb);
  return rgb;
}

function parseWithCanvas(color: string): RGB | null {
  if (probe === undefined) {
    probe = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  }
  if (!probe) return null;
  // 못 읽는 색이면 fillStyle 이 바뀌지 않는다. 서로 다른 두 색에서 출발해 둘 다 같은 값이 나오는지로 가린다
  probe.fillStyle = '#000000';
  probe.fillStyle = color;
  const first = probe.fillStyle;
  probe.fillStyle = '#ffffff';
  probe.fillStyle = color;
  if (probe.fillStyle !== first) return null;
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(first);
  if (hex) return [parseInt(hex[1], 16), parseInt(hex[2], 16), parseInt(hex[3], 16)];
  const rgba = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(first);
  if (rgba) return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])];
  return null;
}

function toCss([r, g, b]: RGB): string {
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

/** amount = 0 이면 a, 1 이면 b */
export function mixRgb(a: RGB, b: RGB, amount: number): RGB {
  return [a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount, a[2] + (b[2] - a[2]) * amount];
}

const adjusted = new Map<string, string>();

function adjust(kind: string, color: string, amount: number, fn: (rgb: RGB) => RGB): string {
  const key = `${kind}|${amount}|${color}`;
  let result = adjusted.get(key);
  if (result === undefined) {
    const rgb = parseColor(color);
    result = rgb ? toCss(fn(rgb)) : color;
    adjusted.set(key, result);
  }
  return result;
}

/** 검정 쪽으로 amount(0 ~ 1) 만큼 섞는다 */
export function darken(color: string, amount: number): string {
  return adjust('d', color, amount, (rgb) => mixRgb(rgb, [0, 0, 0], amount));
}

/** 흰색 쪽으로 amount(0 ~ 1) 만큼 섞는다 */
export function lighten(color: string, amount: number): string {
  return adjust('l', color, amount, (rgb) => mixRgb(rgb, [255, 255, 255], amount));
}

function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): RGB {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/** 밝은 배경 위에서 읽히는 밝기 상한 */
const MAX_LIGHTNESS_ON_LIGHT = 0.46;

/**
 * 어두운 배경에 맞춰 고른 색(파스텔, 흰색 등) 을 밝은 배경에서도 보이게 어둡게 만든다. 색상은 그대로 둔다.
 * 이미 충분히 짙은 색은 건드리지 않는다
 */
export function readableOnLight(color: string): string {
  return adjust('r', color, 0, (rgb) => {
    const [h, s, l] = rgbToHsl(rgb);
    if (l <= MAX_LIGHTNESS_ON_LIGHT) return rgb;
    return hslToRgb(h, s, MAX_LIGHTNESS_ON_LIGHT - (l - MAX_LIGHTNESS_ON_LIGHT) * 0.25);
  });
}

/** 여러 색 사이를 잇는 그라데이션에서 t 위치의 색. stops 는 at 오름차순 */
export function sampleGradient(stops: { at: number; color: string }[], t: number): string {
  if (stops.length === 0) return '#000';
  if (t <= stops[0].at) return stops[0].color;
  for (let i = 1; i < stops.length; i++) {
    if (t > stops[i].at) continue;
    const a = parseColor(stops[i - 1].color);
    const b = parseColor(stops[i].color);
    if (!a || !b) return stops[i].color;
    const span = stops[i].at - stops[i - 1].at;
    return toCss(mixRgb(a, b, span > 0 ? (t - stops[i - 1].at) / span : 1));
  }
  return stops[stops.length - 1].color;
}
