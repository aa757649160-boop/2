import { cookies } from 'next/headers';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * 服务端会话：登录成功后签发一枚 HMAC 签名的 httpOnly cookie，
 * 之后所有接口都从这里取真实 userId，不再信任前端传来的 userId。
 */
export const SESSION_COOKIE = 'sid';
const MAX_AGE = 60 * 60 * 24 * 7; // 7 天

function getSecret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  const fallback = process.env.MAIN_API_KEY;
  if (fallback) {
    console.warn('[session] 未设置 SESSION_SECRET，暂用上游密钥派生签名密钥，建议在 Vercel 补上 SESSION_SECRET');
    return 'fallback-secret:' + fallback;
  }
  console.warn('[session] 缺少 SESSION_SECRET，正在使用不安全的默认签名密钥');
  return 'insecure-default-session-secret';
}

function b64url(buf: Buffer | string): string {
  const s = Buffer.isBuffer(buf) ? buf.toString('base64') : Buffer.from(buf, 'utf8').toString('base64');
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): string {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(padded, 'base64').toString('utf8');
}

function sign(payload: string): string {
  return b64url(createHmac('sha256', getSecret()).update(payload).digest());
}

/** 生成会话 cookie 值：base64(userId).签发时间.签名 */
export function createSessionToken(userId: string): string {
  const payload = `${b64url(userId)}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

/** 校验会话 cookie，通过返回 userId，否则 null */
export function verifySessionToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [uidPart, issuedAt, sig] = parts;
  const expected = sign(`${uidPart}.${issuedAt}`);
  if (expected.length !== sig.length) return null;
  try {
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  } catch {
    return null;
  }
  const ts = Number(issuedAt);
  if (!Number.isFinite(ts) || Date.now() - ts > MAX_AGE * 1000) return null;
  try {
    const userId = fromB64url(uidPart);
    if (!userId || userId.length > 128) return null;
    return userId;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  };
}

/** 读取当前请求的会话 userId（未登录返回 null） */
export function getSessionUserId(): string | null {
  const value = cookies().get(SESSION_COOKIE)?.value;
  return verifySessionToken(value);
}

/** 供路由里快速判空：未登录时直接返回 401 响应 */
export function unauthorized() {
  return Response.json({ error: '请先登录' }, { status: 401 });
}
