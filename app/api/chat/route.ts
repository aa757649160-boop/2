import { NextRequest, NextResponse } from 'next/server';
import { proxyStreamRequest } from '@/lib/api-proxy';
import { getUserPoints, deductUserPoints } from '@/lib/db';
import { MODEL_PRICING } from '@/lib/config';

export async function POST(req: NextRequest) {
  try {
    const { messages, model, userId, stream = true } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: '用户ID不能为空' }, { status: 400 });
    }

    if (!model) {
      return NextResponse.json({ error: '模型不能为空' }, { status: 400 });
    }

    // 获取模型价格
    const pricing = MODEL_PRICING[model];
    if (!pricing) {
      return NextResponse.json({ error: '不支持的模型' }, { status: 400 });
    }

    // 估算token数量，预扣除积分
    // 简单估算：每个消息约100token
    const estimatedInputTokens = messages.reduce((acc: number, m: any) => acc + (m.content?.length || 0) / 4, 0);
    const estimatedOutputTokens = estimatedInputTokens * 0.5; // 假设输出是输入的一半
    
    const estimatedCost = 
      (estimatedInputTokens / 1000) * pricing.input + 
      (estimatedOutputTokens / 1000) * pricing.output;
    
    const estimatedPoints = Math.max(1, Math.ceil(estimatedCost));

    // 检查用户积分
    const userPoints = await getUserPoints(userId);
    if (userPoints < estimatedPoints) {
      return NextResponse.json({ error: '积分不足，请先充值' }, { status: 402 });
    }

    // 预扣除积分
    const success = await deductUserPoints(userId, estimatedPoints);
    if (!success) {
      return NextResponse.json({ error: '积分不足，请先充值' }, { status: 402 });
    }

    // 转发请求到API平台
    const response = await proxyStreamRequest('/v1/chat/completions', {
      messages,
      model,
      stream,
    });

    // 返回流式响应
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error: any) {
    console.error('Chat API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
