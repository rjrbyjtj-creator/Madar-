import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";

type Atom = string | number | null | Buffer;
export type QuestionBankItem = {
  id: string; question: string; subject: string; grade: string; chapter: string;
  questionType: string; difficulty: string; source: string; createdAt: string;
};
export type QuestionBankFile = {
  id: string; fileName: string; mimeType: string; fileSize: number; subject: string;
  grade: string; chapter: string; questionCount: number; createdAt: string;
};
const ITEM_COLS = "id,question,subject,grade,chapter,question_type,difficulty,source,created_at";
function config() {
  const raw = env.TURSO_DATABASE_URL.trim(), token = env.TURSO_AUTH_TOKEN.trim();
  if (!raw || !token) throw new Error("Turso database is not configured");
  const url = raw.replace(/^libsql:\/\//i, "https://").replace(/^wss:\/\//i, "https://").replace(/^ws:\/\//i, "http://").replace(/\/+$/, "");
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(parsed.hostname)) throw new Error("Turso URL must use HTTPS");
  return { url: parsed.origin, token };
}
function encode(value: Atom) {
  if (value === null || value === undefined) return { type: "null" };
  if (Buffer.isBuffer(value)) return { type: "blob", base64: value.toString("base64") };
  if (typeof value === "number") return Number.isInteger(value) ? { type: "integer", value: String(value) } : { type: "float", value };
  return { type: "text", value: String(value) };
}
async function pipeline(requests: any[]) {
  const { url, token } = config();
  const response = await fetch(url + "/v3/pipeline", {
    method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ baton: null, requests: [...requests, { type: "close" }] }),
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) throw new Error("Turso HTTP " + response.status);
  const data = await response.json() as any, first = data.results?.[0];
  if (!first || first.type !== "ok") throw new Error(first?.error?.message || "Turso SQL failed");
  return first.response;
}
async function execute(sql: string, args: Atom[] = [], rows = true) {
  return (await pipeline([{ type: "execute", stmt: { sql, args: args.map(encode), want_rows: rows } }])).result;
}
async function batch(entries: Array<{ sql: string; args: Atom[] }>) {
  for (let i = 0; i < entries.length; i += 4) {
    const result = await pipeline([{ type: "batch", batch: { steps: entries.slice(i, i + 4).map(entry => ({ stmt: { sql: entry.sql, args: entry.args.map(encode), want_rows: false } })) } }]);
    const error = result.result?.step_errors?.find((item: any) => item);
    if (error) throw new Error(error.message || "Turso batch failed");
  }
}
function rows(result: any): Array<Record<string, any>> {
  const names = (result.cols || []).map((col: any) => String(col.name));
  return (result.rows || []).map((row: any[]) => {
    const output: Record<string, any> = {};
    names.forEach((name: string, index: number) => {
      const value = row[index];
      output[name] = !value || value.type === "null" ? null : value.type === "text" ? String(value.value) :
        value.type === "blob" ? Buffer.from(String(value.base64 || ""), "base64") : Number(value.value);
    });
    return output;
  });
}
function mapItem(row: Record<string, any>): QuestionBankItem {
  return { id: String(row.id), question: String(row.question), subject: String(row.subject), grade: String(row.grade),
    chapter: String(row.chapter || ""), questionType: String(row.question_type || "ترکیبی"),
    difficulty: String(row.difficulty || "متوسط"), source: String(row.source || ""), createdAt: String(row.created_at) };
}
function mapFile(row: Record<string, any>): QuestionBankFile {
  return { id: String(row.id), fileName: String(row.file_name), mimeType: String(row.mime_type),
    fileSize: Number(row.file_size), subject: String(row.subject), grade: String(row.grade),
    chapter: String(row.chapter || ""), questionCount: Number(row.question_count || 0), createdAt: String(row.created_at) };
}
export async function initializeQuestionBankStore() {
  if (!env.TURSO_DATABASE_URL.trim() || !env.TURSO_AUTH_TOKEN.trim()) {
    console.warn("[QUESTION_BANK] Turso not configured; question bank storage unavailable");
    return;
  }
  await execute("CREATE TABLE IF NOT EXISTS question_bank_items (id TEXT PRIMARY KEY,question TEXT NOT NULL,subject TEXT NOT NULL,grade TEXT NOT NULL CHECK(grade IN ('10','11','12')),chapter TEXT NOT NULL DEFAULT '',question_type TEXT NOT NULL DEFAULT 'ترکیبی',difficulty TEXT NOT NULL DEFAULT 'متوسط',source TEXT NOT NULL DEFAULT '',is_active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL)", [], false);
  await execute("CREATE INDEX IF NOT EXISTS idx_qbank_grade_subject ON question_bank_items(is_active,grade,subject,chapter)", [], false);
  await execute("CREATE INDEX IF NOT EXISTS idx_qbank_created ON question_bank_items(is_active,created_at DESC)", [], false);
  await execute("CREATE TABLE IF NOT EXISTS question_bank_files (id TEXT PRIMARY KEY,file_name TEXT NOT NULL,mime_type TEXT NOT NULL,file_size INTEGER NOT NULL,subject TEXT NOT NULL,grade TEXT NOT NULL CHECK(grade IN ('10','11','12')),chapter TEXT NOT NULL DEFAULT '',question_count INTEGER NOT NULL DEFAULT 0,is_active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL)", [], false);
  await execute("CREATE INDEX IF NOT EXISTS idx_qbank_files_grade_subject ON question_bank_files(is_active,grade,subject,created_at DESC)", [], false);
  await execute("CREATE TABLE IF NOT EXISTS question_bank_file_chunks (file_id TEXT NOT NULL,chunk_index INTEGER NOT NULL,data BLOB NOT NULL,PRIMARY KEY(file_id,chunk_index))", [], false);
  console.info("[QUESTION_BANK] Turso tables ready (separate from music tables)");
}
export async function addQuestionItem(input: Omit<QuestionBankItem, "id" | "createdAt">) {
  const id = randomUUID(), now = new Date().toISOString();
  await execute("INSERT INTO question_bank_items(id,question,subject,grade,chapter,question_type,difficulty,source,is_active,created_at) VALUES(?,?,?,?,?,?,?,?,1,?)",
    [id,input.question,input.subject,input.grade,input.chapter,input.questionType,input.difficulty,input.source,now], false);
  return { ...input, id, createdAt: now };
}
export async function listQuestionItems(filters: { q?: string; grade?: string; subject?: string; chapter?: string; limit?: number } = {}) {
  const where = ["is_active=1"], args: Atom[] = [];
  if (filters.grade) { where.push("grade=?"); args.push(filters.grade); }
  if (filters.subject) { where.push("subject=?"); args.push(filters.subject); }
  if (filters.chapter) { where.push("chapter LIKE ?"); args.push("%" + filters.chapter + "%"); }
  if (filters.q) { where.push("(question LIKE ? OR chapter LIKE ? OR source LIKE ?)"); const p = "%" + filters.q.slice(0, 100) + "%"; args.push(p,p,p); }
  const result = await execute("SELECT " + ITEM_COLS + " FROM question_bank_items WHERE " + where.join(" AND ") + " ORDER BY created_at DESC LIMIT " + Math.min(500, Math.max(1, filters.limit || 300)), args);
  return rows(result).map(mapItem);
}
export async function questionBankFacets() {
  const [grades, subjects, total, files] = await Promise.all([
    execute("SELECT grade,COUNT(*) AS count FROM question_bank_items WHERE is_active=1 GROUP BY grade ORDER BY grade"),
    execute("SELECT grade,subject,COUNT(*) AS count FROM question_bank_items WHERE is_active=1 GROUP BY grade,subject ORDER BY grade,subject"),
    execute("SELECT COUNT(*) AS count FROM question_bank_items WHERE is_active=1"),
    execute("SELECT COUNT(*) AS count FROM question_bank_files WHERE is_active=1"),
  ]);
  return { total: Number(rows(total)[0]?.count || 0), fileCount: Number(rows(files)[0]?.count || 0),
    grades: rows(grades).map(x => ({ grade: String(x.grade), count: Number(x.count) })),
    subjects: rows(subjects).map(x => ({ grade: String(x.grade), subject: String(x.subject), count: Number(x.count) })) };
}
export async function deactivateQuestionItem(id: string) {
  const result = await execute("UPDATE question_bank_items SET is_active=0 WHERE id=? AND is_active=1", [id], false);
  return Number(result.affected_row_count || 0) > 0;
}
const FILE_CHUNK_SIZE = 256 * 1024;
export async function saveQuestionBankFile(input: { fileName: string; mimeType: string; subject: string; grade: string; chapter: string; buffer: Buffer; questionCount: number }) {
  if (!Buffer.isBuffer(input.buffer) || input.buffer.length < 1) throw new Error("Empty file");
  if (input.buffer.length > 25 * 1024 * 1024) throw new Error("Question bank file exceeds 25 MB");
  const id = randomUUID(), now = new Date().toISOString();
  await execute("INSERT INTO question_bank_files(id,file_name,mime_type,file_size,subject,grade,chapter,question_count,is_active,created_at) VALUES(?,?,?,?,?,?,?,?,1,?)",
    [id,input.fileName,input.mimeType,input.buffer.length,input.subject,input.grade,input.chapter,input.questionCount,now], false);
  const chunks: Array<{sql:string;args:Atom[]}> = [];
  for (let offset=0,index=0;offset<input.buffer.length;offset+=FILE_CHUNK_SIZE,index++) {
    chunks.push({ sql:"INSERT INTO question_bank_file_chunks(file_id,chunk_index,data) VALUES(?,?,?)",
      args:[id,index,input.buffer.subarray(offset,Math.min(offset+FILE_CHUNK_SIZE,input.buffer.length))] });
  }
  try { await batch(chunks); }
  catch (error) { await execute("DELETE FROM question_bank_files WHERE id=?",[id],false).catch(()=>{}); await execute("DELETE FROM question_bank_file_chunks WHERE file_id=?",[id],false).catch(()=>{}); throw error; }
  return { id,fileName:input.fileName,mimeType:input.mimeType,fileSize:input.buffer.length,subject:input.subject,grade:input.grade,chapter:input.chapter,questionCount:input.questionCount,createdAt:now };
}
export async function listQuestionBankFiles(filters: { grade?: string; subject?: string } = {}) {
  const where=["is_active=1"],args:Atom[]=[];
  if(filters.grade){where.push("grade=?");args.push(filters.grade);}
  if(filters.subject){where.push("subject=?");args.push(filters.subject);}
  return rows(await execute("SELECT id,file_name,mime_type,file_size,subject,grade,chapter,question_count,created_at FROM question_bank_files WHERE "+where.join(" AND ")+" ORDER BY created_at DESC LIMIT 300",args)).map(mapFile);
}
export async function deactivateQuestionBankFile(id:string) {
  const result=await execute("UPDATE question_bank_files SET is_active=0 WHERE id=? AND is_active=1",[id],false);
  return Number(result.affected_row_count||0)>0;
}
export async function retrieveQuestionBankContext(input: { message: string; subject?: string; grade?: string; limit?: number }) {
  const terms=[...new Set(input.message.normalize("NFKC").toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(term=>term.length>=3))].slice(0,8);
  const where=["is_active=1"],args:Atom[]=[];
  if(input.grade) {where.push("grade=?");args.push(input.grade);}
  if(input.subject) {where.push("subject=?");args.push(input.subject);}
  if(terms.length) {
    const matches=terms.slice(0,5).map(()=>"(question LIKE ? OR chapter LIKE ? OR subject LIKE ?)");
    where.push("("+matches.join(" OR ")+")");
    for(const term of terms.slice(0,5)){const p="%"+term+"%";args.push(p,p,p);}
  }
  const found=rows(await execute("SELECT "+ITEM_COLS+" FROM question_bank_items WHERE "+where.join(" AND ")+" ORDER BY created_at DESC LIMIT "+Math.min(8,Math.max(1,input.limit||6)),args)).map(mapItem);
  if(!found.length)return "";
  return "نمونه‌های مرتبط از بانک سؤال اختصاصی مدار (برای تحلیل سبک، تیپ و سطح؛ عیناً کپی نکن):\n"+found.map((item,index)=>
    (index+1)+". پایه "+item.grade+"؛ "+item.subject+"؛ "+(item.chapter||"بدون فصل")+"؛ تیپ "+item.questionType+"؛ دشواری "+item.difficulty+"\n"+item.question
  ).join("\n\n").slice(0,7000);
}
