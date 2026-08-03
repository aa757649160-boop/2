import { NextRequest, NextResponse } from 'next/server';
import { getUserPoints } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json({ error: '用户ID不能为空' }, { status: 400 });
    }

    const points = await getUserPoints(userId);
    return NextResponse.json({ points });

  } catch (error: any) {
    console.error('Balance API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
