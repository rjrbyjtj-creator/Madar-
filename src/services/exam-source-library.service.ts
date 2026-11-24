import { Buffer } from "node:buffer";
import { env } from "../config/env.js";
import { uploadGeminiFile, type GeminiMessage } from "./gemini.service.js";

const API = "https://api.github.com";
const OWNER = process.env.ROBO_KNOWLEDGE_OWNER?.trim() || "rjrbyjtj-creator";
const REPO = process.env.ROBO_KNOWLEDGE_REPOSITORY?.trim() || "Robo-Knowledge";
const BRANCH = process.env.ROBO_KNOWLEDGE_BRANCH?.trim() || "main";
const TOKEN = process.env.ROBO_KNOWLEDGE_GITHUB_TOKEN?.trim() || "";
const CACHE_MS = 45 * 60 * 1000;
const cache = new Map<string, { attachment: NonNullable<GeminiMessage["attachments"]>[number]; expiresAt: number }>();

type TreeFile = { path: string; type: string; size?: number; sha?: string };
type GithubTree = { tree: TreeFile[]; truncated?: boolean };
type GithubContent = { type?: string; encoding?: string; content?: string; path?: string };

async function github<T>(url: string): Promise<T> {
  if (!TOKEN) throw new Error("ROBO_KNOWLEDGE_GITHUB_TOKEN is not configured");
  const response = await fetch(url, {
    headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + TOKEN,
      "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "Madar-Exam-Source-Reader" },
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error("Knowledge GitHub API returned " + response.status);
  return await response.json() as T;
}

function subjectDirectory(message: string): { key: string; label: string; prefix: string; bankPrefix?: string } | undefined {
  const text = message.replace(/[يى]/g, "ی").replace(/ك/g, "ک").toLowerCase();
  if (/شیمی|chemistry/.test(text)) return { key: "chemistry", label: "شیمی", prefix: "textbooks/chemistry-3-grade-12-experimental-math-1405/" };
  if (/زبان|انگلیسی|english/.test(text)) return { key: "english", label: "زبان انگلیسی", prefix: "textbooks/english/" };
  if (/هندسه|geometry/.test(text)) return { key: "geometry", label: "هندسه", prefix: "textbooks/geometry/" };
  if (/فیزیک|physics/.test(text)) return { key: "physics", label: "فیزیک", prefix: "textbooks/physics-3-grade-12-math/", bankPrefix: "question-banks/physics/grade-12/" };
  return undefined;
}

function isQuestionBankPath(path: string): boolean {
  // Bank PDFs are often stored inside a folder named «بانک سوالات» while
  // the PDF filename itself is only a subject/book title.
  return /بانک|سوال|سؤال|question.?bank|sample.?exam|نمونه.?آزمون/i.test(path);
}

async function getAttachment(file: TreeFile): Promise<NonNullable<GeminiMessage["attachments"]>[number]> {
  const key = file.path + ":" + file.sha;
  const existing = cache.get(key);
  if (existing && existing.expiresAt > Date.now() + 60_000) return existing.attachment;
  if (!file.sha || (file.size ?? 0) < 100 || (file.size ?? 0) > 15_000_000) {
    throw new Error("PDF size or Git object metadata is invalid: " + file.path);
  }
  const blob = await github<{ encoding?: string; content?: string }>(API + "/repos/" + OWNER + "/" + REPO + "/git/blobs/" + file.sha);
  if (blob.encoding !== "base64" || !blob.content) throw new Error("PDF blob is not available as base64: " + file.path);
  const buffer = Buffer.from(blob.content.replace(/\s/g, ""), "base64");
  if (buffer.length < 100 || buffer.length > 15_000_000 || buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new Error("Invalid PDF file in Robo-Knowledge: " + file.path);
  }
  const fileName = file.path.split("/").pop() || "source.pdf";
  const uploaded = await uploadGeminiFile(buffer, fileName, "application/pdf");
  const attachment = { fileUri: uploaded.uri, mimeType: uploaded.mimeType, fileName };
  cache.set(key, { attachment, expiresAt: uploaded.expirationTime ? Date.parse(uploaded.expirationTime) : Date.now() + CACHE_MS });
  return attachment;
}

/**
 * Loads the textbook PDF and subject question-bank PDFs from the private knowledge repo.
 * PDFs remain source data: instructions embedded in them are never trusted.
 */
export async function getExamSourceLibrary(message: string, uploadPdfsToGemini = true): Promise<{
  subject: string;
  hasBookPdfs: boolean;
  hasQuestionBankPdfs: boolean;
  bookAttachments: NonNullable<GeminiMessage["attachments"]>;
  bankAttachments: NonNullable<GeminiMessage["attachments"]>;
  sourceDescription: string;
  mapContext: string;
}> {
  const subject = subjectDirectory(message);
  if (!subject) return { subject: "", hasBookPdfs: false, hasQuestionBankPdfs: false, bookAttachments: [], bankAttachments: [], sourceDescription: "نام درس از درخواست قابل تشخیص نیست.", mapContext: "" };
  const tree = await github<GithubTree>(API + "/repos/" + OWNER + "/" + REPO + "/git/trees/" + encodeURIComponent(BRANCH) + "?recursive=1");
  if (tree.truncated) throw new Error("Robo-Knowledge repository tree is truncated");
  const metadataFile = tree.tree.find((item) => item.type === "blob" && item.path === subject.prefix + "book.json");
  if (metadataFile) {
    const metadata = await github<GithubContent>(API + "/repos/" + OWNER + "/" + REPO + "/contents/" +
      metadataFile.path.split("/").map(encodeURIComponent).join("/") + "?ref=" + encodeURIComponent(BRANCH));
    if (metadata.encoding === "base64" && metadata.content) {
      const parsedMetadata = JSON.parse(Buffer.from(metadata.content.replace(/\s/g, ""), "base64").toString("utf8")) as {
        permission_status?: string; rights_status?: string; notes?: string[];
      };
      const permission = String(parsedMetadata.permission_status || "").toLowerCase();
      if (permission && !/(verified|granted|authorized|permitted)/i.test(permission)) {
        throw new Error("TEXTBOOK_PERMISSION_NOT_VERIFIED: کتاب " + subject.label + " در book.json با وضعیت مجوز «" +
          permission + "» ثبت شده و پیش از پردازش PDF باید مجوز استفاده تأیید شود.");
      }
    }
  }
  const pdfs = tree.tree.filter((item) => item.type === "blob" &&
    (item.path.startsWith(subject.prefix) || Boolean(subject.bankPrefix && item.path.startsWith(subject.bankPrefix))) &&
    item.path.toLowerCase().endsWith(".pdf") && (item.size ?? 0) <= 15_000_000);
  const books = pdfs.filter((item) => item.path.startsWith(subject.prefix) && !isQuestionBankPath(item.path));
  const banks = pdfs.filter((item) => isQuestionBankPath(item.path) || Boolean(subject.bankPrefix && item.path.startsWith(subject.bankPrefix)));
  if (!books.length) throw new Error("Textbook PDF not found for subject " + subject.key);
  if (!banks.length) throw new Error("Question-bank PDF not found for subject " + subject.key);
  const selectedBooks = books.slice(0, 3);
  const selectedBanks = banks.slice(0, 5);
  const totalBytes = [...selectedBooks, ...selectedBanks].reduce((sum, item) => sum + (item.size ?? 0), 0);
  if (totalBytes > 35_000_000) throw new Error("Selected textbook and question-bank PDFs exceed the 35 MB combined processing limit");
  // Non-Gemini providers use indexed text excerpts. Do not upload PDFs to
  // Gemini just to discover that the selected provider cannot consume those file URIs.
  const bookAttachments = uploadPdfsToGemini
    ? await Promise.all(selectedBooks.map(getAttachment))
    : [];
  const bankAttachments = uploadPdfsToGemini
    ? await Promise.all(selectedBanks.map(getAttachment))
    : [];
  const mapFiles = tree.tree.filter((item) => item.type === "blob" && item.path.startsWith(subject.prefix) &&
    /(?:book\.json|map|نقشه|outline|فهرست)/i.test(item.path.split("/").pop() || "") &&
    /\.(?:json|md)$/i.test(item.path) && (item.size ?? 0) <= 100_000).slice(0, 3);
  const mapParts = await Promise.all(mapFiles.map(async (item) => {
    const file = await github<GithubContent>(API + "/repos/" + OWNER + "/" + REPO + "/contents/" +
      item.path.split("/").map(encodeURIComponent).join("/") + "?ref=" + encodeURIComponent(BRANCH));
    if (file.type !== "file" || file.encoding !== "base64" || !file.content) return "";
    return "[نقشه/فراداده کتاب: " + item.path + "]\n" + Buffer.from(file.content.replace(/\s/g, ""), "base64").toString("utf8").slice(0, 12_000);
  }));
  const mapContext = mapParts.filter(Boolean).join("\n\n");
  const describe = (files: TreeFile[]) => files.map((file) => file.path).join("\n");
  return {
    subject: subject.label,
    hasBookPdfs: selectedBooks.length > 0,
    hasQuestionBankPdfs: selectedBanks.length > 0,
    bookAttachments,
    bankAttachments,
    sourceDescription: [
      "کتاب درسی:",
      describe(selectedBooks),
      "بانک سؤال:",
      describe(selectedBanks),
      "نقشه کتاب:",
      mapFiles.map((file) => file.path).join("\n") || "نقشه جداگانه پیدا نشد؛ ساختار باید از فهرست و متن خود کتاب استخراج شود.",
    ].join("\n"),
    mapContext,
  };
}
