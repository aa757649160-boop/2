import { NextResponse } from 'next/server';
import { MAIN_API, BACKUP_API } from '@/lib/config';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const TASK_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const SUCCESS_STATES = ['COMPLETED', 'SUCCEEDED', 'SUCCESS', 'SUCCESSFUL', 'DONE', 'FINISHED'];
const FAILURE_STATES = ['FAILED', 'FAILURE', 'ERROR', 'CANCELED', 'CANCELLED'];

function extractVideoUrl(data: any): string {
  const candidates = [
    data?.video_url,
    data?.videoUrl,
    data?.output,
    data?.output?.video_url,
    data?.data?.output,
    data?.data?.video_url,
    data?.result?.video_url,
    data?.result?.output,
    data?.url,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && (c.startsWith('http') || c.startsWith('data:'))) return c;
  }
  return '';
}

/**
 * 视频任务查询中转：前端仍按原地址轮询 /v2/videos/generations/{taskId}，
 * 但实际由本路由带着服务端密钥去查上游，密钥不出服务端。
 * 返回字段保持前端既有读取方式（status / video_url / fail_reason）。
 */
export async function GET(
  request: Request,
  { params }: { params: { taskId: string } }
) {
  const taskId = (params?.taskId || '').trim();
  if (!TASK_ID_RE.test(taskId)) {
    return NextResponse.json({ status: 'FAILED', fail_reason: '任务ID无效' }, { status: 400 });
  }

  const targets = [
    { baseUrl: MAIN_API.baseUrl, apiKey: MAIN_API.apiKey },
    { baseUrl: BACKUP_API.baseUrl, apiKey: BACKUP_API.apiKey },
  ];

  for (const t of targets) {
    if (!t.apiKey) continue;
    try {
      const res = await fetch(`${t.baseUrl}/v2/videos/generations/${encodeURIComponent(taskId)}`, {
        headers: {
          'Authorization': `Bearer ${t.apiKey}`,
        },
        cache: 'no-store',
      });
      if (!res.ok) {
        console.warn('[videos/generations] 上游返回', t.baseUrl, res.status);
        continue;
      }
      const data = await res.json();
      const status = String(data?.status || data?.data?.status || '').toUpperCase();
      const videoUrl = extractVideoUrl(data);
      const failReason = data?.fail_reason
        || data?.error?.message
        || (typeof data?.error === 'string' ? data.error : '')
        || '';

      if (videoUrl) {
        return NextResponse.json({ status: 'SUCCESS', video_url: videoUrl, fail_reason: '' });
      }
      if (FAILURE_STATES.indexOf(status) > -1) {
        return NextResponse.json({ status: 'FAILED', video_url: '', fail_reason: failReason || '任务失败' });
      }
      if (SUCCESS_STATES.indexOf(status) > -1) {
        // 上游说完成但还没给地址，继续让前端等下一轮
        return NextResponse.json({ status: 'IN_PROGRESS', video_url: '', fail_reason: '' });
      }
      return NextResponse.json({ status: 'IN_PROGRESS', video_url: '', fail_reason: '' });
    } catch (e: any) {
      console.warn('[videos/generations] 查询异常:', e.message);
    }
  }

  return NextResponse.json({ status: 'IN_PROGRESS', video_url: '', fail_reason: '' });
}
