'use client';
import { useState, useEffect } from 'react';
import { IMAGE_MODELS, IMAGE_RESOLUTIONS, MODEL_PRICING } from '@/lib/config';
// 上传图片到img.scdn.io图床
const uploadToScdn = async (file: File): Promise<string> => {
  // 创建FormData，按照API要求格式
  const formData = new FormData();
  // 添加图片文件
  formData.append('image', file);
  // 指定CDN域名，使用用户配置的img.scdn.io
  formData.append('cdn_domain', 'img.scdn.io');
  // 推荐使用自动输出格式，自动优化图片
  formData.append('outputFormat', 'auto');
  
  // 调用图床API上传
  const response = await fetch('https://img.scdn.io/api/v1.php', {
    method: 'POST',
    body: formData,
    // fetch会自动处理FormData的Content-Type，无需手动设置
  });
  
  if (!response.ok) {
    let errorMsg = '上传失败，请稍后再试';
    try {
      const errorData = await response.json();
      if (errorData.message) {
        errorMsg = errorData.message;
      }
    } catch (e) {
      errorMsg = `HTTP ${response.status}: ${response.statusText}`;
    }
    throw new Error(`上传图床失败: ${errorMsg}`);
  }
  
  const data = await response.json();
  if (!data.success) {
    throw new Error(`上传图床失败: ${data.message || '未知错误'}`);
  }
  
  // 返回API返回的图片外链URL
  return data.url;
};
export default function ImagePage() {
const [userId, setUserId] = useState('');
const [prompt, setPrompt] = useState('');
const [provider, setProvider] = useState<string>('gpt-image-2');
const [model, setModel] = useState<string>('');
const [resolution, setResolution] = useState<string>('1024x1024');
const [aspectRatio, setAspectRatio] = useState<string>('auto');
const [loading, setLoading] = useState(false);
const [result, setResult] = useState<string | null>(null);
// 参考图状态，支持最多5张，现在存的是图床URL，以及图片原始宽高
const [referenceImages, setReferenceImages] = useState<{file: File, preview: string, url: string, width: number, height: number}[]>([]);
// 上传状态
const [uploading, setUploading] = useState(false);
// 根据模型和比例获取对应的分辨率
const getResolutionByAspect = (currentModel: string, ratio: string, referenceImages: {width: number, height: number}[]) => {
  if (ratio === 'auto') {
    // 自动模式：如果有参考图，自动适配第一张参考图的比例，否则默认返回1:1
    const resolutions = IMAGE_RESOLUTIONS[currentModel] || [];
    if (referenceImages.length > 0) {
      // 用第一张参考图的宽高比例
      const firstImg = referenceImages[0];
      const imgRatio = firstImg.width / firstImg.height;
      // 遍历分辨率，找到最匹配的比例
      for (const res of resolutions) {
        const [w, h] = res.split('x').map(Number);
        const resRatio = w / h;
        // 误差在0.1以内就算匹配
        if (Math.abs(imgRatio - resRatio) < 0.1) {
          return res;
        }
      }
    }
    // 没有参考图或者没找到匹配的，用默认的第一个分辨率
    return resolutions[0] || '1024x1024';
  }
  const resolutions = IMAGE_RESOLUTIONS[currentModel] || [];
  for (const res of resolutions) {
    const [w, h] = res.split('x').map(Number);
    if (ratio === '1:1' && w === h) return res;
    if (ratio === '16:9' && Math.abs(w/h - 16/9) < 0.01) return res;
    if (ratio === '9:16' && Math.abs(w/h - 9/16) < 0.01) return res;
    if (ratio === '4:3' && Math.abs(w/h - 4/3) < 0.01) return res;
    if (ratio === '3:4' && Math.abs(w/h - 3/4) < 0.01) return res;
    if (ratio === '3:2' && Math.abs(w/h - 3/2) < 0.01) return res;
    if (ratio === '2:3' && Math.abs(w/h - 2/3) < 0.01) return res;
    if (ratio === '5:4' && Math.abs(w/h - 5/4) < 0.01) return res;
    if (ratio === '4:5' && Math.abs(w/h - 4/5) < 0.01) return res;
    if (ratio === '21:9' && Math.abs(w/h - 21/9) < 0.01) return res;
    if (ratio === '9:21' && Math.abs(w/h - 9/21) < 0.01) return res;
  }
  return resolutions[0] || '1024x1024';
};
// 下载图片的处理函数，处理跨域问题
const handleDownload = async () => {
  if (!result) return;
  try {
    const response = await fetch(result);
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ai-generated-image-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    // 下载失败则 fallback 到新窗口打开图片
    window.open(result, '_blank');
  }
};
// 参考图上传处理，支持最多5张，自动上传到img.scdn.io图床
const handleReferenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = e.target.files;
  if (!files) return;
  // 最多支持5张
  const newFiles = Array.from(files).slice(0, 5 - referenceImages.length);
  setUploading(true);
  try {
    for (const file of newFiles) {
      const preview = URL.createObjectURL(file);
      // 读取图片的原始宽高，用于自动适配比例
      const img = new Image();
      img.src = preview;
      await new Promise(resolve => img.onload = resolve);
      const width = img.naturalWidth;
      const height = img.naturalHeight;
      // 自动上传到img.scdn.io图床
      const url = await uploadToScdn(file);
      setReferenceImages(prev => [...prev, {
        file,
        preview,
        url,
        width,
        height,
      }]);
    }
  } catch (error: any) {
    alert(error.message);
  } finally {
    setUploading(false);
  }
  // 清空input
  e.target.value = '';
};
// 删除参考图
const handleRemoveReference = (index: number) => {
  const img = referenceImages[index];
  if (img) {
    URL.revokeObjectURL(img.preview);
  }
  setReferenceImages(prev => prev.filter((_, i) => i !== index));
};
useEffect(() => {
let storedUserId = localStorage.getItem('userId');
if (!storedUserId) {
storedUserId = 'user_' + Math.random().toString(36).substr(2, 9);
localStorage.setItem('userId', storedUserId);
}
setUserId(storedUserId);
const modelConfig = IMAGE_MODELS['gpt-image-2'];
const models = modelConfig.models;
if (models && models.length > 0) {
setModel(models[0]);
}
}, []);
useEffect(() => {
const modelConfig = IMAGE_MODELS[provider];
const models = modelConfig.models;
if (models && models.length > 0) {
setModel(models[0]);
}
}, [provider]);
// 当模型、比例或参考图变化时，自动更新分辨率
useEffect(() => {
  if (model) {
    const newRes = getResolutionByAspect(model, aspectRatio, referenceImages);
    setResolution(newRes);
  }
}, [model, aspectRatio, referenceImages]);
const handleSubmit = async (e: React.FormEvent) => {
e.preventDefault();
if (!prompt.trim() || loading) return;
setLoading(true);
setResult(null);
try {
// 完整的模型名字，需要拼接provider和model
const fullModel = `${provider}-${model}`;
// 构建请求体，用API支持的image参数，现在传的是图床URL
// 处理auto比例：如果是auto且有参考图，自动提取参考图的比例传给后端，适配nano-banana模型
let finalAspectRatio = aspectRatio;
if (aspectRatio === 'auto' && referenceImages.length > 0) {
  // 用第一个参考图的宽高计算比例
  const firstImg = referenceImages[0];
  const imgRatio = firstImg.width / firstImg.height;
  // 匹配对应的aspect_ratio枚举值
  const ratios = [
    { ratio: 1/1, value: '1:1' },
    { ratio: 16/9, value: '16:9' },
    { ratio: 9/16, value: '9:16' },
    { ratio: 4/3, value: '4:3' },
    { ratio: 3/4, value: '3:4' },
    { ratio: 3/2, value: '3:2' },
    { ratio: 2/3, value: '2:3' },
    { ratio: 5/4, value: '5:4' },
    { ratio: 4/5, value: '4:5' },
    { ratio: 21/9, value: '21:9' },
    { ratio: 9/21, value: '9:21' },
  ];
  // 找到最匹配的比例
  let bestMatch = '1:1';
  let minDiff = Infinity;
  for (const r of ratios) {
    const diff = Math.abs(imgRatio - r.ratio);
    if (diff < minDiff) {
      minDiff = diff;
      bestMatch = r.value;
    }
  }
  finalAspectRatio = bestMatch;
}

const body: any = {
  userId,
  model: fullModel,
  prompt,
  size: resolution,
  aspectRatio: finalAspectRatio,
};
// 如果有参考图，添加image参数，传的是图床URL，请求体非常小
if (referenceImages.length > 0) {
  body.image = referenceImages.map(img => img.url);
}
const response = await fetch('/api/image', {
method: 'POST',
headers: {
  'Content-Type': 'application/json',
},
body: JSON.stringify(body),
});
const data = await response.json();
if (data.error) {
alert(data.error);
return;
}
setResult(data.imageUrl);
} catch (error: any) {
alert(error.message);
} finally {
setLoading(false);
}
};
// 完整的模型名字，用来获取价格
const fullModel = `${provider}-${model}`;
const currentPricing = MODEL_PRICING[fullModel];
const availableModels = IMAGE_MODELS[provider]?.models || [];
return (
<div className="min-h-screen bg-white" style={{ backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
<div className="max-w-5xl mx-auto px-4 py-8">
<div className="text-center mb-8">
<h1 className="text-3xl font-bold text-gray-900 mb-2">AI 绘图</h1>
<p className="text-gray-500">输入提示词，生成精美的图片</p>
</div>
<div className="flex gap-6">
<div className="w-64 flex-shrink-0">
<div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sticky top-8">
<h3 className="text-sm font-semibold text-gray-700 mb-4">绘图设置</h3>
<div className="space-y-4">
<div>
<label className="block text-xs font-medium text-gray-500 mb-2">
模型厂商
</label>
<select
value={provider}
onChange={(e) => setProvider(e.target.value)}
className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
>
{Object.keys(IMAGE_MODELS).map(p => (
<option key={p} value={p}>{p}</option>
))}
</select>
</div>
<div>
<label className="block text-xs font-medium text-gray-500 mb-2">
模型
</label>
<select
value={model}
onChange={(e) => setModel(e.target.value)}
className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
>
{availableModels.map(m => (
<option key={m} value={m}>{m}</option>
))}
</select>
</div>
{/* 绘图比例选择框 */}
<div>
<label className="block text-xs font-medium text-gray-500 mb-2">
绘图比例
</label>
<select
value={aspectRatio}
onChange={(e) => setAspectRatio(e.target.value)}
className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
>
<option value="auto">默认自动（有参考图时自动适配参考图比例）</option>
<option value="1:1">1:1 (正方形)</option>
<option value="16:9">16:9 (横屏)</option>
<option value="9:16">9:16 (竖屏)</option>
<option value="4:3">4:3</option>
<option value="3:4">3:4</option>
<option value="3:2">3:2</option>
<option value="2:3">2:3</option>
<option value="5:4">5:4</option>
<option value="4:5">4:5</option>
<option value="21:9">21:9 (超宽屏)</option>
<option value="9:21">9:21 (超长屏)</option>
</select>
</div>
<div className="pt-3 border-t border-gray-100">
<div className="text-xs text-gray-500">
<div className="flex justify-between">
<span>单次价格</span>
<span className="font-medium text-gray-700">{currentPricing?.input || 0} 积分</span>
</div>
{referenceImages.length > 0 && (
  <div className="flex justify-between mt-1">
    <span>参考图费用</span>
    <span className="font-medium text-gray-700">+{(referenceImages.length * 0.01).toFixed(2)} 积分</span>
  </div>
)}
</div>
</div>
</div>
</div>
</div>
<div className="flex-1">
{/* 结果展示区域 */}
<div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-6 h-[400px] overflow-hidden flex items-center justify-center relative">
{result ? (
<>
<img src={result} alt="Generated" className="max-w-full max-h-full object-contain" />
{/* 下载按钮 */}
<button
onClick={handleDownload}
className="absolute bottom-4 right-4 bg-yellow-500 text-white px-4 py-2 rounded-xl hover:bg-yellow-600 flex items-center gap-2 transition-colors shadow-sm"
>
<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 00-3-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
</svg>
下载图片
</button>
</>
) : loading ? (
<div className="text-gray-500">
<div className="flex flex-col items-center">
<div className="w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mb-4"></div>
<p>生成中...</p>
</div>
</div>
) : (
<div className="flex flex-col items-center text-gray-400">
<div className="w-16 h-16 bg-yellow-50 rounded-full flex items-center justify-center mb-4">
<svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 00-2-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 00-2 2z" />
</svg>
</div>
<p>生成的图片将显示在这里</p>
</div>
)}
</div>
{/* 参考图上传区域，支持最多5张 */}
{referenceImages.length > 0 && (
  <div className="mb-4">
    <label className="block text-xs font-medium text-gray-500 mb-2">参考图 ({referenceImages.length}/5)</label>
    <div className="flex gap-3 flex-wrap">
      {referenceImages.map((img, index) => (
        <div key={index} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200">
          <img src={img.preview} alt={`参考图${index+1}`} className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={() => handleRemoveReference(index)}
            className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
          >
            ×
          </button>
          <span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs text-center py-0.5">
            图{index+1}
          </span>
        </div>
      ))}
    </div>
  </div>
)}
{referenceImages.length < 5 && (
  <div className="mb-4">
    <label className="flex items-center justify-center w-full h-16 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-yellow-400 transition-colors">
      <div className="flex items-center gap-2 text-gray-500 text-sm">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 00-2-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 00-2 2z" />
        </svg>
        {uploading ? (
          <>
            <div className="w-4 h-4 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
            正在上传到img.scdn.io图床...
          </>
        ) : (
          '上传参考图（最多5张，可多选，自动上传到img.scdn.io图床）'
        )}
      </div>
      <input
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleReferenceUpload}
        disabled={loading || uploading}
      />
    </label>
  </div>
)}
{/* 输入框 */}
<form onSubmit={handleSubmit} className="relative">
<textarea
value={prompt}
onChange={(e) => setPrompt(e.target.value)}
placeholder="描述您想要生成的图片，参考图会自动上传到img.scdn.io图床，然后把URL传给API，绝对不会有请求太大的问题！"
rows={3}
className="w-full border border-gray-200 rounded-2xl px-6 py-4 pr-32 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent shadow-sm resize-none"
disabled={loading || uploading}
 />
<button
type="submit"
disabled={loading || !prompt.trim() || uploading}
className="absolute right-2 bottom-2 bg-yellow-500 text-white px-6 py-2.5 rounded-xl hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
>
生成
</button>
</form>
</div>
</div>
</div>
</div>
);
}
