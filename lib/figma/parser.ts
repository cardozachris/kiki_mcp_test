import {
  GetFileNodesResponse,
  GetFileResponse,
  Node as FigmaDocNode,
} from "@figma/rest-api-spec";
import {
  generateVarId,
  isVisible,
  parsePaint,
  removeEmptyKeys,
  StyleId,
} from "./common";
import { buildFigmaStrokes, FigmaStroke } from "./stroke";
import { buildSimplifiedLayout, FigmaLayout } from "./layout";
import { FigmaFill } from "./common";
import { buildEffects, FigmaEffects } from "./effect";
import { hasValue, isRectangleCornerRadii } from "./identity";

export type TextStyle = Partial<{
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  lineHeight: string;
  letterSpacing: string;
  textCase: string;
  textAlignHorizontal: string;
  textAlignVertical: string;
}>;

export type StrokeWeights = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

type StyleTypes =
  | TextStyle
  | FigmaFill[]
  | FigmaLayout
  | FigmaStroke
  | FigmaEffects
  | string;

type GlobalVars = {
  styles: Record<StyleId, StyleTypes>;
};

export interface FigmaFile {
  name: string;
  lastModified: string;
  thumbnailUrl: string;
  nodes: FigmaNode[];
  globalVars: GlobalVars;
}

export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  boundingBox?: BoundingBox;
  text?: string;
  textStyle?: string;
  fills?: string;
  styles?: string;
  strokes?: string;
  effects?: string;
  opacity?: number;
  borderRadius?: string;
  layout?: string;
  children?: FigmaNode[];
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

function findOrCreateVar(
  globalVars: GlobalVars,
  value: any,
  prefix: string
): StyleId {
  // Check if the same value already exists
  const [existingVarId] =
    Object.entries(globalVars.styles).find(
      ([_, existingValue]) =>
        JSON.stringify(existingValue) === JSON.stringify(value)
    ) ?? [];

  if (existingVarId) {
    return existingVarId as StyleId;
  }

  // Create a new variable if it doesn't exist
  const varId = generateVarId(prefix);
  globalVars.styles[varId] = value;
  return varId;
}

export const parseFigmaResponse = (
  data: GetFileResponse | GetFileNodesResponse
): FigmaFile => {
  const { name, lastModified, thumbnailUrl } = data;
  let nodes: FigmaDocNode[] = [];
  if ("document" in data) {
    nodes = Object.values(data.document.children);
  } else {
    nodes = Object.values(data.nodes).map((n) => n.document);
  }
  let globalVars: GlobalVars = {
    styles: {},
  };
  const simplifiedNodes: FigmaNode[] = nodes
    .filter(isVisible)
    .map((n) => parseNode(globalVars, n))
    .filter((child) => child !== null && child !== undefined);

  return {
    name,
    lastModified,
    thumbnailUrl: thumbnailUrl || "",
    nodes: simplifiedNodes,
    globalVars,
  };
};

const parseNode = (
  globalVars: GlobalVars,
  n: FigmaDocNode,
  parent?: FigmaDocNode
): FigmaNode | null => {
  const { id, name, type } = n;
  const simplified: FigmaNode = {
    id,
    name,
    type,
  };

  // text
  if (hasValue("style", n) && Object.keys(n.style).length) {
    const style = n.style;
    const textStyle = {
      fontFamily: style.fontFamily,
      fontWeight: style.fontWeight,
      fontSize: style.fontSize,
      lineHeight:
        style.lineHeightPx && style.fontSize
          ? `${style.lineHeightPx / style.fontSize}em`
          : undefined,
      letterSpacing:
        style.letterSpacing && style.letterSpacing !== 0 && style.fontSize
          ? `${(style.letterSpacing / style.fontSize) * 100}%`
          : undefined,
      textCase: style.textCase,
      textAlignHorizontal: style.textAlignHorizontal,
      textAlignVertical: style.textAlignVertical,
    };
    simplified.textStyle = findOrCreateVar(globalVars, textStyle, "style");
  }

  // fills & strokes
  if (hasValue("fills", n) && Array.isArray(n.fills) && n.fills.length) {
    // const fills = simplifyFills(n.fills.map(parsePaint));
    const fills = n.fills.map(parsePaint);
    simplified.fills = findOrCreateVar(globalVars, fills, "fill");
  }

  const strokes = buildFigmaStrokes(n);
  if (strokes.colors.length) {
    simplified.strokes = findOrCreateVar(globalVars, strokes, "stroke");
  }

  const effects = buildEffects(n);
  if (Object.keys(effects).length) {
    simplified.effects = findOrCreateVar(globalVars, effects, "effect");
  }

  // Process layout
  const layout = buildSimplifiedLayout(n, parent);
  if (Object.keys(layout).length > 1) {
    simplified.layout = findOrCreateVar(globalVars, layout, "layout");
  }

  // Keep other simple properties directly
  if (hasValue("characters", n)) {
    simplified.text = n.characters;
  }

  // border/corner

  // opacity
  if (
    hasValue("opacity", n) &&
    typeof n.opacity === "number" &&
    n.opacity !== 1
  ) {
    simplified.opacity = n.opacity;
  }

  if (hasValue("cornerRadius", n) && typeof n.cornerRadius === "number") {
    simplified.borderRadius = `${n.cornerRadius}px`;
  }
  if (hasValue("rectangleCornerRadii", n, isRectangleCornerRadii)) {
    simplified.borderRadius = `${n.rectangleCornerRadii[0]}px ${n.rectangleCornerRadii[1]}px ${n.rectangleCornerRadii[2]}px ${n.rectangleCornerRadii[3]}px`;
  }

  // Recursively process child nodes
  if (hasValue("children", n) && n.children.length > 0) {
    let children = n.children
      .filter(isVisible)
      .map((child) => parseNode(globalVars, child, n))
      .filter((child) => child !== null && child !== undefined);
    if (children.length) {
      simplified.children = children;
    }
  }

  // Convert VECTOR to IMAGE
  if (type === "VECTOR") {
    simplified.type = "IMAGE-SVG";
  }

  return removeEmptyKeys(simplified);
};
