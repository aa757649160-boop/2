import { NextRequest, NextResponse } from 'next/server';
import { getUserDeductions } from '@/lib/db';
import { getSessionUserId, unauthorized } from '@/lib/session';

export async function GET(req: NextRequest) {
  try {
    // 身份只认服务端会话，忽略 query 里的 userId
    const userId = getSessionUserId();
    if (!userId) return unauthorized();

    // 获取用户的扣费历史
    const deductions = await getUserDeductions(userId);

    return NextResponse.json({
      deductions: deductions,
    });
  } catch (error: any) {
    console.error('Point history error:', error);
    return NextResponse.json({ error: '查询明细失败，请稍后重试' }, { status: 500 });
  }
}
