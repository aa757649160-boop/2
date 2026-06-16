'use client';
import { useState, useEffect, useRef } from 'react';
import { IMAGE_MODELS, IMAGE_RESOLUTIONS, MODEL_PRICING, IMAGE_PRESETS } from '@/lib/config';
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
  return data.url;
};

// 任务类型定义
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
// 从localStorage加载持久化的任务状态
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
const [count, setCount] = useState(1); // 单次出图数量
// 参考图状态，支持最多5张
const [referenceImages, setReferenceImages] = useState<{file: File, preview: string, url: string, width: number, height: number}[]>([]);
// 上传状态
const [uploading, setUploading] = useState(false);
// 历史记录
const [history, setHistory] = useState<Array<{time: number, images: string[], prompt: string}>>([]);
// 任务队列状态，从localStorage初始化
const [tasks, setTasks] = useState<Task[]>(initialTaskState.tasks);
const [activeTaskId, setActiveTaskId] = useState<number | null>(initialTaskState.activeTaskId);
const [nextTaskId, setNextTaskId] = useState<number>(initialTaskState.nextTaskId);
// 组件挂载状态，用于避免卸载后更新state的警告
const mountedRef = useRef(true);

// 同步任务状态到localStorage，实现页面切换后状态不丢失
useEffect(() => {
  localStorage.setItem('imageTasks', JSON.stringify(tasks));
}, [tasks]);

useEffect(() => {
  localStorage.setItem('imageNextTaskId', nextTaskId.toString());
}, [nextTaskId]);

useEffect(() => {
  if (activeTaskId !== null) {
    localStorage.setItem('imageActiveTaskId', activeTaskId.toString());
  } else {
    localStorage.removeItem('imageActiveTaskId');
  }
}, [activeTaskId]);

// 组件挂载/卸载状态管理
useEffect(() => {
  mountedRef.current = true;
  return () => {
    mountedRef.current = false;
  };
}, []);

// 根据模型和比例获取对应的分辨率
const getResolutionByAspect = (currentModel: string, ratio: string, referenceImages: {width: number, height: number}[]) => {
  if (ratio === 'auto') {
    const resolutions = IMAGE_RESOLUTIONS[currentModel] || [];
    if (referenceImages.length > 0) {
      const firstImg = referenceImages[0];
      const imgRatio = firstImg.width / firstImg.height;
      for (const res of resolutions) {
        const [w, h] = res.split('x').map(Number);
        const resRatio = w / h;
        if (Math.abs(imgRatio - resRatio) < 0.1) {
          return res;
        }
      }
    }
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
// 单张图片下载
const handleSingleDownload = async (url: string, index: number) => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const objUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objUrl;
    link.download = `ai-generated-image-${Date.now()}-${index+1}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(objUrl);
  } catch (error) {
    window.open(url, '_blank');
  }
};

// 批量下载多张图片
const handleBatchDownload = async (urls: string[]) => {
  for (let i = 0; i < urls.length; i++) {
    await handleSingleDownload(urls[i], i);
    await new Promise(resolve => setTimeout(resolve, 300));
  }
};
// 参考图上传处理
const handleReferenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = e.target.files;
  if (!files) return;
  const newFiles = Array.from(files).slice(0, 5 - referenceImages.length);
  setUploading(true);
  try {
    for (const file of newFiles) {
      const preview = URL.createObjectURL(file);
      const img = new Image();
      img.src = preview;
      await new Promise(resolve => img.onload = resolve);
      const width = img.naturalWidth;
      const height = img.naturalHeight;
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
const storedUserId = localStorage.getItem('userId');
if (storedUserId) {
  setUserId(storedUserId);
}
// 读取历史记录
const storedHistory = localStorage.getItem('imageHistory');
if (storedHistory) {
  try {
    const parsed = JSON.parse(storedHistory);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTimestamp = today.getTime();
    const filtered = parsed.filter((item: any) => item.time >= todayTimestamp);
    setHistory(filtered);
    if (filtered.length !== parsed.length) {
      localStorage.setItem('imageHistory', JSON.stringify(filtered));
    }
  } catch (e) {}
}
const modelConfig = IMAGE_MODELS['gpt-image-2'];
const models = modelConfig.models;
if (models && models.length > 0) {
setModel(models[0]);
}

// 处理挂载时的pending任务，重新执行生成逻辑以获取结果
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
          userId: taskUserId,
          model: fullModel,
          prompt: task.prompt,
          size: taskResolution,
          aspectRatio: finalAspectRatio,
          n: taskCount,
        };
        if (taskRefImages.length > 0) {
          body.image = taskRefImages.map(img => img.url);
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
          // 出错移除任务
          if (mountedRef.current) {
            setTasks(prev => prev.filter(t => t.id !== task.id));
          } else {
            try {
              const storedTasks = localStorage.getItem('imageTasks');
              if (storedTasks) {
                const tasks = JSON.parse(storedTasks);
                const updatedTasks = tasks.filter((t: Task) => t.id !== task.id);
                localStorage.setItem('imageTasks', JSON.stringify(updatedTasks));
              }
            } catch (e) {}
          }
          return;
        }
        const imageUrls = data.imageUrls;
        // 更新任务状态为完成
        if (mountedRef.current) {
          setTasks(prev => prev.map(t => {
            if (t.id === task.id) {
              return {
                ...t,
                status: 'complete',
                result: imageUrls,
              };
            }
            return t;
          }));
        } else {
          // 组件已卸载，直接更新localStorage
          try {
            const storedTasks = localStorage.getItem('imageTasks');
            if (storedTasks) {
              const tasks = JSON.parse(storedTasks);
              const updatedTasks = tasks.map((t: Task) => {
                if (t.id === task.id) {
                  return {
                    ...t,
                    status: 'complete',
                    result: imageUrls,
                  };
                }
                return t;
              });
              localStorage.setItem('imageTasks', JSON.stringify(updatedTasks));
            }
          } catch (e) {}
        }
        // 保存到历史记录
        const newRecord = {
          time: Date.now(),
          images: imageUrls,
          prompt: task.prompt,
        };
        setHistory(prev => {
          const newHistory = [newRecord, ...prev];
          localStorage.setItem('imageHistory', JSON.stringify(newHistory));
          return newHistory;
        });
      } catch (error: any) {
        // 出错移除任务
        if (mountedRef.current) {
          setTasks(prev => prev.filter(t => t.id !== task.id));
        } else {
          try {
            const storedTasks = localStorage.getItem('imageTasks');
            if (storedTasks) {
              const tasks = JSON.parse(storedTasks);
              const updatedTasks = tasks.filter((t: Task) => t.id !== task.id);
              localStorage.setItem('imageTasks', JSON.stringify(updatedTasks));
            }
          } catch (e) {}
        }
      }
    })();
  }
});
}, []);
useEffect(() => {
const modelConfig = IMAGE_MODELS[provider];
const models = modelConfig.models;
if (models && models.length > 0) {
setModel(models[0]);
}
}, [provider]);
useEffect(() => {
  if (model) {
    const newRes = getResolutionByAspect(model, aspectRatio, referenceImages);
    setResolution(newRes);
  }
}, [model, aspectRatio, referenceImages]);

// 获取当前激活的任务
const activeTask = tasks.find(t => t.id === activeTaskId) || null;

const handleSubmit = async (e: any) => {
if (e) e.preventDefault();
if (!prompt.trim() || uploading) return;

// 创建新任务
const taskId = nextTaskId;
const newTask: Task = {
  id: taskId,
  status: 'pending',
  result: null,
  prompt: prompt,
  params: {
    userId,
    provider,
    model,
    resolution,
    aspectRatio,
    count,
    referenceImages: referenceImages.map(img => ({url: img.url, width: img.width, height: img.height})),
  },
};

// 添加到任务列表
setTasks(prev => [...prev, newTask]);
setNextTaskId(prev => prev + 1);
setActiveTaskId(taskId);

// 异步执行生成，不阻塞
(async () => {
  try {
    const fullModel = `${provider}-${model}`;
    let finalAspectRatio = aspectRatio;
    if (aspectRatio === 'auto' && referenceImages.length > 0) {
      const firstImg = referenceImages[0];
      const imgRatio = firstImg.width / firstImg.height;
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
      n: count,
    };
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
      // 出错移除任务，组件卸载时直接更新localStorage
      if (mountedRef.current) {
        setTasks(prev => prev.filter(t => t.id !== taskId));
      } else {
        try {
          const storedTasks = localStorage.getItem('imageTasks');
          if (storedTasks) {
            const tasks = JSON.parse(storedTasks);
            const updatedTasks = tasks.filter((t: Task) => t.id !== taskId);
            localStorage.setItem('imageTasks', JSON.stringify(updatedTasks));
          }
        } catch (e) {}
      }
      return;
    }
    const imageUrls = data.imageUrls;
    // 更新任务状态为完成，组件卸载时直接更新localStorage避免警告
    if (mountedRef.current) {
      setTasks(prev => prev.map(t => {
        if (t.id === taskId) {
          return {
            ...t,
            status: 'complete',
            result: imageUrls,
          };
        }
        return t;
      }));
    } else {
      // 组件已卸载，直接更新localStorage中的任务状态
      try {
        const storedTasks = localStorage.getItem('imageTasks');
        if (storedTasks) {
          const tasks = JSON.parse(storedTasks);
          const updatedTasks = tasks.map((t: Task) => {
            if (t.id === taskId) {
              return {
                ...t,
                status: 'complete',
                result: imageUrls,
              };
            }
            return t;
          });
          localStorage.setItem('imageTasks', JSON.stringify(updatedTasks));
        }
      } catch (e) {
        // 忽略存储错误，不影响主流程
      }
    }
    // 保存到历史记录
    const newRecord = {
      time: Date.now(),
      images: imageUrls,
      prompt: prompt,
    };
    setHistory(prev => {
      const newHistory = [newRecord, ...prev];
      localStorage.setItem('imageHistory', JSON.stringify(newHistory));
      return newHistory;
    });
  } catch (error: any) {
    alert(error.message);
    // 出错移除任务，组件卸载时直接更新localStorage
    if (mountedRef.current) {
      setTasks(prev => prev.filter(t => t.id !== taskId));
    } else {
      try {
        const storedTasks = localStorage.getItem('imageTasks');
        if (storedTasks) {
          const tasks = JSON.parse(storedTasks);
          const updatedTasks = tasks.filter((t: Task) => t.id !== taskId);
          localStorage.setItem('imageTasks', JSON.stringify(updatedTasks));
        }
      } catch (e) {}
    }
  }
})();
};
// 一键预设的处理函数，完全保留原来的逻辑
const handlePresetClick = async (preset: typeof IMAGE_PRESETS[0]) => {
  if (referenceImages.length === 0) {
    alert('请先上传您的照片，才能使用这个一键功能！');
    return;
  }
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
{/* 左侧：绘图设置 */}
<div className="w-full md:w-64 flex-shrink-0">
<div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sticky top-8">
<h3 className="text-sm font-semibold text-gray-700 mb-4">绘图设置</h3>
<div className="space-y-4">
<div>
<label className="block text-xs font-medium text-gray-500 mb-2">模型厂商</label>
<select
value={provider}
onChange={(e) => setProvider(e.target.value)}
className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
>
{Object.keys(IMAGE_MODELS).map(p => (
<option key={p} value={p}>
  {p === 'gpt-image-2-stable' ? 'gpt-image-2（稳定接口）' : p === 'nano-banana-2-stable' ? 'nano-banana-2（稳定接口）' : p}
</option>
))}
</select>
</div>
<div>
<label className="block text-xs font-medium text-gray-500 mb-2">模型</label>
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
{/* 模型说明提示 */}
{IMAGE_MODELS[provider]?.note && (
  <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
    <p className="text-xs text-blue-700">{IMAGE_MODELS[provider].note}</p>
  </div>
)}
<div>
<label className="block text-xs font-medium text-gray-500 mb-2">绘图比例</label>
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
{/* 新增的出图数量选择，不影响原来的布局 */}
<div>
<label className="block text-xs font-medium text-gray-500 mb-2">单次出图数量</label>
<select
value={count}
onChange={(e) => setCount(Number(e.target.value))}
className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
>
<option value={1}>1张</option>
<option value={2}>2张</option>
<option value={3}>3张</option>
<option value={4}>4张</option>
</select>
</div>
<div className="pt-3 border-t border-gray-100">
<div className="text-xs text-gray-500">
<div className="flex justify-between">
<span>单次价格</span>
<span className="font-medium text-gray-700">{((currentPricing?.input || 0) * count).toFixed(2)} 积分</span>
</div>
</div>
</div>

{/* 任务列表区域，用户红框位置 */}
{tasks.length > 0 && (
  <div className="pt-3 border-t border-gray-100">
    <h3 className="text-xs font-medium text-gray-500 mb-2">生成任务</h3>
    <div className="flex gap-2 flex-wrap">
      {tasks.map((task) => (
        <div key={task.id} className="relative group">
          <button
            onClick={() => setActiveTaskId(task.id)}
            className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-medium transition-colors ${
              activeTaskId === task.id
                ? 'bg-yellow-500 text-white'
                : task.status === 'pending'
                ? 'bg-gray-100 text-gray-500'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {task.status === 'pending' ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
            ) : (
              task.id
            )}
          </button>
          {/* 删除任务按钮，hover时显示 */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              // 删除任务
              setTasks(prev => {
                const remaining = prev.filter(t => t.id !== task.id);
                // 如果删除的是当前激活的任务，自动切换到剩下的第一个
                if (activeTaskId === task.id) {
                  if (remaining.length > 0) {
                    setActiveTaskId(remaining[0].id);
                  } else {
                    setActiveTaskId(null);
                  }
                }
                return remaining;
              });
            }}
            className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  </div>
)}
</div>
</div>
</div>
{/* 中间：结果、参考图、输入框 */}
<div className="flex-1">
<div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-6 h-[400px] overflow-hidden flex items-center justify-center relative">
{activeTask ? (
  <>
    {activeTask.result ? (
      <>
        {/* 动态网格：1张图单列，多张双列，自动适应 */}
        <div className={`grid ${activeTask.result.length === 1 ? 'grid-cols-1' : 'grid-cols-2'} gap-4 w-full h-full overflow-auto p-4`}>
          {activeTask.result.map((url, index) => (
            <div key={index} className="relative group">
              <img src={url} alt={`Generated ${index+1}`} className="w-full h-auto object-contain rounded-lg" />
              <button
                onClick={() => handleSingleDownload(url, index)}
                className="absolute bottom-2 right-2 bg-yellow-500 text-white px-3 py-1 rounded-lg hover:bg-yellow-600 text-sm opacity-0 group-hover:opacity-100 transition-opacity"
              >
                下载
              </button>
            </div>
          ))}
        </div>
        <button
        onClick={() => handleBatchDownload(activeTask.result!)}
        className="absolute bottom-4 right-4 bg-yellow-500 text-white px-4 py-2 rounded-xl hover:bg-yellow-600 flex items-center gap-2 transition-colors shadow-sm"
        >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 00-3-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        批量下载全部
        </button>
      </>
    ) : (
      <div className="text-gray-500">
        <div className="flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p>生成中...</p>
        </div>
      </div>
    )}
  </>
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
            正在上传...
          </>
        ) : (
          '上传参考图（最多5张，可多选）'
        )}
      </div>
      <input
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleReferenceUpload}
        disabled={uploading}
      />
    </label>
  </div>
)}
<form onSubmit={handleSubmit} className="relative">
<textarea
value={prompt}
onChange={(e) => setPrompt(e.target.value)}
placeholder="尽量详细的描述您想要生成的图片"
rows={3}
className="w-full border border-gray-200 rounded-2xl px-6 py-4 pr-32 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent shadow-sm resize-none"
disabled={uploading}
 />
<button
type="submit"
disabled={!prompt.trim() || uploading}
className="absolute right-2 bottom-2 bg-yellow-500 text-white px-6 py-2.5 rounded-xl hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed"
>
  生成图片
</button>
</form>
</div>
{/* 右侧：一键预设面板，完全还原原来的布局和样式，没有任何修改 */}
<div className="w-full md:w-56 flex-shrink-0">
  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sticky top-8">
    <h3 className="text-sm font-semibold text-gray-700 mb-4">一键预设</h3>
    <div className="space-y-3">
      {IMAGE_PRESETS.map(preset => (
        <button
          key={preset.name}
          type="button"
          onClick={() => handlePresetClick(preset)}
          disabled={uploading}
          className="w-full text-left px-3 py-2 bg-yellow-50 text-yellow-700 rounded-lg text-sm hover:bg-yellow-100 disabled:opacity-50"
        >
          {preset.name}
        </button>
      ))}
    </div>
    <p className="text-xs text-gray-500 mt-4">提示：使用一键功能前，请先上传您的照片</p>
  </div>
</div>
</div>

{/* 今日历史记录，新增的，在页面最底部，不影响原来的布局 */}
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
            <button
              onClick={() => handleBatchDownload(record.images)}
              className="bg-gray-100 text-gray-700 px-3 py-1 rounded-lg hover:bg-gray-200 text-sm"
            >
              下载该组全部
            </button>
          </div>
          <div className="flex gap-3 flex-wrap">
            {record.images.map((imgUrl, imgIndex) => (
              <div key={imgIndex} className="relative group w-24 h-24">
                <img src={imgUrl} alt="" className="w-full h-full object-cover rounded-lg" />
                <button
                  onClick={() => handleSingleDownload(imgUrl, imgIndex)}
                  className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-lg"
                >
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 00-3-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
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
