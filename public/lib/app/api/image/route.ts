import { NextResponse } from 'next/server';
import { proxyApiRequest } from '@/lib/api-proxy';
import { getUserPoints } from '@/lib/db';
import { MODEL_PRICING } from '@/lib/config';
export async function POST(request: Request) {
  // 用JSON格式，支持image参数，这是API支持的多参考图参数
  const body = await request.json();
  const { userId, model, prompt, size, image, aspectRatio, n = 1 } = body;

  // 提取参考图
  const referenceCount = image?.length || 0;

  // 检查积分
  const userPoints = await getUserPoints(userId);
  const basePrice = MODEL_PRICING[model]?.input || 0;
  // 参考图每张加0.01积分
  const referencePrice = referenceCount * 0.01;
  const totalPrice = basePrice * n + referencePrice;

  if (userPoints < totalPrice) {
    return NextResponse.json({ error: '积分不足' });
  }

  try {
    // 构建请求体，用API支持的image参数
    // 模型名字：只有当最后一个部分是1k/2k的时候，才去掉后缀，其他后缀（比如512px）保留
    const parts = model.split('-');
    let apiModel = model;
    if (parts.length > 1 && (parts[parts.length - 1] === '1k' || parts[parts.length - 1] === '2k')) {
      // 如果最后一个部分是1k或者2k，就去掉这个后缀
      apiModel = parts.slice(0, -1).join('-');
    }
    let requestBody: any = {
      model: apiModel,
      prompt,
      n: n,
    };
    // 区分不同模型的参数格式
    if (apiModel === 'nano-banana-2') {
      // 替换为新的gemini模型，前端显示不变，实际调用新模型
      apiModel = 'gemini-3.1-flash-image-preview';
      // 新模型和原来的nano-banana-2参数格式完全兼容，无需修改其他参数
      const imageSize = parts[parts.length - 1].toUpperCase();
      requestBody.image_size = imageSize;
      if (aspectRatio && aspectRatio !== 'auto') {
        requestBody.aspect_ratio = aspectRatio;
      }
    } else {
      // 其他OpenAI兼容模型（比如gpt-image-2），用原来的size参数
      requestBody.size = size;
    }

    // 如果有参考图，添加image参数
    if (image && image.length > 0) {
      requestBody.image = image;
    }

    const response = await proxyApiRequest(
      '/v1/images/generations',
      requestBody
    );

    const data = await response.json();

    // 处理API返回格式，提取所有图片URL
    let imageUrls: string[];
    if (data.data && Array.isArray(data.data) && data.data.length > 0) {
      imageUrls = data.data.map((item: {url: string}) => item.url);
    } else if (data.url) {
      imageUrls = [data.url];
    } else {
      throw new Error('API返回格式错误');
    }

    // API调用成功后，扣除积分并记录扣费历史
    const { deductUserPoints } = await import('@/lib/db');
    const description = `绘图生成：${model}`;
    await deductUserPoints(userId, totalPrice, description);

    return NextResponse.json({ imageUrls });
  } catch (error: any) {
    // API调用失败，不需要恢复积分，因为还没扣
    return NextResponse.json({ error: error.message });
  }
}
