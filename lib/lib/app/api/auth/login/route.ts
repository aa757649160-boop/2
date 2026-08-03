import { NextResponse } from 'next/server';
import { loginUser } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: '请填写完整信息' }, { status: 400 });
    }

    // 登录用户
    const userId = await loginUser(email, password);

    return NextResponse.json({ success: true, userId });
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json({ error: '邮箱或密码错误' }, { status: 400 });
  }
}
