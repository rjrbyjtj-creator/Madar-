import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { Music } from "../models/Music.js";
export type MusicTrack={id:string;telegramFileId:string;title:string;artist:string;album:string;category:string;duration:number;fileName:string;mimeType:string;fileSize:number;createdAt:string};
type A=string|number|null|Buffer;
const C="id,telegram_file_id,title,artist,album,category,duration,file_name,mime_type,file_size,created_at";
function cfg(){const raw=env.TURSO_DATABASE_URL.trim(),token=env.TURSO_AUTH_TOKEN.trim();if(!raw||!token)throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required");const u=raw.replace(/^libsql:\/\//i,"https://").replace(/^wss:\/\//i,"https://").replace(/^ws:\/\//i,"http://").replace(/\/+$/,"");const p=new URL(u);if(p.protocol!=="https:"&&!["localhost","127.0.0.1"].includes(p.hostname))throw new Error("Turso URL must use HTTPS");return{url:p.origin,token};}
function enc(v:A){if(v===null||v===undefined)return{type:"null"};if(Buffer.isBuffer(v))return{type:"blob",base64:v.toString("base64")};if(typeof v==="number")return Number.isInteger(v)?{type:"integer",value:String(v)}:{type:"float",value:v};return{type:"text",value:String(v)};}
async function pipe(requests:any[]){const{url,token}=cfg();const r=await fetch(url+"/v3/pipeline",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({baton:null,requests:[...requests,{type:"close"}]}),signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error("Turso HTTP "+r.status);const d=await r.json() as any;const f=d.results?.[0];if(!f||f.type!=="ok")throw new Error(f?.error?.message||"Turso SQL request failed");return f.response;}
async function sql(q:string,a:A[]=[],rows=true){return(await pipe([{type:"execute",stmt:{sql:q,args:a.map(enc),want_rows:rows}}])).result;}
async function batch(xs:Array<{q:string;a:A[]}>){if(!xs.length)return;const r=await pipe([{type:"batch",batch:{steps:xs.map(x=>({stmt:{sql:x.q,args:x.a.map(enc),want_rows:false}}))}}]);const e=(r.result?.step_errors||[]).find((x:any)=>x);if(e)throw new Error(e.message||"Turso migration failed");}
function objs(r:any):Record<string,A>[] {const ns=(r.cols||[]).map((c:any)=>String(c.name));return(r.rows||[]).map((row:any[])=>{const o:Record<string,A>={};ns.forEach((n:string,i:number)=>{const v=row[i];o[n]=!v||v.type==="null"?null:v.type==="text"?String(v.value):v.type==="blob"?Buffer.from(String(v.base64||""),"base64"):Number(v.value);});return o;});}
function map(o:Record<string,A>):MusicTrack{return{id:String(o.id||""),telegramFileId:String(o.telegram_file_id||""),title:String(o.title||""),artist:String(o.artist||"نامشخص"),album:String(o.album||""),category:String(o.category||"عمومی"),duration:Number(o.duration||0),fileName:String(o.file_name||"track.mp3"),mimeType:String(o.mime_type||"audio/mpeg"),fileSize:Number(o.file_size||0),createdAt:String(o.created_at||"")};}
function iso(v:unknown){const d=v instanceof Date?v:new Date(String(v||""));return Number.isNaN(d.getTime())?new Date().toISOString():d.toISOString();}
export async function initializeMusicStore(){
 if(!env.TURSO_DATABASE_URL.trim()&&!env.TURSO_AUTH_TOKEN.trim()){console.info("[MUSIC_DB] Turso not configured yet");return;}cfg();
 await sql("CREATE TABLE IF NOT EXISTS music_tracks (id TEXT PRIMARY KEY,telegram_file_id TEXT NOT NULL,telegram_file_unique_id TEXT NOT NULL UNIQUE,title TEXT NOT NULL,artist TEXT NOT NULL DEFAULT 'نامشخص',album TEXT NOT NULL DEFAULT '',category TEXT NOT NULL DEFAULT 'عمومی',duration INTEGER NOT NULL,file_name TEXT NOT NULL,mime_type TEXT NOT NULL DEFAULT 'audio/mpeg',file_size INTEGER NOT NULL,caption TEXT NOT NULL DEFAULT '',uploaded_by_chat_id TEXT NOT NULL,uploaded_by_name TEXT NOT NULL DEFAULT '',telegram_message_id INTEGER,is_active INTEGER NOT NULL DEFAULT 1,play_count INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)",[],false);
 await sql("CREATE INDEX IF NOT EXISTS idx_music_active_created ON music_tracks(is_active,created_at DESC)",[],false);
 await sql("CREATE INDEX IF NOT EXISTS idx_music_active_category ON music_tracks(is_active,category,created_at DESC)",[],false);
 await sql("CREATE TABLE IF NOT EXISTS music_meta (key TEXT PRIMARY KEY,value TEXT NOT NULL)",[],false);
 await sql("CREATE TABLE IF NOT EXISTS music_audio_chunks (track_id TEXT NOT NULL,chunk_index INTEGER NOT NULL,data BLOB NOT NULL,PRIMARY KEY(track_id,chunk_index))",[],false);
 await sql("CREATE TABLE IF NOT EXISTS music_audio_files (track_id TEXT PRIMARY KEY,chunk_count INTEGER NOT NULL,byte_size INTEGER NOT NULL,updated_at TEXT NOT NULL)",[],false);
 if(objs(await sql("SELECT value FROM music_meta WHERE key=?",["mongo_music_migration_v1"])).length){console.info("[MUSIC_DB] Turso music store ready");return;}
 const old=await Music.find({}).sort({createdAt:1}).lean();
 const xs=old.map((t:any)=>({q:"INSERT OR IGNORE INTO music_tracks (id,telegram_file_id,telegram_file_unique_id,title,artist,album,category,duration,file_name,mime_type,file_size,caption,uploaded_by_chat_id,uploaded_by_name,telegram_message_id,is_active,play_count,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",a:[String(t._id),String(t.telegramFileId||""),String(t.telegramFileUniqueId||""),String(t.title||"آهنگ جدید"),String(t.artist||"نامشخص"),String(t.album||""),String(t.category||"عمومی"),Math.max(1,Number(t.duration||1)),String(t.fileName||"track.mp3"),String(t.mimeType||"audio/mpeg"),Math.max(1,Number(t.fileSize||1)),String(t.caption||""),String(t.uploadedByChatId||""),String(t.uploadedByName||""),t.telegramMessageId==null?null:Number(t.telegramMessageId),t.isActive===false?0:1,Math.max(0,Number(t.playCount||0)),iso(t.createdAt),iso(t.updatedAt||t.createdAt)] as A[]}));
 for(let i=0;i<xs.length;i+=80)await batch(xs.slice(i,i+80));
 await sql("INSERT OR IGNORE INTO music_meta(key,value) VALUES(?,?)",["mongo_music_migration_v1",new Date().toISOString()],false);
 console.info("[MUSIC_DB] Turso ready; migrated "+old.length+" legacy tracks");
}
export async function saveMusicTrack(x:{telegramFileId:string;telegramFileUniqueId:string;title:string;artist:string;album:string;category:string;duration:number;fileName:string;mimeType:string;fileSize:number;caption:string;uploadedByChatId:string;uploadedByName:string;telegramMessageId:number}){
 const now=new Date().toISOString();
 await sql("INSERT INTO music_tracks (id,telegram_file_id,telegram_file_unique_id,title,artist,album,category,duration,file_name,mime_type,file_size,caption,uploaded_by_chat_id,uploaded_by_name,telegram_message_id,is_active,play_count,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,0,?,?) ON CONFLICT(telegram_file_unique_id) DO UPDATE SET telegram_file_id=excluded.telegram_file_id,title=excluded.title,artist=excluded.artist,album=excluded.album,category=excluded.category,duration=excluded.duration,file_name=excluded.file_name,mime_type=excluded.mime_type,file_size=excluded.file_size,caption=excluded.caption,uploaded_by_chat_id=excluded.uploaded_by_chat_id,uploaded_by_name=excluded.uploaded_by_name,telegram_message_id=excluded.telegram_message_id,is_active=1,updated_at=excluded.updated_at",[randomUUID(),x.telegramFileId,x.telegramFileUniqueId,x.title,x.artist,x.album,x.category,x.duration,x.fileName,x.mimeType,x.fileSize,x.caption,x.uploadedByChatId,x.uploadedByName,x.telegramMessageId,now,now],false);
 const row=objs(await sql("SELECT "+C+" FROM music_tracks WHERE telegram_file_unique_id=? LIMIT 1",[x.telegramFileUniqueId]))[0];if(!row)throw new Error("Could not read saved music row");return map(row);
}
export async function listMusicTracks(q:string,category:string){const w=["is_active=1"],a:A[]=[];if(category&&category!=="همه"){w.push("category=?");a.push(category);}if(q){w.push("(title LIKE ? COLLATE NOCASE OR artist LIKE ? COLLATE NOCASE OR album LIKE ? COLLATE NOCASE OR category LIKE ? COLLATE NOCASE)");const p="%"+q+"%";a.push(p,p,p,p);}return objs(await sql("SELECT "+C+" FROM music_tracks WHERE "+w.join(" AND ")+" ORDER BY created_at DESC LIMIT 300",a)).map(map);}
export async function getActiveMusicTrack(id:string){const r=objs(await sql("SELECT "+C+" FROM music_tracks WHERE id=? AND is_active=1 LIMIT 1",[id]))[0];return r?map(r):null;}
export async function deactivateMusicTrack(id:string){const r=await sql("UPDATE music_tracks SET is_active=0,updated_at=? WHERE id=? AND is_active=1",[new Date().toISOString(),id],false);return Number(r.affected_row_count||0)>0;}


// Audio bytes live in Turso as bounded BLOB chunks. The Hrana HTTP API
// materializes each selected BLOB, so chunks are deliberately kept small.
const AUDIO_CHUNK_SIZE=256*1024;
export async function saveMusicAudioFile(trackId:string,data:Buffer):Promise<void>{
 if(!trackId||!Buffer.isBuffer(data)||data.length<1)throw new Error("Invalid music audio payload");
 if(data.length>20*1024*1024)throw new Error("Music audio exceeds the 20 MB upload limit");
 await sql("DELETE FROM music_audio_files WHERE track_id=?",[trackId],false);
 await sql("DELETE FROM music_audio_chunks WHERE track_id=?",[trackId],false);
 const chunks:Array<{q:string;a:A[]}>= [];
 for(let offset=0,index=0;offset<data.length;offset+=AUDIO_CHUNK_SIZE,index++){
   chunks.push({q:"INSERT INTO music_audio_chunks(track_id,chunk_index,data) VALUES(?,?,?)",a:[trackId,index,data.subarray(offset,Math.min(offset+AUDIO_CHUNK_SIZE,data.length))]});
 }
 try{
   for(let i=0;i<chunks.length;i+=4)await batch(chunks.slice(i,i+4));
   await sql("INSERT INTO music_audio_files(track_id,chunk_count,byte_size,updated_at) VALUES(?,?,?,?)",[trackId,chunks.length,data.length,new Date().toISOString()],false);
 }catch(error){
   await sql("DELETE FROM music_audio_chunks WHERE track_id=?",[trackId],false).catch(()=>{});
   throw error;
 }
}
export async function getMusicAudioFile(trackId:string):Promise<Buffer|null>{
 const meta=objs(await sql("SELECT chunk_count,byte_size FROM music_audio_files WHERE track_id=? LIMIT 1",[trackId]))[0];
 if(!meta)return null;
 const rows=objs(await sql("SELECT data FROM music_audio_chunks WHERE track_id=? ORDER BY chunk_index ASC",[trackId]));
 if(rows.length!==Number(meta.chunk_count))throw new Error("Music audio is incomplete in Turso");
 const parts=rows.map(r=>r.data).filter((v):v is Buffer=>Buffer.isBuffer(v));
 if(parts.length!==rows.length)throw new Error("Music audio chunk decoding failed");
 const result=Buffer.concat(parts);
 if(result.length!==Number(meta.byte_size))throw new Error("Music audio size verification failed");
 return result;
}
