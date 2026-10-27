import { MAIN_API, BACKUP_API } from './config';
/**
 * API代理工具，实现主备API自动切换
 */
type ApiConfig = {
  baseUrl: string;
  apiKey: string;
};

/**
 * 从上游响应中提取具体错误信息（不暴露密钥）
 */
async function extractErrorMessage(response: Response): Promise<string> {
  let detail = `${response.status} ${response.statusText}`;
  try {
    const data = await response.json();
    if (data?.error?.message) {
      detail = data.error.message;
    } else if (data?.error) {
      detail = typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
    } else if (data?.message) {
      detail = data.message;
    }
  } catch (e) {
    // 响应体不是JSON，保留 statusText
  }
  return detail;
}

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
  
  let response: Response;
  try {
    response = await fetch(`${apiConfig.baseUrl}${endpoint}`, {
      method,
      headers,
      body: requestBody,
    });
  } catch (err: any) {
    throw new Error(`连接上游 ${apiConfig.baseUrl} 失败: ${err.message}`);
  }
  if (!response.ok) {
    const detail = await extractErrorMessage(response);
    throw new Error(`上游 ${apiConfig.baseUrl} 返回错误: ${detail}`);
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
  } catch (mainError: any) {
    console.warn('Main API failed, trying backup API:', mainError);
    
    // 主API失败，尝试备用API
    try {
      return await tryApiRequest(BACKUP_API, endpoint, body, method);
    } catch (backupError: any) {
      console.error('Both APIs failed:', backupError);
      throw new Error(`所有API服务暂时不可用。主API：${mainError.message}；备用API：${backupError.message}`);
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
    const detail = await extractErrorMessage(response);
    throw new Error(`上游 ${MAIN_API.baseUrl} 返回错误: ${detail}`);
  } catch (mainError: any) {
    console.warn('Main API stream failed, trying backup API:', mainError);
    
    // 主API失败，尝试备用API
    try {
      const response = await fetch(`${BACKUP_API.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${BACKUP_API.apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        return response;
      }
      const detail = await extractErrorMessage(response);
      throw new Error(`上游 ${BACKUP_API.baseUrl} 返回错误: ${detail}`);
    } catch (backupError: any) {
      console.error('Backup API stream failed:', backupError);
      throw new Error(`所有API服务暂时不可用。主API：${mainError.message}；备用API：${backupError.message}`);
    }
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
