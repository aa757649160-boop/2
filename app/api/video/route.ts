import { NextRequest, NextResponse } from 'next/server';
import {
  MAIN_API_BASE_URL,
  BACKUP_API_BASE_URL,
  MODEL_PRICING
} from '@/lib/config';
import { getUserPoints, updateUserPoints } from '@/lib/db';
import { getSessionUserId } from '@/lib/session';
// 轮询任务状态的函数
async function pollTaskStatus(baseUrl: string, apiKey: string, taskId: string, maxAttempts: number) {
  // 轮询次数，每次2秒，veo3.1模型需要900次=30分钟，其他模型600次=20分钟
  let attempts = 0;
  while (attempts < maxAttempts) {
    try {
      // 使用GET请求查询任务状态，适配你的API的查询接口
      const response = await fetch(`${baseUrl}/v2/videos/generations/${taskId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });
      // 先获取响应文本，避免直接json()解析失败
      const text = await response.text();
      let data: any;
      try {
        data = JSON.parse(text);
      } catch (e) {
        // 解析JSON失败，可能是API临时返回了普通文本错误，忽略这个错误继续轮询
        // 不抛出错误，等待下一次重试，避免因为临时的API错误导致任务失败
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
        continue;
      }
      // 兼容不同的状态字段和视频URL字段，适配你的API的返回格式
      const isSuccess = data.status === 'completed' || data.status === 'succeeded' || data.status === 'SUCCESS';
      if (isSuccess) {
        // 任务完成，返回视频URL，兼容不同的字段：标准的video_url，或者你的data.output，或者根目录的output
        const videoUrl = data.video_url || data.output || data.data?.output;
        return videoUrl;
      } else if (data.status === 'failed' || data.status === 'FAILED') {
        // 任务真的失败了，才抛出错误
        throw new Error(data.error || data.fail_reason || '视频生成任务失败');
      }
      // 即使response.ok是false，只要任务还没失败，就继续轮询，忽略临时的API错误
    } catch (e) {
      // 网络错误、连接失败等fetch本身的错误，也是临时的，忽略继续轮询
      console.log('轮询临时错误，继续重试:', e instanceof Error ? e.message : String(e));
    }
    // 任务还在处理中，等待2秒后重试
    await new Promise(resolve => setTimeout(resolve, 2000));
    attempts++;
  }
  throw new Error('视频生成超时，请稍后重试');
}
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      model,
      prompt,
      images,
      enhance_prompt,
      aspect_ratio,
      resolution,
      ratio,
      seed,
      return_last_frame,
      generate_audio
    } = body;

    // 身份只认服务端会话，忽略 body 里的 userId
    const userId = getSessionUserId();
    if (!userId) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }
    if (!model || !prompt) {
      return NextResponse.json({ error: '参数错误' }, { status: 400 });
    }
    // 检查余额
    const rawBalance = await getUserPoints(userId);
    const balance = Number(rawBalance) || 0;
    
    let price;
    if (model === 'doubao-seedance-2-0-260128') {
      // doubao模型动态计算价格：1.5积分/秒
      price = 1.5 * (body.duration || 5);
      // 如果选择了1080p，额外加1积分
      if (resolution === '1080p') {
        price += 1;
      }
    } else {
      price = MODEL_PRICING[model]?.input || 0;
    }
    
    if (balance < price) {
      return NextResponse.json({
        error: `积分不足，需要 ${price} 积分，您当前有 ${balance.toFixed(2)} 积分`
      }, { status: 400 });
    }
    // 调用API，先尝试主API
    let response;
    let apiKey = process.env.MAIN_API_KEY;
    let baseUrl = MAIN_API_BASE_URL;
    // 构造请求体
    const requestBody: any = {
      model,
      prompt,
    };
    // 根据模型添加对应的参数，veo3.1也改成同步模式，和doubao一样
    if (model === 'veo3.1') {
      // veo3.1支持的参数
      if (images && images.length > 0) {
        requestBody.images = images;
      }
      if (enhance_prompt !== undefined) {
        requestBody.enhance_prompt = enhance_prompt;
      }
      if (aspect_ratio) {
        requestBody.aspect_ratio = aspect_ratio;
      }
      // 设置任务超时时间为30分钟，让API同步等待任务完成，不需要前端轮询
      requestBody.execution_expires_after = 1800;
    } else {
      // doubao模型支持的完整参数
      if (images && images.length > 0) {
        requestBody.images = images;
      }
      if (resolution) {
        requestBody.resolution = resolution;
      }
      if (ratio) {
        requestBody.ratio = ratio;
      }
      if (seed !== undefined) {
        requestBody.seed = seed;
      }
      if (generate_audio !== undefined) {
        requestBody.generate_audio = generate_audio;
      }
      // 设置任务超时时间为20分钟
      requestBody.execution_expires_after = 1200;
      // 设置视频时长
      if (body.duration !== undefined) {
        requestBody.duration = body.duration;
      }
    }
    try {
      response = await fetch(`${baseUrl}/v2/videos/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });
    } catch (error) {
      // 主API失败，尝试备用API
      apiKey = process.env.BACKUP_API_KEY;
      baseUrl = BACKUP_API_BASE_URL;
      response = await fetch(`${baseUrl}/v2/videos/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });
    }
    // 先获取响应文本，避免直接json()解析失败
    const text = await response.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch (e) {
      // 解析JSON失败，说明API返回的是普通文本错误
      return NextResponse.json({ error: `API调用失败，返回内容: ${text}` }, { status: response.status });
    }
    if (!response.ok) {
      // 把API返回的所有内容都返回，方便调试
      return NextResponse.json({ error: `API调用失败，返回内容: ${JSON.stringify(data)}` }, { status: response.status });
    }
    // 先确定任务是否真的创建成功，再扣分，避免建任务失败也扣钱
    const { deductUserPoints, recordAsyncTask } = await import('@/lib/db');
    let description = `视频生成：${model}`;
    if (body.duration) {
      description += ` ${body.duration}秒`;
    }
    // 如果是1080p，添加到描述里
    if (model === 'doubao-seedance-2-0-260128' && resolution === '1080p') {
      description += ` 1080p`;
    }
    // 不管是什么模型，现在都改成前端轮询模式，后端只创建任务，不等待结果
    // 这样就不会有Vercel函数超时的问题了
    const taskId = data.id || data.task_id;
    if (!taskId) {
      // 先检查是不是已经直接返回了视频URL（doubao的同步模式）
      const directVideoUrl = data.video_url || data.output || data.data?.output;
      if (directVideoUrl) {
        // doubao的同步模式，直接返回结果
        await deductUserPoints(userId, price, description);
        return NextResponse.json({
          videoUrl: directVideoUrl,
        });
      }
      return NextResponse.json({ error: '获取任务ID失败' }, { status: 500 });
    }
    await deductUserPoints(userId, price, description);
    // 登记任务，后续任务失败时由 /v2/videos/generations/{taskId} 自动退分
    try {
      await recordAsyncTask({ taskId, userId, points: price, kind: 'video', model });
    } catch (e: any) {
      console.warn('[video] 登记异步任务失败（不影响生成）:', e?.message);
    }
    // 创建任务成功，只把任务ID返回给前端；轮询地址指回本站（/v2/videos/generations/{taskId} 由服务端中转），
    // 上游密钥不再下发到浏览器，apiKey 字段仅为兼容前端现有轮询代码的占位值
    const siteOrigin = new URL(req.url).origin;
    return NextResponse.json({
      taskId: taskId,
      baseUrl: siteOrigin,
      apiKey: 'server-side-proxy',
    });
  } catch (error: any) {
    // 内部异常细节只写服务端日志，不回传浏览器
    console.error('[video] fatal error:', error?.message, error?.stack);
    const errorObj = { error: '视频任务提交失败，请稍后重试' };
    return new Response(JSON.stringify(errorObj), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
