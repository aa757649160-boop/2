import { NextResponse } from 'next/server';
import { proxyApiRequestWithKey } from '@/lib/api-proxy';
import { getUserPoints } from '@/lib/db';
import { MODEL_PRICING, STABLE_API, MAIN_API, BACKUP_API } from '@/lib/config';
import { extractImageUrlsFromTask } from '@/lib/image-task-client';

export const maxDuration = 60;

type SubmitResult = { baseUrl: string; apiKey: string; data: any };

/**
 * 从异步提交的返回里取任务ID（兼容 task_id / id / data.task_id 等写法）
 */
function findTaskId(data: any): string | null {
  if (!data || data.error) return null;
  const candidates = [data.task_id, data.taskId, data.id, data.data?.task_id, data.data?.taskId, data.data?.id, data.result?.task_id];
  for (const c of candidates) {
    if (c === undefined || c === null || c === '') continue;
    if (typeof c === 'object') continue;
    const s = String(c).trim();
    if (!s) continue;
    if (/^\d{1,3}$/.test(s)) continue;   // 排除 HTTP 状态码/错误码
    return s;
  }
  return null;
}

/**
 * 提交图片异步任务（POST /v1/images/tasks），返回任务ID由前端轮询
 */
async function submitAsyncImageTask(body: any, customApiKey?: string): Promise<SubmitResult | null> {
  const targets = customApiKey
    ? [{ baseUrl: MAIN_API.baseUrl, apiKey: customApiKey }]
    : [
        { baseUrl: MAIN_API.baseUrl, apiKey: MAIN_API.apiKey },
        { baseUrl: BACKUP_API.baseUrl, apiKey: BACKUP_API.apiKey },
      ];
  for (const t of targets) {
    if (!t.apiKey) continue;
    try {
      const res = await fetch(`${t.baseUrl}/v1/images/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${t.apiKey}`,
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let data: any = null;
      try { data = JSON.parse(text); } catch { data = null; }
      if (res.ok && data) return { baseUrl: t.baseUrl, apiKey: t.apiKey, data };
      console.warn('[image] 异步提交失败:', res.status, text.substring(0, 200));
    } catch (e: any) {
      console.warn('[image] 异步提交异常:', e.message);
    }
  }
  return null;
}

const SIZE_SUFFIXES = ['1k', '2k', '4k'];

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
    // 剥掉模型名末尾所有分辨率后缀（1k/2k/4k，重复的也一并清掉），得到基础模型名
    let baseParts = apiModel.split('-');
    while (baseParts.length > 1 && SIZE_SUFFIXES.indexOf(baseParts[baseParts.length - 1]) > -1) {
      baseParts = baseParts.slice(0, -1);
    }
    // 1k / 2k / 4k 只是本站的选择与计费档位，发给上游的模型名一律只用基础名，不带任何分辨率后缀
    // 分辨率由 size（gpt-image 系列）或 image_size（nano-banana 系列）传
    apiModel = baseParts.join('-');

    let requestBody: any = {
      model: apiModel,
      prompt,
      n: effectiveN,
    };

    // nano-banana 系列：统一映射到 Gemini 图像模型；gemini-nano-banana 系列：直接使用上游同名模型
    // 两者都通过 image_size / aspect_ratio 传参
    if (apiModel.startsWith('nano-banana') || apiModel.startsWith('gemini-nano-banana')) {
      if (apiModel.startsWith('nano-banana')) {
        apiModel = 'gemini-3.1-flash-image-preview';
      }
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

    // ==================== 异步模式（优先）：只建任务，结果由前端轮询 ====================
    // 上游：POST /v1/images/tasks 建任务 → GET /v1/images/tasks/{task_id} 查结果（SUCCESS / FAILURE / IN_PROGRESS）
    // 这样本函数只等“建任务”这一步（几秒），不会再撞 Vercel 的 60 秒超时
    console.log('[image] 提交异步任务:', JSON.stringify(requestBody).substring(0, 500));
    const submitted = await submitAsyncImageTask(requestBody, apiKey);
    if (submitted) {
      const immediateUrls = extractImageUrlsFromTask(submitted.data);
      const upstreamTaskId = findTaskId(submitted.data);
      if (immediateUrls.length > 0 || upstreamTaskId) {
        const { deductUserPoints } = await import('@/lib/db');
        await deductUserPoints(userId, totalPrice, `绘图生成：${model}${isStableApi ? '（稳定接口）' : ''}`);
        if (immediateUrls.length > 0) {
          return NextResponse.json({ imageUrls: immediateUrls });
        }
        console.log('[image] 异步任务已创建:', upstreamTaskId, submitted.baseUrl);
        return NextResponse.json({
          taskId: upstreamTaskId,
          baseUrl: submitted.baseUrl,
          apiKey: submitted.apiKey,
        });
      }
      console.warn('[image] 异步接口未返回任务ID，回退同步接口:', JSON.stringify(submitted.data).substring(0, 300));
    }

    // ==================== 回退：老的同步接口 ====================
    const imageEndpoint = '/v1/images/generations';

    console.log('[image] 同步请求:', imageEndpoint, JSON.stringify(requestBody).substring(0, 500));
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
