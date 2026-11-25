import assert from "node:assert/strict";
import test from "node:test";
import { physicsDiagramSchema, renderPhysicsDiagram } from "./physics-diagram.service.js";

const examples: unknown[] = [
  { type: "free-body", bodyLabel: "m", forces: [{ label: "mg", angleDeg: -90 }, { label: "N", angleDeg: 90 }] },
  { type: "inclined-plane", angleDeg: 35, blockLabel: "m", forces: [{ label: "mg", angleDeg: -90 }] },
  { type: "pulley", leftMass: "m₁", rightMass: "m₂", showTension: true },
  { type: "pendulum", angleDeg: 25, lengthLabel: "L", massLabel: "m" },
  { type: "spring", displacement: "right", massLabel: "m", showEquilibrium: true },
  { type: "circuit", voltageLabel: "12 V", resistanceLabel: "R", meter: "none" },
  { type: "circuit", voltageLabel: "12 V", resistanceLabel: "R", meter: "ammeter" },
  { type: "circuit", voltageLabel: "12 V", resistanceLabel: "R", meter: "voltmeter" },
  { type: "coulomb", charge1: "+q", charge2: "-q", forceLabel: "F", attraction: true },
  { type: "kinematics-graph", graph: "velocity-time", points: [{ x: -2, y: -4 }, { x: 0, y: 0 }, { x: 2, y: 4 }], xLabel: "t (s)", yLabel: "v (m/s)" },
  { type: "atomic-transition", levels: [{ energy: 10, label: "E₂" }, { energy: 2, label: "E₁" }], from: 0, to: 1, photonLabel: "hν" },
];

test("renders every supported physics diagram as a self-contained SVG", () => {
  for (const example of examples) {
    const parsed = physicsDiagramSchema.parse(example);
    const result = renderPhysicsDiagram(parsed);
    assert.match(result.svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(result.svg, /<\/svg>$/);
    assert.match(result.svg, /viewBox="0 0 640 360"/);
    assert.match(result.svg, /id="arrow"/);
    assert.match(result.svg, /id="axis"/);
    assert.ok(result.alt.length > 0);
  }
});

test("escapes labels before inserting them into SVG text", () => {
  const parsed = physicsDiagramSchema.parse({
    type: "free-body",
    bodyLabel: "<script>alert(1)</script>",
    forces: [{ label: "F", angleDeg: 0 }],
  });
  const { svg } = renderPhysicsDiagram(parsed);
  assert.doesNotMatch(svg, /<script>/i);
  assert.match(svg, /&lt;script&gt;/);
});

test("places an ammeter in series without overlapping the resistor", () => {
  const parsed = physicsDiagramSchema.parse({ type: "circuit", meter: "ammeter" });
  const { svg } = renderPhysicsDiagram(parsed);
  assert.match(svg, /<circle cx="260" cy="95" r="22"/);
  assert.match(svg, /<rect x="365" y="77" width="70"/);
  assert.doesNotMatch(svg, /<rect x="285" y="77" width="70".*<circle cx="260"/);
});

test("places a voltmeter on a parallel branch", () => {
  const parsed = physicsDiagramSchema.parse({ type: "circuit", meter: "voltmeter" });
  const { svg } = renderPhysicsDiagram(parsed);
  assert.match(svg, /<circle cx="430" cy="205" r="22"/);
  assert.match(svg, /x1="285" y1="95" x2="285" y2="205"/);
});

test("draws graph axes through the origin for negative and positive values", () => {
  const parsed = physicsDiagramSchema.parse({
    type: "kinematics-graph",
    graph: "velocity-time",
    points: [{ x: -2, y: -4 }, { x: 2, y: 4 }],
  });
  const { svg } = renderPhysicsDiagram(parsed);
  assert.match(svg, /marker-end="url\(#axis\)"/);
  assert.match(svg, /<polyline points=/);
});

test("rejects invalid graph data and identical atomic transition levels", () => {
  assert.equal(physicsDiagramSchema.safeParse({
    type: "kinematics-graph",
    graph: "position-time",
    points: [{ x: 0, y: 0 }],
  }).success, false);

  const parsed = physicsDiagramSchema.parse({
    type: "atomic-transition",
    levels: [{ energy: 10, label: "E₂" }, { energy: 2, label: "E₁" }],
    from: 0,
    to: 0,
  });
  assert.throws(() => renderPhysicsDiagram(parsed), /دو تراز متفاوت/);
});
