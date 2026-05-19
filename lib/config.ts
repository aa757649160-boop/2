// 主API和备用API的基础URL
export const MAIN_API_BASE_URL = 'https://ai.comfly.org';
export const BACKUP_API_BASE_URL = 'https://grsaapi.com';
// 收款码图片路径
export const PAYMENT_QRCODE = '/qrcode/payment_qrcode.png';
// 充值档位配置
export const RECHARGE_OPTIONS = [
{ amount: 12, points: 10, label: '12元 = 10积分' },
{ amount: 118, points: 100, label: '118元 = 100积分' },
{ amount: 220, points: 200, label: '220元 = 200积分' },
{ amount: 1100, points: 1000, label: '1100元 = 1000积分' },
];
// 模型价格配置
// 对话模型：每千token价格，单位：积分
// 图片/视频模型：单次调用价格，单位：积分
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
// OpenAI 对话模型
'gpt-5.5': { input: 0.008, output: 0.05 },
'gpt-5.4-2026-03-05': { input: 0.005, output: 0.032 },
'gpt-5.4': { input: 0.005, output: 0.03 },
// Claude 对话模型
'claude-opus-4-7': { input: 0.009, output: 0.052 },
'claude-sonnet-4-6-thinking': { input: 0.006, output: 0.03 },
'claude-sonnet-4-6': { input: 0.005, output: 0.03 },
// 图片生成模型
'gpt-image-2-1k': { input: 0.06, output: 0 },
'gpt-image-2-2k': { input: 0.08, output: 0 },
'gpt-image-2-4k': { input: 0.12, output: 0 },
'nano-banana-2-1k': { input: 0.12, output: 0 },
'nano-banana-2-2k': { input: 0.22, output: 0 },
'nano-banana-2-4k': { input: 0.32, output: 0 },
// 视频生成模型
'sora-2': { input: 0.22, output: 0 },
'grok-video-3': { input: 0.9, output: 0 },
'vidu2.0': { input: 0.07, output: 0 },
};
// 对话模型分组
export const CHAT_MODELS: Record<string, string[]> = {
'OpenAI': ['gpt-5.5', 'gpt-5.4-2026-03-05', 'gpt-5.4'],
'Claude': ['claude-opus-4-7', 'claude-sonnet-4-6-thinking', 'claude-sonnet-4-6'],
};
// 图片模型分组
export const IMAGE_MODELS: Record<string, {
models: string[];
note?: string;
}> = {
'gpt-image-2': {
models: ['1k', '2k', '4k'],
},
'nano-banana-2': {
models: ['1k', '2k', '4k'],
note: 'nano-banana2',
},
};
// 视频模型
export const VIDEO_MODELS: string[] = ['sora-2', 'grok-video-3', 'vidu2.0'];
// 默认模型
export const DEFAULT_CHAT_MODEL = 'gpt-5.5';
export const DEFAULT_IMAGE_MODEL = 'gpt-image-2';
export const DEFAULT_VIDEO_MODEL = 'sora-2';
// 兼容旧代码的导出
export const ADMIN_USER_ID = 'admin';
export const MAIN_API = {
baseUrl: MAIN_API_BASE_URL,
apiKey: process.env.MAIN_API_KEY || '',
};
export const BACKUP_API = {
baseUrl: BACKUP_API_BASE_URL,
apiKey: process.env.BACKUP_API_KEY || '',
};

// 兼容旧页面的导出别名
export const RECHARGE_TIERS = RECHARGE_OPTIONS;
export const IMAGE_RESOLUTIONS: Record<string, string[]> = {
  '1k': [
    '1024x1024', // 1:1
    '1792x1024', // 16:9
    '1024x1792', // 9:16
    '1365x1024', // 4:3
    '1024x1365', // 3:4
    '1536x1024', // 3:2
    '1024x1536', // 2:3
    '1280x1024', // 5:4
    '1024x1280', // 4:5
    '2389x1024', // 21:9
    '1024x2389', // 9:21
  ],
  '2k': [
    '2048x2048', // 1:1
    '3584x2048', // 16:9
    '2048x3584', // 9:16
    '2730x2048', // 4:3
    '2048x2730', // 3:4
    '3072x2048', // 3:2
    '2048x3072', // 2:3
    '2560x2048', // 5:4
    '2048x2560', // 4:5
    '4778x2048', // 21:9
    '2048x4778', // 9:21
  ],
  '4k': [
    '4096x4096', // 1:1
    '7168x4096', // 16:9
    '4096x7168', // 9:16
    '5461x4096', // 4:3
    '4096x5461', // 3:4
    '6144x4096', // 3:2
    '4096x6144', // 2:3
    '5120x4096', // 5:4
    '4096x5120', // 4:5
    '9557x4096', // 21:9
    '4096x9557', // 9:21
  ],
};
