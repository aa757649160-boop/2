import { NextRequest, NextResponse } from 'next/server';
import { getAllRecharges } from '@/lib/db';
import { ADMIN_USER_ID } from '@/lib/config';
import { getSessionUserId, unauthorized } from '@/lib/session';

export async function GET(req: NextRequest) {
  try {
    // 管理员身份只认服务端会话，不再信任 query 里的 userId
    const userId = getSessionUserId();
    if (!userId) return unauthorized();
    if (userId !== ADMIN_USER_ID) {
      return NextResponse.json({ error: '无权访问' }, { status: 403 });
    }

    const recharges = await getAllRecharges();
    return NextResponse.json({ recharges });

  } catch (error: any) {
    console.error('Admin recharges API error:', error);
    return NextResponse.json({ error: '查询失败，请稍后重试' }, { status: 500 });
  }
}
