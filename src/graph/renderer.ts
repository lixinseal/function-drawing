import type {
  FeaturePoint,
  PlotFunction,
  Readout,
  RuntimeFunction,
  Viewport
} from "../types";
import {
  formatAxisValue,
  getViewportBounds,
  niceStep,
  worldToScreenX,
  worldToScreenY
} from "./viewport";
import { sampleFunction } from "../math/sampling";

export interface RenderScene {
  viewport: Viewport;
  functions: RuntimeFunction[];
  parameters: Record<string, number>;
  showGrid: boolean;
  showAxes: boolean;
  showIntersections: boolean;
  features: FeaturePoint[];
  selectedFunctionId: string | null;
  width: number;
  height: number;
  pixelRatio: number;
}

const COLORS = {
  background: "#fbfaf6",
  gridMinor: "#edf0eb",
  gridMajor: "#dce3dd",
  axis: "#41524e",
  axisLabel: "#677570",
  feature: "#173c39",
  paper: "#fffdf8"
};

function prepareCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  pixelRatio: number
): CanvasRenderingContext2D {
  const backingWidth = Math.max(1, Math.round(width * pixelRatio));
  const backingHeight = Math.max(1, Math.round(height * pixelRatio));
  if (canvas.width !== backingWidth || canvas.height !== backingHeight) {
    canvas.width = backingWidth;
    canvas.height = backingHeight;
  }
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is unavailable");
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, width, height);
  return context;
}

function safeScreenValue(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1_000_000, Math.min(1_000_000, value));
}

function drawGrid(
  context: CanvasRenderingContext2D,
  scene: RenderScene
): void {
  const { viewport, width, height } = scene;
  const bounds = getViewportBounds(viewport, width, height);
  const majorStep = niceStep(82 / viewport.pixelsPerUnit);
  const minorStep = majorStep / 5;
  const minorPixelStep = minorStep * viewport.pixelsPerUnit;

  if (scene.showGrid && minorPixelStep >= 8) {
    context.beginPath();
    context.strokeStyle = COLORS.gridMinor;
    context.lineWidth = 1;

    const firstX = Math.ceil(bounds.xMin / minorStep) * minorStep;
    for (let x = firstX, count = 0; x <= bounds.xMax && count < 1800; x += minorStep, count += 1) {
      const screenX = worldToScreenX(x, viewport, width);
      context.moveTo(screenX, 0);
      context.lineTo(screenX, height);
    }

    const firstY = Math.ceil(bounds.yMin / minorStep) * minorStep;
    for (let y = firstY, count = 0; y <= bounds.yMax && count < 1800; y += minorStep, count += 1) {
      const screenY = worldToScreenY(y, viewport, height);
      context.moveTo(0, screenY);
      context.lineTo(width, screenY);
    }
    context.stroke();
  }

  if (scene.showGrid) {
    context.beginPath();
    context.strokeStyle = COLORS.gridMajor;
    context.lineWidth = 1;

    const firstX = Math.ceil(bounds.xMin / majorStep) * majorStep;
    for (let x = firstX, count = 0; x <= bounds.xMax && count < 420; x += majorStep, count += 1) {
      const screenX = worldToScreenX(x, viewport, width);
      context.moveTo(screenX, 0);
      context.lineTo(screenX, height);
    }

    const firstY = Math.ceil(bounds.yMin / majorStep) * majorStep;
    for (let y = firstY, count = 0; y <= bounds.yMax && count < 420; y += majorStep, count += 1) {
      const screenY = worldToScreenY(y, viewport, height);
      context.moveTo(0, screenY);
      context.lineTo(width, screenY);
    }
    context.stroke();
  }

  if (!scene.showAxes) return;

  const xAxisY = worldToScreenY(0, viewport, height);
  const yAxisX = worldToScreenX(0, viewport, width);
  const xAxisVisible = xAxisY >= 0 && xAxisY <= height;
  const yAxisVisible = yAxisX >= 0 && yAxisX <= width;

  context.beginPath();
  context.strokeStyle = COLORS.axis;
  context.lineWidth = 1.5;
  if (xAxisVisible) {
    context.moveTo(0, xAxisY);
    context.lineTo(width, xAxisY);
  }
  if (yAxisVisible) {
    context.moveTo(yAxisX, 0);
    context.lineTo(yAxisX, height);
  }
  context.stroke();

  context.font = '11px "IBM Plex Mono", "SFMono-Regular", Consolas, monospace';
  context.fillStyle = COLORS.axisLabel;
  context.textBaseline = "top";
  context.textAlign = "center";

  if (xAxisVisible) {
    const labelY = Math.min(height - 18, Math.max(4, xAxisY + 7));
    const firstX = Math.ceil(bounds.xMin / majorStep) * majorStep;
    for (let x = firstX, count = 0; x <= bounds.xMax && count < 100; x += majorStep, count += 1) {
      if (Math.abs(x) < majorStep * 1e-7) continue;
      const screenX = worldToScreenX(x, viewport, width);
      if (screenX < 22 || screenX > width - 22) continue;
      context.fillText(formatAxisValue(x, majorStep), screenX, labelY);
    }
  }

  context.textAlign = "right";
  context.textBaseline = "middle";
  if (yAxisVisible) {
    const labelX = Math.min(width - 6, Math.max(28, yAxisX - 8));
    const firstY = Math.ceil(bounds.yMin / majorStep) * majorStep;
    for (let y = firstY, count = 0; y <= bounds.yMax && count < 100; y += majorStep, count += 1) {
      if (Math.abs(y) < majorStep * 1e-7) continue;
      const screenY = worldToScreenY(y, viewport, height);
      if (screenY < 14 || screenY > height - 18) continue;
      context.fillText(formatAxisValue(y, majorStep), labelX, screenY);
    }
  }

  context.fillStyle = COLORS.axis;
  context.textAlign = "right";
  context.textBaseline = "bottom";
  context.fillText("x", width - 10, Math.min(height - 7, Math.max(18, xAxisY - 7)));
  context.textAlign = "left";
  context.textBaseline = "top";
  context.fillText("y", Math.min(width - 18, Math.max(8, yAxisX + 8)), 6);
}

function drawCurves(context: CanvasRenderingContext2D, scene: RenderScene): void {
  const bounds = getViewportBounds(scene.viewport, scene.width, scene.height);

  context.save();
  context.beginPath();
  context.rect(0, 0, scene.width, scene.height);
  context.clip();

  for (const runtime of scene.functions) {
    if (!runtime.definition.visible || !runtime.compiled) continue;
    const segments = sampleFunction(runtime.compiled, {
      viewport: scene.viewport,
      bounds,
      width: scene.width,
      height: scene.height,
      parameters: scene.parameters
    });

    const selected = runtime.definition.id === scene.selectedFunctionId;
    context.strokeStyle = runtime.definition.color;
    context.lineWidth = selected ? 2.8 : 2.1;
    context.globalAlpha = selected ? 1 : 0.88;
    context.lineCap = "round";
    context.lineJoin = "round";

    context.beginPath();
    for (const segment of segments) {
      if (segment.length < 2) continue;
      const first = segment[0];
      context.moveTo(
        worldToScreenX(first.x, scene.viewport, scene.width),
        safeScreenValue(worldToScreenY(first.y, scene.viewport, scene.height))
      );
      for (let index = 1; index < segment.length; index += 1) {
        const point = segment[index];
        context.lineTo(
          worldToScreenX(point.x, scene.viewport, scene.width),
          safeScreenValue(worldToScreenY(point.y, scene.viewport, scene.height))
        );
      }
    }
    context.stroke();
  }
  context.restore();
  context.globalAlpha = 1;
}

function drawFeatures(context: CanvasRenderingContext2D, scene: RenderScene): void {
  if (!scene.showIntersections) return;

  for (const feature of scene.features) {
    const x = worldToScreenX(feature.x, scene.viewport, scene.width);
    const y = worldToScreenY(feature.y, scene.viewport, scene.height);
    if (x < -8 || x > scene.width + 8 || y < -8 || y > scene.height + 8) continue;

    context.beginPath();
    if (feature.kind === "yIntercept") {
      const radius = 3.8;
      context.moveTo(x, y - radius);
      context.lineTo(x + radius, y);
      context.lineTo(x, y + radius);
      context.lineTo(x - radius, y);
      context.closePath();
    } else {
      context.arc(x, y, feature.kind === "root" ? 3.2 : 4, 0, Math.PI * 2);
    }
    context.fillStyle =
      feature.kind === "intersection" ? COLORS.paper : COLORS.feature;
    context.strokeStyle = COLORS.feature;
    context.lineWidth = 1.6;
    context.fill();
    context.stroke();
  }
}

export function renderGraph(canvas: HTMLCanvasElement, scene: RenderScene): void {
  const context = prepareCanvas(canvas, scene.width, scene.height, scene.pixelRatio);
  context.fillStyle = COLORS.background;
  context.fillRect(0, 0, scene.width, scene.height);
  drawGrid(context, scene);
  drawFeatures(context, scene);
  drawCurves(context, scene);
}

export function renderInteractionOverlay(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  pixelRatio: number,
  viewport: Viewport,
  readout: Readout | null
): void {
  const context = prepareCanvas(canvas, width, height, pixelRatio);
  if (!readout) return;

  const xAxisY = worldToScreenY(0, viewport, height);
  const yAxisX = worldToScreenX(0, viewport, width);
  const xAxisVisible = xAxisY >= 0 && xAxisY <= height;
  const yAxisVisible = yAxisX >= 0 && yAxisX <= width;

  context.save();
  context.setLineDash([4, 5]);
  context.lineWidth = 1;
  context.strokeStyle = "rgba(23, 60, 57, 0.34)";
  context.beginPath();
  if (xAxisVisible) {
    context.moveTo(readout.screenX, readout.screenY);
    context.lineTo(readout.screenX, xAxisY);
  }
  if (yAxisVisible) {
    context.moveTo(readout.screenX, readout.screenY);
    context.lineTo(yAxisX, readout.screenY);
  }
  context.stroke();
  context.restore();

  const formatValue = (value: number) =>
    Number(value.toPrecision(6)).toString();
  const xLabel = readout.exactXLabel ?? formatValue(readout.x);
  const yLabel = formatValue(readout.y);
  context.font = '10px "SFMono-Regular", Consolas, monospace';
  context.textBaseline = "middle";

  if (xAxisVisible) {
    const label = `x ${xLabel}`;
    const padding = 4;
    const textWidth = context.measureText(label).width;
    const labelX = Math.min(width - textWidth - padding * 2 - 2, readout.screenX + 5);
    const labelY = Math.min(height - 10, xAxisY + 11);
    context.fillStyle = "rgba(255, 253, 248, 0.92)";
    context.fillRect(labelX - padding, labelY - 8, textWidth + padding * 2, 16);
    context.fillStyle = "#53625d";
    context.textAlign = "left";
    context.fillText(label, labelX, labelY);
  }

  if (yAxisVisible) {
    const label = `y ${yLabel}`;
    const padding = 4;
    const textWidth = context.measureText(label).width;
    const labelY = Math.max(12, Math.min(height - 10, readout.screenY - 11));
    const labelX = Math.max(4, yAxisX - textWidth - padding * 2 - 4);
    context.fillStyle = "rgba(255, 253, 248, 0.92)";
    context.fillRect(labelX - padding, labelY - 8, textWidth + padding * 2, 16);
    context.fillStyle = "#53625d";
    context.textAlign = "left";
    context.fillText(label, labelX, labelY);
  }

  if (readout.snapped) {
    context.save();
    context.beginPath();
    context.arc(readout.screenX, readout.screenY, 12, 0, Math.PI * 2);
    context.fillStyle = "rgba(31, 122, 112, 0.14)";
    context.strokeStyle = "rgba(31, 122, 112, 0.7)";
    context.lineWidth = 1.5;
    context.fill();
    context.stroke();
    context.restore();
  }

  context.beginPath();
  context.arc(readout.screenX, readout.screenY, readout.pinned ? 5 : 4.5, 0, Math.PI * 2);
  context.fillStyle = readout.color;
  context.strokeStyle = "#fffdf8";
  context.lineWidth = 2.5;
  context.fill();
  context.stroke();
}

export function definitionLabel(definition: PlotFunction): string {
  return `y = ${definition.expression}`;
}
