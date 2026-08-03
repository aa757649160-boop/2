import { MAIN_API, BACKUP_API } from './config';
/**
 * API代理工具，实现主备API自动切换
 */
type ApiConfig = {
  baseUrl: string;
  apiKey: string;
};
async function tryApiRequest(
  apiConfig: ApiConfig,
  endpoint: string,
  body: any,
  method: 'POST' | 'GET' = 'POST'
) {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${apiConfig.apiKey}`,
  };
  let requestBody: any;
  
  // 如果body是FormData，不序列化，直接传递，不设置Content-Type，让fetch自动处理
  if (body instanceof FormData) {
    requestBody = body;
  } else {
    // 否则，正常的JSON处理
    headers['Content-Type'] = 'application/json';
    requestBody = method === 'POST' ? JSON.stringify(body) : undefined;
  }
  
  const response = await fetch(`${apiConfig.baseUrl}${endpoint}`, {
    method,
    headers,
    body: requestBody,
  });
  if (!response.ok) {
    throw new Error(`API request failed: ${response.statusText}`);
  }
  return response;
}
export async function proxyApiRequest(
  endpoint: string,
  body: any,
  method: 'POST' | 'GET' = 'POST'
) {
  // 先尝试主API
  try {
    return await tryApiRequest(MAIN_API, endpoint, body, method);
  } catch (mainError) {
    console.warn('Main API failed, trying backup API:', mainError);
    
    // 主API失败，尝试备用API
    try {
      return await tryApiRequest(BACKUP_API, endpoint, body, method);
    } catch (backupError) {
      console.error('Both APIs failed:', backupError);
      throw new Error('所有API服务暂时不可用，请稍后再试');
    }
  }
}
export async function proxyStreamRequest(
  endpoint: string,
  body: any
) {
  // 先尝试主API
  try {
    const response = await fetch(`${MAIN_API.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MAIN_API.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (response.ok) {
      return response;
    }
    throw new Error(`Main API failed: ${response.statusText}`);
  } catch (mainError) {
    console.warn('Main API stream failed, trying backup API:', mainError);
    
    // 主API失败，尝试备用API
    const response = await fetch(`${BACKUP_API.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BACKUP_API.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      console.error('Backup API stream failed:', response.statusText);
      throw new Error('所有API服务暂时不可用，请稍后再试');
    }
    return response;
  }
}

/**
 * 使用指定API密钥发起请求（用于稳定接口）
 * @param endpoint API端点
 * @param body 请求体
 * @param customApiKey 自定义API密钥，如果不传则使用主API密钥
 * @param method 请求方法
 */
export async function proxyApiRequestWithKey(
  endpoint: string,
  body: any,
  customApiKey?: string,
  method: 'POST' | 'GET' = 'POST'
) {
  // 如果提供了自定义API密钥，使用它；否则使用主备切换逻辑
  if (customApiKey) {
    const apiConfig: ApiConfig = {
      baseUrl: MAIN_API.baseUrl,
      apiKey: customApiKey,
    };
    return await tryApiRequest(apiConfig, endpoint, body, method);
  }
  
  // 没有自定义密钥，走正常的主备切换逻辑
  return await proxyApiRequest(endpoint, body, method);
}
