import { NextRequest, NextResponse } from 'next/server';
import { createRechargeRequest } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const { userId, amount, points, screenshot } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: '用户ID不能为空' }, { status: 400 });
    }

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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
