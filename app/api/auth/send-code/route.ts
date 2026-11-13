import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { randomInt } from 'node:crypto';
import {
  saveVerificationCode,
  recordCodeRequest,
  countRecentCodeRequestsByEmail,
  countRecentCodeRequestsByIp,
  secondsUntilEmailCanRequest,
} from '@/lib/db';

export const runtime = 'nodejs';

// 取真实客户端 IP（Vercel 走 x-forwarded-for，第一条即真实来源）
function getClientIp(request: Request): string | null {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0].trim();
    if (first) return first;
  }
  return request.headers.get('x-real-ip')?.trim() || null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = typeof body?.email === 'string' ? body.email.trim() : '';

    if (!email) {
      return NextResponse.json({ error: '请输入邮箱' }, { status: 400 });
    }
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: '邮箱格式不正确' }, { status: 400 });
    }

    // ===== 限频 =====
    // 1) 同一邮箱 60 秒冷却
    const remainSeconds = await secondsUntilEmailCanRequest(email);
    if (remainSeconds > 0) {
      return NextResponse.json(
        { error: `请求过于频繁，请 ${remainSeconds} 秒后再试` },
        { status: 429 }
      );
    }
    // 2) 同一邮箱每小时最多 5 次
    if ((await countRecentCodeRequestsByEmail(email, 60)) >= 5) {
      return NextResponse.json(
        { error: '该邮箱获取验证码次数过多，请 1 小时后再试' },
        { status: 429 }
      );
    }
    // 3) 同一 IP 每小时最多 10 次
    const ip = getClientIp(request);
    if (ip && (await countRecentCodeRequestsByIp(ip, 60)) >= 10) {
      return NextResponse.json(
        { error: '当前网络获取验证码次数过多，请 1 小时后再试' },
        { status: 429 }
      );
    }

    // 密码学安全随机，固定 6 位（100000-999999，不会出现前导 0 的歧义）
    const code = String(randomInt(100000, 1000000));

    // 先落库再发信：发信失败也不会留下"未记录"的请求
    await saveVerificationCode(email, code);
    await recordCodeRequest(email, ip);

    // 创建邮件发送器
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    // 发送邮件
    await transporter.sendMail({
      from: `"AI Studio" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'AI Studio 注册验证码',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">欢迎注册 AI Studio</h2>
          <p>您的注册验证码是：</p>
          <div style="background: #f5f5f5; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 10px; color: #f59e0b;">
            ${code}
          </div>
          <p>验证码有效期为5分钟，连续输错5次将失效，请尽快完成注册。</p>
          <p>如果这不是您本人的操作，请忽略此邮件。</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Send code error:', error);
    return NextResponse.json({ error: '发送验证码失败，请稍后重试' }, { status: 500 });
  }
}
