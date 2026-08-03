import { NextResponse } from 'next/server';
import { registerUser, verifyCode } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { email, code, password } = await request.json();

    if (!email || !code || !password) {
      return NextResponse.json({ error: '请填写完整信息' }, { status: 400 });
    }

    // 验证验证码
    const valid = await verifyCode(email, code);
    if (!valid) {
      return NextResponse.json({ error: '验证码错误或已过期' }, { status: 400 });
    }

    // 注册用户
    const userId = await registerUser(email, password);

    return NextResponse.json({ success: true, userId });
  } catch (error: any) {
    console.error('Register error:', error);
    if (error.constraint === 'users_username_key') {
      return NextResponse.json({ error: '该邮箱已被注册' }, { status: 400 });
    }
    return NextResponse.json({ error: '注册失败，请稍后重试' }, { status: 500 });
  }
}
