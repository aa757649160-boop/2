import { NextRequest, NextResponse } from 'next/server';
import { approveRecharge, rejectRecharge } from '@/lib/db';
import { ADMIN_USER_ID } from '@/lib/config';

export async function POST(req: NextRequest) {
  try {
    const { userId, rechargeId, action } = await req.json();
    
    // 验证管理员权限
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
