/**
 * PS插件集成工具
 * 用于与Photoshop UXP插件通信
 */

// 检测是否在PS插件环境中
export function isInPhotoshopPlugin(): boolean {
  if (typeof window === 'undefined') return false;
  
  // 检测UXP WebView环境
  // 插件的host.js会通过postMessage通信
  return !!window.__PS_PLUGIN__ || detectPSPlugin();
}

// 检测PS插件环境（通过postMessage ping）
let cachedDetection: boolean | null = null;
function detectPSPlugin(): boolean {
  if (cachedDetection !== null) return cachedDetection;
  
  // 检查是否有uxpHost对象（HHPS风格）
  if (typeof window !== 'undefined' && window.uxpHost && typeof window.uxpHost.postMessage === 'function') {
    cachedDetection = true;
    return true;
  }
  
  // 检查URL参数（用于调试）
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

// 请求ID计数器
let requestIdCounter = 0;
// 待处理的请求
const pendingRequests = new Map<number, { resolve: (value: any) => void; reject: (reason: any) => void }>();
// 消息监听器是否已初始化
let listenerInitialized = false;

// PS端主动发来的请求处理器注册表
// key: method名, value: handler函数
type PSRequestHandler = (args: any[]) => Promise<any> | any;
const requestHandlers = new Map<string, PSRequestHandler>();

/**
 * 注册PS端请求处理器
 * PS插件端主动调用网页端方法时，通过此注册响应
 */
export function registerPSRequestHandler(method: string, handler: PSRequestHandler): () => void {
  requestHandlers.set(method, handler);
  return () => {
    if (requestHandlers.get(method) === handler) {
      requestHandlers.delete(method);
    }
  };
}

/**
 * 初始化消息监听器
 */
function ensureListener() {
  if (listenerInitialized || typeof window === 'undefined') return;
  
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    
    // 处理响应消息（网页端 → PS端请求的回复）
    if (data.type === 'response' && data.requestId) {
      const pending = pendingRequests.get(data.requestId);
      if (pending) {
        pendingRequests.delete(data.requestId);
        if (data.error) {
          pending.reject(new Error(data.error));
        } else {
          pending.resolve(data.result);
        }
      }
      return;
    }
    
    // 处理PS端主动发来的请求（PS端按钮触发 → 网页端处理）
    if (data.type === 'request' && data.method) {
      const handler = requestHandlers.get(data.method);
      if (handler) {
        Promise.resolve()
          .then(() => handler(data.args || []))
          .then((result) => {
            replyToPS(event, data.requestId, null, result);
          })
          .catch((err) => {
            replyToPS(event, data.requestId, err.message || String(err), null);
          });
      } else {
        // 没有注册的处理器，回复未知方法
        replyToPS(event, data.requestId, `未知方法: ${data.method}`, null);
      }
      return;
    }
    
    // 处理来自插件的主动消息
    if (data.type === 'event' && data.event) {
      const customEvent = new CustomEvent('ps-plugin-event', {
        detail: data
      });
      window.dispatchEvent(customEvent);
    }
  });
  
  listenerInitialized = true;
}

/**
 * 回复PS端请求
 */
function replyToPS(event: MessageEvent, requestId: number, error: string | null, result: any) {
  const reply: any = { type: 'response', requestId };
  if (error) reply.error = error;
  else reply.result = result;
  
  try {
    // 回复给发送方
    if (event.source) {
      (event.source as Window).postMessage(reply, event.origin || '*');
    } else if (window.uxpHost) {
      window.uxpHost.postMessage(reply);
    } else {
      window.postMessage(reply, '*');
    }
  } catch (e) {
    console.error('[PS插件] 回复消息失败:', e);
  }
}

/**
 * 调用PS插件方法
 */
export function invokePSPlugin(method: string, ...args: any[]): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!isInPhotoshopPlugin()) {
      reject(new Error('不在PS插件环境中'));
      return;
    }
    
    ensureListener();
    
    const requestId = ++requestIdCounter;
    pendingRequests.set(requestId, { resolve, reject });
    
    // 发送请求
    const message = {
      type: 'request',
      requestId,
      method,
      args
    };
    
    // 尝试多种方式发送消息
    try {
      // 方式1: uxpHost.postMessage（HHPS风格）
      if (window.uxpHost && typeof window.uxpHost.postMessage === 'function') {
        window.uxpHost.postMessage(message);
      }
      // 方式2: window.parent.postMessage（iframe方式）
      else if (window.parent && window.parent !== window) {
        window.parent.postMessage(message, '*');
      }
      // 方式3: window.postMessage（同窗口调试）
      else {
        window.postMessage(message, '*');
      }
    } catch (e) {
      pendingRequests.delete(requestId);
      reject(e);
      return;
    }
    
    // 超时处理
    setTimeout(() => {
      if (pendingRequests.has(requestId)) {
        pendingRequests.delete(requestId);
        reject(new Error('请求超时'));
      }
    }, 120000); // 120秒超时
  });
}

/**
 * 捕获PS当前图层
 * 返回 { success: boolean, imageData: string, width: number, height: number, layerName: string }
 */
export async function capturePSLayer(): Promise<{
  success: boolean;
  imageData: string; // base64 PNG
  width: number;
  height: number;
  layerName: string;
}> {
  return invokePSPlugin('captureLayer');
}

/**
 * 将图片发送到Photoshop
 * @param imageUrl 图片URL或base64数据
 * @param options 选项
 */
export async function sendToPhotoshop(
  imageUrl: string,
  options?: { asSmartObject?: boolean }
): Promise<{
  success: boolean;
  message: string;
}> {
  return invokePSPlugin('sendToPhotoshop', imageUrl, options || {});
}

/**
 * 获取当前文档信息
 */
export async function getPSDocumentInfo(): Promise<{
  hasDocument: boolean;
  width?: number;
  height?: number;
  mode?: string;
  name?: string;
}> {
  return invokePSPlugin('getDocumentInfo');
}

/**
 * 监听PS插件事件
 */
export function onPSEvent(callback: (event: any) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  
  const handler = (e: any) => {
    callback(e.detail);
  };
  
  window.addEventListener('ps-plugin-event', handler);
  return () => window.removeEventListener('ps-plugin-event', handler);
}

// 扩展Window类型
declare global {
  interface Window {
    uxpHost?: {
      postMessage: (message: any) => void;
    };
    __PS_PLUGIN__?: boolean;
  }
}
