import { NextRequest, NextResponse } from 'next/server';
import {
  MAIN_API_BASE_URL,
  BACKUP_API_BASE_URL,
  MODEL_PRICING,
  IMAGE_MODELS
} from '@/lib/config';
import { getUserPoints, updateUserPoints } from '@/lib/db';
import { auth } from '@/auth';

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }
    
    const userId = session.user.id;
    const { model, prompt } = await req.json();

    if (!model || !prompt) {
      return NextResponse.json({ error: '参数错误' }, { status: 400 });
    }

    // 检查余额
    const balance = await getUserPoints(userId);
    const price = MODEL_PRICING[model]?.input || 0;

    if (balance < price) {
      return NextResponse.json({
        error: `积分不足，需要 ${price} 积分，您当前有 ${balance.toFixed(2)} 积分`
      }, { status: 400 });
    }

    // 调用API，先尝试主API
    let response;
    let apiKey = process.env.MAIN_API_KEY;
    let baseUrl = MAIN_API_BASE_URL;

    try {
      response = await fetch(`${baseUrl}/videos/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          prompt,
        }),
      });
    } catch (error) {
      // 主API失败，尝试备用API
      apiKey = process.env.BACKUP_API_KEY;
      baseUrl = BACKUP_API_BASE_URL;

      response = await fetch(`${baseUrl}/videos/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          prompt,
        }),
      });
    }

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json({ error: data.error?.message || 'API调用失败' }, { status: response.status });
    }

    // 扣除积分
    await updateUserPoints(userId, -price);

    // 返回视频URL
    return NextResponse.json({
      url: data.data[0].url,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
