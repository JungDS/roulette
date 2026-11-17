import type { Camera } from './camera';
import { canvasHeight, canvasWidth, initialZoom, Themes, winnerAreaHeight } from './data/constants';
import type { StageDef } from './data/maps';
import { paintEntity } from './entityPainter';
import type { GameObject } from './gameObject';
import { translate } from './localization';
import type { Marble } from './marble';
import { MINIMAP_INSET, MINIMAP_WIDTH } from './minimap';
import type { WinnerRange } from './options';
import type { ParticleManager } from './particleManager';
import type { ColorTheme } from './types/ColorTheme';
import type { EntityShape, MapEntityState } from './types/MapEntity.type';
import type { Rect } from './types/rect.type';
import type { VectorLike } from './types/VectorLike';
import type { UIObject } from './UIObject';
import { closeButtonSize, drawCloseCircle } from './utils/closeButton';
import { sampleGradient } from './utils/color';
import { paintZones } from './zonePainter';

export type RenderParameters = {
  camera: Camera;
  stage: StageDef;
  entities: MapEntityState[];
  marbles: Marble[];
  winners: Marble[];
  particleManager: ParticleManager;
  effects: GameObject[];
  winnerRange: WinnerRange;
  /** 진행 중에는 null, 당첨자가 모두 확정되면 당첨자 배열 */
  result: Marble[] | null;
  size: VectorLike;
  theme: ColorTheme;
  /** 맵을 불러온 뒤 흐른 물리 시간(초). 구역 무늬처럼 물리와 함께 움직이는 연출의 기준 */
  time: number;
};

/** 기본 해상도에서 표시 캔버스 폭 상한 */
const MAX_DISPLAY_WIDTH = 1920;
/** High 해상도에서 캔버스 긴 변 상한 (물리 픽셀) */
const HIGH_MAX_LONG_SIDE = 1920;

/**
 * - default: 화면 절반 크기 씬 캔버스에 그린 뒤 표시 캔버스(폭 최대 1920)로 늘려 복사
 * - high: 캔버스 하나를 화면 픽셀 크기로 두고 바로 그린다. 긴 변 최대 1920
 * - ultra: high 와 같지만 상한 없이 창 크기 × devicePixelRatio
 *
 * 세 모드 모두 논리 좌표계(width/height)는 같다. 구도·UI 크기·입력 좌표는 그대로이고 선명도만 다르다
 */
export type RenderResolution = 'default' | 'high' | 'ultra';
const WINNER_TEXT_OFFSET = 30;
const RESULT_PANEL_MAX_WIDTH_RATIO = 0.9;
const RESULT_PANEL_MAX_HEIGHT_RATIO = 0.8;
const RESULT_COLUMN_MAX_WIDTH = 280;
const PROGRESS_MAX_WIDTH_RATIO = 0.3;
const PROGRESS_ACCENT = 'rgba(255, 215, 0, 0.8)';
/** 배경 점 무늬의 간격과 크기 (월드 단위) */
const DOT_GAP = 2;
const DOT_SIZE = 0.13;
/** 화면 세로를 이만큼 나눠 배경 그라데이션의 색을 찍는다 */
const BACKGROUND_SAMPLES = 4;

/** 장애물이 놓인 자리에서 가장 먼 꼭짓점까지의 거리. 화면 밖 장애물을 건너뛸 때 쓴다 */
const shapeReach = new WeakMap<EntityShape, number>();
function reachOf(shape: EntityShape): number {
  let reach = shapeReach.get(shape);
  if (reach === undefined) {
    if (shape.type === 'circle') reach = shape.radius;
    else if (shape.type === 'box') reach = Math.hypot(shape.width, shape.height);
    else reach = shape.points.reduce((max, p) => Math.max(max, Math.hypot(p[0], p[1])), 0);
    // 테두리 두께, 그림자, 닿았을 때 커지는 범퍼만큼 여유를 둔다
    reach += 1;
    shapeReach.set(shape, reach);
  }
  return reach;
}

/** canvas.width 는 정수로 잘리므로 잘린 값끼리 비교한다 */
function setCanvasSize(canvas: HTMLCanvasElement, width: number, height: number) {
  const w = Math.floor(width);
  const h = Math.floor(height);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
}

function inRect(rect: Rect | null, x: number, y: number): boolean {
  return !!rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

export class RouletteRenderer {
  protected _canvas!: HTMLCanvasElement;
  protected _sceneCanvas!: HTMLCanvasElement;
  protected ctx!: CanvasRenderingContext2D;
  private _displayCtx!: CanvasRenderingContext2D;
  private _sceneCtx!: CanvasRenderingContext2D;
  public sizeFactor = 1;

  private _resolution: RenderResolution = 'default';
  /** 논리 좌표계 크기. 모든 그리기·카메라 계산의 기준 */
  private _viewWidth = canvasWidth;
  private _viewHeight = canvasHeight;
  /** high/ultra 에서 논리 1 = 물리 픽셀 몇 개. default 에서는 씬 캔버스에 1:1 로 그리므로 1 */
  protected _pixelScale = 1;

  protected _theme: ColorTheme = Themes.light;
  /** 맵마다 배경 그라데이션 정보를 한 번만 만든다 */
  private _backgroundStops = new WeakMap<StageDef, { at: number; color: string }[]>();
  private _resultCloseRect: Rect | null = null;
  private _resultPopupClosed = false;
  /** 여러 명이 뽑혔을 때 화면 가운데에 당첨자 목록을 띄울지. 결과를 따로 보여 주는 추첨에서는 끈다 */
  public showWinnerList = true;
  /** 화면 아래쪽을 가리는 것(설정 창) 의 높이 (논리 좌표). 당첨 표시를 그만큼 올려 그린다 */
  public bottomInset = 0;
  private _lastResult: Marble[] | null = null;

  get width() {
    return this._viewWidth;
  }

  get height() {
    return this._viewHeight;
  }

  get resolution(): RenderResolution {
    return this._resolution;
  }

  set resolution(value: RenderResolution) {
    if (this._resolution === value) return;
    this._resolution = value;
    if (this._canvas) this.refreshSize();
  }

  private get _isDirect() {
    return this._resolution !== 'default';
  }

  get canvas() {
    return this._canvas;
  }

  set theme(value: ColorTheme) {
    this._theme = value;
  }

  async init() {
    this._canvas = document.createElement('canvas');
    this._canvas.width = canvasWidth;
    this._canvas.height = canvasHeight;
    this._displayCtx = this._canvas.getContext('2d', {
      alpha: false,
    }) as CanvasRenderingContext2D;

    this._sceneCanvas = document.createElement('canvas');
    this._sceneCanvas.width = canvasWidth;
    this._sceneCanvas.height = canvasHeight;
    this._sceneCtx = this._sceneCanvas.getContext('2d', {
      alpha: false,
    }) as CanvasRenderingContext2D;
    this.ctx = this._sceneCtx;

    document.body.appendChild(this._canvas);

    const resizeObserver = new ResizeObserver(() => this.refreshSize());
    resizeObserver.observe(this._canvas);
    // 모니터를 옮겨 devicePixelRatio 만 바뀌는 경우는 ResizeObserver 가 잡지 못한다
    window.addEventListener('resize', () => this.refreshSize());
    this.refreshSize();
  }

  /** 화면 크기·dpr·해상도 모드가 바뀐 뒤 캔버스 크기를 다시 맞춘다 */
  refreshSize() {
    const rect = this._canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    // 논리 크기는 모드와 무관하게 원래 계산 그대로
    const width = Math.max(rect.width / 2, 640);
    const height = (width / rect.width) * rect.height;
    this._viewWidth = width;
    this._viewHeight = height;
    this.sizeFactor = width / rect.width;

    const defaultDisplayWidth = Math.min(rect.width, MAX_DISPLAY_WIDTH);

    if (!this._isDirect) {
      // 같은 값을 다시 넣어도 캔버스가 지워지므로 바뀔 때만 넣는다 (resize·ResizeObserver 가 같이 불린다)
      setCanvasSize(this._sceneCanvas, width, height);
      setCanvasSize(this._canvas, defaultDisplayWidth, (defaultDisplayWidth / rect.width) * rect.height);
      this._pixelScale = 1;
      this.ctx = this._sceneCtx;
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    let scale = (rect.width * dpr) / width;
    if (this._resolution === 'high') {
      scale = Math.min(scale, HIGH_MAX_LONG_SIDE / Math.max(width, height));
    }
    // 작은 창에서도 기본 해상도보다 흐려지지는 않게
    scale = Math.max(1, scale);

    const physW = Math.max(1, Math.round(width * scale));
    const physH = Math.max(1, Math.round(height * scale));
    setCanvasSize(this._canvas, physW, physH);
    this._pixelScale = physW / width;

    // 씬 캔버스는 쓰지 않으므로 메모리만 돌려준다
    setCanvasSize(this._sceneCanvas, 1, 1);
    this.ctx = this._displayCtx;
  }

  protected onBeforeEntities(): void {}
  /** 장애물 아래에 월드 좌표로 덧그리는 그림 (테스트 플레이의 진행도 지도) */
  public debugDraw: ((ctx: CanvasRenderingContext2D) => void) | null = null;
  protected onAfterScene(): void {}

  render(renderParameters: RenderParameters, uiObjects: UIObject[]) {
    this._theme = renderParameters.theme;
    // 이후 모든 그리기는 논리 좌표 기준 (default 에서는 배율 1)
    this.ctx.setTransform(this._pixelScale, 0, 0, this._pixelScale, 0, 0);
    this.renderBackground(renderParameters);

    this.ctx.save();
    this.ctx.scale(initialZoom, initialZoom);
    this.ctx.textAlign = 'left';
    this.ctx.textBaseline = 'top';
    this.ctx.font = '0.4pt sans-serif';
    this.ctx.lineWidth = 3 / (renderParameters.camera.zoom + initialZoom);
    renderParameters.camera.renderScene(this.ctx, { x: this.width, y: this.height }, () => {
      this.renderBackdrop(renderParameters);
      this.onBeforeEntities();
      this.debugDraw?.(this.ctx);
      const zones = renderParameters.stage.zones;
      if (zones?.length) paintZones(this.ctx, zones, renderParameters.time, this._theme);
      this.renderEntities(renderParameters);
      this.renderEffects(renderParameters);
      this.renderMarbles(renderParameters);
    });
    this.ctx.restore();
    this.onAfterScene();

    uiObjects.forEach((obj) => obj.render(this.ctx, renderParameters, this.width, this.height));
    renderParameters.particleManager.render(this.ctx);
    this.renderWinnerProgress(renderParameters);
    this.renderResult(renderParameters);

    if (!this._isDirect) {
      this._displayCtx.drawImage(this._sceneCanvas, 0, 0, this._canvas.width, this._canvas.height);
    }
  }

  /** 화면에 보이는 월드 범위의 절반 크기 */
  private viewHalfExtent(camera: Camera): VectorLike {
    const zoom = initialZoom * camera.zoom;
    return { x: this.width / 2 / zoom, y: this.height / 2 / zoom };
  }

  /** 배경색. 맵이 높이별 색을 정해 두었으면 지금 보이는 높이에 맞춰 그라데이션으로 칠한다 */
  private renderBackground({ stage, camera }: RenderParameters) {
    const ctx = this.ctx;
    const theme = this._theme;
    ctx.fillStyle = theme.background;
    if (theme.light && stage.background?.length) {
      let stops = this._backgroundStops.get(stage);
      if (!stops) {
        stops = stage.background.map((stop) => ({ at: stop.y, color: stop.color })).sort((a, b) => a.at - b.at);
        this._backgroundStops.set(stage, stops);
      }
      const half = this.viewHalfExtent(camera).y;
      const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
      for (let i = 0; i <= BACKGROUND_SAMPLES; i++) {
        const t = i / BACKGROUND_SAMPLES;
        gradient.addColorStop(t, sampleGradient(stops, camera.y - half + half * 2 * t));
      }
      ctx.fillStyle = gradient;
    }
    ctx.fillRect(0, 0, this.width, this.height);
  }

  /** 장애물 아래에 깔리는 점 무늬와 맵에 적어 둔 글자 (월드 좌표) */
  private renderBackdrop({ stage, camera }: RenderParameters) {
    const ctx = this.ctx;
    const theme = this._theme;
    const half = this.viewHalfExtent(camera);

    if (theme.backgroundDot) {
      const firstRow = Math.floor((camera.y - half.y) / DOT_GAP);
      const lastRow = Math.ceil((camera.y + half.y) / DOT_GAP);
      const firstCol = Math.floor((camera.x - half.x) / DOT_GAP) - 1;
      const lastCol = Math.ceil((camera.x + half.x) / DOT_GAP);
      ctx.fillStyle = theme.backgroundDot;
      ctx.beginPath();
      for (let row = firstRow; row <= lastRow; row++) {
        // 한 줄 걸러 반 칸씩 밀어 엇갈리게 놓는다
        const shift = row % 2 === 0 ? 0 : DOT_GAP / 2;
        for (let col = firstCol; col <= lastCol; col++) {
          ctx.rect(col * DOT_GAP + shift - DOT_SIZE / 2, row * DOT_GAP - DOT_SIZE / 2, DOT_SIZE, DOT_SIZE);
        }
      }
      ctx.fill();
    }

    if (stage.labels?.length) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const label of stage.labels) {
        if (Math.abs(label.y - camera.y) > half.y + label.size) continue;
        ctx.font = `900 ${label.size}px sans-serif`;
        ctx.fillStyle = label.color ?? theme.labelColor;
        ctx.fillText(translate(label.text), label.x, label.y);
      }
      ctx.restore();
    }
  }

  private renderEntities({ entities, camera }: RenderParameters) {
    const ctx = this.ctx;
    const hairline = ctx.lineWidth;
    const half = this.viewHalfExtent(camera);
    for (const entity of entities) {
      const reach = reachOf(entity.shape);
      if (Math.abs(entity.x - camera.x) > half.x + reach || Math.abs(entity.y - camera.y) > half.y + reach) continue;
      paintEntity(ctx, entity, this._theme, this._pixelScale, hairline);
    }
  }

  private renderEffects({ effects, camera }: RenderParameters) {
    effects.forEach((effect) => effect.render(this.ctx, camera.zoom * initialZoom, this._theme));
  }

  private renderMarbles({ marbles, camera, winnerRange, winners, size }: RenderParameters) {
    const firstIndex = winnerRange.start - winners.length;
    const lastIndex = winnerRange.end - winners.length;

    const viewPort = { x: camera.x, y: camera.y, w: size.x, h: size.y, zoom: camera.zoom * initialZoom };
    marbles.forEach((marble, i) => {
      marble.render(
        this.ctx,
        camera.zoom * initialZoom,
        i >= firstIndex && i <= lastIndex,
        false,
        viewPort,
        this._theme
      );
    });
  }

  private renderResult(params: RenderParameters) {
    const result = params.result;
    // 새 결과가 나오면(또는 리셋되면) 닫힘 상태를 푼다. _result는 확정될 때마다 새 배열이다
    if (result !== this._lastResult) {
      this._lastResult = result;
      this._resultPopupClosed = false;
    }
    this._resultCloseRect = null;
    if (!result) return;
    // 1명이면 기존 하단 Winner 표시, 여러명이면 화면 중앙 당첨자 목록 팝업
    if (result.length === 1) {
      this.renderWinner(result[0], params.theme);
    } else if (this.showWinnerList && !this._resultPopupClosed) {
      this.renderWinnerList(result, params);
    }
  }

  /** 결과 팝업 닫기 버튼을 눌렀는지 */
  getResultCloseHitAt(x: number, y: number): boolean {
    return inRect(this._resultCloseRect, x, y);
  }

  closeResultPopup(): void {
    this._resultPopupClosed = true;
  }

  /**
   * 여러명 모드에서 확정된 당첨자를 좌측 상단에 상시 표시한다.
   * 우측은 랭킹 리스트가 구슬 수만큼 내려오므로 겹친다. 좌측은 미니맵이 세로로 긴
   * 스트립이라 그 오른쪽에 붙인다.
   */
  private renderWinnerProgress({ winners, winnerRange, result, theme }: RenderParameters) {
    const { start, end } = winnerRange;
    if (end <= start) return; // 1명 추첨은 기존 하단 Winner 표시를 쓴다

    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    const lineHeight = Math.min(24, Math.max(14, h * 0.042));
    const pad = lineHeight * 0.6;
    const rankWidth = lineHeight * 1.9;
    const headerFont = `bold ${lineHeight * 0.7}px sans-serif`;
    const rankFont = `${lineHeight * 0.6}px sans-serif`;
    const nameFont = `bold ${lineHeight * 0.72}px sans-serif`;

    // 확정 전에는 골인한 당첨자만, 확정 후에는 최종 명단(조기 확정분 포함)을 쓴다
    const confirmed = result ?? winners.slice(start, end + 1);
    const header = `${translate('Confirmed')} ${confirmed.length} / ${end - start + 1}`;

    // 화면을 넘기면 오래된 쪽을 접는다. 전체 명단은 어차피 중앙 팝업에서 보여준다
    const maxRows = Math.max(1, Math.floor((h * 0.55) / lineHeight) - 2);
    const hidden = Math.max(0, confirmed.length - maxRows);
    const shown = confirmed.slice(hidden);
    const foldLabel = translate('+{n} more').replace('{n}', String(hidden));

    ctx.save();

    ctx.font = headerFont;
    let contentW = ctx.measureText(header).width;
    ctx.font = nameFont;
    for (const marble of shown) {
      contentW = Math.max(contentW, rankWidth + ctx.measureText(marble.name).width);
    }
    if (hidden > 0) {
      ctx.font = rankFont;
      contentW = Math.max(contentW, ctx.measureText(foldLabel).width);
    }

    const panelW = Math.min(contentW + pad * 2, w * PROGRESS_MAX_WIDTH_RATIO);
    const rows = shown.length + (hidden > 0 ? 1 : 0);
    // 헤더와 목록 사이 간격은 목록이 있을 때만 준다. 항상 주면 당첨자가 없을 때
    // 아래쪽에만 빈 공간이 남아 위아래 여백이 어긋난다
    const headerGap = rows > 0 ? lineHeight * 0.35 : 0;
    const panelH = pad * 2 + lineHeight + headerGap + rows * lineHeight;
    const panelX = MINIMAP_INSET + MINIMAP_WIDTH + pad;
    const panelY = MINIMAP_INSET; // 미니맵 상단과 맞춘다

    ctx.fillStyle = theme.winnerBackground;
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = PROGRESS_ACCENT;
    ctx.lineWidth = 2;
    ctx.strokeRect(panelX, panelY, panelW, panelH);

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = headerFont;
    ctx.fillStyle = theme.winnerText;
    ctx.fillText(header, panelX + pad, panelY + pad + lineHeight / 2);

    let y = panelY + pad + lineHeight + headerGap + lineHeight / 2;
    if (hidden > 0) {
      ctx.font = rankFont;
      ctx.fillStyle = theme.winnerText;
      ctx.fillText(foldLabel, panelX + pad, y);
      y += lineHeight;
    }

    shown.forEach((marble, i) => {
      ctx.save();
      ctx.beginPath();
      ctx.rect(panelX, y - lineHeight / 2, panelW, lineHeight);
      ctx.clip();

      ctx.font = rankFont;
      ctx.fillStyle = theme.winnerText;
      ctx.fillText(`#${start + hidden + i + 1}`, panelX + pad, y);

      ctx.font = nameFont;
      ctx.fillStyle = `hsl(${marble.hue} ${theme.marbleSaturation}% ${theme.rankLightness}%)`;
      ctx.fillText(marble.name, panelX + pad + rankWidth, y);
      ctx.restore();
      y += lineHeight;
    });

    ctx.restore();
  }

  /** 당첨자가 여러명일 때 화면 중앙에 목록 팝업을 그린다 */
  private renderWinnerList(winners: Marble[], { theme, winnerRange }: RenderParameters) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    const lineHeight = Math.min(32, Math.max(16, h * 0.05));
    const padding = lineHeight;
    const titleHeight = lineHeight * 2;

    // 세로로 다 안 들어가면 열을 늘린다
    const maxRows = Math.max(
      1,
      Math.floor((h * RESULT_PANEL_MAX_HEIGHT_RATIO - titleHeight - padding * 2) / lineHeight)
    );
    const cols = Math.max(1, Math.ceil(winners.length / maxRows));
    const rows = Math.ceil(winners.length / cols);

    const colWidth = Math.min(RESULT_COLUMN_MAX_WIDTH, (w * RESULT_PANEL_MAX_WIDTH_RATIO - padding * 2) / cols);
    const panelW = colWidth * cols + padding * 2;
    const panelH = titleHeight + rows * lineHeight + padding;
    const panelX = (w - panelW) / 2;
    const panelY = (h - panelH) / 2;

    ctx.save();

    ctx.fillStyle = theme.winnerBackground;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = theme.background;
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = theme.winnerText;
    ctx.lineWidth = 2;
    ctx.strokeRect(panelX, panelY, panelW, panelH);

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillStyle = theme.winnerText;
    ctx.font = `bold ${lineHeight * 1.1}px sans-serif`;
    ctx.fillText(`${translate('Winners')} (${winners.length})`, w / 2, panelY + titleHeight / 2);

    // 버튼 중심을 팝업 우상단 꼭지점에 맞춰 걸쳐놓는다. 뒤가 비치지 않게 불투명하게 채우되,
    // 검정으로 채우면 다크 테마에서 배경과 같아져 버튼으로 안 보이므로 대비되는 색을 쓴다
    this._resultCloseRect = drawCloseCircle(ctx, panelX + panelW, panelY, closeButtonSize(h), '#222');

    const rankWidth = lineHeight * 1.8;
    winners.forEach((marble, i) => {
      const col = Math.floor(i / rows);
      const row = i % rows;
      const x = panelX + padding + col * colWidth;
      const y = panelY + titleHeight + row * lineHeight + lineHeight / 2;

      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y - lineHeight / 2, colWidth, lineHeight);
      ctx.clip();

      ctx.textAlign = 'right';
      ctx.fillStyle = theme.winnerText;
      ctx.font = `${lineHeight * 0.6}px sans-serif`;
      ctx.fillText(`#${winnerRange.start + i + 1}`, x + rankWidth * 0.8, y);

      ctx.textAlign = 'left';
      ctx.fillStyle = `hsl(${marble.hue} ${theme.marbleSaturation}% ${theme.rankLightness}%)`;
      ctx.font = `bold ${lineHeight * 0.75}px sans-serif`;
      ctx.fillText(marble.name, x + rankWidth, y);
      ctx.restore();
    });

    ctx.restore();
  }

  private renderWinner(winner: Marble, theme: ColorTheme) {
    // 설정 창에 가리지 않게 그만큼 위에 그린다 (화면의 절반 넘게는 올리지 않는다)
    const bottom = this.height - Math.min(this.bottomInset, this.height * 0.5);
    this.ctx.save();
    this.ctx.fillStyle = theme.winnerBackground;
    this.ctx.fillRect(this.width / 2, bottom - winnerAreaHeight, this.width / 2, winnerAreaHeight);
    if (theme.light) {
      this.ctx.fillStyle = PROGRESS_ACCENT;
      this.ctx.fillRect(this.width / 2, bottom - winnerAreaHeight, this.width / 2, 4);
    }

    // Draw marble image or colored circle
    const marbleSize = 100;
    const marbleCenterX = this.width - marbleSize / 2 - 20;
    const marbleCenterY = bottom - winnerAreaHeight / 2;
    const marbleColor = `hsl(${winner.hue} ${theme.marbleSaturation}% ${theme.marbleLightness}%)`;

    this.ctx.beginPath();
    this.ctx.arc(marbleCenterX, marbleCenterY, marbleSize / 2, 0, Math.PI * 2);
    this.ctx.fillStyle = marbleColor;
    this.ctx.fill();
    if (theme.light) {
      this.ctx.lineWidth = 3;
      this.ctx.strokeStyle = `hsl(${winner.hue} ${theme.marbleSaturation}% ${theme.marbleLightness - 24}%)`;
      this.ctx.stroke();
      this.ctx.beginPath();
      this.ctx.ellipse(marbleCenterX - 16, marbleCenterY - 18, 16, 10, -0.6, 0, Math.PI * 2);
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      this.ctx.fill();
    }

    this.ctx.fillStyle = theme.winnerText;
    this.ctx.strokeStyle = theme.winnerOutline;
    this.ctx.lineJoin = 'round';

    this.ctx.font = 'bold 48px sans-serif';
    this.ctx.textAlign = 'right';
    this.ctx.lineWidth = theme.light ? 6 : 4;
    const textRightX = marbleCenterX - marbleSize / 2 - 20;
    if (theme.winnerOutline) {
      this.ctx.strokeText(translate('Winner'), textRightX, bottom - 120 + WINNER_TEXT_OFFSET);
    }

    this.ctx.fillText(translate('Winner'), textRightX, bottom - 120 + WINNER_TEXT_OFFSET);
    this.ctx.font = 'bold 72px sans-serif';
    this.ctx.fillStyle = theme.light ? `hsl(${winner.hue} ${theme.marbleSaturation}% 38%)` : marbleColor;
    if (theme.winnerOutline) {
      this.ctx.strokeText(winner.name, textRightX, bottom - 55 + WINNER_TEXT_OFFSET);
    }
    this.ctx.fillText(winner.name, textRightX, bottom - 55 + WINNER_TEXT_OFFSET);
    this.ctx.restore();
  }
}
