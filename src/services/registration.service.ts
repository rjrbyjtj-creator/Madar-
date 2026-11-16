import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";
import { RegistrationOtp } from "../models/RegistrationOtp.js";
import { User } from "../models/User.js";
import { AppError, isDuplicateKeyError } from "../utils/errors.js";
import { hashPassword } from "../utils/security.js";
import { signAccessToken, TOKEN_TTL } from "../utils/token.js";
import { toPublicUser, type PublicUser } from "./auth.service.js";
import { resolveTelegramChat } from "./telegramChat.service.js";
import { sendTelegramCode } from "./telegram.service.js";
import { sendEmailCode } from "./email.service.js";

type Input = { channel:"telegram"|"email"; chat?:string; phone:string; email:string; name:string; pass:string; schoolName:string; officialSchoolName:string; grade:string; fieldOfStudy:string };
const hash=(phone:string,code:string)=>createHmac("sha256",env.JWT_SECRET).update("signup:"+phone+":"+code).digest("hex");
export async function requestRegistrationCode(input:Input):Promise<{resendAfter:number;expiresIn:number}> {
  if(await User.exists({phone:input.phone})) throw new AppError(409,"PHONE_TAKEN","این شماره قبلاً ثبت‌نام کرده. وارد شو.");
  if(await User.exists({email:input.email})) throw new AppError(409,"EMAIL_TAKEN","این ایمیل قبلاً ثبت‌نام کرده. وارد شو.");
  const telegram = input.channel==="telegram" ? await resolveTelegramChat(input.chat||"") : null;
  const target = input.channel==="email" ? input.email : telegram!.chatId;
  const last=await RegistrationOtp.findOne({phone:input.phone,channel:input.channel,consumedAt:null}).sort({issuedAt:-1}).select("issuedAt").lean();
  if(last){const wait=Math.ceil(env.OTP_RESEND_SECONDS-(Date.now()-last.issuedAt.getTime())/1000);if(wait>0)throw new AppError(429,"OTP_COOLDOWN",`بعد از ${wait} ثانیه می‌تونی دوباره کد بگیری.`,{retryAfter:wait});}
  const code=String(randomInt(100000,1000000));
  await RegistrationOtp.updateMany({phone:input.phone,consumedAt:null},{$set:{consumedAt:new Date()}});
  const doc=await RegistrationOtp.create({
    phone:input.phone,email:input.email,channel:input.channel,destination:target,
    ...(input.channel==="telegram"?{chatId:telegram!.chatId}:{}),
    codeHash:hash(input.phone,code),registrationData:{name:input.name,email:input.email,phone:input.phone,passwordHash:await hashPassword(input.pass),...(input.channel==="telegram"?{telegramChatId:telegram!.chatId,telegramUsername:telegram!.username}:{}),schoolName:input.schoolName,officialSchoolName:input.officialSchoolName,grade:input.grade,fieldOfStudy:input.fieldOfStudy},
    expiresAt:new Date(Date.now()+env.OTP_EXPIRES_MINUTES*60000),
  });
  try {
    if(input.channel==="email") await sendEmailCode(input.email,code,env.OTP_EXPIRES_MINUTES);
    else await sendTelegramCode(target,code,env.OTP_EXPIRES_MINUTES);
  } catch(error) { await RegistrationOtp.deleteOne({_id:doc._id}); throw error; }
  return {resendAfter:env.OTP_RESEND_SECONDS,expiresIn:env.OTP_EXPIRES_MINUTES*60};
}
export async function completeRegistration(input:{phone:string;email:string;channel:"telegram"|"email";code:string}):Promise<{token:string;user:PublicUser}> {
  const doc=await RegistrationOtp.findOne({phone:input.phone,email:input.email,channel:input.channel,consumedAt:null,expiresAt:{$gt:new Date()}}).sort({issuedAt:-1}).select("+codeHash +registrationData");
  if(!doc) throw new AppError(400,"OTP_NOT_FOUND","کد فعال نیست یا منقضی شده. کد جدید بگیر.");
  const attempt=doc as typeof doc & {attempts:number;maxAttempts?:number;registrationData:Record<string,any>};
  if(attempt.attempts>=5) throw new AppError(429,"OTP_ATTEMPTS_EXCEEDED","تعداد تلاش‌های اشتباه زیاد بود. کد جدید بگیر.");
  const expected=Buffer.from(hash(input.phone,input.code),"hex"),actual=Buffer.from(doc.codeHash,"hex");
  if(expected.length!==actual.length||!timingSafeEqual(expected,actual)){await RegistrationOtp.updateOne({_id:doc._id},{$inc:{attempts:1}});throw new AppError(400,"INVALID_CODE","کد اشتباه است. دوباره امتحان کن.");}
  const data=attempt.registrationData;
  try {
    const user=await User.create({...data,isEmailVerified:input.channel==="email",isPhoneVerified:false,isTelegramVerified:input.channel==="telegram"});
    await RegistrationOtp.updateOne({_id:doc._id},{$set:{consumedAt:new Date()}});
    const token=signAccessToken({id:String(user._id),role:user.role},TOKEN_TTL.default);
    return {token,user:toPublicUser(user)};
  } catch(error){if(isDuplicateKeyError(error))throw new AppError(409,"ALREADY_REGISTERED","با این اطلاعات قبلاً ثبت‌نام شده. وارد شو.");throw error;}
}
