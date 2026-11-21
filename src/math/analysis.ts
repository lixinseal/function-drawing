import type { RuntimeFunction, FeaturePoint, ViewportBounds } from "../types";

interface Evaluator {
  evaluate: (x: number) => number;
  color: string;
}

function valueOf(fn: RuntimeFunction, x: number, parameters: Record<string, number>): number {
  if (!fn.compiled) return Number.NaN;
  return fn.compiled.evaluate(x, parameters);
}

function bisectRoot(
  leftX: number,
  rightX: number,
  leftY: number,
  rightY: number,
  evaluate: (x: number) => number
): { x: number; y: number } | null {
  if (!Number.isFinite(leftY) || !Number.isFinite(rightY) || Math.sign(leftY) === Math.sign(rightY)) {
    return null;
  }

  let low = leftX;
  let high = rightX;
  let lowValue = leftY;
  let highValue = rightY;

  for (let step = 0; step < 42; step += 1) {
    const middle = (low + high) / 2;
    const middleValue = evaluate(middle);
    if (!Number.isFinite(middleValue)) return null;

    if (Math.abs(middleValue) < 1e-9) {
      return { x: middle, y: middleValue };
    }

    if (Math.sign(lowValue) !== Math.sign(middleValue)) {
      high = middle;
      highValue = middleValue;
    } else {
      low = middle;
      lowValue = middleValue;
    }
  }

  const x = (low + high) / 2;
  return { x, y: evaluate(x) };
}

function findRoots(
  evaluate: (x: number) => number,
  bounds: ViewportBounds,
  sampleCount = 520
): Array<{ x: number; y: number }> {
  const roots: Array<{ x: number; y: number }> = [];
  const dx = (bounds.xMax - bounds.xMin) / sampleCount;
  let previousX = bounds.xMin;
  let previousY = evaluate(previousX);

  for (let index = 1; index <= sampleCount; index += 1) {
    const x = bounds.xMin + index * dx;
    const y = evaluate(x);

    if (Number.isFinite(previousY) && Math.abs(previousY) < 1e-7) {
      roots.push({ x: previousX, y: 0 });
    }

    if (
      Number.isFinite(previousY) &&
      Number.isFinite(y) &&
      Math.sign(previousY) !== Math.sign(y)
    ) {
      const root = bisectRoot(previousX, x, previousY, y, evaluate);
      if (root) roots.push(root);
    }

    previousX = x;
    previousY = y;
  }

  return roots;
}

function dedupeRoots(
  roots: Array<{ x: number; y: number }>,
  minimumDistance: number
): Array<{ x: number; y: number }> {
  const result: Array<{ x: number; y: number }> = [];
  for (const root of roots) {
    if (!Number.isFinite(root.x) || !Number.isFinite(root.y)) continue;
    if (result.some((candidate) => Math.abs(candidate.x - root.x) < minimumDistance)) continue;
    result.push(root);
  }
  return result;
}

function dedupeFeatures(
  features: FeaturePoint[],
  minimumXDistance: number,
  minimumYDistance: number
): FeaturePoint[] {
  const priority: Record<FeaturePoint["kind"], number> = {
    intersection: 3,
    yIntercept: 2,
    root: 1
  };
  const result: FeaturePoint[] = [];

  for (const feature of features) {
    const existing = result.find(
      (candidate) =>
        Math.abs(candidate.x - feature.x) < minimumXDistance &&
        Math.abs(candidate.y - feature.y) < minimumYDistance
    );

    if (!existing) {
      result.push(feature);
    } else if (priority[feature.kind] > priority[existing.kind]) {
      Object.assign(existing, feature);
    }
  }

  return result;
}

export function findFeaturePoints(
  functions: RuntimeFunction[],
  bounds: ViewportBounds,
  parameters: Record<string, number>
): FeaturePoint[] {
  const usable = functions.filter(
    (fn): fn is RuntimeFunction & { compiled: NonNullable<RuntimeFunction["compiled"]> } =>
      fn.definition.visible && fn.compiled !== null
  );
  if (usable.length === 0) return [];

  const minimumDistance = (bounds.xMax - bounds.xMin) / 8000;
  const minimumYDistance = (bounds.yMax - bounds.yMin) / 8000;
  const features: FeaturePoint[] = [];

  if (bounds.yMin <= 0 && bounds.yMax >= 0) {
    for (const fn of usable) {
      const roots = findRoots(
        (x) => valueOf(fn, x, parameters),
        bounds
      );
      for (const root of dedupeRoots(roots, minimumDistance)) {
        features.push({ x: root.x, y: 0, kind: "root" });
      }
    }
  }

  if (bounds.xMin <= 0 && bounds.xMax >= 0) {
    for (const fn of usable) {
      const y = valueOf(fn, 0, parameters);
      if (Number.isFinite(y) && y >= bounds.yMin && y <= bounds.yMax) {
        features.push({ x: 0, y, kind: "yIntercept" });
      }
    }
  }

  for (let leftIndex = 0; leftIndex < usable.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < usable.length; rightIndex += 1) {
      const left = usable[leftIndex];
      const right = usable[rightIndex];
      const roots = findRoots(
        (x) => valueOf(left, x, parameters) - valueOf(right, x, parameters),
        bounds
      );

      for (const root of dedupeRoots(roots, minimumDistance)) {
        const y = valueOf(left, root.x, parameters);
        if (Number.isFinite(y)) {
          features.push({
            x: root.x,
            y,
            kind: "intersection"
          });
        }
      }
    }
  }

  return dedupeFeatures(features, minimumDistance, minimumYDistance).slice(0, 240);
}
