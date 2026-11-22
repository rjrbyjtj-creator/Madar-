import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface ExamPaperQuestion {
  number: number;
  text: string;
  score: number;
  section?: string;
  answerLines?: number;
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

function renderQuestionText(value: string): string {
  // AI output occasionally wraps mathematical notation in inline code or omits
  // delimiters around units such as 5 \\mathrm{kg}; normalize both cases.
  const source = String(value ?? "")
    .replace(/`([^`\\n]+)`/g, "$1")
    .replace(/(^|[\\s(])(\\d+(?:[.,]\\d+)?)\\s*\\\\(?:mathrm|text)\\{([^{}]+)\\}/g,
      (_match, prefix: string, amount: string, unit: string) => prefix + "\\\\(" + amount + "\\\\,\\\\mathrm{" + unit + "}\\\\)");
  const parts = source.split(/(\\\\\\([\\s\\S]*?\\\\\\)|\\\\\\[[\\s\\S]*?\\\\\\]|\\$\\$[\\s\\S]*?\\$\\$|\\$(?!\\$)[^\\n$]+\\$)/g);
  return parts.map((part) => {
    if (part.startsWith("\\\\(") && part.endsWith("\\\\)")) return `<span class="math-inline">${part}</span>`;
    if (part.startsWith("\\\\[") && part.endsWith("\\\\]")) return `<div class="math-display">${part}</div>`;
    if (part.startsWith("$") && part.endsWith("$")) return `<div class="math-display">\\\\[${part.slice(2, -2)}\\\\]</div>`;
    if (part.startsWith("$") && part.endsWith("$")) return `<span class="math-inline">\\\\(${part.slice(1, -1)}\\\\)</span>`;
    return escapeHtml(part).replace(/\\r?\\n/g, "<br>");
  }).join("");
}

function renderQuestionBlocks(questions: ExamPaperQuestion[]): string {
  let currentSection = "";
  return questions.map((question) => {
    const section = question.section?.trim() ?? "";
    const sectionMarkup = section && section !== currentSection
      ? (currentSection = section, `<div class="section-title">${escapeHtml(section)}</div>`)
      : "";
    const lines = Math.max(1, Math.min(8, Math.floor(question.answerLines ?? 2)));
    const answerLines = Array.from({ length: lines }, () => '<div class="answer-line"></div>').join("");
    return `${sectionMarkup}
<div class="question">
  <div class="question-number">${escapeHtml(question.number)}</div>
  <div class="question-body"><div class="question-text">${renderQuestionText(question.text)}</div><div class="answer-lines">${answerLines}</div></div>
  <div class="question-score">${escapeHtml(question.score)}</div>
</div>`;
  }).join("\n");
}

/** Render the fixed Madar exam-paper design with newly generated question content. */
export async function renderExamPaperHtml(data: ExamPaperData): Promise<string> {
  if (!data.questions.length) throw new Error("Exam paper must contain at least one question.");
  const scoreSum = data.questions.reduce((sum, question) => sum + question.score, 0);
  if (Math.abs(scoreSum - data.totalScore) > 0.001) {
    throw new Error(`Question scores (${scoreSum}) do not equal the declared total (${data.totalScore}).`);
  }
  const template = await readFile(TEMPLATE_PATH, "utf8");
  const values: Record<string, string> = {
    documentTitle: data.examTitle,
    examTitle: data.examTitle,
    subject: data.subject,
    grade: data.grade,
    field: data.field ?? "",
    duration: data.duration,
    totalScore: String(data.totalScore),
    examDate: data.examDate ?? "",
    studentName: data.studentName ?? "",
    school: data.school ?? "",
    className: data.className ?? "",
    teacher: data.teacher ?? "",
    pageCount: "۱",
    questionBlocks: renderQuestionBlocks(data.questions),
  };
  return template.replace(/\{\{([a-zA-Z]+)\}\}/g, (_match, key: string) => values[key] ?? "");
}
