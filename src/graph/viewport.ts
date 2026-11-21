import type { Viewport, ViewportBounds } from "../types";

export const DEFAULT_VIEWPORT: Viewport = {
  centerX: 0,
  centerY: 0,
  pixelsPerUnit: 56
};

export function getViewportBounds(
  viewport: Viewport,
  width: number,
  height: number
): ViewportBounds {
  const halfWidth = width / (2 * viewport.pixelsPerUnit);
  const halfHeight = height / (2 * viewport.pixelsPerUnit);
  return {
    xMin: viewport.centerX - halfWidth,
    xMax: viewport.centerX + halfWidth,
    yMin: viewport.centerY - halfHeight,
    yMax: viewport.centerY + halfHeight
  };
}

export function worldToScreenX(worldX: number, viewport: Viewport, width: number): number {
  return width / 2 + (worldX - viewport.centerX) * viewport.pixelsPerUnit;
}

export function worldToScreenY(worldY: number, viewport: Viewport, height: number): number {
  return height / 2 - (worldY - viewport.centerY) * viewport.pixelsPerUnit;
}

export function screenToWorldX(screenX: number, viewport: Viewport, width: number): number {
  return viewport.centerX + (screenX - width / 2) / viewport.pixelsPerUnit;
}

export function screenToWorldY(screenY: number, viewport: Viewport, height: number): number {
  return viewport.centerY - (screenY - height / 2) / viewport.pixelsPerUnit;
}

export function zoomViewportAt(
  viewport: Viewport,
  nextPixelsPerUnit: number,
  anchorX: number,
  anchorY: number,
  width: number,
  height: number
): Viewport {
  const worldX = screenToWorldX(anchorX, viewport, width);
  const worldY = screenToWorldY(anchorY, viewport, height);
  const pixelsPerUnit = Math.min(10000, Math.max(0.2, nextPixelsPerUnit));

  return {
    pixelsPerUnit,
    centerX: worldX - (anchorX - width / 2) / pixelsPerUnit,
    centerY: worldY + (anchorY - height / 2) / pixelsPerUnit
  };
}

export function niceStep(targetStep: number): number {
  if (!Number.isFinite(targetStep) || targetStep <= 0) return 1;
  const base = 10 ** Math.floor(Math.log10(targetStep));
  const normalized = targetStep / base;

  if (normalized <= 1) return base;
  if (normalized <= 2) return 2 * base;
  if (normalized <= 5) return 5 * base;
  return 10 * base;
}

export function formatAxisValue(value: number, step: number): string {
  if (Math.abs(value) < step * 1e-7) return "0";
  const decimals = Math.max(0, Math.min(8, -Math.floor(Math.log10(step)) + 1));
  return Number(value.toFixed(decimals)).toString();
}
