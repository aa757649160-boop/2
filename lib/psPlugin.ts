/**
 * PS插件集成工具
 * 用于与Photoshop UXP插件通信
 */

// 检测是否在PS插件环境中
export function isInPhotoshopPlugin(): boolean {
  if (typeof window === 'undefined') return false;
  return !!window.__PS_PLUGIN__ || detectPSPlugin();
}

let cachedDetection: boolean | null = null;
function detectPSPlugin(): boolean {
  if (cachedDetection !== null) return cachedDetection;
  if (typeof window !== 'undefined' && window.uxpHost && typeof window.uxpHost.postMessage === 'function') {
    cachedDetection = true;
    return true;
  }
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('ps_plugin') === '1') {
      cachedDetection = true;
      return true;
    }
  }
  cachedDetection = false;
  return false;
}

let requestIdCounter = 0;
const pendingRequests = new Map<number, { resolve: (value: any) => void; reject: (reason: any) => void }>();
let listenerInitialized = false;

type PSRequestHandler = (args: any[]) => Promise<any> | any;
const requestHandlers = new Map<string, PSRequestHandler>();

export function registerPSRequestHandler(method: string, handler: PSRequestHandler): () => void {
  requestHandlers.set(method, handler);
  return () => {
    if (requestHandlers.get(method) === handler) {
      requestHandlers.delete(method);
    }
  };
}

/**
 * 发送消息到PS宿主（与 invokePSPlugin 使用相同的多通道策略）
 */
function sendToPSHost(message: any) {
  try {
    if (window.uxpHost && typeof window.uxpHost.postMessage === 'function') {
      window.uxpHost.postMessage(message);
    } else if (window.parent && window.parent !== window) {
      window.parent.postMessage(message, '*');
    } else {
      window.postMessage(message, '*');
    }
  } catch (e) {
    console.error('[PS插件] 发送消息失败:', e);
  }
}

/**
 * 初始化消息监听器（必须在检测到PS插件环境后调用）
 */
function ensureListener() {
  if (listenerInitialized || typeof window === 'undefined') return;

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;

    // 处理响应消息（网页 → PS 请求的回复）
    if (data.type === 'response' && data.requestId) {
      const pending = pendingRequests.get(data.requestId);
      if (pending) {
        pendingRequests.delete(data.requestId);
        if (data.error) pending.reject(new Error(data.error));
        else pending.resolve(data.result);
      }
      return;
    }

    // 处理PS端主动发来的请求
    if (data.type === 'request' && data.method) {
      const handler = requestHandlers.get(data.method);
      if (handler) {
        Promise.resolve()
          .then(() => handler(data.args || []))
          .then((result) => {
            sendToPSHost({ type: 'response', requestId: data.requestId, result });
          })
          .catch((err) => {
            sendToPSHost({ type: 'response', requestId: data.requestId, error: err.message || String(err) });
          });
      } else {
        sendToPSHost({ type: 'response', requestId: data.requestId, error: `未知方法: ${data.method}` });
      }
      return;
    }

    if (data.type === 'event' && data.event) {
      window.dispatchEvent(new CustomEvent('ps-plugin-event', { detail: data }));
    }
  });

  listenerInitialized = true;
  console.log('[PS插件] 消息监听器已初始化');
}

/**
 * 初始化PS插件通信桥。在检测到PS插件环境后立即调用，
 * 确保PS端主动发来的请求能被接收。
 */
export function initPSPluginBridge(): void {
  if (typeof window === 'undefined') return;
  ensureListener();
}

export function invokePSPlugin(method: string, ...args: any[]): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!isInPhotoshopPlugin()) {
      reject(new Error('不在PS插件环境中'));
      return;
    }

    ensureListener();

    const requestId = ++requestIdCounter;
    pendingRequests.set(requestId, { resolve, reject });

    sendToPSHost({ type: 'request', requestId, method, args });

    setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        reject(new Error('请求超时'));
      }
    }, 120000);
  });
}

export async function capturePSLayer(): Promise<{
  success: boolean;
  imageData: string;
  width: number;
  height: number;
  layerName: string;
}> {
  return invokePSPlugin('captureLayer');
}

export async function sendToPhotoshop(
  imageUrl: string,
  options?: { asSmartObject?: boolean }
): Promise<{
  success: boolean;
  message: string;
}> {
  return invokePSPlugin('sendToPhotoshop', imageUrl, options || {});
}

export async function getPSDocumentInfo(): Promise<{
  hasDocument: boolean;
  width?: number;
  height?: number;
  mode?: string;
  name?: string;
}> {
  return invokePSPlugin('getDocumentInfo');
}

export function onPSEvent(callback: (event: any) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: any) => callback(e.detail);
  window.addEventListener('ps-plugin-event', handler);
  return () => window.removeEventListener('ps-plugin-event', handler);
}

declare global {
  interface Window {
    uxpHost?: {
      postMessage: (message: any) => void;
    };
    __PS_PLUGIN__?: boolean;
  }
}
