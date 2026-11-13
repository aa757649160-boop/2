import { NextRequest, NextResponse } from 'next/server';
import { createRechargeRequest } from '@/lib/db';
import { pointsForAmount } from '@/lib/config';
import { getSessionUserId, unauthorized } from '@/lib/session';

export async function POST(req: NextRequest) {
  try {
    const { amount, points: clientPoints, screenshot } = await req.json();

    // 身份只认服务端会话，忽略 body 里的 userId
    const userId = getSessionUserId();
    if (!userId) return unauthorized();

    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      return NextResponse.json({ error: '充值金额和积分不能为空' }, { status: 400 });
    }

    // 积分数额以服务端档位表为准，客户端传来的 points 一律不采信
    const points = pointsForAmount(amountNum);
    if (points === null) {
      return NextResponse.json({ error: '无效的充值档位' }, { status: 400 });
    }
    if (clientPoints !== undefined && Number(clientPoints) !== points) {
      console.warn('[recharge] 客户端上报积分数额与档位不一致，已按档位修正', {
        userId,
        amount: amountNum,
        clientPoints,
        serverPoints: points,
      });
    }

    if (!screenshot) {
      return NextResponse.json({ error: '请上传付款截图' }, { status: 400 });
    }

    const request = await createRechargeRequest({
      userId,
      amount: amountNum,
      points,
      screenshot,
    });

    return NextResponse.json({ success: true, points, request });

  } catch (error: any) {
    console.error('Recharge API error:', error);
    return NextResponse.json({ error: '提交充值申请失败，请稍后重试' }, { status: 500 });
  }
}
