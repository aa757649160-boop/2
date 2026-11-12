import { NextRequest, NextResponse } from 'next/server';
import { approveRecharge, rejectRecharge } from '@/lib/db';
import { ADMIN_USER_ID } from '@/lib/config';
import { getSessionUserId, unauthorized } from '@/lib/session';

export async function POST(req: NextRequest) {
  try {
    const { rechargeId, action } = await req.json();

    // 管理员身份只认服务端会话，不再信任请求体里的 userId
    const userId = getSessionUserId();
    if (!userId) return unauthorized();
    if (userId !== ADMIN_USER_ID) {
      return NextResponse.json({ error: '无权访问' }, { status: 403 });
    }

    if (!rechargeId || !action) {
      return NextResponse.json({ error: '参数错误' }, { status: 400 });
    }

    let result;
    if (action === 'approve') {
      result = await approveRecharge(rechargeId);
    } else if (action === 'reject') {
      result = await rejectRecharge(rechargeId);
    } else {
      return NextResponse.json({ error: '无效的操作' }, { status: 400 });
    }

    return NextResponse.json({ success: true, result });

  } catch (error: any) {
    console.error('Admin approve API error:', error);
    return NextResponse.json({ error: '操作失败，请稍后重试' }, { status: 500 });
  }
}
