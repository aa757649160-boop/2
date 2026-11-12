import { NextRequest, NextResponse } from 'next/server';
import { createRechargeRequest } from '@/lib/db';
import { getSessionUserId, unauthorized } from '@/lib/session';

export async function POST(req: NextRequest) {
  try {
    const { amount, points, screenshot } = await req.json();

    // 身份只认服务端会话，忽略 body 里的 userId
    const userId = getSessionUserId();
    if (!userId) return unauthorized();

    if (!amount || !points) {
      return NextResponse.json({ error: '充值金额和积分不能为空' }, { status: 400 });
    }

    if (!screenshot) {
      return NextResponse.json({ error: '请上传付款截图' }, { status: 400 });
    }

    const request = await createRechargeRequest({
      userId,
      amount,
      points,
      screenshot,
    });

    return NextResponse.json({ success: true, request });

  } catch (error: any) {
    console.error('Recharge API error:', error);
    return NextResponse.json({ error: '提交充值申请失败，请稍后重试' }, { status: 500 });
  }
}
