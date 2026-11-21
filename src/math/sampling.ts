import type { CompiledExpression } from "./expression";
import type { PlotPoint, PlotSegment, Viewport, ViewportBounds } from "../types";

export interface SamplingContext {
  viewport: Viewport;
  bounds: ViewportBounds;
  width: number;
  height: number;
  parameters: Record<string, number>;
}

function screenY(
  value: number,
  viewport: Viewport,
  height: number
): number {
  return height / 2 - (value - viewport.centerY) * viewport.pixelsPerUnit;
}

export function sampleFunction(
  expression: CompiledExpression,
  context: SamplingContext
): PlotSegment[] {
  const { viewport, bounds, width, height, parameters } = context;
  const sampleCount = Math.max(600, Math.min(2600, Math.ceil(width * 1.6)));
  const dx = (bounds.xMax - bounds.xMin) / sampleCount;
  const segments: PlotSegment[] = [];
  let segment: PlotSegment = [];
  let previous: { point: PlotPoint; screenY: number } | null = null;

  const flush = () => {
    if (segment.length > 1) segments.push(segment);
    segment = [];
  };

  for (let index = 0; index <= sampleCount; index += 1) {
    const x = bounds.xMin + index * dx;
    const y = expression.evaluate(x, parameters);

    if (!Number.isFinite(y) || Math.abs(y) > 1e12) {
      flush();
      previous = null;
      continue;
    }

    const point = { x, y };
    const currentScreenY = screenY(y, viewport, height);

    if (previous) {
      const jump = Math.abs(currentScreenY - previous.screenY);
      let discontinuity = false;

      if (jump > height * 1.8 && Math.sign(y) !== Math.sign(previous.point.y)) {
        const midpointX = (x + previous.point.x) / 2;
        const midpointY = expression.evaluate(midpointX, parameters);
        discontinuity =
          !Number.isFinite(midpointY) ||
          Math.abs(midpointY) >
            Math.max(Math.abs(y), Math.abs(previous.point.y), 1) * 1.25;
      }

      if (jump > height * 5 && Math.abs(y) > 1e6) {
        discontinuity = true;
      }

      if (discontinuity) {
        flush();
      } else if (segment.length === 0) {
        segment.push(previous.point);
      }
    }

    segment.push(point);
    previous = { point, screenY: currentScreenY };
  }

  flush();
  return segments;
}

export function valueAt(
  expression: CompiledExpression,
  x: number,
  parameters: Record<string, number>
): number {
  return expression.evaluate(x, parameters);
}
