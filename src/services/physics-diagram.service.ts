import { z } from "zod";

const label = z.string().trim().min(1).max(32);
const point = z.object({ x: z.number().min(-100).max(100), y: z.number().min(-100).max(100) });

const force = z.object({
  label,
  angleDeg: z.number().min(-360).max(360),
  magnitude: z.number().positive().max(1000).optional(),
});

export const physicsDiagramSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("free-body"), bodyLabel: label.default("جسم"), forces: z.array(force).min(1).max(8) }),
  z.object({ type: z.literal("inclined-plane"), angleDeg: z.number().min(5).max(60).default(30), blockLabel: label.default("m"), forces: z.array(force).max(6).default([]) }),
  z.object({ type: z.literal("pulley"), leftMass: label.default("m₁"), rightMass: label.default("m₂"), showTension: z.boolean().default(true) }),
  z.object({ type: z.literal("pendulum"), angleDeg: z.number().min(0).max(60).default(25), lengthLabel: label.default("L"), massLabel: label.default("m") }),
  z.object({ type: z.literal("spring"), displacement: z.enum(["left", "right"]).default("right"), massLabel: label.default("m"), showEquilibrium: z.boolean().default(true) }),
  z.object({ type: z.literal("circuit"), voltageLabel: label.default("V"), resistanceLabel: label.default("R"), meter: z.enum(["none", "ammeter", "voltmeter"]).default("none") }),
  z.object({ type: z.literal("coulomb"), charge1: label.default("+q₁"), charge2: label.default("+q₂"), forceLabel: label.default("F"), attraction: z.boolean().default(false) }),
  z.object({ type: z.literal("kinematics-graph"), graph: z.enum(["position-time", "velocity-time", "acceleration-time"]), points: z.array(point).min(2).max(8), xLabel: label.default("t"), yLabel: label.default("x") }),
  z.object({ type: z.literal("atomic-transition"), levels: z.array(z.object({ energy: z.number().min(0).max(100), label: label })).min(2).max(6), from: z.number().int().min(0).max(5), to: z.number().int().min(0).max(5), photonLabel: label.default("hν") }),
]);

export type PhysicsDiagram = z.infer<typeof physicsDiagramSchema>;

const esc = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const line = (x1: number, y1: number, x2: number, y2: number, extra = "") => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${extra}/>`;
const text = (x: number, y: number, value: string, extra = "") => `<text x="${x}" y="${y}" fill="#17212d" font-family="Arial,sans-serif" font-size="16" ${extra}>${esc(value)}</text>`;
const arrow = (x1: number, y1: number, x2: number, y2: number, caption: string, color = "#202a36") =>
  line(x1, y1, x2, y2, `stroke="${color}" stroke-width="2.4" marker-end="url(#arrow)"`) +
  text((x1 + x2) / 2 + 8, (y1 + y2) / 2 - 7, caption);

function renderFreeBody(d: Extract<PhysicsDiagram, {type:"free-body"}>): string {
  const cx = 320, cy = 174;
  let out = `<rect x="286" y="140" width="68" height="68" rx="3" fill="#fff" stroke="#202a36" stroke-width="2.2"/>` + text(cx, cy + 5, d.bodyLabel, 'text-anchor="middle"');
  d.forces.forEach((f) => {
    const a = f.angleDeg * Math.PI / 180, length = 48 + Math.min(42, (f.magnitude ?? 1) * 4);
    out += arrow(cx, cy, cx + Math.cos(a) * length, cy - Math.sin(a) * length, f.label);
  });
  return out;
}
function renderIncline(d: Extract<PhysicsDiagram, {type:"inclined-plane"}>): string {
  const rad = d.angleDeg * Math.PI / 180, x0 = 100, y0 = 280;
  const rampWidth = Math.min(440, 220 / Math.tan(rad));
  const x1 = x0 + rampWidth, y1 = y0 - Math.tan(rad) * rampWidth;
  const bx = x0 + rampWidth * 0.58, by = y0 - Math.tan(rad) * (bx - x0) - 27;
  let out = line(x0, y0, x1, y1, 'stroke="#303b49" stroke-width="3"') +
    line(x0, y0, x1, y0, 'stroke="#8793a2" stroke-width="1.4"') +
    `<g transform="translate(${bx} ${by}) rotate(-${d.angleDeg})"><rect x="-25" y="-25" width="50" height="50" fill="#fff" stroke="#202a36" stroke-width="2.2"/><text x="0" y="5" fill="#17212d" font-family="Arial,sans-serif" font-size="16" text-anchor="middle">${esc(d.blockLabel)}</text></g>` +
    text(130, 268, `${d.angleDeg}°`);
  d.forces.forEach((f) => {
    const a = f.angleDeg * Math.PI / 180;
    out += arrow(bx, by, bx + Math.cos(a) * 62, by - Math.sin(a) * 62, f.label);
  });
  return out;
}
function renderPulley(d: Extract<PhysicsDiagram, {type:"pulley"}>): string {
  return line(120, 85, 520, 85, 'stroke="#303b49" stroke-width="3"') +
    line(320, 85, 320, 110, 'stroke="#303b49" stroke-width="2"') +
    \`<circle cx="320" cy="132" r="22" fill="#fff" stroke="#202a36" stroke-width="2.2"/>\` +
    \`<path d="M298 132 A22 22 0 0 1 342 132 V245 M298 132 V245" stroke="#303b49" stroke-width="2" fill="none"/>\` +
    \`<rect x="276" y="245" width="44" height="42" fill="#fff" stroke="#202a36" stroke-width="2.2"/><rect x="320" y="245" width="44" height="42" fill="#fff" stroke="#202a36" stroke-width="2.2"/>\` +
    text(298, 271, d.leftMass, 'text-anchor="middle"') + text(342, 271, d.rightMass, 'text-anchor="middle"') +
    (d.showTension ? text(276, 185, "T") + text(350, 185, "T") : "");
}
function renderPendulum(d: Extract<PhysicsDiagram, {type:"pendulum"}>): string {
  const a = d.angleDeg * Math.PI / 180, px = 320 + Math.sin(a) * 150, py = 80 + Math.cos(a) * 150;
  return `<circle cx="320" cy="80" r="4" fill="#202a36"/>` + line(320, 80, px, py, 'stroke="#303b49" stroke-width="2.5"') +
    `<circle cx="${px}" cy="${py}" r="20" fill="#fff" stroke="#202a36" stroke-width="2.2"/>` + text(px, py + 5, d.massLabel, 'text-anchor="middle"') +
    line(320, 80, 320, 260, 'stroke="#a0a9b4" stroke-dasharray="5 5"') +
    text((320 + px) / 2 + 10, (80 + py) / 2, d.lengthLabel) + text(340, 112, `${d.angleDeg}°`);
}
function renderSpring(d: Extract<PhysicsDiagram, {type:"spring"}>): string {
  const equilibrium = 320, massX = d.displacement === "right" ? 400 : 240;
  const start = 90, end = massX - 28, turns = 12, dx = (end - start) / (turns * 2);
  let path = `M ${start} 175 `;
  for (let i = 1; i < turns * 2; i++) path += `L ${start + i * dx} ${i % 2 ? 150 : 200} `;
  path += `L ${end} 175`;
  return line(70, 220, 570, 220, 'stroke="#9aa4b1" stroke-width="1.5"') +
    (d.showEquilibrium ? line(equilibrium, 115, equilibrium, 250, 'stroke="#a0a9b4" stroke-dasharray="5 5"') + text(equilibrium, 270, "تعادل", 'text-anchor="middle"') : "") +
    `<path d="${path}" fill="none" stroke="#303b49" stroke-width="2.5"/><rect x="${massX-28}" y="145" width="56" height="60" fill="#fff" stroke="#202a36" stroke-width="2.2"/>` +
    text(massX, 181, d.massLabel, 'text-anchor="middle"') + arrow(massX, 115, d.displacement === "right" ? massX - 55 : massX + 55, 115, "F");
}
function renderCircuit(d: Extract<PhysicsDiagram, {type:"circuit"}>): string {
  const top = d.meter === "ammeter"
    ? line(130, 95, 238, 95, 'stroke="#303b49" stroke-width="2" fill="none"') +
      line(282, 95, 365, 95, 'stroke="#303b49" stroke-width="2" fill="none"') +
      line(435, 95, 510, 95, 'stroke="#303b49" stroke-width="2" fill="none"') +
      \`<circle cx="260" cy="95" r="22" fill="#fff" stroke="#202a36" stroke-width="2"/>\` +
      text(260, 100, "A", 'text-anchor="middle"') +
      \`<rect x="365" y="77" width="70" height="36" fill="#fff" stroke="#202a36" stroke-width="2.2"/>\` +
      text(400, 100, d.resistanceLabel, 'text-anchor="middle"')
    : line(130, 95, 285, 95, 'stroke="#303b49" stroke-width="2" fill="none"') +
      line(355, 95, 510, 95, 'stroke="#303b49" stroke-width="2" fill="none"') +
      \`<rect x="285" y="77" width="70" height="36" fill="#fff" stroke="#202a36" stroke-width="2.2"/>\` +
      text(320, 100, d.resistanceLabel, 'text-anchor="middle"');
  const meter = d.meter === "voltmeter"
    ? line(285, 95, 285, 205, 'stroke="#303b49" stroke-width="2" fill="none"') +
      line(285, 205, 408, 205, 'stroke="#303b49" stroke-width="2" fill="none"') +
      line(452, 205, 355, 205, 'stroke="#303b49" stroke-width="2" fill="none"') +
      line(355, 205, 355, 95, 'stroke="#303b49" stroke-width="2" fill="none"') +
      \`<circle cx="430" cy="205" r="22" fill="#fff" stroke="#202a36" stroke-width="2"/>\` +
      text(430, 210, "V", 'text-anchor="middle"')
    : "";
  return top +
    line(130, 95, 130, 172, 'stroke="#303b49" stroke-width="2" fill="none"') +
    line(130, 184, 130, 245, 'stroke="#303b49" stroke-width="2" fill="none"') +
    line(510, 95, 510, 245, 'stroke="#303b49" stroke-width="2" fill="none"') +
    line(130, 245, 510, 245, 'stroke="#303b49" stroke-width="2" fill="none"') +
    line(118, 172, 142, 172, 'stroke="#303b49" stroke-width="2"') +
    line(122, 184, 138, 184, 'stroke="#303b49" stroke-width="4"') +
    text(154, 182, d.voltageLabel) + meter;
}
function renderCoulomb(d: Extract<PhysicsDiagram, {type:"coulomb"}>): string {
  const left = d.attraction ? "#2876b9" : "#202a36";
  return line(130, 175, 510, 175, 'stroke="#9aa4b1" stroke-dasharray="5 5"') +
    `<circle cx="190" cy="175" r="34" fill="#fff" stroke="${left}" stroke-width="2.5"/>` +
    `<circle cx="450" cy="175" r="34" fill="#fff" stroke="#202a36" stroke-width="2.5"/>` +
    text(190, 181, d.charge1, 'text-anchor="middle"') + text(450, 181, d.charge2, 'text-anchor="middle"') +
    line(190, 225, 450, 225, 'stroke="#303b49" stroke-width="1.5" marker-start="url(#axis)" marker-end="url(#axis)"') +
    text(320, 250, "r", 'text-anchor="middle"') +
    arrow(190, 130, d.attraction ? 235 : 125, 130, d.forceLabel) +
    arrow(450, 130, d.attraction ? 405 : 495, 130, d.forceLabel);
}
function renderGraph(d: Extract<PhysicsDiagram, {type:"kinematics-graph"}>): string {
  const xs = d.points.map(p => p.x), ys = d.points.map(p => p.y);
  let minX = Math.min(...xs, 0), maxX = Math.max(...xs, 0);
  let minY = Math.min(...ys, 0), maxY = Math.max(...ys, 0);
  if (maxX - minX < 1) { minX -= 0.5; maxX += 0.5; }
  if (maxY - minY < 1) { minY -= 0.5; maxY += 0.5; }
  const sx = (x:number) => 100 + (x-minX)/(maxX-minX)*420;
  const sy = (y:number) => 270 - (y-minY)/(maxY-minY)*215;
  const originX = sx(0), originY = sy(0);
  const points = d.points.map(p => `${sx(p.x)},${sy(p.y)}`).join(" ");
  return line(82, originY, 555, originY, 'stroke="#303b49" stroke-width="1.5" marker-end="url(#axis)"') +
    line(originX, 292, originX, 42, 'stroke="#303b49" stroke-width="1.5" marker-end="url(#axis)"') +
    `<polyline points="${points}" fill="none" stroke="#202a36" stroke-width="2.8" stroke-linejoin="round"/>` +
    d.points.map(p => `<circle cx="${sx(p.x)}" cy="${sy(p.y)}" r="4" fill="#202a36"/>`).join("") +
    text(560, originY - 7, d.xLabel) + text(originX + 8, 38, d.yLabel);
}
function renderAtomic(d: Extract<PhysicsDiagram, {type:"atomic-transition"}>): string {
  if (d.from >= d.levels.length || d.to >= d.levels.length || d.from === d.to) throw new Error("گذار اتمی باید بین دو تراز متفاوت باشد.");
  const sorted = [...d.levels].sort((a,b) => a.energy-b.energy);
  const yAt = (energy:number) => 260 - energy * 1.8;
  const from = d.levels[d.from], to = d.levels[d.to];
  const xFrom = 180, xTo = 470, y1 = yAt(from.energy), y2 = yAt(to.energy);
  return sorted.map((l) => line(130, yAt(l.energy), 520, yAt(l.energy), 'stroke="#303b49" stroke-width="2"') + text(535, yAt(l.energy)+5, l.label)).join("") +
    arrow(xFrom, y1, xTo, y2, d.photonLabel, "#2876b9");
}

export function renderPhysicsDiagram(input: PhysicsDiagram): { svg: string; alt: string; viewBox: string } {
  const drawings: Record<PhysicsDiagram["type"], () => string> = {
    "free-body": () => renderFreeBody(input as Extract<PhysicsDiagram,{type:"free-body"}>),
    "inclined-plane": () => renderIncline(input as Extract<PhysicsDiagram,{type:"inclined-plane"}>),
    pulley: () => renderPulley(input as Extract<PhysicsDiagram,{type:"pulley"}>),
    pendulum: () => renderPendulum(input as Extract<PhysicsDiagram,{type:"pendulum"}>),
    spring: () => renderSpring(input as Extract<PhysicsDiagram,{type:"spring"}>),
    circuit: () => renderCircuit(input as Extract<PhysicsDiagram,{type:"circuit"}>),
    coulomb: () => renderCoulomb(input as Extract<PhysicsDiagram,{type:"coulomb"}>),
    "kinematics-graph": () => renderGraph(input as Extract<PhysicsDiagram,{type:"kinematics-graph"}>),
    "atomic-transition": () => renderAtomic(input as Extract<PhysicsDiagram,{type:"atomic-transition"}>),
  };
  const body = drawings[input.type]();
  const labels: Record<PhysicsDiagram["type"], string> = {
    "free-body": "نمودار جسم آزاد",
    "inclined-plane": "سطح شیب‌دار",
    pulley: "دستگاه قرقره",
    pendulum: "آونگ",
    spring: "فنر و نوسان",
    circuit: "مدار الکتریکی",
    coulomb: "نیروی کولنی",
    "kinematics-graph": "نمودار حرکت‌شناسی",
    "atomic-transition": "گذار ترازهای انرژی",
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" role="img" aria-label="Physics diagram" style="max-width:100%;height:auto"><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6" fill="#202a36"/></marker><marker id="axis" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0 0 L5 3 L0 6" fill="#303b49"/></marker></defs>${body}</svg>`;
  return { svg, alt: labels[input.type], viewBox: "0 0 640 360" };
}
