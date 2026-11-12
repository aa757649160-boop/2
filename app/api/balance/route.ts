import { NextRequest, NextResponse } from 'next/server';
import { getUserPoints } from '@/lib/db';
import { getSessionUserId, unauthorized } from '@/lib/session';

export async function GET(req: NextRequest) {
  try {
    // 身份只认服务端会话，忽略 query 里的 userId
    const userId = getSessionUserId();
    if (!userId) return unauthorized();

    const points = await getUserPoints(userId);
    return NextResponse.json({ points });

  } catch (error: any) {
    console.error('Balance API error:', error);
    return NextResponse.json({ error: '查询积分失败，请稍后重试' }, { status: 500 });
  }
}
