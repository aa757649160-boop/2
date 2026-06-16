import { NextResponse } from 'next/server';
import { proxyApiRequestWithKey } from '@/lib/api-proxy';
import { getUserPoints } from '@/lib/db';
import { MODEL_PRICING, STABLE_API } from '@/lib/config';

export async function POST(request: Request) {
  // 用JSON格式，支持image参数，这是API支持的多参考图参数
  const body = await request.json();
  const { userId, model, prompt, size, image, aspectRatio, n = 1 } = body;

  // 提取参考图
  const referenceCount = image?.length || 0;

  // 判断是否为稳定接口
  const isStableApi = model.includes('-stable-');

  // 检查积分
  const userPoints = await getUserPoints(userId);
  const basePrice = MODEL_PRICING[model]?.input || 0;
  
  let totalPrice: number;
  if (isStableApi) {
    // 稳定接口：按token计费模式，基础费用 + 参考图额外费用
    // 单张2k生图约0.08积分作为基础预估
    const baseEstimate = basePrice;
    const referenceExtra = referenceCount * 0.02; // 每张参考图额外token消耗
    totalPrice = (baseEstimate + referenceExtra) * n;
  } else {
    // 普通接口：固定价格模式
    const referencePrice = referenceCount * 0.01;
    totalPrice = basePrice * n + referencePrice;
  }

  if (userPoints < totalPrice) {
    return NextResponse.json({ error: '积分不足' });
  }

  try {
    // 构建请求体，用API支持的image参数
    // 模型名字：只有当最后一个部分是1k/2k/4k的时候，才去掉后缀，其他后缀保留
    const parts = model.split('-');
    let apiModel = model;
    
    // 稳定接口：去掉stable后缀
    if (isStableApi) {
      // gpt-image-2-stable-1k -> gpt-image-2-1k
      apiModel = model.replace('-stable-', '-');
    }
    
    // 去掉1k/2k/4k后缀
    const modelParts = apiModel.split('-');
    if (modelParts.length > 1 && (modelParts[modelParts.length - 1] === '1k' || modelParts[modelParts.length - 1] === '2k' || modelParts[modelParts.length - 1] === '4k')) {
      apiModel = modelParts.slice(0, -1).join('-');
    }
    
    let requestBody: any = {
      model: apiModel,
      prompt,
      n: n,
    };
    
    // 区分不同模型的参数格式
    if (apiModel.startsWith('nano-banana')) {
      // 替换为新的gemini模型，前端显示不变，实际调用新模型
      apiModel = 'gemini-3.1-flash-image-preview';
      requestBody.model = apiModel;
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

    // 稳定接口使用独立的API密钥
    const apiKey = isStableApi ? STABLE_API.apiKey : undefined;
    
    const response = await proxyApiRequestWithKey(
      '/v1/images/generations',
      requestBody,
      apiKey
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
    const description = `绘图生成：${model}${isStableApi ? '（稳定接口）' : ''}`;
    await deductUserPoints(userId, totalPrice, description);

    return NextResponse.json({ imageUrls });
  } catch (error: any) {
    // API调用失败，不需要恢复积分，因为还没扣
    return NextResponse.json({ error: error.message });
  }
}
