// 图片异步任务：提交成功后由前端轮询（经本站中转接口，上游密钥不出服务端）
export type UpstreamImageTask = {
  taskId: string;
  model?: string;
};

const SUCCESS_STATES = ['SUCCESS', 'SUCCEEDED', 'COMPLETED', 'COMPLETE', 'DONE', 'OK', 'FINISHED'];
const FAILURE_STATES = ['FAILURE', 'FAILED', 'FAIL', 'ERROR', 'CANCELED', 'CANCELLED', 'TIMEOUT'];
const URL_KEYS = ['url', 'image_url', 'imageUrl', 'img_url', 'image', 'imageUrls', 'image_urls', 'images', 'urls'];

/**
 * 从上游任意形态的返回里捞出图片地址（https:// 或 data:image）
 */
export function extractImageUrlsFromTask(raw: any): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const pushUrl = (v: any) => {
    if (typeof v !== 'string') return;
    if (!v.startsWith('http') && !v.startsWith('data:image')) return;
    if (seen.has(v)) return;
    seen.add(v);
    out.push(v);
  };
  const walk = (node: any, depth: number) => {
    if (!node || depth > 4) return;
    if (typeof node === 'string') { pushUrl(node); return; }
    if (Array.isArray(node)) { node.forEach(item => walk(item, depth + 1)); return; }
    if (typeof node !== 'object') return;
    if (typeof node.b64_json === 'string' && node.b64_json) {
      pushUrl(`data:image/png;base64,${node.b64_json}`);
    }
    for (const key of URL_KEYS) {
      if (node[key] !== undefined && node[key] !== null) walk(node[key], depth + 1);
    }
    if (node.data !== undefined && node.data !== null) walk(node.data, depth + 1);
    if (node.result !== undefined && node.result !== null) walk(node.result, depth + 1);
    if (node.output !== undefined && node.output !== null) walk(node.output, depth + 1);
    if (node.task_result !== undefined && node.task_result !== null) walk(node.task_result, depth + 1);
  };
  walk(raw, 0);
  return out;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 轮询图片异步任务（走 /api/image/task 中转），返回图片地址数组；失败或超时抛错
 */
export async function awaitImageTask(
  task: UpstreamImageTask,
  opts: { maxAttempts?: number; intervalMs?: number } = {}
): Promise<string[]> {
  const maxAttempts = opts.maxAttempts ?? 600;   // 600 * 2s = 20 分钟
  const intervalMs = opts.intervalMs ?? 2000;
  if (!task?.taskId) throw new Error('任务信息缺失，请重试');

  for (let i = 0; i < maxAttempts; i++) {
    let data: any = null;
    try {
      const url = `/api/image/task?taskId=${encodeURIComponent(task.taskId)}&model=${encodeURIComponent(task.model || '')}`;
      const res = await fetch(url, { cache: 'no-store' });
      data = await res.json();
    } catch (e) {
      // 网络抖动，继续轮询
      data = null;
    }

    if (data) {
      const status = String(data.status || '').toUpperCase();
      if (FAILURE_STATES.indexOf(status) > -1) {
        const reason = data.error || '';
        throw new Error(reason ? `图片生成失败：${reason}` : '图片生成失败，请重试');
      }
      const urls: string[] = Array.isArray(data.imageUrls) ? data.imageUrls : [];
      if (urls.length > 0) return urls;
      if (SUCCESS_STATES.indexOf(status) > -1) {
        throw new Error('任务已完成但未返回图片地址，请重试');
      }
      // IN_PROGRESS / 查询暂时失败：继续等
    }

    await sleep(intervalMs);
  }
  throw new Error('图片生成超时，请稍后重试');
}
