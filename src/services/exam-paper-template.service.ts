import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface ExamPaperQuestion {
  number: number;
  text: string;
  score: number;
  section?: string;
  answerLines?: number;
  figureSvg?: string;
  figureAlt?: string;
}

export interface ExamPaperData {
  examTitle: string;
  subject: string;
  grade: string;
  field?: string;
  duration: string;
  totalScore: number;
  examDate?: string;
  studentName?: string;
  school?: string;
  className?: string;
  teacher?: string;
  questions: ExamPaperQuestion[];
}

const TEMPLATE_PATH = join(process.cwd(), "src", "templates", "exam-paper.template.html");

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] ?? char);
}

const faDigits = (value: unknown): string =>
  String(value ?? "").replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]).replace(/\./g, "/");

function renderQuestionText(value: string, languageMode = false): string {
  const source = String(value ?? "").replace(/`([^`\n]+)`/g, "$1");
  if (languageMode) {
    return source.split(/\r?\n/).map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '<div class="language-spacer"></div>';
      const isOption = /^(?:[A-Da-d][).:]|[A-Da-d]\s+-)/.test(trimmed);
      const latin = (trimmed.match(/[A-Za-z]/g) ?? []).length;
      const letters = (trimmed.match(/[A-Za-z\u0600-\u06FF]/g) ?? []).length;
      const isEnglish = latin >= 3 && latin / Math.max(1, letters) >= 0.55;
      if (isOption) return '<div class="language-option" dir="ltr" lang="en">' + escapeHtml(trimmed) + '</div>';
      if (isEnglish) return '<div class="language-english-line" dir="ltr" lang="en">' + escapeHtml(trimmed) + '</div>';
      return '<div class="language-persian-line" dir="rtl" lang="fa">' + escapeHtml(trimmed) + '</div>';
    }).join("");
  }
  const parts = source.split(/(\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$|\$(?!\$)[^\n$]+\$)/g);
  return parts.map((part) => {
    if (part.startsWith("\\(") && part.endsWith("\\)")) return '<span class="math-inline">' + part + "</span>";
    if (part.startsWith("\\[") && part.endsWith("\\]")) return '<div class="math-display">' + part + "</div>";
    if (part.startsWith("$$") && part.endsWith("$$")) return '<div class="math-display">\\[' + part.slice(2, -2) + '\\]</div>';
    if (part.startsWith("$") && part.endsWith("$")) return '<span class="math-inline">\\(' + part.slice(1, -1) + '\\)</span>';
    return escapeHtml(part).replace(/\r?\n/g, "<br>");
  }).join("");
}

const allowedSvgTags = new Set(["svg", "g", "line", "path", "rect", "circle", "ellipse", "polygon", "polyline", "text", "tspan", "defs", "marker"]);
const allowedSvgAttributes = new Set([
  "xmlns", "viewBox", "width", "height", "x", "y", "x1", "x2", "y1", "y2", "cx", "cy", "r", "rx", "ry",
  "d", "points", "fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-dasharray",
  "font-size", "font-family", "font-weight", "text-anchor", "dominant-baseline", "transform", "opacity",
  "markerWidth", "markerHeight", "refX", "refY", "orient", "markerUnits", "marker-start", "marker-mid", "marker-end"
]);

function sanitizeQuestionSvg(value: string): string {
  let source = String(value ?? "").trim().replace(/^`{3}(?:svg|xml)?\s*/i, "").replace(/\s*`{3}$/, "");
  if (!source || source.length > 16000 || !/<svg\b/i.test(source) || !/<\/svg\s*>/i.test(source)) return "";
  source = source.replace(/<!--[\s\S]*?-->/g, "");
  const token = /<\/?([a-z][a-z0-9:-]*)\b([^>]*)>/gi;
  let output = "";
  let cursor = 0;
  for (const match of source.matchAll(token)) {
    const index = match.index ?? 0;
    output += escapeHtml(source.slice(cursor, index));
    cursor = index + match[0].length;
    const tag = match[1].toLowerCase();
    if (!allowedSvgTags.has(tag)) continue;
    if (/^<\//.test(match[0])) {
      output += `</${tag}>`;
      continue;
    }
    const attrs: string[] = [];
    const attrPattern = /([a-zA-Z_:][a-zA-Z0-9:_.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    for (const attr of match[2].matchAll(attrPattern)) {
      const name = attr[1], normalizedName = name.toLowerCase();
      let attrValue = attr[2] ?? attr[3] ?? "";
      if (![...allowedSvgAttributes].some((item) => item.toLowerCase() === normalizedName)) continue;
      if (normalizedName === "xmlns" && attrValue !== "http://www.w3.org/2000/svg") continue;
      if (normalizedName === "stroke" && attrValue.toLowerCase() !== "none") attrValue = "#111";
      if (normalizedName === "fill" && !["none", "#fff", "#ffffff"].includes(attrValue.toLowerCase())) attrValue = "#111";
      if (["marker-start", "marker-mid", "marker-end"].includes(normalizedName) && !/^url\(#[a-zA-Z0-9_-]+\)$/.test(attrValue)) continue;
      if (/url\s*\(|javascript:|data:|https?:|\\/i.test(attrValue) && !["marker-start", "marker-mid", "marker-end"].includes(normalizedName)) continue;
      attrs.push(`${name}="${escapeHtml(attrValue)}"`);
    }
    output += `<${tag}${attrs.length ? " " + attrs.join(" ") : ""}${/\/\s*>$/.test(match[0]) ? "/>" : ">" }`;
  }
  output += escapeHtml(source.slice(cursor));
  return output.includes("<svg") ? output : "";
}

const iconPaths: Record<string, string> = {
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  school: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5M9 10h.01M15 10h.01"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20v-1a5 5 0 0 1 5-5h3a5 5 0 0 1 5 5v1M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20v-1a5 5 0 0 0-3.5-4.7"/>',
  board: '<path d="M3 5h18v11H3zM8 21h8M12 16v5"/>',
  book: '<path d="M12 6.5C10.5 5 8 4.5 4 4.5v14c4 0 6.5.5 8 2 1.5-1.5 4-2 8-2v-14c-4 0-6.5.5-8 2zM12 6.5v14"/>',
  cap: '<path d="M2 9l10-5 10 5-10 5zM6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5M22 9v6"/>',
  cal: '<rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M8 2.5v4M16 2.5v4M3 10h18"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
};

function svgIcon(name: string): string {
  return '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + (iconPaths[name] ?? "") + "</svg>";
}

function renderStudentInfo(data: ExamPaperData): string {
  const fields: Array<[string, string, string]> = [
    ["نام و نام خانوادگی", data.studentName ?? "", "user"],
    ["مدرسه", data.school ?? "", "school"],
    ["کلاس", data.className ?? "", "users"],
    ["نام دبیر", data.teacher ?? "", "board"],
    ["نام درس", data.subject, "book"],
    ["پایه", data.grade, "cap"],
    ["تاریخ آزمون", data.examDate ?? "", "cal"],
    ["رشته", data.field ?? "", "layers"],
  ];
  return fields.map(([label, value, icon]) =>
    '<div class="f">' + svgIcon(icon) + '<div><span>' + escapeHtml(label) +
    '</span><b>' + escapeHtml(value) + "</b></div></div>"
  ).join("\n");
}

function renderQuestionBlocks(questions: ExamPaperQuestion[], languageMode = false): string {
  let currentSection = "";
  return questions.map((question) => {
    const section = question.section?.trim() ?? "";
    const sectionMarkup = section && section !== currentSection
      ? (currentSection = section, '<div class="sec">' + svgIcon("bookmark") +
          '<span class="st">' + escapeHtml(section) + "</span></div>")
      : "";
    const lines = Math.max(1, Math.min(8, Math.floor(question.answerLines ?? 2)));
    const answerLines = '<div class="ans" style="height:' + (lines * 22) + 'px"></div>';
    const figureSvg = question.figureSvg ? sanitizeQuestionSvg(question.figureSvg) : "";
    const figureMarkup = figureSvg
      ? '<figure class="question-figure">' + figureSvg +
        (question.figureAlt ? '<figcaption>' + escapeHtml(question.figureAlt) + "</figcaption>" : "") + "</figure>"
      : "";
    const questionContentClass = figureMarkup ? "question-content has-figure" : "question-content";
    return sectionMarkup + '\n<div class="q">' +
      '<div class="n"></div>' +
      '<div><div class="' + questionContentClass + '"><div class="qt">' + renderQuestionText(question.text, languageMode) + "</div>" + figureMarkup + "</div>" + answerLines + "</div>" +
      '<div class="b"><span class="bv">' + escapeHtml(faDigits(question.score)) + "</span></div>" +
      "</div>";
  }).join("\n");
}

/** Render questions inside the exact HTML template supplied by the user. */
export async function renderExamPaperHtml(data: ExamPaperData): Promise<string> {
  if (!data.questions.length) throw new Error("Exam paper must contain at least one question.");
  const scoreSum = data.questions.reduce((sum, question) => sum + question.score, 0);
  if (Math.abs(scoreSum - data.totalScore) > 0.001) {
    throw new Error("Question scores (" + scoreSum + ") do not equal the declared total (" + data.totalScore + ").");
  }
  const languageMode = /(?:زبان|انگلیسی|english)/i.test(data.subject + " " + data.examTitle);
  const template = await readFile(TEMPLATE_PATH, "utf8");
  const values: Record<string, string> = {
    documentTitle: escapeHtml(data.examTitle),
    subjectClass: languageMode ? "language-exam" : "",
    examTitle: escapeHtml(data.examTitle),
    subject: escapeHtml(data.subject),
    grade: escapeHtml(data.grade),
    field: escapeHtml(data.field ?? ""),
    duration: escapeHtml(data.duration),
    totalScore: escapeHtml(faDigits(data.totalScore)),
    studentName: escapeHtml(data.studentName ?? ""),
    school: escapeHtml(data.school ?? ""),
    className: escapeHtml(data.className ?? ""),
    teacher: escapeHtml(data.teacher ?? ""),
    examDate: escapeHtml(data.examDate ?? ""),
    questionBlocks: renderQuestionBlocks(data.questions, languageMode),
  };
  return template.replace(/\{\{([a-zA-Z]+)\}\}/g, (_match, key: string) => values[key] ?? "");
}
