import "./style.css";
import {
  ChartSpline,
  Check,
  Crosshair,
  Delete,
  Eye,
  EyeOff,
  FolderOpen,
  Grid3X3,
  ImageDown,
  Maximize2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Trash2,
  ZoomIn,
  ZoomOut,
  createIcons
} from "lucide";
import type {
  FeaturePoint,
  GraphDocument,
  PlotFunction,
  Readout,
  RuntimeFunction,
  Viewport
} from "./types";
import {
  compileExpression,
  describeExpressionError
} from "./math/expression";
import { findFeaturePoints } from "./math/analysis";
import {
  DEFAULT_VIEWPORT,
  getViewportBounds,
  screenToWorldX,
  screenToWorldY,
  worldToScreenX,
  worldToScreenY,
  zoomViewportAt
} from "./graph/viewport";
import {
  renderGraph,
  renderInteractionOverlay
} from "./graph/renderer";

const ICONS = {
  ChartSpline,
  Check,
  Crosshair,
  Delete,
  Eye,
  EyeOff,
  FolderOpen,
  Grid3x3: Grid3X3,
  ImageDown,
  Maximize2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Trash2,
  ZoomIn,
  ZoomOut
};

const STORAGE_KEY = "function-graph:document:v1";
const DEFAULT_PIXELS_PER_UNIT = DEFAULT_VIEWPORT.pixelsPerUnit;
const COLOR_PALETTE = [
  "#1f7a70",
  "#cb5b30",
  "#315b9a",
  "#a14f7c",
  "#8a6a1f",
  "#4d6b3a",
  "#6f5a9c",
  "#394b59"
];

const icon = (name: string) => `<i data-lucide="${name}" aria-hidden="true"></i>`;

function mustElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

function refreshIcons(): void {
  createIcons({ icons: ICONS });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeColor(value: unknown, fallback = COLOR_PALETTE[0]): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `fn-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function createDefaultDocument(): GraphDocument {
  return {
    version: 1,
    functions: [
      {
        id: makeId(),
        expression: "sin(x)",
        color: COLOR_PALETTE[0],
        visible: true
      }
    ],
    parameters: {},
    viewport: { ...DEFAULT_VIEWPORT },
    showGrid: true,
    showAxes: true,
    showIntersections: true
  };
}

function normalizeDocument(value: unknown): GraphDocument | null {
  if (!isRecord(value) || !Array.isArray(value.functions)) return null;

  const functions: PlotFunction[] = [];
  for (const item of value.functions.slice(0, 24)) {
    if (!isRecord(item) || typeof item.expression !== "string") continue;
    const id =
      typeof item.id === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(item.id)
        ? item.id
        : makeId();
    functions.push({
      id,
      expression: item.expression.slice(0, 500),
      color: safeColor(item.color),
      visible: item.visible !== false
    });
  }

  const view = isRecord(value.viewport) ? value.viewport : {};
  const centerX = finiteNumber(view.centerX) ?? DEFAULT_VIEWPORT.centerX;
  const centerY = finiteNumber(view.centerY) ?? DEFAULT_VIEWPORT.centerY;
  const pixelsPerUnit = finiteNumber(view.pixelsPerUnit) ?? DEFAULT_VIEWPORT.pixelsPerUnit;
  const parameters: Record<string, number> = {};

  if (isRecord(value.parameters)) {
    for (const [name, parameterValue] of Object.entries(value.parameters)) {
      if (!/^[a-z]$/.test(name) || name === "x") continue;
      const parsed = finiteNumber(parameterValue);
      if (parsed !== null) parameters[name] = parsed;
    }
  }

  return {
    version: 1,
    functions,
    parameters,
    viewport: {
      centerX,
      centerY,
      pixelsPerUnit: Math.min(10000, Math.max(0.2, pixelsPerUnit))
    },
    showGrid: value.showGrid !== false,
    showAxes: value.showAxes !== false,
    showIntersections: value.showIntersections !== false
  };
}

function loadStoredDocument(): GraphDocument | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeDocument(JSON.parse(raw));
  } catch {
    return null;
  }
}

const workspace = mustElement<HTMLElement>("workspace");
const canvasStage = mustElement<HTMLElement>("canvas-stage");
const graphCanvas = mustElement<HTMLCanvasElement>("graph-canvas");
const interactionCanvas = mustElement<HTMLCanvasElement>("interaction-canvas");
const functionList = mustElement<HTMLElement>("function-list");
const functionEmpty = mustElement<HTMLElement>("function-empty");
const functionForm = mustElement<HTMLFormElement>("function-form");
const expressionInput = mustElement<HTMLInputElement>("expression-input");
const expressionError = mustElement<HTMLElement>("expression-error");
const colorInput = mustElement<HTMLInputElement>("color-input");
const colorSwatches = mustElement<HTMLElement>("color-swatches");
const submitFunctionButton = mustElement<HTMLButtonElement>("submit-function-btn");
const cancelEditButton = mustElement<HTMLButtonElement>("cancel-edit-btn");
const newFunctionButton = mustElement<HTMLButtonElement>("new-function-btn");
const parameterBlock = mustElement<HTMLElement>("parameters-block");
const parameterList = mustElement<HTMLElement>("parameter-list");
const fileInput = mustElement<HTMLInputElement>("file-input");
const gridToggle = mustElement<HTMLInputElement>("grid-toggle");
const axesToggle = mustElement<HTMLInputElement>("axes-toggle");
const intersectionsToggle = mustElement<HTMLInputElement>("intersections-toggle");
const analysisEmpty = mustElement<HTMLElement>("analysis-empty");
const analysisDetails = mustElement<HTMLElement>("analysis-details");
const detailExpression = mustElement<HTMLElement>("detail-expression");
const detailX = mustElement<HTMLElement>("detail-x");
const detailY = mustElement<HTMLElement>("detail-y");
const detailSlope = mustElement<HTMLElement>("detail-slope");
const xRangeValue = mustElement<HTMLElement>("x-range-value");
const yRangeValue = mustElement<HTMLElement>("y-range-value");
const zoomValue = mustElement<HTMLElement>("zoom-value");
const canvasResolution = mustElement<HTMLElement>("canvas-resolution");
const functionStatus = mustElement<HTMLElement>("function-status");
const coordinateStatus = mustElement<HTMLElement>("coordinate-status");
const toggleFunctionsButton = mustElement<HTMLButtonElement>("toggle-functions-btn");
const toggleAnalysisButton = mustElement<HTMLButtonElement>("toggle-analysis-btn");
const edgeFunctionsToggle = mustElement<HTMLButtonElement>("edge-functions-toggle");

let state = loadStoredDocument() ?? createDefaultDocument();
let runtimeFunctions: RuntimeFunction[] = [];
let features: FeaturePoint[] = [];
let activeFunctionId: string | null = state.functions[0]?.id ?? null;
let editingFunctionId: string | null = null;
let readout: Readout | null = null;
let canvasWidth = 1;
let canvasHeight = 1;
let pixelRatio = 1;
let renderFrame = 0;
let featureTimer = 0;
let saveTimer = 0;
let pointerMoved = false;
let pinchAnchor: { distance: number; x: number; y: number } | null = null;
let lastPointer: { x: number; y: number } | null = null;
let expressionSelectionStart = 0;
let expressionSelectionEnd = 0;

interface PointerRecord {
  previousX: number;
  previousY: number;
  startX: number;
  startY: number;
}

const pointers = new Map<number, PointerRecord>();

function formatNumber(value: number, digits = 6): string {
  if (!Number.isFinite(value)) return "—";
  if (value === 0) return "0";
  if (Math.abs(value) >= 1e7 || Math.abs(value) < 1e-5) {
    return value.toExponential(3).replace("e+", "e");
  }
  return Number(value.toPrecision(digits)).toString();
}

function formatRange(min: number, max: number): string {
  return `${formatNumber(min, 4)} … ${formatNumber(max, 4)}`;
}

function updateColors(): void {
  const selected = colorInput.value.toLowerCase();
  for (const button of colorSwatches.querySelectorAll<HTMLButtonElement>("[data-color]")) {
    button.classList.toggle("active", button.dataset.color === selected);
  }
}

function renderColorSwatches(): void {
  colorSwatches.innerHTML = COLOR_PALETTE.map(
    (color) =>
      `<button type="button" class="color-swatch" data-color="${color}" style="--swatch:${color}" title="${color}" aria-label="选择颜色 ${color}"></button>`
  ).join("");
  updateColors();
}

function showExpressionError(message: string): void {
  expressionError.textContent = message;
  expressionError.hidden = false;
}

function hideExpressionError(): void {
  expressionError.hidden = true;
  expressionError.textContent = "";
}

function featureKindLabel(kind: Readout["featureKind"]): string {
  switch (kind) {
    case "root":
      return "x 轴交点";
    case "yIntercept":
      return "y 轴交点";
    case "intersection":
      return "曲线交点";
    case "trigPi":
      return "π 特殊点";
    default:
      return "";
  }
}

function setReadout(value: Readout | null): void {
  readout = value;
  if (!value) {
    analysisEmpty.hidden = false;
    analysisDetails.hidden = true;
    renderOverlay();
    return;
  }

  const axisTolerance = Math.max(
    1e-7,
    4 / Math.max(1, state.viewport.pixelsPerUnit)
  );
  const featureLabel = value.snapped
    ? Math.abs(value.x) <= axisTolerance && Math.abs(value.y) <= axisTolerance
      ? "坐标轴交点"
      : featureKindLabel(value.featureKind)
    : "";
  const xText = value.exactXLabel ?? formatNumber(value.x);

  analysisEmpty.hidden = true;
  analysisDetails.hidden = false;
  detailExpression.textContent = featureLabel
    ? `${featureLabel} · y = ${value.expression}`
    : `y = ${value.expression}`;
  detailX.textContent = xText;
  detailY.textContent = formatNumber(value.y);

  const runtime = runtimeFunctions.find((item) => item.definition.id === value.functionId);
  if (!runtime?.compiled) {
    detailSlope.textContent = "—";
  } else {
    const step = Math.max(1e-7, Math.abs(value.x) * 1e-6);
    const left = runtime.compiled.evaluate(value.x - step, state.parameters);
    const right = runtime.compiled.evaluate(value.x + step, state.parameters);
    const slope = (right - left) / (2 * step);
    detailSlope.textContent = formatNumber(slope);
  }

  coordinateStatus.textContent =
    `x ${xText}, y ${formatNumber(value.y)}` +
    (value.snapped ? ` · ${featureLabel}` : "");
  renderOverlay();
}

function clearReadout(): void {
  setReadout(null);
}

function renderOverlay(): void {
  renderInteractionOverlay(
    interactionCanvas,
    canvasWidth,
    canvasHeight,
    pixelRatio,
    state.viewport,
    readout
  );
}

function renderNow(): void {
  if (canvasWidth <= 1 || canvasHeight <= 1) return;
  const bounds = getViewportBounds(state.viewport, canvasWidth, canvasHeight);

  renderGraph(graphCanvas, {
    viewport: state.viewport,
    functions: runtimeFunctions,
    parameters: state.parameters,
    showGrid: state.showGrid,
    showAxes: state.showAxes,
    showIntersections: state.showIntersections,
    features,
    selectedFunctionId: activeFunctionId,
    width: canvasWidth,
    height: canvasHeight,
    pixelRatio
  });
  renderOverlay();

  xRangeValue.textContent = formatRange(bounds.xMin, bounds.xMax);
  yRangeValue.textContent = formatRange(bounds.yMin, bounds.yMax);
  zoomValue.textContent = `${Math.round((state.viewport.pixelsPerUnit / DEFAULT_PIXELS_PER_UNIT) * 100)}%`;
  canvasResolution.textContent = `${Math.round(canvasWidth)} × ${Math.round(canvasHeight)}`;
}

function queueRender(): void {
  if (renderFrame) return;
  renderFrame = requestAnimationFrame(() => {
    renderFrame = 0;
    renderNow();
  });
}

function scheduleSave(): void {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // The app remains usable when storage is unavailable.
    }
  }, 220);
}

function recomputeFeatures(): void {
  if (!state.showIntersections || canvasWidth <= 1 || canvasHeight <= 1) {
    features = [];
    return;
  }
  const bounds = getViewportBounds(state.viewport, canvasWidth, canvasHeight);
  features = findFeaturePoints(runtimeFunctions, bounds, state.parameters);
}

function scheduleFeatureRefresh(delay = 70): void {
  window.clearTimeout(featureTimer);
  featureTimer = window.setTimeout(() => {
    recomputeFeatures();
    queueRender();
  }, delay);
}

function updateFunctionStatus(): void {
  const total = state.functions.length;
  const invalid = runtimeFunctions.filter((item) => item.error).length;
  functionStatus.textContent =
    invalid > 0 ? `${total} 条函数 · ${invalid} 条待修正` : `${total} 条函数`;
}

function rebuildRuntime(): void {
  runtimeFunctions = state.functions.map((definition) => {
    try {
      return {
        definition,
        compiled: compileExpression(definition.expression),
        error: ""
      };
    } catch (error) {
      return {
        definition,
        compiled: null,
        error: describeExpressionError(error)
      };
    }
  });

  const variableNames = new Set<string>();
  for (const runtime of runtimeFunctions) {
    for (const name of runtime.compiled?.variables ?? []) variableNames.add(name);
  }

  const nextParameters: Record<string, number> = {};
  for (const name of [...variableNames].sort()) {
    nextParameters[name] =
      finiteNumber(state.parameters[name]) ?? (name === "a" || name === "k" ? 1 : 0);
  }
  state.parameters = nextParameters;

  renderFunctionList();
  renderParameters();
  updateFunctionStatus();
}

function runtimeFor(functionId: string): RuntimeFunction | undefined {
  return runtimeFunctions.find((item) => item.definition.id === functionId);
}

function renderFunctionList(): void {
  functionEmpty.hidden = state.functions.length > 0;
  functionList.innerHTML = state.functions
    .map((definition) => {
      const runtime = runtimeFor(definition.id);
      const selected = definition.id === activeFunctionId;
      const parameterLabels = runtime?.compiled?.variables.length
        ? `<span class="parameter-tags">${runtime.compiled.variables.map((name) => `<b>${name}</b>`).join("")}</span>`
        : "";
      const subtitle = runtime?.error
        ? `<span class="function-error-text">${escapeHtml(runtime.error)}</span>`
        : `<span class="function-meta">${parameterLabels}<span>${definition.visible ? "显示" : "隐藏"}</span></span>`;

      return `
        <article class="function-item${selected ? " active" : ""}${runtime?.error ? " invalid" : ""}" data-function-id="${definition.id}">
          <button class="function-select" type="button" title="编辑函数">
            <span class="function-color" style="--curve-color:${definition.color}"></span>
            <span class="function-copy">
              <code>y = ${escapeHtml(definition.expression)}</code>
              ${subtitle}
            </span>
          </button>
          <div class="function-actions">
            <button type="button" data-action="visibility" title="${definition.visible ? "隐藏" : "显示"}">
              ${icon(definition.visible ? "eye" : "eye-off")}
            </button>
            <button type="button" data-action="delete" title="删除">${icon("trash-2")}</button>
          </div>
        </article>
      `;
    })
    .join("");
  refreshIcons();
}

function renderParameters(): void {
  const names = Object.keys(state.parameters).sort();
  parameterBlock.hidden = names.length === 0;

  parameterList.innerHTML = names
    .map((name) => {
      const value = state.parameters[name];
      const sliderValue = Math.max(-5, Math.min(5, value));
      return `
        <div class="parameter-row" data-parameter="${name}">
          <div class="parameter-line">
            <span class="parameter-name">${name}</span>
            <input class="parameter-number" type="number" step="0.1" value="${value}" aria-label="参数 ${name}" />
          </div>
          <input class="parameter-range" type="range" min="-5" max="5" step="0.01" value="${sliderValue}" aria-label="调整参数 ${name}" />
        </div>
      `;
    })
    .join("");
  refreshIcons();
}

function rememberExpressionSelection(): void {
  const length = expressionInput.value.length;
  expressionSelectionStart = Math.min(length, expressionInput.selectionStart ?? length);
  expressionSelectionEnd = Math.min(length, expressionInput.selectionEnd ?? length);
  if (expressionSelectionEnd < expressionSelectionStart) {
    [expressionSelectionStart, expressionSelectionEnd] = [
      expressionSelectionEnd,
      expressionSelectionStart
    ];
  }
}

function deleteExpressionCharacter(): void {
  const value = expressionInput.value;
  const start = Math.min(expressionSelectionStart, value.length);
  const end = Math.min(expressionSelectionEnd, value.length);

  if (start !== end) {
    expressionInput.value = value.slice(0, start) + value.slice(end);
    expressionSelectionStart = start;
    expressionSelectionEnd = start;
  } else if (start > 0) {
    expressionInput.value = value.slice(0, start - 1) + value.slice(start);
    expressionSelectionStart = start - 1;
    expressionSelectionEnd = start - 1;
  } else {
    return;
  }

  expressionInput.setSelectionRange(
    expressionSelectionStart,
    expressionSelectionEnd
  );
  validateExpressionInput();
}

function resetEditor(): void {
  editingFunctionId = null;
  expressionInput.value = "";
  expressionSelectionStart = 0;
  expressionSelectionEnd = 0;
  colorInput.value = COLOR_PALETTE[state.functions.length % COLOR_PALETTE.length];
  updateColors();
  submitFunctionButton.innerHTML = `${icon("plus")}<span>添加函数</span>`;
  cancelEditButton.hidden = true;
  hideExpressionError();
  refreshIcons();
}

function editFunction(functionId: string): void {
  const definition = state.functions.find((item) => item.id === functionId);
  if (!definition) return;
  activeFunctionId = functionId;
  editingFunctionId = functionId;
  expressionInput.value = definition.expression;
  expressionSelectionStart = definition.expression.length;
  expressionSelectionEnd = definition.expression.length;
  colorInput.value = definition.color;
  updateColors();
  submitFunctionButton.innerHTML = `${icon("check")}<span>更新函数</span>`;
  cancelEditButton.hidden = false;
  hideExpressionError();
  renderFunctionList();
  queueRender();
  expressionInput.focus();
  expressionInput.setSelectionRange(expressionInput.value.length, expressionInput.value.length);
}

function addFunction(expression: string, color: string): boolean {
  let compiled;
  try {
    compiled = compileExpression(expression);
  } catch (error) {
    showExpressionError(describeExpressionError(error));
    return false;
  }

  const definition: PlotFunction = {
    id: makeId(),
    expression: compiled.source,
    color: safeColor(color),
    visible: true
  };
  state.functions.push(definition);
  activeFunctionId = definition.id;
  rebuildRuntime();
  recomputeFeatures();
  queueRender();
  scheduleSave();
  return true;
}

function validateExpressionInput(): void {
  const value = expressionInput.value.trim();
  if (!value) {
    hideExpressionError();
    return;
  }
  try {
    compileExpression(value);
    hideExpressionError();
  } catch (error) {
    showExpressionError(describeExpressionError(error));
  }
}

function setViewport(next: Viewport): void {
  state.viewport = {
    centerX: Number.isFinite(next.centerX) ? next.centerX : state.viewport.centerX,
    centerY: Number.isFinite(next.centerY) ? next.centerY : state.viewport.centerY,
    pixelsPerUnit: Math.min(10000, Math.max(0.2, next.pixelsPerUnit))
  };
  clearReadout();
  features = [];
  queueRender();
  scheduleFeatureRefresh(100);
  scheduleSave();
}

function zoomBy(factor: number): void {
  const next = zoomViewportAt(
    state.viewport,
    state.viewport.pixelsPerUnit * factor,
    canvasWidth / 2,
    canvasHeight / 2,
    canvasWidth,
    canvasHeight
  );
  setViewport(next);
}

function fitView(): void {
  const bounds = getViewportBounds(state.viewport, canvasWidth, canvasHeight);
  const values: number[] = [];

  for (const runtime of runtimeFunctions) {
    if (!runtime.definition.visible || !runtime.compiled) continue;
    const sampleCount = 720;
    for (let index = 0; index <= sampleCount; index += 1) {
      const x = bounds.xMin + ((bounds.xMax - bounds.xMin) * index) / sampleCount;
      const y = runtime.compiled.evaluate(x, state.parameters);
      if (Number.isFinite(y) && Math.abs(y) < 1e8) values.push(y);
    }
  }

  if (values.length < 4) {
    setViewport({ ...DEFAULT_VIEWPORT });
    return;
  }

  values.sort((left, right) => left - right);
  const low = values[Math.floor(values.length * 0.05)];
  const high = values[Math.floor(values.length * 0.95)];
  let yMin = Math.min(low, high);
  let yMax = Math.max(low, high);
  if (yMax - yMin < 0.5) {
    const center = (yMax + yMin) / 2;
    yMin = center - 0.5;
    yMax = center + 0.5;
  }

  const yPadding = (yMax - yMin) * 0.12;
  yMin -= yPadding;
  yMax += yPadding;
  const xSpan = Math.max(0.1, bounds.xMax - bounds.xMin);
  const ySpan = Math.max(0.1, yMax - yMin);
  const pixelsPerUnit = Math.min(
    canvasWidth / (xSpan * 1.08),
    canvasHeight / (ySpan * 1.12)
  );

  setViewport({
    centerX: (bounds.xMin + bounds.xMax) / 2,
    centerY: (yMin + yMax) / 2,
    pixelsPerUnit: Math.min(10000, Math.max(0.2, pixelsPerUnit))
  });
}

function syncCanvasSize(): void {
  const rect = canvasStage.getBoundingClientRect();
  canvasWidth = Math.max(1, rect.width);
  canvasHeight = Math.max(1, rect.height);
  pixelRatio = Math.min(2.5, Math.max(1, window.devicePixelRatio || 1));
}

function localPoint(event: PointerEvent): { x: number; y: number } {
  const rect = canvasStage.getBoundingClientRect();
  return {
    x: Math.min(canvasWidth, Math.max(0, event.clientX - rect.left)),
    y: Math.min(canvasHeight, Math.max(0, event.clientY - rect.top))
  };
}

function runtimeForFeature(feature: FeaturePoint): RuntimeFunction | undefined {
  const tolerance = Math.max(1e-6, 2 / state.viewport.pixelsPerUnit);
  const visible = runtimeFunctions.filter(
    (runtime) => runtime.definition.visible && runtime.compiled !== null
  );
  const matching = visible.filter((runtime) => {
    const value = runtime.compiled?.evaluate(feature.x, state.parameters);
    return Number.isFinite(value) && Math.abs((value as number) - feature.y) <= tolerance;
  });

  return (
    matching.find((runtime) => runtime.definition.id === activeFunctionId) ??
    matching[0] ??
    visible.find((runtime) => runtime.definition.id === activeFunctionId) ??
    visible[0]
  );
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b > 0) {
    [a, b] = [b, a % b];
  }
  return a || 1;
}

function formatPiFraction(numerator: number, denominator: number): string {
  if (numerator === 0) return "0";
  const divisor = greatestCommonDivisor(numerator, denominator);
  const reducedNumerator = numerator / divisor;
  const reducedDenominator = denominator / divisor;
  const sign = reducedNumerator < 0 ? "-" : "";
  const absoluteNumerator = Math.abs(reducedNumerator);
  const numeratorText = absoluteNumerator === 1 ? "π" : `${absoluteNumerator}π`;
  return reducedDenominator === 1
    ? `${sign}${numeratorText}`
    : `${sign}${numeratorText}/${reducedDenominator}`;
}

function isTrigonometricFunction(runtime: RuntimeFunction): boolean {
  return (
    runtime.compiled !== null &&
    /(?<![a-z])(?:sin|cos|tan)\s*\(/i.test(runtime.compiled.source)
  );
}

function nearestTrigReadout(
  x: number,
  y: number,
  pinned: boolean,
  pointerType: string
): Readout | null {
  const pointerRadius = pointerType === "pen" ? 24 : pointerType === "touch" ? 21 : 14;
  const snapRadius = pinned ? pointerRadius + 4 : pointerRadius;
  const worldX = screenToWorldX(x, state.viewport, canvasWidth);
  const bounds = getViewportBounds(state.viewport, canvasWidth, canvasHeight);
  const denominators = [1, 2, 3, 4, 6];
  let best: Readout | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  const seen = new Set<string>();

  for (const runtime of runtimeFunctions) {
    if (
      !runtime.definition.visible ||
      !runtime.compiled ||
      !isTrigonometricFunction(runtime)
    ) {
      continue;
    }

    for (const denominator of denominators) {
      const nearestNumerator = Math.round((worldX * denominator) / Math.PI);
      for (let delta = -1; delta <= 1; delta += 1) {
        const numerator = nearestNumerator + delta;
        const candidateX = (numerator * Math.PI) / denominator;
        if (candidateX < bounds.xMin || candidateX > bounds.xMax) continue;

        const divisor = greatestCommonDivisor(numerator, denominator);
        const key = `${runtime.definition.id}:${numerator / divisor}:${denominator / divisor}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const value = runtime.compiled.evaluate(candidateX, state.parameters);
        if (!Number.isFinite(value)) continue;

        const screenX = worldToScreenX(candidateX, state.viewport, canvasWidth);
        const screenY = worldToScreenY(value, state.viewport, canvasHeight);
        const distance = Math.hypot(screenX - x, screenY - y);
        const complexityPenalty = (denominator / divisor - 1) * 0.02;
        const score = distance + complexityPenalty;
        if (distance > snapRadius || score >= bestScore) continue;

        bestScore = score;
        best = {
          x: candidateX,
          y: value,
          screenX,
          screenY,
          functionId: runtime.definition.id,
          expression: runtime.definition.expression,
          color: runtime.definition.color,
          pinned,
          snapped: true,
          featureKind: "trigPi",
          exactXLabel: formatPiFraction(numerator, denominator)
        };
      }
    }
  }

  return best;
}

function nearestFeatureReadout(
  x: number,
  y: number,
  pinned: boolean,
  pointerType: string
): Readout | null {
  const hoverRadius = pointerType === "pen" ? 24 : pointerType === "touch" ? 21 : 13;
  const snapRadius = pinned ? hoverRadius + 5 : hoverRadius;
  const radiusSquared = snapRadius * snapRadius;
  let closest: FeaturePoint | null = null;
  let closestDistance = radiusSquared;

  for (const feature of features) {
    const screenX = worldToScreenX(feature.x, state.viewport, canvasWidth);
    const screenY = worldToScreenY(feature.y, state.viewport, canvasHeight);
    const distance = (screenX - x) ** 2 + (screenY - y) ** 2;
    if (distance <= closestDistance) {
      closest = feature;
      closestDistance = distance;
    }
  }

  if (!closest) return null;
  const runtime = runtimeForFeature(closest);
  if (!runtime) return null;

  return {
    x: closest.x,
    y: closest.y,
    screenX: worldToScreenX(closest.x, state.viewport, canvasWidth),
    screenY: worldToScreenY(closest.y, state.viewport, canvasHeight),
    functionId: runtime.definition.id,
    expression: runtime.definition.expression,
    color: runtime.definition.color,
    pinned,
    snapped: true,
    featureKind: closest.kind
  };
}

function nearestReadoutAt(
  x: number,
  y: number,
  pinned: boolean,
  pointerType = "mouse"
): Readout | null {
  const snappedFeature = nearestFeatureReadout(x, y, pinned, pointerType);
  if (snappedFeature) return snappedFeature;

  const trigonometricSnap = nearestTrigReadout(x, y, pinned, pointerType);
  if (trigonometricSnap) return trigonometricSnap;

  const worldX = screenToWorldX(x, state.viewport, canvasWidth);
  let best: Readout | null = null;
  let bestDistance = 34;

  for (const runtime of runtimeFunctions) {
    if (!runtime.definition.visible || !runtime.compiled) continue;
    const value = runtime.compiled.evaluate(worldX, state.parameters);
    if (!Number.isFinite(value)) continue;
    const screenY = worldToScreenY(value, state.viewport, canvasHeight);
    const distance = Math.abs(screenY - y);
    const preference = runtime.definition.id === activeFunctionId ? 2 : 0;
    if (distance - preference < bestDistance) {
      bestDistance = distance - preference;
      best = {
        x: worldX,
        y: value,
        screenX: x,
        screenY,
        functionId: runtime.definition.id,
        expression: runtime.definition.expression,
        color: runtime.definition.color,
        pinned,
        snapped: false
      };
    }
  }

  return best;
}

function updateHoverReadout(x: number, y: number, pointerType: string): void {
  if (readout?.pinned) return;
  const nearest = nearestReadoutAt(x, y, false, pointerType);
  if (nearest) {
    setReadout(nearest);
  } else {
    setReadout(null);
    const worldX = screenToWorldX(x, state.viewport, canvasWidth);
    const worldY = screenToWorldY(y, state.viewport, canvasHeight);
    coordinateStatus.textContent = `x ${formatNumber(worldX)}, y ${formatNumber(worldY)}`;
  }
}

function pinReadoutAt(x: number, y: number, pointerType: string): void {
  const nearest = nearestReadoutAt(x, y, true, pointerType);
  setReadout(nearest);
}

function setToggleAppearance(
  button: HTMLButtonElement,
  collapsed: boolean,
  side: "left" | "right"
): void {
  const iconName =
    side === "left"
      ? collapsed
        ? "panel-left-open"
        : "panel-left-close"
      : collapsed
        ? "panel-right-open"
        : "panel-right-close";
  button.innerHTML = icon(iconName);
  button.setAttribute("aria-expanded", String(!collapsed));
  refreshIcons();
}

function toggleFunctionsPanel(forceCollapsed?: boolean): void {
  const collapsed =
    forceCollapsed ?? !workspace.classList.contains("functions-collapsed");
  workspace.classList.toggle("functions-collapsed", collapsed);
  edgeFunctionsToggle.setAttribute("aria-expanded", String(!collapsed));
  setToggleAppearance(toggleFunctionsButton, collapsed, "left");
  window.setTimeout(syncCanvasSize, 220);
}

function toggleAnalysisPanel(forceCollapsed?: boolean): void {
  const collapsed =
    forceCollapsed ?? !workspace.classList.contains("analysis-collapsed");
  workspace.classList.toggle("analysis-collapsed", collapsed);
  setToggleAppearance(toggleAnalysisButton, collapsed, "right");
  window.setTimeout(syncCanvasSize, 220);
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function saveDocumentFile(): void {
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: "application/json"
  });
  const stamp = new Date().toISOString().slice(0, 10);
  downloadBlob(blob, `函数绘图-${stamp}.json`);
}

function exportPng(): void {
  graphCanvas.toBlob((blob) => {
    if (!blob) return;
    const stamp = new Date().toISOString().replaceAll(":", "-").slice(0, 19);
    downloadBlob(blob, `函数图像-${stamp}.png`);
  }, "image/png");
}

async function openDocument(file: File): Promise<void> {
  try {
    const parsed = normalizeDocument(JSON.parse(await file.text()));
    if (!parsed) throw new Error("不是有效的函数绘图文档");
    state = parsed;
    activeFunctionId = state.functions[0]?.id ?? null;
    editingFunctionId = null;
    readout = null;
    gridToggle.checked = state.showGrid;
    axesToggle.checked = state.showAxes;
    intersectionsToggle.checked = state.showIntersections;
    resetEditor();
    rebuildRuntime();
    recomputeFeatures();
    queueRender();
    scheduleSave();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : "文档无法读取");
  } finally {
    fileInput.value = "";
  }
}

function handlePointerDown(event: PointerEvent): void {
  const target = event.target as HTMLElement;
  if (target.closest("button")) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;

  const point = localPoint(event);
  pointers.set(event.pointerId, {
    previousX: point.x,
    previousY: point.y,
    startX: point.x,
    startY: point.y
  });
  lastPointer = point;
  canvasStage.setPointerCapture(event.pointerId);
  canvasStage.classList.add("dragging");

  if (pointers.size === 1) {
    pointerMoved = false;
  } else if (pointers.size === 2) {
    pointerMoved = true;
    const values = [...pointers.values()];
    const dx = values[1].previousX - values[0].previousX;
    const dy = values[1].previousY - values[0].previousY;
    pinchAnchor = {
      distance: Math.max(1, Math.hypot(dx, dy)),
      x: (values[0].previousX + values[1].previousX) / 2,
      y: (values[0].previousY + values[1].previousY) / 2
    };
    clearReadout();
  }
  event.preventDefault();
}

function handlePointerMove(event: PointerEvent): void {
  const point = localPoint(event);
  lastPointer = point;
  const record = pointers.get(event.pointerId);

  if (!record) {
    if (event.pointerType !== "touch") {
      updateHoverReadout(point.x, point.y, event.pointerType);
    }
    return;
  }

  if (pointers.size === 1) {
    const totalDistance = Math.hypot(point.x - record.startX, point.y - record.startY);
    if (totalDistance > 3) pointerMoved = true;
    if (pointerMoved) {
      const dx = point.x - record.previousX;
      const dy = point.y - record.previousY;
      state.viewport.centerX -= dx / state.viewport.pixelsPerUnit;
      state.viewport.centerY += dy / state.viewport.pixelsPerUnit;
      features = [];
      clearReadout();
      queueRender();
    }
  } else if (pointers.size >= 2 && pinchAnchor) {
    const values = [...pointers.values()];
    const dx = values[1].previousX - values[0].previousX;
    const dy = values[1].previousY - values[0].previousY;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const midpointX = (values[0].previousX + values[1].previousX) / 2;
    const midpointY = (values[0].previousY + values[1].previousY) / 2;
    const worldX = screenToWorldX(pinchAnchor.x, state.viewport, canvasWidth);
    const worldY = screenToWorldY(pinchAnchor.y, state.viewport, canvasHeight);
    const nextPixelsPerUnit = Math.min(
      10000,
      Math.max(0.2, state.viewport.pixelsPerUnit * (distance / pinchAnchor.distance))
    );

    state.viewport.pixelsPerUnit = nextPixelsPerUnit;
    state.viewport.centerX = worldX - (midpointX - canvasWidth / 2) / nextPixelsPerUnit;
    state.viewport.centerY = worldY + (midpointY - canvasHeight / 2) / nextPixelsPerUnit;
    pinchAnchor = { distance, x: midpointX, y: midpointY };
    features = [];
    clearReadout();
    queueRender();
  }

  pointers.set(event.pointerId, {
    ...record,
    previousX: point.x,
    previousY: point.y
  });
  event.preventDefault();
}

function handlePointerEnd(event: PointerEvent, allowClick: boolean): void {
  const record = pointers.get(event.pointerId);
  if (!record) return;
  const point = localPoint(event);
  const wasSingle = pointers.size === 1;
  pointers.delete(event.pointerId);

  if (allowClick && wasSingle && !pointerMoved) {
    pinReadoutAt(point.x, point.y, event.pointerType);
  }

  if (pointers.size === 1) {
    pinchAnchor = null;
  } else if (pointers.size === 0) {
    canvasStage.classList.remove("dragging");
    pinchAnchor = null;
    if (pointerMoved) {
      scheduleFeatureRefresh(50);
      scheduleSave();
    }
  }

  if (canvasStage.hasPointerCapture(event.pointerId)) {
    canvasStage.releasePointerCapture(event.pointerId);
  }
  event.preventDefault();
}

function handleWheel(event: WheelEvent): void {
  const rect = canvasStage.getBoundingClientRect();
  const x = Math.min(canvasWidth, Math.max(0, event.clientX - rect.left));
  const y = Math.min(canvasHeight, Math.max(0, event.clientY - rect.top));
  const factor = Math.exp(-event.deltaY * 0.0015);
  const next = zoomViewportAt(
    state.viewport,
    state.viewport.pixelsPerUnit * factor,
    x,
    y,
    canvasWidth,
    canvasHeight
  );
  setViewport(next);
  event.preventDefault();
}

function bindEvents(): void {
  functionForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = expressionInput.value.trim();
    if (!value) {
      showExpressionError("请输入函数表达式");
      return;
    }

    let compiled;
    try {
      compiled = compileExpression(value);
    } catch (error) {
      showExpressionError(describeExpressionError(error));
      return;
    }

    if (editingFunctionId) {
      const definition = state.functions.find((item) => item.id === editingFunctionId);
      if (definition) {
        definition.expression = compiled.source;
        definition.color = safeColor(colorInput.value);
        activeFunctionId = definition.id;
      }
    } else {
      state.functions.push({
        id: makeId(),
        expression: compiled.source,
        color: safeColor(colorInput.value),
        visible: true
      });
      activeFunctionId = state.functions[state.functions.length - 1]?.id ?? null;
    }

    resetEditor();
    rebuildRuntime();
    recomputeFeatures();
    queueRender();
    scheduleSave();
  });

  expressionInput.addEventListener("input", () => {
    rememberExpressionSelection();
    validateExpressionInput();
  });
  expressionInput.addEventListener("select", rememberExpressionSelection);
  expressionInput.addEventListener("click", rememberExpressionSelection);
  expressionInput.addEventListener("keyup", rememberExpressionSelection);
  expressionInput.addEventListener("focus", rememberExpressionSelection);
  expressionInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") resetEditor();
  });
  colorInput.addEventListener("input", updateColors);
  cancelEditButton.addEventListener("click", resetEditor);
  newFunctionButton.addEventListener("click", () => {
    resetEditor();
    expressionInput.focus();
  });

  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-snippet]")) {
    button.addEventListener("click", () => {
      const snippet = button.dataset.snippet ?? "";
      const caretOffset = Number(button.dataset.caret ?? 0);
      const start = expressionSelectionStart;
      const end = expressionSelectionEnd;
      const selected = expressionInput.value.slice(start, end);
      const replaced = snippet.includes("()") && selected
        ? snippet.replace("()", `(${selected})`)
        : snippet;
      expressionInput.value =
        expressionInput.value.slice(0, start) +
        replaced +
        expressionInput.value.slice(end);
      const caret = start + replaced.length + (selected ? 0 : caretOffset);
      expressionInput.setSelectionRange(caret, caret);
      expressionSelectionStart = caret;
      expressionSelectionEnd = caret;
      validateExpressionInput();
    });
  }

  for (const button of document.querySelectorAll<HTMLButtonElement>(
    '[data-input-action="backspace"]'
  )) {
    button.addEventListener("click", deleteExpressionCharacter);
  }

  colorSwatches.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-color]");
    if (!button?.dataset.color) return;
    colorInput.value = button.dataset.color;
    updateColors();
  });

  functionList.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const item = target.closest<HTMLElement>("[data-function-id]");
    const functionId = item?.dataset.functionId;
    if (!functionId) return;
    const action = target.closest<HTMLButtonElement>("[data-action]")?.dataset.action;

    if (action === "visibility") {
      const definition = state.functions.find((candidate) => candidate.id === functionId);
      if (definition) definition.visible = !definition.visible;
      rebuildRuntime();
      recomputeFeatures();
      queueRender();
      scheduleSave();
      return;
    }

    if (action === "delete") {
      state.functions = state.functions.filter((candidate) => candidate.id !== functionId);
      if (activeFunctionId === functionId) activeFunctionId = state.functions[0]?.id ?? null;
      if (editingFunctionId === functionId) resetEditor();
      clearReadout();
      rebuildRuntime();
      recomputeFeatures();
      queueRender();
      scheduleSave();
      return;
    }

    if (target.closest(".function-select")) editFunction(functionId);
  });

  parameterList.addEventListener("input", (event) => {
    const input = event.target as HTMLInputElement;
    const row = input.closest<HTMLElement>("[data-parameter]");
    const name = row?.dataset.parameter;
    if (!name) return;
    const value = Number(input.value);
    if (!Number.isFinite(value)) return;
    state.parameters[name] = value;

    const numberInput = row.querySelector<HTMLInputElement>(".parameter-number");
    const rangeInput = row.querySelector<HTMLInputElement>(".parameter-range");
    if (input === rangeInput && numberInput) {
      numberInput.value = String(value);
    } else if (input === numberInput && rangeInput) {
      rangeInput.value = String(Math.max(-5, Math.min(5, value)));
    }

    clearReadout();
    scheduleFeatureRefresh(45);
    queueRender();
    scheduleSave();
  });

  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-example]")) {
    button.addEventListener("click", () => {
      const expression = button.dataset.example ?? "";
      const color = COLOR_PALETTE[state.functions.length % COLOR_PALETTE.length];
      if (addFunction(expression, color)) resetEditor();
    });
  }

  mustElement("save-btn").addEventListener("click", saveDocumentFile);
  mustElement("open-btn").addEventListener("click", () => fileInput.click());
  mustElement("export-btn").addEventListener("click", exportPng);
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) void openDocument(file);
  });

  gridToggle.addEventListener("change", () => {
    state.showGrid = gridToggle.checked;
    queueRender();
    scheduleSave();
  });
  axesToggle.addEventListener("change", () => {
    state.showAxes = axesToggle.checked;
    queueRender();
    scheduleSave();
  });
  intersectionsToggle.addEventListener("change", () => {
    state.showIntersections = intersectionsToggle.checked;
    recomputeFeatures();
    queueRender();
    scheduleSave();
  });

  toggleFunctionsButton.addEventListener("click", () => toggleFunctionsPanel());
  edgeFunctionsToggle.addEventListener("click", () => toggleFunctionsPanel(false));
  toggleAnalysisButton.addEventListener("click", () => toggleAnalysisPanel());
  mustElement("zoom-in-btn").addEventListener("click", () => zoomBy(1.3));
  mustElement("zoom-out-btn").addEventListener("click", () => zoomBy(1 / 1.3));
  mustElement("fit-view-btn").addEventListener("click", fitView);
  mustElement("reset-view-btn").addEventListener("click", () => {
    setViewport({ ...DEFAULT_VIEWPORT });
  });

  canvasStage.addEventListener("pointerdown", handlePointerDown);
  canvasStage.addEventListener("pointermove", handlePointerMove);
  canvasStage.addEventListener("pointerup", (event) => handlePointerEnd(event, true));
  canvasStage.addEventListener("pointercancel", (event) => handlePointerEnd(event, false));
  canvasStage.addEventListener("pointerleave", () => {
    if (pointers.size === 0 && !readout?.pinned) clearReadout();
  });
  canvasStage.addEventListener("wheel", handleWheel, { passive: false });
  canvasStage.addEventListener("contextmenu", (event) => event.preventDefault());
  canvasStage.addEventListener("dblclick", () => setViewport({ ...DEFAULT_VIEWPORT }));

  document.addEventListener("keydown", (event) => {
    const shortcut = event.ctrlKey || event.metaKey;
    if (shortcut && event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveDocumentFile();
    }
    if (shortcut && event.key.toLowerCase() === "o") {
      event.preventDefault();
      fileInput.click();
    }
  });
}

function initialize(): void {
  renderColorSwatches();
  resetEditor();
  gridToggle.checked = state.showGrid;
  axesToggle.checked = state.showAxes;
  intersectionsToggle.checked = state.showIntersections;
  edgeFunctionsToggle.setAttribute(
    "aria-expanded",
    String(!workspace.classList.contains("functions-collapsed"))
  );

  rebuildRuntime();
  bindEvents();
  syncCanvasSize();
  recomputeFeatures();
  renderNow();

  const observer = new ResizeObserver(() => {
    syncCanvasSize();
    features = [];
    queueRender();
    scheduleFeatureRefresh(80);
  });
  observer.observe(canvasStage);

  if (window.innerWidth < 960) {
    toggleFunctionsPanel(true);
    toggleAnalysisPanel(true);
  }

  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
        // Development and unsupported contexts can continue without a service worker.
      });
    });
  }
}

initialize();
