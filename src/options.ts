import type { RenderResolution } from './rouletteRenderer';
import { load, save } from './storage';

export type WinnerRange = { start: number; end: number };

const RESOLUTIONS: readonly string[] = ['default', 'high', 'ultra'] satisfies RenderResolution[];

export function isRenderResolution(value: unknown): value is RenderResolution {
  return typeof value === 'string' && RESOLUTIONS.includes(value);
}

function loadResolution(): RenderResolution {
  const saved = load('resolution');
  if (isRenderResolution(saved)) return saved;
  // 빔 프로젝터나 큰 화면에 띄워도 글자와 선이 흐려지지 않도록 처음부터 선명하게 그린다
  return 'high';
}

export function saveResolution(value: RenderResolution) {
  save('resolution', value);
}

class Options {
  useSkills: boolean = true;
  /** 0-based, 양끝 포함. 1명 추첨은 start === end */
  winnerRange: WinnerRange = { start: 0, end: 0 };
  autoRecording: boolean = true;
  /** 렌더링 해상도. 물리 시뮬레이션과는 무관하다 */
  resolution: RenderResolution = loadResolution();
}

const options = new Options();
export default options;
