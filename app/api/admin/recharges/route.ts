import { NextRequest, NextResponse } from 'next/server';
import { getAllRecharges } from '@/lib/db';
import { ADMIN_USER_ID } from '@/lib/config';

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get('userId');
    
    // 验证管理员权限
    if (userId !== ADMIN_USER_ID) {
      return NextResponse.json({ error: '无权访问' }, { status: 403 });
    }

    const recharges = await getAllRecharges();
    return NextResponse.json({ recharges });

  } catch (error: any) {
    console.error('Admin recharges API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
