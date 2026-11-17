import type { EntityRole } from './MapEntity.type';

export interface ShapeColor {
  outline: string;
  fill: string;
  bloom: string;
  bloomRadius: number;
}

export interface ColorTheme {
  /** 밝은 테마인지. 도형을 채우고 그림자를 넣는 방식, 맵에 적힌 색을 보정할지를 가른다 */
  light: boolean;
  background: string;
  /** 배경 점 무늬 색. 빈 문자열이면 그리지 않는다 */
  backgroundDot: string;
  marbleLightness: number;
  marbleSaturation: number;
  marbleWinningBorder: string;
  /** 구슬 이름 글자의 밝기와 테두리 색 */
  nameLightness: number;
  nameStroke: string;
  skillColor: string;
  coolTimeIndicator: string;
  entity: {
    box: ShapeColor;
    circle: ShapeColor;
    polyline: ShapeColor;
  };
  /** 역할별 색. 없는 역할은 모양(entity) 의 색을 쓴다 */
  roles: Partial<Record<EntityRole, ShapeColor>>;
  /** 벽(선) 두께 (월드 단위). 0 이면 화면 배율에 맞춘 가는 선 */
  wallWidth: number;
  /** 도형 아래 그림자 색. 빈 문자열이면 넣지 않는다 */
  shadow: string;
  /** 구역 이름처럼 맵 위에 적는 글자의 기본 색 */
  labelColor: string;
  rankStroke: string;
  /** 순위표에서 구슬 이름 글자의 밝기 */
  rankLightness: number;
  /** 순위표처럼 화면 위에 적는 글자 색 */
  hudText: string;
  minimapBackground: string;
  minimapBorder: string;
  minimapViewport: string;
  winnerText: string;
  winnerOutline: string;
  winnerBackground: string;
}
