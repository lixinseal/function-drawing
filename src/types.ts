export interface Viewport {
  centerX: number;
  centerY: number;
  pixelsPerUnit: number;
}

export interface ViewportBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface PlotFunction {
  id: string;
  expression: string;
  color: string;
  visible: boolean;
}

export interface ParameterValue {
  name: string;
  value: number;
}

export interface GraphDocument {
  version: 1;
  functions: PlotFunction[];
  parameters: Record<string, number>;
  viewport: Viewport;
  showGrid: boolean;
  showAxes: boolean;
  showIntersections: boolean;
}

export interface PlotPoint {
  x: number;
  y: number;
}

export type PlotSegment = PlotPoint[];

export interface Readout {
  x: number;
  y: number;
  screenX: number;
  screenY: number;
  functionId: string;
  expression: string;
  color: string;
  pinned: boolean;
  snapped: boolean;
  featureKind?: FeaturePoint["kind"] | "trigPi";
  exactXLabel?: string;
}

export interface FeaturePoint {
  x: number;
  y: number;
  kind: "intersection" | "root" | "yIntercept";
}

export interface RuntimeFunction {
  definition: PlotFunction;
  compiled: import("./math/expression").CompiledExpression | null;
  error: string;
}
