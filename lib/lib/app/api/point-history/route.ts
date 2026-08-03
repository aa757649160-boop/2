import { NextRequest, NextResponse } from 'next/server';
import { getUserDeductions } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json({ error: '用户ID不能为空' }, { status: 400 });
    }

    // 获取用户的扣费历史
    const deductions = await getUserDeductions(userId);

    return NextResponse.json({
      deductions: deductions,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
