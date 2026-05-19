import { NextResponse } from 'next/server';
import { getUserPoints } from '@/lib/db';
import { auth } from '@/auth';

export async function GET() {
  try {
    const session = await auth();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }
    
    const userId = session.user.id;
    const points = await getUserPoints(userId);
    return NextResponse.json({ points });
  } catch (error: any) {
    console.error('Balance API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
