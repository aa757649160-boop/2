import { NextResponse } from 'next/server';
import { loginUser } from '@/lib/db';
import { SESSION_COOKIE, createSessionToken, sessionCookieOptions } from '@/lib/session';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: '请填写完整信息' }, { status: 400 });
    }

    // 登录用户
    const userId = await loginUser(email, password);

    const res = NextResponse.json({ success: true, userId });
    // 签发服务端会话，之后的接口以这枚 cookie 为准
    res.cookies.set(SESSION_COOKIE, createSessionToken(userId), sessionCookieOptions());
    return res;
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json({ error: '邮箱或密码错误' }, { status: 400 });
  }
}
