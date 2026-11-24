import test from "node:test";
import assert from "node:assert/strict";
import { renderExamDiagram } from "./exam-diagram.service.js";

test("renders a monochrome coordinate diagram with points and curve", () => {
  const svg = renderExamDiagram({
    type: "coordinate", xMin: -2, xMax: 2, yMin: -2, yMax: 2,
    points: [{ x: 1, y: 1, label: "A" }],
    curve: [{ x: -2, y: 1 }, { x: 0, y: 0 }, { x: 2, y: 1 }],
  });
  assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
  assert.match(svg, /stroke="#111"/);
  assert.match(svg, />A<\/text>/);
  const colors = [...svg.matchAll(/(?:stroke|fill)="(#[0-9a-f]{3,6})"/gi)].map((m) => m[1]);
  assert.deepEqual([...new Set(colors)].sort(), ["#111", "#d7d7d7"]);
});

test("renders vectors from a shared origin with arrow markers", () => {
  const svg = renderExamDiagram({
    type: "vectors", origin: { x: 3, y: -2 },
    vectors: [{ x: 4, y: 0, label: "F" }, { x: 0, y: 2, label: "N" }],
  });
  assert.match(svg, /marker-end="url\(#arr\)"/);
  assert.match(svg, />F<\/text>/);
  assert.match(svg, />N<\/text>/);
});

test("preserves circular geometry as a circle, not an ellipse", () => {
  const svg = renderExamDiagram({
    type: "geometry",
    points: [{ x: -2, y: -1, label: "A" }, { x: 2, y: 1, label: "B" }],
    edges: [[0, 1]],
    circles: [{ cx: 0, cy: 0, r: 1, label: "C" }],
  });
  const circleTags = svg.match(/<circle[^>]+>/g) ?? [];
  assert.ok(circleTags.some((tag) => /r="[^"]+"/.test(tag)));
  assert.match(svg, />C<\/text>/);
  assert.doesNotMatch(svg, /<ellipse/);
});

test("rejects invalid coordinate ranges instead of emitting malformed SVG", () => {
  assert.equal(renderExamDiagram({ type: "coordinate", xMin: 2, xMax: 2, yMin: 0, yMax: 1 }), "");
});

test("renders compact monochrome electrical circuits", () => {
  const svg = renderExamDiagram({
    type: "circuit",
    nodes: [{ x: 0, y: 0, label: "A" }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 0, y: 2 }],
    components: [
      { kind: "battery", from: 0, to: 3, label: "V" },
      { kind: "resistor", from: 0, to: 1, label: "R" },
      { kind: "lamp", from: 1, to: 2, label: "L" },
      { kind: "switch", from: 2, to: 3 },
    ],
  });
  assert.match(svg, /^<svg[\\s\\S]*<\\/svg>$/);
  assert.match(svg, /<polyline/);
  assert.match(svg, /<circle/);
  assert.match(svg, />R<\\/text>/);
  assert.doesNotMatch(svg, /#[0-9a-f]{6}/i);
});
