'use client';
import { useState, useEffect } from 'react';
import { VIDEO_MODELS, MODEL_PRICING } from '@/lib/config';

// 上传文件到img.scdn.io，支持图片/视频/音频
const uploadToScdn = async (file: File): Promise<string> => {
  // 创建FormData，按照API要求格式
  const formData = new FormData();
  // 添加文件
  formData.append('image', file);
  // 指定CDN域名，使用用户配置的img.scdn.io
  formData.append('cdn_domain', 'img.scdn.io');
  // 推荐使用自动输出格式，自动优化
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
    throw new Error(`上传失败: ${errorMsg}`);
  }
  const data = await response.json();
  if (!data.success) {
    throw new Error(`上传失败: ${data.message || '未知错误'}`);
  }
  return data.url;
};

// 任务类型定义，和绘图模块一样
type Task = {
  id: number;
  status: 'pending' | 'complete';
  result: string | null;
  prompt: string;
};

export default function VideoPage() {
  const [userId, setUserId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState<string>(VIDEO_MODELS[0]);
  
  // 参考图状态，veo最多2张，seedance最多8张
  const [referenceFiles, setReferenceFiles] = useState<{file: File, preview: string, url: string, width: number, height: number}[]>([]);
  // 上传状态
  const [uploading, setUploading] = useState(false);
  
  // 历史记录
  const [history, setHistory] = useState<Array<{time: number, video: string, prompt: string}>>([]);
  
  // 任务队列状态，和绘图模块一样的异步任务
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null);
  const [nextTaskId, setNextTaskId] = useState(1);
  
  // 模型参数
  // veo3.1-pro的参数
  const [enhancePrompt, setEnhancePrompt] = useState(false);
  const [aspectRatio, setAspectRatio] = useState('9:16');
  
  // doubao-seedance的参数
  const [resolution, setResolution] = useState('720p');
  const [ratio, setRatio] = useState('keep_ratio');
  const [seed, setSeed] = useState<number | undefined>(undefined);
  const [cameraFixed, setCameraFixed] = useState(false);
  const [generateAudio, setGenerateAudio] = useState(false);
  const [duration, setDuration] = useState(5); // 视频时长，默认5秒

  // 视频下载函数
  const handleDownload = async (url: string) => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const objUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objUrl;
      link.download = `ai-generated-video-${Date.now()}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(objUrl);
    } catch (error) {
      window.open(url, '_blank');
    }
  };

  // 参考文件上传处理
  const handleReferenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    // 根据模型动态调整参考文件最大数量
    const maxRef = model === 'veo3.1-pro' ? 2 : 8;
    const newFiles = Array.from(files).slice(0, maxRef - referenceFiles.length);
    setUploading(true);
    try {
      for (const file of newFiles) {
        // veo3.1模型仅支持图片参考，不支持视频和音频
        if (isVeoModel && !file.type.startsWith('image/')) {
          alert('veo3.1模型仅支持图片参考文件，不支持视频和音频');
          continue;
        }
        const preview = URL.createObjectURL(file);
        let width = 0, height = 0;
        // 仅图片需要读取宽高
        if (file.type.startsWith('image/')) {
          const img = new Image();
          img.src = preview;
          await new Promise(resolve => img.onload = resolve);
          width = img.naturalWidth;
          height = img.naturalHeight;
        }
        const url = await uploadToScdn(file);
        setReferenceFiles(prev => [...prev, {
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

  // 删除参考文件
  const handleRemoveReference = (index: number) => {
    const file = referenceFiles[index];
    if (file) {
      URL.revokeObjectURL(file.preview);
    }
    setReferenceFiles(prev => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    const storedUserId = localStorage.getItem('userId');
    if (storedUserId) {
      setUserId(storedUserId);
    }
    // 读取历史记录
    const storedHistory = localStorage.getItem('videoHistory');
    if (storedHistory) {
      try {
        const parsed = JSON.parse(storedHistory);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTimestamp = today.getTime();
        const filtered = parsed.filter((item: any) => item.time >= todayTimestamp);
        setHistory(filtered);
        if (filtered.length !== parsed.length) {
          localStorage.setItem('videoHistory', JSON.stringify(filtered));
        }
      } catch (e) {}
    }
  }, []);

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
    };
    // 添加到任务列表
    setTasks(prev => [...prev, newTask]);
    setNextTaskId(prev => prev + 1);
    setActiveTaskId(taskId);
    
    // 异步执行生成，不阻塞
    (async () => {
      try {
        // 构造请求参数
        const body: any = {
          userId,
          model,
          prompt,
        };
        
        // 参考文件
        if (referenceFiles.length > 0) {
          // 图片类的放到images，视频和音频的话，后续API如果有对应参数可以扩展，这里先统一放到images
          body.images = referenceFiles.map(file => file.url);
        }
        
        // 根据模型添加对应的参数
        if (model === 'veo3.1') {
          body.enhance_prompt = enhancePrompt;
          body.aspect_ratio = aspectRatio;
        } else if (model === 'doubao-seedance-2-0-260128') {
          body.resolution = resolution;
          // 前端的"保持原图比例"对应API的adaptive参数
          body.ratio = ratio === 'keep_ratio' ? 'adaptive' : ratio;
          if (seed !== undefined) {
            body.seed = seed;
          }
          body.generate_audio = generateAudio;
          body.duration = duration;
        }
        
        const response = await fetch('/api/video', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        const data = await response.json();
        
        if (data.error) {
          alert(data.error);
          // 出错移除任务
          setTasks(prev => prev.filter(t => t.id !== taskId));
          return;
        }
        
        if (data.videoUrl) {
          // doubao的同步模式，直接返回结果
          const videoUrl = data.videoUrl;
          
          // 更新任务状态为完成
          setTasks(prev => prev.map(t => {
            if (t.id === taskId) {
              return {
                ...t,
                status: 'complete',
                result: videoUrl,
              };
            }
            return t;
          }));
          
          // 保存到历史记录
          const newRecord = {
            time: Date.now(),
            video: videoUrl,
            prompt: prompt,
          };
          setHistory(prev => {
            const newHistory = [newRecord, ...prev];
            localStorage.setItem('videoHistory', JSON.stringify(newHistory));
            return newHistory;
          });
        } else {
          // veo的异步模式，前端自己轮询任务状态，绕开Vercel函数超时
          const { taskId: apiTaskId, baseUrl, apiKey } = data;
          
          // 前端轮询，直到任务完成
          const pollTask = async () => {
            let attempts = 0;
            const maxAttempts = 900; // 30分钟超时
            
            while (attempts < maxAttempts) {
              try {
                const res = await fetch(`${baseUrl}/v2/videos/generations/${apiTaskId}`, {
                  headers: {
                    'Authorization': `Bearer ${apiKey}`,
                  },
                });
                
                const taskData = await res.json();
                
                // 检查任务状态
                const isSuccess = taskData.status === 'completed' || taskData.status === 'succeeded' || taskData.status === 'SUCCESS';
                if (isSuccess) {
                  // 任务完成，拿到视频URL
                  const videoUrl = taskData.video_url || taskData.output || taskData.data?.output;
                  if (videoUrl) {
                    // 更新任务状态为完成
                    setTasks(prev => prev.map(t => {
                      if (t.id === taskId) {
                        return {
                          ...t,
                          status: 'complete',
                          result: videoUrl,
                        };
                      }
                      return t;
                    }));
                    
                    // 保存到历史记录
                    const newRecord = {
                      time: Date.now(),
                      video: videoUrl,
                      prompt: prompt,
                    };
                    setHistory(prev => {
                      const newHistory = [newRecord, ...prev];
                      localStorage.setItem('videoHistory', JSON.stringify(newHistory));
                      return newHistory;
                    });
                    
                    alert('生成成功！');
                    return;
                  }
                } else if (taskData.status === 'failed' || taskData.status === 'FAILED') {
                  // 任务失败
                  alert(taskData.fail_reason || taskData.error || '任务失败，请重试');
                  // 移除任务
                  setTasks(prev => prev.filter(t => t.id !== taskId));
                  return;
                }
                
                // 任务还在处理中，等待2秒后重试
                await new Promise(resolve => setTimeout(resolve, 2000));
                attempts++;
              } catch (e) {
                // 网络错误，忽略，继续轮询
                await new Promise(resolve => setTimeout(resolve, 2000));
                attempts++;
              }
            }
            
            // 超时
            alert('任务超时，请稍后查看结果');
            // 移除任务
            setTasks(prev => prev.filter(t => t.id !== taskId));
          };
          
          // 开始轮询
          pollTask();
        }
      } catch (error: any) {
        alert(error.message);
        // 出错移除任务
        setTasks(prev => prev.filter(t => t.id !== taskId));
      }
    })();
  };

  // 动态计算价格：doubao模型根据时长计算，veo模型固定价格
  let currentPrice;
  if (model === 'doubao-seedance-2-0-260128') {
    currentPrice = 1.5 * duration; // 1.5积分/秒
    // 如果选择了1080p，额外加1积分
    if (resolution === '1080p') {
      currentPrice += 1;
    }
  } else {
    currentPrice = MODEL_PRICING[model]?.input || 0;
  }
  const isVeoModel = model === 'veo3.1';
  const isSeedanceModel = model === 'doubao-seedance-2-0-260128';
  const maxRef = isVeoModel ? 2 : 8;

  return (
    <div className="min-h-screen bg-white" style={{ backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">AI 视频生成</h1>
          <p className="text-gray-500">输入提示词，生成动态视频，支持文生视频和图生视频</p>
        </div>
        <div className="flex flex-col md:flex-row gap-6">
          {/* 左侧：视频设置，和绘图模块布局一样 */}
          <div className="w-full md:w-64 flex-shrink-0">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sticky top-8">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">视频设置</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-2">
                    视频模型
                  </label>
                  <select
                    value={model}
                    onChange={(e) => {
                      setModel(e.target.value);
                      // 切换模型时清空参考文件，避免数量不匹配
                      setReferenceFiles([]);
                    }}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                  >
                    {VIDEO_MODELS.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                
                {/* veo3.1-pro 专属参数 */}
                {isVeoModel && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-2">
                        视频比例
                      </label>
                      <select
                        value={aspectRatio}
                        onChange={(e) => setAspectRatio(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                      >
                        <option value="9:16">9:16 (竖屏)</option>
                        <option value="16:9">16:9 (横屏)</option>
                      </select>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-gray-500">
                        优化提示词
                      </label>
                      <input
                        type="checkbox"
                        checked={enhancePrompt}
                        onChange={(e) => setEnhancePrompt(e.target.checked)}
                        className="w-4 h-4 text-yellow-500 border-gray-300 rounded focus:ring-yellow-400"
                      />
                    </div>
                    <p className="text-xs text-gray-400">参考文件最多2张，仅支持图片，支持文生/首帧/首尾帧</p>
                  </>
                )}
                
                {/* doubao-seedance 专属参数 */}
                {isSeedanceModel && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-2">
                        视频分辨率
                      </label>
                      <select
                        value={resolution}
                        onChange={(e) => setResolution(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                      >
                        <option value="480p">480p</option>
                        <option value="720p">720p</option>
                        <option value="1080p">1080p</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-2">
                        宽高比例
                      </label>
                      <select
                        value={ratio}
                        onChange={(e) => setRatio(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                      >
                        <option value="keep_ratio">保持原图比例</option>
                        <option value="adaptive">自动适配</option>
                        <option value="21:9">21:9</option>
                        <option value="16:9">16:9</option>
                        <option value="4:3">4:3</option>
                        <option value="1:1">1:1</option>
                        <option value="3:4">3:4</option>
                        <option value="9:16">9:16</option>
                        <option value="9:21">9:21</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-2">
                        随机种子 (可选)
                      </label>
                      <input
                        type="number"
                        value={seed || ''}
                        onChange={(e) => setSeed(e.target.value ? Number(e.target.value) : undefined)}
                        min={0}
                        max={2147483647}
                        placeholder="留空则随机"
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-2">
                        视频时长
                      </label>
                      <select
                        value={duration}
                        onChange={(e) => setDuration(Number(e.target.value))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                      >
                        <option value={5}>5秒</option>
                        <option value={10}>10秒</option>
                        <option value={15}>15秒</option>
                      </select>
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-gray-500">
                        固定摄像头
                      </label>
                      <input
                        type="checkbox"
                        checked={cameraFixed}
                        onChange={(e) => setCameraFixed(e.target.checked)}
                        className="w-4 h-4 text-yellow-500 border-gray-300 rounded focus:ring-yellow-400"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-gray-500">
                        生成音频
                      </label>
                      <input
                        type="checkbox"
                        checked={generateAudio}
                        onChange={(e) => setGenerateAudio(e.target.checked)}
                        className="w-4 h-4 text-yellow-500 border-gray-300 rounded focus:ring-yellow-400"
                      />
                    </div>
                    <p className="text-xs text-gray-400">参考文件最多8张，支持文生/首帧/首尾帧/多参考/视频生/音频生</p>
                  </>
                )}
                
                <div className="pt-3 border-t border-gray-100">
                  <div className="text-xs text-gray-500">
                    <div className="flex justify-between">
                      <span>单次价格</span>
                      <span className="font-medium text-gray-700">{currentPrice} 积分</span>
                    </div>
                  </div>
                </div>
                
                {/* 任务列表区域，和绘图模块一样 */}
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
                          {/* 删除任务按钮 */}
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
          
          {/* 中间：结果、参考文件、输入框，和绘图模块布局一样 */}
          <div className="flex-1">
            {/* 结果展示 */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-6 h-[400px] overflow-hidden flex items-center justify-center relative">
              {activeTask ? (
                <>
                  {activeTask.result ? (
                    <div className="relative group w-full h-full flex items-center justify-center p-4">
                      <video 
                        src={activeTask.result} 
                        controls 
                        className="max-w-full max-h-full object-contain rounded-lg"
                      >
                        您的浏览器不支持视频播放
                      </video>
                      <button
                        onClick={() => handleDownload(activeTask.result!)}
                        className="absolute top-4 right-4 bg-black/50 text-white p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </button>
                    </div>
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
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p>生成的视频将显示在这里</p>
                </div>
              )}
            </div>
            
            {/* 参考文件上传区域 */}
            {referenceFiles.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">
                  参考文件 {isVeoModel ? '(最多2张，支持文生/首帧/首尾帧)' : '(最多8张，支持多参考/视频生/音频生)'}
                </h4>
                <div className="flex gap-3 flex-wrap">
                  {referenceFiles.map((file, index) => (
                    <div key={index} className="relative group">
                      {file.file.type.startsWith('image/') ? (
                        <img 
                          src={file.preview} 
                          alt={`参考文件 ${index+1}`}
                          className="w-20 h-20 object-cover rounded-lg border border-gray-200"
                        />
                      ) : file.file.type.startsWith('video/') ? (
                        <video 
                          src={file.preview}
                          className="w-20 h-20 object-cover rounded-lg border border-gray-200"
                          muted
                        />
                      ) : (
                        <audio 
                          src={file.preview}
                          className="w-20 h-20 rounded-lg border border-gray-200"
                          controls
                        />
                      )}
                      <button
                        onClick={() => handleRemoveReference(index)}
                        className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {referenceFiles.length < maxRef && (
                    <label className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center cursor-pointer hover:border-yellow-400 transition-colors">
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      <input
                        type="file"
                        accept="image/*,video/*,audio/*"
                        onChange={handleReferenceUpload}
                        className="hidden"
                        disabled={uploading}
                        multiple
                      />
                    </label>
                  )}
                </div>
              </div>
            )}
            
            {/* 如果没有参考文件，显示上传按钮 */}
            {referenceFiles.length === 0 && (
              <div className="mb-4">
                <label className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 cursor-pointer hover:border-yellow-400 hover:text-yellow-500 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  上传参考文件（图片/视频/音频）
                  <input
                    type="file"
                    accept="image/*,video/*,audio/*"
                    onChange={handleReferenceUpload}
                    className="hidden"
                    disabled={uploading}
                    multiple
                  />
                </label>
                {uploading && <span className="ml-2 text-sm text-gray-500">上传中...</span>}
              </div>
            )}
            
            {/* 输入框 */}
            <form onSubmit={handleSubmit} className="relative">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="描述您想要生成的视频..."
                rows={3}
                className="w-full border border-gray-200 rounded-2xl px-6 py-4 pr-32 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent shadow-sm resize-none"
                disabled={uploading}
              />
              <button
                type="submit"
                disabled={uploading || !prompt.trim()}
                className="absolute right-2 bottom-2 bg-yellow-500 text-white px-6 py-2.5 rounded-xl hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
              >
                生成
              </button>
            </form>
          </div>
        </div>

        {/* 今日历史记录 */}
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
                      onClick={() => handleDownload(record.video)}
                      className="bg-gray-100 text-gray-700 px-3 py-1 rounded-lg hover:bg-gray-200 text-sm"
                    >
                      下载视频
                    </button>
                  </div>
                  <div className="flex gap-3 flex-wrap">
                    <div className="relative group w-32 h-24">
                      <video
                        src={record.video}
                        className="w-full h-full object-cover rounded-lg"
                        muted
                      />
                      <button
                        onClick={() => handleDownload(record.video)}
                        className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-lg"
                      >
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 00-3-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </button>
                    </div>
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
