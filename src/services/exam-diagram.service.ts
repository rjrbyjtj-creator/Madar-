export type DiagramPoint = { x: number; y: number; label?: string };
export type ExamDiagramSpec =
  | { type: "coordinate"; xMin: number; xMax: number; yMin: number; yMax: number; points?: DiagramPoint[]; curve?: DiagramPoint[]; xLabel?: string; yLabel?: string }
  | { type: "vectors"; vectors: Array<{ x: number; y: number; label: string }>; origin?: { x: number; y: number } }
  | { type: "geometry"; points: DiagramPoint[]; edges: Array<[number, number]>; circles?: Array<{ cx: number; cy: number; r: number; label?: string }> }
  | { type: "circuit"; nodes: Array<{ x: number; y: number; label?: string }>; components: Array<{ kind: "wire" | "resistor" | "battery" | "lamp" | "switch" | "capacitor"; from: number; to: number; label?: string }> };

const W = 480, H = 280, PAD = 34;
const ink = "#111", guide = "#d7d7d7";
const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c] ?? c);
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const line = (x1: number, y1: number, x2: number, y2: number, width = 2, color = ink) =>
  '<line x1="' + x1.toFixed(2) + '" y1="' + y1.toFixed(2) + '" x2="' + x2.toFixed(2) + '" y2="' + y2.toFixed(2) + '" stroke="' + color + '" stroke-width="' + width + '" stroke-linecap="round"/>';
const label = (x: number, y: number, value: string, anchor = "middle") =>
  '<text x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" fill="' + ink + '" font-size="15" font-family="Arial,sans-serif" text-anchor="' + anchor + '">' + esc(value) + '</text>';
function shell(body: string): string {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 280" role="img">' + body + '</svg>';
}
function mapPoint(point: DiagramPoint, bounds: { xMin: number; xMax: number; yMin: number; yMax: number }) {
  return {
    x: PAD + ((point.x - bounds.xMin) / (bounds.xMax - bounds.xMin)) * (W - PAD * 2),
    y: H - PAD - ((point.y - bounds.yMin) / (bounds.yMax - bounds.yMin)) * (H - PAD * 2),
  };
}
function validPoints(value: unknown): value is DiagramPoint[] {
  return Array.isArray(value) && value.length <= 40 && value.every((p) =>
    p && typeof p === "object" && finite((p as DiagramPoint).x) && finite((p as DiagramPoint).y) &&
    (!("label" in p) || typeof (p as DiagramPoint).label === "string")
  );
}

/** Deterministic monochrome SVG renderer for structured exam diagrams. */
export function renderExamDiagram(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const spec = input as Record<string, unknown>;
  if (spec.type === "coordinate") {
    const { xMin, xMax, yMin, yMax } = spec as Record<string, number>;
    if (![xMin, xMax, yMin, yMax].every(finite) || xMin >= xMax || yMin >= yMax ||
      xMax - xMin > 1e6 || yMax - yMin > 1e6) return "";
    const bounds = { xMin, xMax, yMin, yMax };
    const originX = xMin <= 0 && xMax >= 0 ? mapPoint({ x: 0, y: yMin }, bounds).x : PAD;
    const originY = yMin <= 0 && yMax >= 0 ? mapPoint({ x: xMin, y: 0 }, bounds).y : H - PAD;
    let body = "";
    const xTicks = Math.min(10, Math.max(2, Math.round(xMax - xMin)));
    const yTicks = Math.min(8, Math.max(2, Math.round(yMax - yMin)));
    for (let i = 0; i <= xTicks; i++) {
      const x = PAD + i * (W - PAD * 2) / xTicks;
      body += line(x, PAD, x, H - PAD, 0.7, guide);
    }
    for (let i = 0; i <= yTicks; i++) {
      const y = PAD + i * (H - PAD * 2) / yTicks;
      body += line(PAD, y, W - PAD, y, 0.7, guide);
    }
    body += line(PAD, originY, W - PAD, originY, 1.8);
    body += line(originX, H - PAD, originX, PAD, 1.8);
    if (xMin <= 0 && xMax >= 0) body += label(originX - 7, originY + 17, "0", "end");
    if (typeof spec.xLabel === "string") body += label(W - PAD, originY - 9, spec.xLabel, "end");
    if (typeof spec.yLabel === "string") body += label(originX + 12, PAD + 4, spec.yLabel, "start");
    if (validPoints(spec.curve)) {
      const pts = spec.curve.map((p) => mapPoint(p, bounds));
      body += '<polyline points="' + pts.map((p) => p.x.toFixed(2) + "," + p.y.toFixed(2)).join(" ") + '" fill="none" stroke="' + ink + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
    }
    if (validPoints(spec.points)) for (const p of spec.points) {
      if (p.x < xMin || p.x > xMax || p.y < yMin || p.y > yMax) continue;
      const q = mapPoint(p, bounds);
      body += '<circle cx="' + q.x + '" cy="' + q.y + '" r="4" fill="white" stroke="' + ink + '" stroke-width="2"/>';
      if (p.label) body += label(q.x + 8, q.y - 8, p.label, "start");
    }
    return shell(body);
  }
  if (spec.type === "vectors") {
    const vectors = spec.vectors;
    if (!Array.isArray(vectors) || vectors.length < 1 || vectors.length > 8 ||
      !vectors.every((v) => v && finite(v.x) && finite(v.y) && typeof v.label === "string")) return "";
    const origin = spec.origin && finite((spec.origin as any).x) && finite((spec.origin as any).y)
      ? spec.origin as { x: number; y: number } : { x: 0, y: 0 };
    const extentX = Math.max(1, ...vectors.map((v: any) => Math.abs(v.x)));
    const extentY = Math.max(1, ...vectors.map((v: any) => Math.abs(v.y)));
    const scale = Math.min((W - PAD * 2 - 44) / (2 * extentX), (H - PAD * 2 - 44) / (2 * extentY));
    const ox = W / 2, oy = H / 2;
    let body = line(PAD, oy, W - PAD, oy, 1.4, guide) + line(ox, PAD, ox, H - PAD, 1.4, guide);
    body += '<defs><marker id="arr" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6" fill="none" stroke="' + ink + '" stroke-width="1"/></marker></defs>';
    for (const v of vectors as Array<{x:number;y:number;label:string}>) {
      const x = ox + v.x * scale, y = oy - v.y * scale;
      body += '<line x1="' + ox + '" y1="' + oy + '" x2="' + x + '" y2="' + y + '" stroke="' + ink + '" stroke-width="2.5" marker-end="url(#arr)"/>';
      body += label(clamp(x + (v.x >= 0 ? 10 : -10), PAD, W-PAD), clamp(y - 8, PAD+12, H-PAD), v.label, v.x >= 0 ? "start" : "end");
    }
    if (origin.x !== 0 || origin.y !== 0) body += label(ox - 8, oy + 17, "(" + origin.x + "," + origin.y + ")", "end");
    return shell(body);
  }
  if (spec.type === "geometry") {
    if (!validPoints(spec.points) || spec.points.length < 2 || !Array.isArray(spec.edges) || spec.edges.length > 40) return "";
    const points = spec.points as DiagramPoint[];
    const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
    const xMin = Math.min(...xs), xMax = Math.max(...xs), yMin = Math.min(...ys), yMax = Math.max(...ys);
    const rawWidth = xMax - xMin || 1, rawHeight = yMax - yMin || 1;
    const scale = Math.min((W - PAD * 2 - 28) / rawWidth, (H - PAD * 2 - 28) / rawHeight);
    const centerX = (xMin + xMax) / 2, centerY = (yMin + yMax) / 2;
    const project = (p: DiagramPoint) => ({
      x: W / 2 + (p.x - centerX) * scale,
      y: H / 2 - (p.y - centerY) * scale,
    });
    let body = "";
    for (const edge of spec.edges as unknown[]) {
      if (!Array.isArray(edge) || edge.length !== 2 || !edge.every((n) => Number.isInteger(n) && n >= 0 && n < points.length)) continue;
      const a = project(points[edge[0] as number]), b = project(points[edge[1] as number]);
      body += line(a.x, a.y, b.x, b.y, 2.4);
    }
    for (const p of points) {
      const q = project(p);
      body += '<circle cx="' + q.x + '" cy="' + q.y + '" r="3" fill="' + ink + '"/>';
      if (p.label) body += label(clamp(q.x + 8, PAD, W-PAD), clamp(q.y - 8, PAD+12, H-PAD), p.label, "start");
    }
    if (Array.isArray(spec.circles)) for (const c of spec.circles.slice(0, 8)) {
      if (!c || ![c.cx,c.cy,c.r].every(finite) || c.r <= 0) continue;
      const center = project({x:c.cx,y:c.cy});
      const radius = c.r * scale;
      body += '<circle cx="' + center.x + '" cy="' + center.y + '" r="' + radius + '" fill="none" stroke="' + ink + '" stroke-width="2"/>';
      if (c.label) body += label(center.x, clamp(center.y - radius - 6, PAD+12, H-PAD), c.label);
    }
    return shell(body);
  }
  if (spec.type === "circuit") {
    const nodes = spec.nodes;
    const components = spec.components;
    if (!Array.isArray(nodes) || nodes.length < 2 || nodes.length > 20 ||
      !nodes.every((n) => n && finite(n.x) && finite(n.y) && (!("label" in n) || typeof n.label === "string")) ||
      !Array.isArray(components) || components.length < 1 || components.length > 30) return "";
    if (!components.every((c) => c && ["wire","resistor","battery","lamp","switch","capacitor"].includes(c.kind) &&
      Number.isInteger(c.from) && Number.isInteger(c.to) && c.from >= 0 && c.to >= 0 &&
      c.from < nodes.length && c.to < nodes.length && c.from !== c.to &&
      (!("label" in c) || typeof c.label === "string"))) return "";
    const xs = nodes.map((n: any) => n.x), ys = nodes.map((n: any) => n.y);
    const xMin = Math.min(...xs), xMax = Math.max(...xs), yMin = Math.min(...ys), yMax = Math.max(...ys);
    const rawWidth = xMax - xMin || 1, rawHeight = yMax - yMin || 1;
    const scale = Math.min((W - PAD * 2 - 32) / rawWidth, (H - PAD * 2 - 32) / rawHeight);
    const cx = (xMin + xMax) / 2, cy = (yMin + yMax) / 2;
    const project = (p: {x:number;y:number}) => ({ x: W/2 + (p.x-cx)*scale, y: H/2 - (p.y-cy)*scale });
    let body = "";
    for (const component of components as Array<{kind:string;from:number;to:number;label?:string}>) {
      const a = project(nodes[component.from] as any), b = project(nodes[component.to] as any);
      const dx = b.x-a.x, dy = b.y-a.y, length = Math.hypot(dx,dy);
      if (length < 18) continue;
      const ux=dx/length, uy=dy/length, px=-uy, py=ux, mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
      const half = Math.min(28, length*0.22);
      const p1={x:mid.x-ux*half,y:mid.y-uy*half}, p2={x:mid.x+ux*half,y:mid.y+uy*half};
      body += line(a.x,a.y,p1.x,p1.y,2) + line(p2.x,p2.y,b.x,b.y,2);
      if (component.kind === "wire") body += line(p1.x,p1.y,p2.x,p2.y,2);
      if (component.kind === "resistor") {
        const pts=[p1];
        for(let i=1;i<=6;i++){const t=i/7;pts.push({x:p1.x+ux*(2*half*t)+px*(i%2?7:-7),y:p1.y+uy*(2*half*t)+py*(i%2?7:-7)});}
        pts.push(p2);
        body += '<polyline points="'+pts.map(p=>p.x.toFixed(1)+","+p.y.toFixed(1)).join(" ")+'" fill="none" stroke="'+ink+'" stroke-width="2.2" stroke-linejoin="round"/>';
      }
      if (component.kind === "battery") {
        body += line(mid.x-px*12,mid.y-py*12,mid.x+px*12,mid.y+py*12,2.5);
        body += line(mid.x+ux*7-px*7,mid.y+uy*7-py*7,mid.x+ux*7+px*7,mid.y+uy*7+py*7,2.5);
        body += label(mid.x+px*19,mid.y+py*19,"+");
      }
      if (component.kind === "lamp") {
        body += '<circle cx="'+mid.x+'" cy="'+mid.y+'" r="11" fill="white" stroke="'+ink+'" stroke-width="2"/>';
        body += line(mid.x-6,mid.y-6,mid.x+6,mid.y+6,1.8)+line(mid.x-6,mid.y+6,mid.x+6,mid.y-6,1.8);
      }
      if (component.kind === "capacitor") {
        body += line(mid.x-px*12-ux*4,mid.y-py*12-uy*4,mid.x+px*12-ux*4,mid.y+py*12-uy*4,2.2);
        body += line(mid.x-px*12+ux*4,mid.y-py*12+uy*4,mid.x+px*12+ux*4,mid.y+py*12+uy*4,2.2);
      }
      if (component.kind === "switch") {
        body += '<circle cx="'+p1.x+'" cy="'+p1.y+'" r="2.7" fill="'+ink+'"/><circle cx="'+p2.x+'" cy="'+p2.y+'" r="2.7" fill="'+ink+'"/>';
        body += line(p1.x,p1.y,p2.x-ux*8-px*7,p2.y-uy*8-py*7,2.2);
      }
      if (component.label) body += label(mid.x+px*17,mid.y+py*17,component.label);
    }
    for (const node of nodes as Array<{x:number;y:number;label?:string}>) {
      const p=project(node);
      body += '<circle cx="'+p.x+'" cy="'+p.y+'" r="3" fill="'+ink+'"/>';
      if(node.label) body += label(p.x+7,p.y-8,node.label,"start");
    }
    return shell(body);
  }
  return "";
}
