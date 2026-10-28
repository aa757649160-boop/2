import { NextResponse } from 'next/server';
import { proxyApiRequestWithKey } from '@/lib/api-proxy';
import { getUserPoints } from '@/lib/db';
import { MODEL_PRICING, STABLE_API } from '@/lib/config';

export const maxDuration = 60;

const validateAndFixSize = (size: string): string => {
  if (!size || typeof size !== 'string') return '1024x1024';
  const parts = size.split('x');
  if (parts.length !== 2) return '1024x1024';
  let width = parseInt(parts[0], 10);
  let height = parseInt(parts[1], 10);
  if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) return '1024x1024';
  const alignTo16 = (val: number) => Math.ceil(val / 16) * 16;
  width = alignTo16(width);
  height = alignTo16(height);
  const maxSide = 3840;
  const max = Math.max(width, height);
  if (max > maxSide) {
    const scale = maxSide / max;
    width = alignTo16(Math.floor(width * scale));
    height = alignTo16(Math.floor(height * scale));
  }
  return `${width}x${height}`;
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { userId, model, prompt, size: rawSize, image, aspectRatio, n = 1, useReferenceSize } = body;

    if (!userId) {
      return NextResponse.json({ error: '用户未登录' });
    }
    if (!prompt || !prompt.trim()) {
      return NextResponse.json({ error: '提示词不能为空' });
    }

    const referenceCount = image?.length || 0;
    const effectiveN = (image && image.length > 1) ? 1 : n;
    const isStableApi = model.includes('-stable-');
    const isGptImage2 = model.startsWith('gpt-image-2');
    const size = (isGptImage2 && useReferenceSize && referenceCount > 0)
      ? (rawSize || '1024x1024')
      : validateAndFixSize(rawSize);

    let userPoints = 0;
    try {
      userPoints = await getUserPoints(userId);
    } catch (e: any) {
      console.error('[image] getUserPoints error:', e.message);
      return NextResponse.json({ error: '查询积分失败: ' + e.message });
    }

    const basePrice = MODEL_PRICING[model]?.input || 0;
    let totalPrice: number;
    if (isStableApi) {
      const referenceExtra = referenceCount * 0.02;
      totalPrice = (basePrice + referenceExtra) * effectiveN;
    } else {
      const referencePrice = referenceCount * 0.01;
      totalPrice = basePrice * effectiveN + referencePrice;
    }

    if (userPoints < totalPrice) {
      return NextResponse.json({ error: `积分不足，需要${totalPrice.toFixed(2)}积分，当前${userPoints.toFixed(2)}` });
    }

    const parts = model.split('-');
    let apiModel = model;
    if (isStableApi) {
      apiModel = model.replace('-stable-', '-');
    }
    const modelParts = apiModel.split('-');
    const lastPart = modelParts[modelParts.length - 1];
    const isSizeSuffix = lastPart === '1k' || lastPart === '2k' || lastPart === '4k';
    if (modelParts.length > 1 && isSizeSuffix && (!apiModel.includes('sunburst') || lastPart === '1k')) {
      apiModel = modelParts.slice(0, -1).join('-');
    }

    let requestBody: any = {
      model: apiModel,
      prompt,
      n: effectiveN,
    };

    if (apiModel.startsWith('nano-banana')) {
      apiModel = 'gemini-3.1-flash-image-preview';
      requestBody.model = apiModel;
      const imageSize = parts[parts.length - 1].toUpperCase();
      requestBody.image_size = imageSize;
      if (aspectRatio && aspectRatio !== 'auto') {
        requestBody.aspect_ratio = aspectRatio;
      }
    } else {
      requestBody.size = size;
      requestBody.response_format = 'url';
    }

    if (image && image.length > 0) {
      requestBody.image = image;
    }

    const apiKey = isStableApi ? STABLE_API.apiKey : undefined;
    const imageEndpoint = '/v1/images/generations';

    console.log('[image] request:', imageEndpoint, JSON.stringify(requestBody).substring(0, 500));
    const response = await proxyApiRequestWithKey(
      imageEndpoint,
      requestBody,
      apiKey
    );

    const data = await response.json();

    let imageUrls: string[];
    if (data.data && Array.isArray(data.data) && data.data.length > 0) {
      imageUrls = data.data.map((item: any) => {
        if (item.url) return item.url;
        if (item.b64_json) return `data:image/png;base64,${item.b64_json}`;
        return '';
      });
    } else if (data.url) {
      imageUrls = [data.url];
    } else {
      console.error('[image] unexpected response:', JSON.stringify(data).substring(0, 500));
      throw new Error('API返回格式错误');
    }

    const { deductUserPoints } = await import('@/lib/db');
    const description = `绘图生成：${model}${isStableApi ? '（稳定接口）' : ''}`;
    await deductUserPoints(userId, totalPrice, description);

    return NextResponse.json({ imageUrls });
  } catch (error: any) {
    console.error('[image] fatal error:', error.message, error.stack);
    return NextResponse.json({ error: error.message || '服务器内部错误' }, { status: 200 });
  }
}
