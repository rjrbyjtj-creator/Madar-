import type { Request, Response } from "express";
import { getActiveMusicTrack, listMusicTracks, deactivateMusicTrack, getMusicAudioFile, saveMusicAudioFile, type MusicTrack } from "../services/music-store.service.js";
import { getTelegramFileStream } from "../services/telegram-files.service.js";
import { AppError } from "../utils/errors.js";
function ready(){if(!process.env.TURSO_DATABASE_URL?.trim()||!process.env.TURSO_AUTH_TOKEN?.trim())throw new AppError(503,"MUSIC_DATABASE_NOT_CONFIGURED","پایگاه داده بخش آهنگ‌ها هنوز به Turso متصل نشده است.");}
function publicTrack(t:MusicTrack){return{id:t.id,title:t.title,artist:t.artist||"نامشخص",album:t.album||"",category:t.category||"عمومی",duration:t.duration,durationLabel:String(Math.floor(t.duration/60)).padStart(2,"0")+":"+String(t.duration%60).padStart(2,"0"),mimeType:t.mimeType||"audio/mpeg",fileSize:t.fileSize,createdAt:t.createdAt,streamUrl:"/api/music/"+t.id+"/stream"};}
export async function listMusic(req:Request,res:Response):Promise<void>{ready();const q=String(req.query.q||"").trim().slice(0,120),c=String(req.query.category||"").trim().slice(0,60);const tracks=await listMusicTracks(q,c);res.setHeader("Cache-Control","public, max-age=30, stale-while-revalidate=120");res.json({ok:true,tracks:tracks.map(publicTrack)});}
export async function streamMusic(req:Request,res:Response):Promise<void>{
 ready();const id=String(req.params.id||"");if(!id||id.length>100)throw new AppError(400,"INVALID_TRACK_ID","شناسه آهنگ معتبر نیست.");
 const t=await getActiveMusicTrack(id);if(!t)throw new AppError(404,"TRACK_NOT_FOUND","آهنگ پیدا نشد.");
 let audio=await getMusicAudioFile(id);
 // Existing tracks are copied from Telegram into Turso the first time they are played.
 if(!audio){
   const legacy=await getTelegramFileStream(t.telegramFileId);
   audio=Buffer.from(await legacy.response.arrayBuffer());
   if(audio.length!==t.fileSize)throw new AppError(502,"AUDIO_SIZE_MISMATCH","حجم فایل دریافتی با اطلاعات آهنگ مطابقت ندارد.");
   await saveMusicAudioFile(id,audio);
 }
 const total=audio.length;let status=200,start=0,end=total-1;
 const range=req.headers.range;
 if(range){
   const m=/^bytes=(\d*)-(\d*)$/.exec(range.trim());
   if(!m||(!m[1]&&!m[2])){res.status(416).setHeader("Content-Range","bytes */"+total).end();return;}
   if(!m[1]){const suffix=Number(m[2]);if(!Number.isFinite(suffix)||suffix<=0){res.status(416).setHeader("Content-Range","bytes */"+total).end();return;}start=Math.max(0,total-suffix);}
   else{start=Number(m[1]);if(m[2])end=Number(m[2]);}
   if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=total||end<start){res.status(416).setHeader("Content-Range","bytes */"+total).end();return;}
   end=Math.min(end,total-1);status=206;
 }
 const body=audio.subarray(start,end+1);
 res.status(status);res.setHeader("Content-Type",t.mimeType||"audio/mpeg");res.setHeader("Content-Disposition","inline; filename*=UTF-8''"+encodeURIComponent(t.fileName));
 res.setHeader("Accept-Ranges","bytes");res.setHeader("Content-Length",String(body.length));if(status===206)res.setHeader("Content-Range",`bytes ${start}-${end}/${total}`);
 res.setHeader("X-Content-Type-Options","nosniff");res.setHeader("Cache-Control","public, max-age=3600");res.end(body);
}
export async function deactivateMusic(req:Request,res:Response):Promise<void>{ready();const id=String(req.params.id||"");if(!id||id.length>100)throw new AppError(400,"INVALID_TRACK_ID","شناسه آهنگ معتبر نیست.");if(!await deactivateMusicTrack(id))throw new AppError(404,"TRACK_NOT_FOUND","آهنگ پیدا نشد.");res.json({ok:true});}
