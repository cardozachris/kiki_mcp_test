import { Node as FigmaDocumentNode } from "@figma/rest-api-spec";
import {
  FigmaFill,
  generateCSSShorthand,
  isVisible,
  parsePaint,
} from "./common";
import { isStrokeWeights } from "./identity";
import { hasValue } from "./identity";

export type FigmaStroke = {
  colors: FigmaFill[];
  strokeWeight?: string;
  strokeDashes?: number[];
  strokeWeights?: string;
};
export function buildFigmaStrokes(n: FigmaDocumentNode): FigmaStroke {
  let strokes: FigmaStroke = { colors: [] };
  if (hasValue("strokes", n) && Array.isArray(n.strokes) && n.strokes.length) {
    strokes.colors = n.strokes.filter(isVisible).map(parsePaint);
  }

  if (
    hasValue("strokeWeight", n) &&
    typeof n.strokeWeight === "number" &&
    n.strokeWeight > 0
  ) {
    strokes.strokeWeight = `${n.strokeWeight}px`;
  }

  if (
    hasValue("strokeDashes", n) &&
    Array.isArray(n.strokeDashes) &&
    n.strokeDashes.length
  ) {
    strokes.strokeDashes = n.strokeDashes;
  }

  if (hasValue("individualStrokeWeights", n, isStrokeWeights)) {
    strokes.strokeWeight = generateCSSShorthand(n.individualStrokeWeights);
  }

  return strokes;
}
