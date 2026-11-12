import { NextResponse } from 'next/server';
import { MAIN_API, BACKUP_API, STABLE_API } from '@/lib/config';
import { extractImageUrlsFromTask } from '@/lib/image-task-client';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

// 只允许合法任务ID，避免被拿来做路径注入
const TASK_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * 图片异步任务查询中转：浏览器 → 本接口 → 上游
 * 上游密钥只存在于服务端，不返回给前端
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const taskId = (searchParams.get('taskId') || '').trim();
  const model = (searchParams.get('model') || '').trim();

  if (!TASK_ID_RE.test(taskId)) {
    return NextResponse.json({ error: '任务ID无效' }, { status: 400 });
  }

  const isStable = model.indexOf('-stable-') > -1;
  const targets = (isStable && STABLE_API.apiKey)
    ? [{ baseUrl: MAIN_API.baseUrl, apiKey: STABLE_API.apiKey }]
    : [
        { baseUrl: MAIN_API.baseUrl, apiKey: MAIN_API.apiKey },
        { baseUrl: BACKUP_API.baseUrl, apiKey: BACKUP_API.apiKey },
      ];

  for (const t of targets) {
    if (!t.apiKey) continue;
    try {
      const res = await fetch(`${t.baseUrl}/v1/images/tasks/${encodeURIComponent(taskId)}`, {
        headers: {
          'Authorization': `Bearer ${t.apiKey}`,
        },
        cache: 'no-store',
      });
      if (!res.ok) {
        console.warn('[image/task] 上游返回', t.baseUrl, res.status);
        continue;
      }
      const text = await res.text();
      let data: any = null;
      try { data = JSON.parse(text); } catch { data = null; }
      if (!data) {
        console.warn('[image/task] 返回非JSON:', text.substring(0, 200));
        continue;
      }
      // 上游返回 { code, message, data: { status, fail_reason, data: { data: [ { url } ] } } }
      const status = String(data?.data?.status || data?.status || data?.task_status || '').toUpperCase();
      const imageUrls = extractImageUrlsFromTask(data);
      const errorText = data?.data?.fail_reason
        || data?.fail_reason
        || data?.error?.message
        || (typeof data?.error === 'string' ? data.error : '')
        || data?.message
        || '';
      if (status === 'SUCCESS' && imageUrls.length === 0) {
        console.warn('[image/task] 状态SUCCESS但未提取到图片URL，返回体:', text.substring(0, 800));
      }
      return NextResponse.json({ status, imageUrls, error: errorText });
    } catch (e: any) {
      console.warn('[image/task] 查询异常:', e.message);
    }
  }

  return NextResponse.json({ error: '任务查询失败，请稍后重试' }, { status: 502 });
}
