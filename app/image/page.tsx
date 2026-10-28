'use client';
import { useState, useEffect, useRef } from 'react';
import { IMAGE_MODELS, IMAGE_RESOLUTIONS, MODEL_PRICING, IMAGE_PRESETS } from '@/lib/config';
import { isInPhotoshopPlugin, capturePSLayer, sendToPhotoshop, registerPSRequestHandler, initPSPluginBridge } from '@/lib/psPlugin';

const uploadToScdn = async (file: File): Promise<string> => {
  const formData = new FormData();
  formData.append('image', file);
  formData.append('cdn_domain', 'cloudflareimg.cdn.sn');
  formData.append('outputFormat', 'auto');
  const response = await fetch('https://img.scdn.io/api/v1.php', {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    let errorMsg = '上传失败，请稍后再试';
    try {
      const errorData = await response.json();
      if (errorData.message) errorMsg = errorData.message;
    } catch (e) {}
    throw new Error(`上传图床失败: ${errorMsg}`);
  }
  const data = await response.json();
  if (!data.success) throw new Error(`上传图床失败: ${data.message || '未知错误'}`);
  return data.url;
};

type Task = {
  id: number;
  status: 'pending' | 'complete';
  result: string[] | null;
  prompt: string;
  params?: {
    userId: string;
    provider: string;
    model: string;
    resolution: string;
    aspectRatio: string;
    count: number;
    referenceImages: {url: string, width: number, height: number}[];
  };
};

export default function ImagePage() {
const loadPersistedTasks = () => {
  try {
    const storedTasks = localStorage.getItem('imageTasks');
    const storedNextId = localStorage.getItem('imageNextTaskId');
    const storedActiveId = localStorage.getItem('imageActiveTaskId');
    return {
      tasks: storedTasks ? JSON.parse(storedTasks) : [],
      nextTaskId: storedNextId ? parseInt(storedNextId) : 1,
      activeTaskId: storedActiveId ? parseInt(storedActiveId) : null
    };
  } catch {
    return { tasks: [], nextTaskId: 1, activeTaskId: null };
  }
};

const initialTaskState = loadPersistedTasks();

const [userId, setUserId] = useState('');
const [prompt, setPrompt] = useState('');
const [provider, setProvider] = useState<string>('gpt-image-2');
const [model, setModel] = useState<string>('');
const [resolution, setResolution] = useState<string>('1024x1024');
const [aspectRatio, setAspectRatio] = useState<string>('auto');
const [count, setCount] = useState(1);
const [referenceImages, setReferenceImages] = useState<{file: File, preview: string, url: string, width: number, height: number}[]>([]);
const [uploading, setUploading] = useState(false);
const [history, setHistory] = useState<Array<{time: number, images: string[], prompt: string}>>([]);
const [tasks, setTasks] = useState<Task[]>(initialTaskState.tasks);
const [activeTaskId, setActiveTaskId] = useState<number | null>(initialTaskState.activeTaskId);
const [nextTaskId, setNextTaskId] = useState<number>(initialTaskState.nextTaskId);
const mountedRef = useRef(true);

const referenceImagesRef = useRef(referenceImages);
const activeTaskRef = useRef<Task | null>(null);

useEffect(() => {
  referenceImagesRef.current = referenceImages;
}, [referenceImages]);

useEffect(() => {
  activeTaskRef.current = tasks.find(t => t.id === activeTaskId) || null;
}, [tasks, activeTaskId]);

useEffect(() => {
  initPSPluginBridge();
  setIsPSPlugin(isInPhotoshopPlugin());
}, []);

useEffect(() => {
  const unregisterRef = registerPSRequestHandler('receiveReferenceImage', async (args: any[]) => {
    console.log('[云卷AI网页] 收到PS参考图(base64), args长度:', args.length);
    const [base64Data, w, h, docName] = args;
    if (!base64Data) throw new Error('未收到图片数据');
    if (referenceImagesRef.current.length >= 5) throw new Error('参考图已达上限5张');
    const res = await fetch(base64Data);
    const blob = await res.blob();
    const file = new File([blob], `ps-canvas-${Date.now()}.png`, { type: 'image/png' });
    const url = await uploadToScdn(file);
    setReferenceImages(prev => [...prev, { file, preview: base64Data, url, width: w || 0, height: h || 0 }]);
    return { success: true, count: referenceImagesRef.current.length + 1 };
  });

  const unregisterUrl = registerPSRequestHandler('receiveReferenceImageUrl', async (args: any[]) => {
    console.log('[云卷AI网页] 收到PS参考图(URL), args:', args);
    const [imageUrl, w, h, docName] = args;
    if (!imageUrl) throw new Error('未收到图片URL');
    if (referenceImagesRef.current.length >= 5) throw new Error('参考图已达上限5张');
    setReferenceImages(prev => [...prev, {
      file: new File([], docName || 'ps-canvas.png', { type: 'image/png' }),
      preview: imageUrl,
      url: imageUrl,
      width: w || 0,
      height: h || 0,
    }]);
    return { success: true, count: referenceImagesRef.current.length + 1 };
  });

  const unregisterGet = registerPSRequestHandler('getCurrentGeneratedImage', async () => {
    const activeTask = activeTaskRef.current;
    if (activeTask && activeTask.result && activeTask.result.length > 0) {
      return { url: activeTask.result[0] };
    }
    return { url: null, message: '当前没有已生成的图片' };
  });

  return () => { unregisterRef(); unregisterUrl(); unregisterGet(); };
}, []);

useEffect(() => { localStorage.setItem('imageTasks', JSON.stringify(tasks)); }, [tasks]);
useEffect(() => { localStorage.setItem('imageNextTaskId', nextTaskId.toString()); }, [nextTaskId]);
useEffect(() => {
  if (activeTaskId !== null) localStorage.setItem('imageActiveTaskId', activeTaskId.toString());
  else localStorage.removeItem('imageActiveTaskId');
}, [activeTaskId]);
useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

const calculateReferenceImageSize = (width: number, height: number, maxSide = 3840) => {
  let targetW = width; let targetH = height;
  const max = Math.max(width, height);
  if (max > maxSide) { const scale = maxSide / max; targetW = Math.floor(width * scale); targetH = Math.floor(height * scale); }
  const alignTo16 = (val: number) => Math.ceil(val / 16) * 16;
  targetW = alignTo16(targetW); targetH = alignTo16(targetH);
  const finalMax = Math.max(targetW, targetH);
  if (finalMax > maxSide) { const adjustScale = maxSide / finalMax; targetW = alignTo16(Math.floor(targetW * adjustScale)); targetH = alignTo16(Math.floor(targetH * adjustScale)); }
  return { width: targetW, height: targetH };
};

const getResolutionByAspect = (currentModel: string, ratio: string, refImgs: {width: number, height: number}[], currentProvider?: string) => {
  if (ratio === 'auto') {
    if ((currentProvider === 'gpt-image-2' || currentProvider === 'gpt-image-2-stable') && refImgs.length > 0) return `${refImgs[0].width}x${refImgs[0].height}`;
    if (refImgs.length > 0) { const { width, height } = calculateReferenceImageSize(refImgs[0].width, refImgs[0].height, 3840); return `${width}x${height}`; }
    const resolutions = IMAGE_RESOLUTIONS[currentModel] || [];
    return resolutions[0] || '1024x1024';
  }
  const resolutions = IMAGE_RESOLUTIONS[currentModel] || [];
  const RATIO_TO_INDEX: Record<string, number> = { '1:1': 0, '16:9': 1, '9:16': 2, '4:3': 3, '3:4': 4, '3:2': 5, '2:3': 6, '5:4': 7, '4:5': 8, '21:9': 9, '9:21': 10 };
  const idx = RATIO_TO_INDEX[ratio];
  if (idx !== undefined && resolutions[idx]) return resolutions[idx];
  return resolutions[0] || '1024x1024';
};

const handleSingleDownload = async (url: string, index: number) => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const objUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objUrl; link.download = `ai-generated-image-${Date.now()}-${index+1}.png`;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    window.URL.revokeObjectURL(objUrl);
  } catch (error) { window.open(url, '_blank'); }
};

const handleBatchDownload = async (urls: string[]) => {
  for (let i = 0; i < urls.length; i++) { await handleSingleDownload(urls[i], i); await new Promise(resolve => setTimeout(resolve, 300)); }
};

const handleReferenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = e.target.files;
  if (!files) return;
  const newFiles = Array.from(files).slice(0, 5 - referenceImages.length);
  setUploading(true);
  try {
    for (const file of newFiles) {
      const preview = URL.createObjectURL(file);
      const img = new Image(); img.src = preview;
      await new Promise(resolve => img.onload = resolve);
      const width = img.naturalWidth; const height = img.naturalHeight;
      const url = await uploadToScdn(file);
      setReferenceImages(prev => [...prev, { file, preview, url, width, height }]);
    }
  } catch (error: any) { alert(error.message); }
  finally { setUploading(false); }
  e.target.value = '';
};

const handleRemoveReference = (index: number) => {
  const img = referenceImages[index];
  if (img) URL.revokeObjectURL(img.preview);
  setReferenceImages(prev => prev.filter((_, i) => i !== index));
};

const [isPSPlugin, setIsPSPlugin] = useState(false);
const [capturingLayer, setCapturingLayer] = useState(false);
const [sendingToPS, setSendingToPS] = useState<string | null>(null);

const handleUploadPSLayer = async () => {
  if (referenceImages.length >= 5) { alert('最多只能上传5张参考图'); return; }
  setCapturingLayer(true);
  try {
    const result = await capturePSLayer();
    if (result.success && result.imageData) {
      const response = await fetch(result.imageData);
      const blob = await response.blob();
      const file = new File([blob], `ps-layer-${result.layerName || 'layer'}.png`, { type: 'image/png' });
      const url = await uploadToScdn(file);
      setReferenceImages(prev => [...prev, { file, preview: result.imageData, url, width: result.width, height: result.height }]);
    }
  } catch (error: any) { alert('上传PS图层失败: ' + (error.message || error)); }
  finally { setCapturingLayer(false); }
};

const handleSendToPS = async (imageUrl: string) => {
  setSendingToPS(imageUrl);
  try {
    const result = await sendToPhotoshop(imageUrl, { asSmartObject: true });
    if (result.success) alert('已发送到Photoshop');
  } catch (error: any) { alert('发送到Photoshop失败: ' + (error.message || error)); }
  finally { setSendingToPS(null); }
};

useEffect(() => {
  const storedUserId = localStorage.getItem('userId');
  if (storedUserId) setUserId(storedUserId);
  const storedHistory = localStorage.getItem('imageHistory');
  if (storedHistory) {
    try {
      const parsed = JSON.parse(storedHistory);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const todayTimestamp = today.getTime();
      const filtered = parsed.filter((item: any) => item.time >= todayTimestamp);
      setHistory(filtered);
      if (filtered.length !== parsed.length) localStorage.setItem('imageHistory', JSON.stringify(filtered));
    } catch (e) {}
  }
  const modelConfig = IMAGE_MODELS['gpt-image-2'];
  if (modelConfig.models && modelConfig.models.length > 0) setModel(modelConfig.models[0]);
  tasks.forEach(task => {
    if (task.status === 'pending' && task.params) {
      (async () => {
        try {
          const { userId: taskUserId, provider: taskProvider, model: taskModel, resolution: taskResolution, aspectRatio: taskAspectRatio, count: taskCount, referenceImages: taskRefImages } = task.params!;
          const fullModel = `${taskProvider}-${taskModel}`;
          let finalAspectRatio = taskAspectRatio;
          if (taskAspectRatio === 'auto' && taskRefImages.length > 0) {
            const firstImg = taskRefImages[0];
            const imgRatio = firstImg.width / firstImg.height;
            const ratios = [{ ratio: 1/1, value: '1:1' }, { ratio: 16/9, value: '16:9' }, { ratio: 9/16, value: '9:16' }, { ratio: 4/3, value: '4:3' }, { ratio: 3/4, value: '3:4' }, { ratio: 3/2, value: '3:2' }, { ratio: 2/3, value: '2:3' }, { ratio: 5/4, value: '5:4' }, { ratio: 4/5, value: '4:5' }, { ratio: 21/9, value: '21:9' }, { ratio: 9/21, value: '9:21' }];
            let bestMatch = '1:1'; let minDiff = Infinity;
            for (const r of ratios) { const diff = Math.abs(imgRatio - r.ratio); if (diff < minDiff) { minDiff = diff; bestMatch = r.value; } }
            finalAspectRatio = bestMatch;
          }
          const finalSize = getResolutionByAspect(taskModel, taskAspectRatio, taskRefImages, taskProvider);
          const body: any = { userId: taskUserId, model: fullModel, prompt: task.prompt, size: finalSize, aspectRatio: finalAspectRatio, n: taskCount };
          if (taskRefImages.length > 0) body.image = taskRefImages.map(img => img.url);
          if ((taskProvider === 'gpt-image-2' || taskProvider === 'gpt-image-2-stable') && taskAspectRatio === 'auto' && taskRefImages.length > 0) body.useReferenceSize = true;
          const response = await fetch('/api/image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
          const data = await response.json();
          if (data.error) { if (mountedRef.current) setTasks(prev => prev.filter(t => t.id !== task.id)); return; }
          const imageUrls = data.imageUrls;
          if (mountedRef.current) setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'complete', result: imageUrls } : t));
          const newRecord = { time: Date.now(), images: imageUrls, prompt: task.prompt };
          setHistory(prev => { const nh = [newRecord, ...prev]; localStorage.setItem('imageHistory', JSON.stringify(nh)); return nh; });
        } catch (error: any) { if (mountedRef.current) setTasks(prev => prev.filter(t => t.id !== task.id)); }
      })();
    }
  });
}, []);

useEffect(() => {
  const modelConfig = IMAGE_MODELS[provider];
  if (modelConfig.models && modelConfig.models.length > 0) setModel(modelConfig.models[0]);
}, [provider]);

useEffect(() => {
  if (model) setResolution(getResolutionByAspect(model, aspectRatio, referenceImages, provider));
}, [model, aspectRatio, referenceImages, provider]);

const activeTask = tasks.find(t => t.id === activeTaskId) || null;

const handleSubmit = async (e: any) => {
if (e) e.preventDefault();
if (!prompt.trim() || uploading) return;
const taskId = nextTaskId;
const newTask: Task = { id: taskId, status: 'pending', result: null, prompt: prompt, params: { userId, provider, model, resolution, aspectRatio, count, referenceImages: referenceImages.map(img => ({url: img.url, width: img.width, height: img.height})) } };
setTasks(prev => [...prev, newTask]);
setNextTaskId(prev => prev + 1);
setActiveTaskId(taskId);
(async () => {
  try {
    const fullModel = `${provider}-${model}`;
    let finalAspectRatio = aspectRatio;
    if (aspectRatio === 'auto' && referenceImages.length > 0) {
      const firstImg = referenceImages[0];
      const imgRatio = firstImg.width / firstImg.height;
      const ratios = [{ ratio: 1/1, value: '1:1' }, { ratio: 16/9, value: '16:9' }, { ratio: 9/16, value: '9:16' }, { ratio: 4/3, value: '4:3' }, { ratio: 3/4, value: '3:4' }, { ratio: 3/2, value: '3:2' }, { ratio: 2/3, value: '2:3' }, { ratio: 5/4, value: '5:4' }, { ratio: 4/5, value: '4:5' }, { ratio: 21/9, value: '21:9' }, { ratio: 9/21, value: '9:21' }];
      let bestMatch = '1:1'; let minDiff = Infinity;
      for (const r of ratios) { const diff = Math.abs(imgRatio - r.ratio); if (diff < minDiff) { minDiff = diff; bestMatch = r.value; } }
      finalAspectRatio = bestMatch;
    }
    const finalSize = getResolutionByAspect(model, aspectRatio, referenceImages, provider);
    const body: any = { userId, model: fullModel, prompt, size: finalSize, aspectRatio: finalAspectRatio, n: count };
    if (referenceImages.length > 0) body.image = referenceImages.map(img => img.url);
    if ((provider === 'gpt-image-2' || provider === 'gpt-image-2-stable') && aspectRatio === 'auto' && referenceImages.length > 0) body.useReferenceSize = true;
    const response = await fetch('/api/image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json();
    if (data.error) { alert(data.error); if (mountedRef.current) setTasks(prev => prev.filter(t => t.id !== taskId)); return; }
    const imageUrls = data.imageUrls;
    if (mountedRef.current) setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: 'complete', result: imageUrls } : t));
    const newRecord = { time: Date.now(), images: imageUrls, prompt: prompt };
    setHistory(prev => { const nh = [newRecord, ...prev]; localStorage.setItem('imageHistory', JSON.stringify(nh)); return nh; });
  } catch (error: any) { alert(error.message); if (mountedRef.current) setTasks(prev => prev.filter(t => t.id !== taskId)); }
})();
};

const handlePresetClick = async (preset: typeof IMAGE_PRESETS[0]) => {
  if (referenceImages.length === 0) { alert('请先上传您的照片，才能使用这个一键功能！'); return; }
  setPrompt(preset.prompt);
  await handleSubmit(null);
};

const fullModel = `${provider}-${model}`;
const currentPricing = MODEL_PRICING[fullModel];
const availableModels = IMAGE_MODELS[provider]?.models || [];

return (
<div className="min-h-screen bg-white" style={{ backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
<div className="max-w-6xl mx-auto px-4 py-8">
<div className="text-center mb-8">
<h1 className="text-3xl font-bold text-gray-900 mb-2">AI 绘图</h1>
<p className="text-gray-500">输入提示词，生成精美的图片</p>
</div>
<div className="flex flex-col md:flex-row gap-6">
<div className="w-full md:w-64 flex-shrink-0">
<div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sticky top-8">
<h3 className="text-sm font-semibold text-gray-700 mb-4">绘图设置</h3>
<div className="space-y-4">
<div>
<label className="block text-xs font-medium text-gray-500 mb-2">模型厂商</label>
<select value={provider} onChange={(e) => setProvider(e.target.value)}
className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent">
{Object.keys(IMAGE_MODELS).map(p => (<option key={p} value={p}>{p === 'gpt-image-2-stable' ? 'gpt-image-2（稳定接口）' : p === 'nano-banana-2-stable' ? 'nano-banana-2（稳定接口）' : p}</option>))}
</select>
</div>
<div>
<label className="block text-xs font-medium text-gray-500 mb-2">模型</label>
<select value={model} onChange={(e) => setModel(e.target.value)}
className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent">
{availableModels.map(m => (<option key={m} value={m}>{m}</option>))}
</select>
</div>
{IMAGE_MODELS[provider]?.note && (<div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2"><p className="text-xs text-blue-700">{IMAGE_MODELS[provider].note}</p></div>)}
<div>
<label className="block text-xs font-medium text-gray-500 mb-2">绘图比例</label>
<select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)}
className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent">
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
<div>
<label className="block text-xs font-medium text-gray-500 mb-2">单次出图数量</label>
<select value={count} onChange={(e) => setCount(Number(e.target.value))}
className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent">
<option value={1}>1张</option><option value={2}>2张</option><option value={3}>3张</option><option value={4}>4张</option>
</select>
</div>
<div className="pt-3 border-t border-gray-100">
<div className="text-xs text-gray-500">
<div className="flex justify-between"><span>单次价格</span><span className="font-medium text-gray-700">{((currentPricing?.input || 0) * count).toFixed(2)} 积分</span></div>
</div>
</div>
{tasks.length > 0 && (
<div className="pt-3 border-t border-gray-100">
<h3 className="text-xs font-medium text-gray-500 mb-2">生成任务</h3>
<div className="flex gap-2 flex-wrap">
{tasks.map((task) => (
<div key={task.id} className="relative group">
<button onClick={() => setActiveTaskId(task.id)}
className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-medium transition-colors ${activeTaskId === task.id ? 'bg-yellow-500 text-white' : task.status === 'pending' ? 'bg-gray-100 text-gray-500' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
{task.status === 'pending' ? (<div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>) : task.id}
</button>
<button onClick={(e) => { e.stopPropagation(); setTasks(prev => { const remaining = prev.filter(t => t.id !== task.id); if (activeTaskId === task.id) { if (remaining.length > 0) setActiveTaskId(remaining[0].id); else setActiveTaskId(null); } return remaining; }); }}
className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600">×</button>
</div>
))}
</div>
</div>
)}
</div>
</div>
</div>
<div className="flex-1">
<div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-6 h-[400px] overflow-hidden flex items-center justify-center relative">
{activeTask ? (<>
{activeTask.result ? (<>
<div className={`grid ${activeTask.result.length === 1 ? 'grid-cols-1' : 'grid-cols-2'} gap-4 w-full h-full overflow-auto p-4`}>
{activeTask.result.map((url, index) => (
<div key={index} className="relative group">
<img src={url} alt={`Generated ${index+1}`} className="w-full h-auto object-contain rounded-lg" />
<div className="absolute bottom-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
<button onClick={() => handleSingleDownload(url, index)} className="bg-yellow-500 text-white px-3 py-1 rounded-lg hover:bg-yellow-600 text-sm">下载</button>
{isPSPlugin && (<button onClick={() => handleSendToPS(url)} disabled={sendingToPS === url}
className="bg-blue-500 text-white px-3 py-1 rounded-lg hover:bg-blue-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed">{sendingToPS === url ? '发送中...' : '发送到PS'}</button>)}
</div>
</div>
))}
</div>
<div className="absolute bottom-4 right-4 flex gap-2">
<button onClick={() => handleBatchDownload(activeTask.result!)} className="bg-yellow-500 text-white px-4 py-2 rounded-xl hover:bg-yellow-600 flex items-center gap-2 transition-colors shadow-sm">
<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 00-3-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
批量下载全部
</button>
{isPSPlugin && (<button onClick={() => { if (activeTask.result && activeTask.result.length > 0) { activeTask.result.forEach((url, i) => setTimeout(() => handleSendToPS(url), i * 500)); } }} disabled={!!sendingToPS}
className="bg-blue-500 text-white px-4 py-2 rounded-xl hover:bg-blue-600 flex items-center gap-2 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 00-2-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 00-2 2z" /></svg>
全部发送到PS
</button>)}
</div>
</>
) : (<div className="text-gray-500"><div className="flex flex-col items-center"><div className="w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mb-4"></div><p>生成中...</p></div></div>)}
</>
) : (
<div className="flex flex-col items-center text-gray-400">
<div className="w-16 h-16 bg-yellow-50 rounded-full flex items-center justify-center mb-4">
<svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 00-2-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 00-2 2z" /></svg>
</div>
<p>生成的图片将显示在这里</p>
</div>
)}
</div>
{referenceImages.length > 0 && (
<div className="mb-4">
<label className="block text-xs font-medium text-gray-500 mb-2">参考图 ({referenceImages.length}/5)</label>
<div className="flex gap-3 flex-wrap">
{referenceImages.map((img, index) => (
<div key={index} className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200">
<img src={img.preview} alt={`参考图${index+1}`} className="w-full h-full object-cover" />
<button type="button" onClick={() => handleRemoveReference(index)} className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600">×</button>
<span className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs text-center py-0.5">图{index+1}</span>
</div>
))}
</div>
</div>
)}
{referenceImages.length < 5 && (
<div className="mb-4">
<label className="flex items-center justify-center w-full h-16 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-yellow-400 transition-colors">
<div className="flex items-center gap-2 text-gray-500 text-sm">
<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 00-2-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 00-2 2z" /></svg>
{uploading ? (<><div className="w-4 h-4 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>正在上传...</>) : '上传参考图（最多5张，可多选）'}
</div>
<input type="file" accept="image/*" multiple className="hidden" onChange={handleReferenceUpload} disabled={uploading} />
</label>
</div>
)}
{isPSPlugin && referenceImages.length < 5 && (
<button type="button" onClick={handleUploadPSLayer} disabled={capturingLayer || uploading}
className="w-full h-12 mb-4 bg-blue-50 text-blue-600 border-2 border-blue-200 rounded-lg hover:bg-blue-100 hover:border-blue-300 transition-colors flex items-center justify-center gap-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">
{capturingLayer ? (<><div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>正在捕获PS图层...</>) : (<><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 00-2-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 00-2 2z" /></svg>上传PS当前图层</>)}
</button>
)}
<form onSubmit={handleSubmit} className="relative">
<textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="尽量详细的描述您想要的图片" rows={3}
className="w-full border border-gray-200 rounded-2xl px-6 py-4 pr-32 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent shadow-sm resize-none" />
<button type="submit" disabled={!prompt.trim() || uploading}
className="absolute right-2 bottom-2 bg-yellow-500 text-white px-6 py-2.5 rounded-xl hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed">生成图片</button>
</form>
</div>
<div className="w-full md:w-56 flex-shrink-0">
<div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sticky top-8">
<h3 className="text-sm font-semibold text-gray-700 mb-4">一键预设</h3>
<div className="space-y-3">
{IMAGE_PRESETS.map(preset => (<button key={preset.name} type="button" onClick={() => handlePresetClick(preset)} disabled={uploading}
className="w-full text-left px-3 py-2 bg-yellow-50 text-yellow-700 rounded-lg text-sm hover:bg-yellow-100 disabled:opacity-50">{preset.name}</button>))}
</div>
<p className="text-xs text-gray-500 mt-4">提示：使用一键功能前，请先上传您的照片</p>
</div>
</div>
</div>
{history.length > 0 && (
<div className="mt-8 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
<h3 className="text-lg font-semibold text-gray-900 mb-4">今日生成记录</h3>
<div className="space-y-4">
{history.map((record, recordIndex) => (
<div key={record.time} className="border border-gray-100 rounded-xl p-4">
<div className="flex justify-between items-center mb-3">
<div>
<p className="text-sm text-gray-500">{new Date(record.time).toLocaleTimeString()}</p>
<p className="text-sm text-gray-700 truncate max-w-md">提示词：{record.prompt}</p>
</div>
<button onClick={() => handleBatchDownload(record.images)} className="bg-gray-100 text-gray-700 px-3 py-1 rounded-lg hover:bg-gray-200 text-sm">下载该组全部</button>
</div>
<div className="flex gap-3 flex-wrap">
{record.images.map((imgUrl, imgIndex) => (
<div key={imgIndex} className="relative group w-24 h-24">
<img src={imgUrl} alt="" className="w-full h-full object-cover rounded-lg" />
<button onClick={() => handleSingleDownload(imgUrl, imgIndex)} className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
<svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 00-3-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
</button>
</div>
))}
</div>
</div>
))}
</div>
</div>
)}
</div>
</div>
);
}