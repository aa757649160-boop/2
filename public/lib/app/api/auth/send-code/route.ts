import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { saveVerificationCode } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: '请输入邮箱' }, { status: 400 });
    }

    // 生成6位验证码
    const code = Math.random().toString().slice(2, 8);

    // 保存验证码到数据库
    await saveVerificationCode(email, code);

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
          <p>验证码有效期为5分钟，请尽快完成注册。</p>
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
