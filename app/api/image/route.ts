import { NextResponse } from 'next/server';
import { proxyApiRequest } from '@/lib/api-proxy';
import { getUserPoints, updateUserPoints } from '@/lib/db';
import { MODEL_PRICING } from '@/lib/config';
import { auth } from '@/auth';

export async function POST(request: Request) {
  const session = await auth();
  
  if (!session?.user?.id) {
    return NextResponse.json({ error: '未登录' }, { status: 401 });
  }
  
  const userId = session.user.id;
  // 用JSON格式，支持image参数，这是API支持的多参考图参数
  const body = await request.json();
  const { model, prompt, size, image, aspectRatio } = body;

  // 提取参考图
  const referenceCount = image?.length || 0;

  // 检查积分
  const userPoints = await getUserPoints(userId);
  const basePrice = MODEL_PRICING[model]?.input || 0;
  // 参考图每张加0.01积分
  const referencePrice = referenceCount * 0.01;
  const totalPrice = basePrice + referencePrice;

  if (userPoints < totalPrice) {
    return NextResponse.json({ error: '积分不足' });
  }

  // 扣除积分
  await updateUserPoints(userId, -totalPrice);

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
    };

    // 区分不同模型的参数格式
    if (apiModel === 'nano-banana-2') {
      // Nano-banana专属模型，用它的专属参数格式
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

    // 处理API返回格式，提取图片URL
    let imageUrl;
    if (data.data && Array.isArray(data.data) && data.data.length > 0) {
      imageUrl = data.data[0].url;
    } else if (data.url) {
      imageUrl = data.url;
    } else {
      throw new Error('API返回格式错误');
    }

    return NextResponse.json({ imageUrl });
  } catch (error: any) {
    // 恢复积分
    const basePrice = MODEL_PRICING[model]?.input || 0;
    const referencePrice = referenceCount * 0.01;
    const totalPrice = basePrice + referencePrice;
    await updateUserPoints(userId, totalPrice);
    return NextResponse.json({ error: error.message });
  }
}
