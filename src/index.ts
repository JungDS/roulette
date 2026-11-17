import './localization';
import { Roulette } from './roulette';
import { initUi } from './ui';

const roulette = new Roulette();
// 브라우저 콘솔에서 살펴보거나 테마를 바꿀 때 쓴다 (roulette.setTheme('dark'))
(window as any).roulette = roulette;

initUi(roulette);
