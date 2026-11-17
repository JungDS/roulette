import type { ColorTheme } from '../types/ColorTheme';

export const initialZoom = 30;
export const canvasWidth = 1600;
export const canvasHeight = 900;
export const zoomThreshold = 5;
export const STUCK_DELAY = 5000;
export const winnerAreaHeight = 168;

export enum Skills {
  None,
  Impact,
}

export const DefaultEntityColor = {
  box: 'cyan',
  circle: 'yellow',
  polyline: 'white',
} as const;

export const DefaultBloomColor = {
  box: 'cyan',
  circle: 'yellow',
  polyline: 'cyan',
};

export const Themes: Record<string, ColorTheme> = {
  // 빔 프로젝터로 띄워도 잘 보이도록 밝은 바탕에 짙은 테두리, 역할마다 다른 색을 쓴다
  light: {
    light: true,
    background: '#f3f6fc',
    backgroundDot: 'rgba(52, 72, 130, 0.1)',
    marbleLightness: 56,
    marbleSaturation: 88,
    marbleWinningBorder: '#1c2440',
    nameLightness: 26,
    nameStroke: 'rgba(255, 255, 255, 0.92)',
    skillColor: '#3b6cf0',
    coolTimeIndicator: 'rgba(28, 36, 64, 0.45)',
    entity: {
      box: {
        fill: '#5b8def',
        outline: '#24469c',
        bloom: 'transparent',
        bloomRadius: 0,
      },
      circle: {
        fill: '#ffd166',
        outline: '#a8690a',
        bloom: 'transparent',
        bloomRadius: 0,
      },
      polyline: {
        fill: '#d5ddf0',
        outline: '#232b45',
        bloom: 'transparent',
        bloomRadius: 0,
      },
    },
    roles: {
      mover: { fill: '#ff5d73', outline: '#a81d36', bloom: 'transparent', bloomRadius: 0 },
      bumper: { fill: '#ffb703', outline: '#a85f00', bloom: 'transparent', bloomRadius: 0 },
      breakable: { fill: '#3ccf91', outline: '#167a4f', bloom: 'transparent', bloomRadius: 0 },
    },
    wallWidth: 0.13,
    shadow: 'rgba(28, 36, 64, 0.22)',
    labelColor: 'rgba(35, 43, 69, 0.13)',
    rankStroke: 'rgba(255, 255, 255, 0.9)',
    rankLightness: 30,
    hudText: '#4a5578',
    minimapBackground: 'rgba(255, 255, 255, 0.92)',
    minimapBorder: '#232b45',
    minimapViewport: '#e0457b',

    winnerBackground: 'rgba(255, 255, 255, 0.9)',
    winnerOutline: 'white',
    winnerText: '#232b45',
  },
  dark: {
    light: false,
    background: 'black',
    backgroundDot: '',
    marbleLightness: 75,
    marbleSaturation: 100,
    marbleWinningBorder: 'white',
    nameLightness: 70,
    nameStroke: 'black',
    skillColor: 'white',
    coolTimeIndicator: 'red',
    entity: {
      box: {
        fill: 'cyan',
        outline: 'cyan',
        bloom: 'cyan',
        bloomRadius: 15,
      },
      circle: {
        fill: 'yellow',
        outline: 'yellow',
        bloom: 'yellow',
        bloomRadius: 15,
      },
      polyline: {
        fill: 'white',
        outline: 'white',
        bloom: 'cyan',
        bloomRadius: 15,
      },
    },
    roles: {},
    wallWidth: 0,
    shadow: '',
    labelColor: 'rgba(255, 255, 255, 0.12)',
    rankStroke: '',
    rankLightness: 75,
    hudText: '#666',
    minimapBackground: '#333333',
    minimapBorder: 'green',
    minimapViewport: 'white',
    winnerBackground: 'rgba(0, 0, 0, 0.5)',
    winnerOutline: 'black',
    winnerText: 'white',
  },
};
