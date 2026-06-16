'use client';
import { useState, useEffect, useRef } from 'react';
import { IMAGE_MODELS, IMAGE_RESOLUTIONS, IMAGE_PRESETS, VIDEO_MODELS } from '@/lib/config';
import Navbar from '@/components/Navbar';

// 绘图任务类型
type ImageTask = {
  id: number;
  status: 'pending' | 'complete' | 'error';
  result: string[] | null;
  prompt: string;
  error?: string;
  params?: any;
};

// 视频任务类型
type VideoTask = {
  id: number;
  status: 'pending' | 'complete' | 'error';
  result: string | null;
  prompt: string;
  error?: string;
};

export default function HomePage() {
  // 标签页状态：移除对话，保留image(绘图) | video(视频) | profile(个人中心)
  const [activeTab, setActiveTab] = useState<'image' | 'video' | 'profile'>('image');
  const [userId, setUserId] = useState('');
  const [points, setPoints] = useState(0);

  // ========== 绘图功能状态 ==========
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageProvider, setImageProvider] = useState<string>('gpt-image-2');
  const [imageModel, setImageModel] = useState<string>('1k');
  const [imageResolution, setImageResolution] = useState<string>('1024x1024');
  const [imageAspectRatio, setImageAspectRatio] = useState<string>('auto');
  const [imageCount, setImageCount] = useState(1);
  const [imageReferenceImages, setImageReferenceImages] = useState<any[]>([]);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageTasks, setImageTasks] = useState<ImageTask[]>([]);
  const [imageNextTaskId, setImageNextTaskId] = useState(1);

  // ========== 视频功能状态 ==========
  const [videoPrompt, setVideoPrompt] = useState('');
  const [videoModel, setVideoModel] = useState<string>(VIDEO_MODELS[0]);
  const [videoTasks, setVideoTasks] = useState<VideoTask[]>([]);
  const [videoNextTaskId, setVideoNextTaskId] = useState(1);
  const [videoLoading, setVideoLoading] = useState(false);

  // ========== 个人中心状态 ==========
  const [pointHistory, setPointHistory] = useState<any[]>([]);

  // 初始化用户ID和积分
  useEffect(() => {
    const storedUserId = localStorage.getItem('userId');
    if (storedUserId) {
      setUserId(storedUserId);
      fetch(`/api/balance?userId=${storedUserId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.points !== undefined) {
            setPoints(Number(data.points));
          }
        })
        .catch(() => {});
    }
  }, [activeTab]);

  // ========== 绘图功能逻辑 ==========
  const uploadToScdn = async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('image', file);
    formData.append('cdn_domain', 'img.scdn.io');
    formData.append('outputFormat', 'auto');
    const response = await fetch('https://img.scdn.io/api/v1.php', {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) throw new Error('上传失败');
    const data = await response.json();
    if (!data.success) throw new Error(data.message || '上传失败');
    return data.url;
  };

  const handleImageReferenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newFiles = Array.from(files).slice(0, 5 - imageReferenceImages.length);
    setImageUploading(true);
    try {
      for (const file of newFiles) {
        const preview = URL.createObjectURL(file);
        const img = new Image();
        img.src = preview;
        await new Promise(resolve => img.onload = resolve);
        const url = await uploadToScdn(file);
        setImageReferenceImages(prev => [...prev, {
          file, preview, url, width: img.naturalWidth, height: img.naturalHeight,
        }]);
      }
    } catch (error: any) {
      alert(error.message);
    } finally {
      setImageUploading(false);
    }
    e.target.value = '';
  };

  const handleImageRemoveReference = (index: number) => {
    const img = imageReferenceImages[index];
    if (img) URL.revokeObjectURL(img.preview);
    setImageReferenceImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleImageSubmit = async (e: any) => {
    if (e) e.preventDefault();
    if (!imagePrompt.trim() || imageUploading) return;
    const taskId = imageNextTaskId;
    const newTask: ImageTask = {
      id: taskId,
      status: 'pending',
      result: null,
      prompt: imagePrompt,
      params: {
        userId, provider: imageProvider, model: imageModel, resolution: imageResolution,
        aspectRatio: imageAspectRatio, count: imageCount,
        referenceImages: imageReferenceImages.map(img => ({url: img.url, width: img.width, height: img.height})),
      },
    };
    setImageTasks(prev => [...prev, newTask]);
    setImageNextTaskId(prev => prev + 1);
    
    (async () => {
      try {
        const fullModel = `${imageProvider}-${imageModel}`;
        const body: any = {
          userId, model: fullModel, prompt: imagePrompt, size: imageResolution,
          aspectRatio: imageAspectRatio, n: imageCount,
        };
        if (imageReferenceImages.length > 0) {
          body.image = imageReferenceImages.map(img => img.url);
        }
        const response = await fetch('/api/image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await response.json();
        
        // 修复：处理API返回的各种格式，确保图片URL正确
        let imageUrls: string[] = [];
        if (data.error) {
          throw new Error(data.error);
        }
        
        // 兼容不同的返回格式
        if (data.imageUrls && Array.isArray(data.imageUrls)) {
          imageUrls = data.imageUrls;
        } else if (data.images && Array.isArray(data.images)) {
          imageUrls = data.images;
        } else if (data.url) {
          imageUrls = [data.url];
        } else if (data.data && Array.isArray(data.data)) {
          imageUrls = data.data.map((item: any) => item.url || item);
        }
        
        // 验证URL有效性，过滤空值和损坏链接
        imageUrls = imageUrls.filter(url => url && typeof url === 'string' && url.startsWith('http'));
        
        if (imageUrls.length === 0) {
          throw new Error('生成失败，未返回有效图片链接');
        }
        
        setImageTasks(prev => prev.map(t => {
          if (t.id === taskId) return { ...t, status: 'complete', result: imageUrls };
          return t;
        }));
      } catch (error: any) {
        console.error('绘图生成错误:', error);
        setImageTasks(prev => prev.map(t => {
          if (t.id === taskId) return { ...t, status: 'error', error: error.message || '生成失败' };
          return t;
        }));
      }
    })();
  };

  // ========== 视频功能逻辑 ==========
  const handleVideoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!videoPrompt.trim() || videoLoading) return;
    const taskId = videoNextTaskId;
    const newTask: VideoTask = {
      id: taskId,
      status: 'pending',
      result: null,
      prompt: videoPrompt,
    };
    setVideoTasks(prev => [...prev, newTask]);
    setVideoNextTaskId(prev => prev + 1);
    setVideoLoading(true);
    try {
      const response = await fetch('/api/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, model: videoModel, prompt: videoPrompt }),
      });
      const data = await response.json();
      
      // 修复：处理视频返回格式
      let videoUrl: string | null = null;
      if (data.error) {
        throw new Error(data.error);
      }
      
      if (data.videoUrl && typeof data.videoUrl === 'string' && data.videoUrl.startsWith('http')) {
        videoUrl = data.videoUrl;
      } else if (data.url && typeof data.url === 'string' && data.url.startsWith('http')) {
        videoUrl = data.url;
      } else if (data.data?.url) {
        videoUrl = data.data.url;
      }
      
      if (!videoUrl) {
        throw new Error('生成失败，未返回有效视频链接');
      }
      
      setVideoTasks(prev => prev.map(t => {
        if (t.id === taskId) return { ...t, status: 'complete', result: videoUrl };
        return t;
      }));
    } catch (error: any) {
      console.error('视频生成错误:', error);
      setVideoTasks(prev => prev.map(t => {
        if (t.id === taskId) return { ...t, status: 'error', error: error.message || '生成失败' };
        return t;
      }));
    } finally {
      setVideoLoading(false);
    }
  };

  // ========== 个人中心逻辑 ==========
  useEffect(() => {
    if (activeTab === 'profile' && userId) {
      fetch(`/api/point-history?userId=${userId}`)
        .then(res => res.json())
        .then(data => {
          if (data.history) setPointHistory(data.history);
        })
        .catch(() => {});
    }
  }, [activeTab, userId]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 导航栏，传入标签页切换函数，移除对话选项 */}
      <Navbar activeTab={activeTab} onTabChange={setActiveTab} userId={userId} points={points} />
      
      {/* 标签页内容 */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* 绘图标签页（默认） */}
        {activeTab === 'image' && (
          <div>
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">AI 绘图</h1>
              <p className="text-gray-500">输入描述，生成您想要的图片</p>
            </div>
            <div className="flex flex-col md:flex-row gap-6">
              <div className="w-full md:w-72 flex-shrink-0">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sticky top-24">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">生成设置</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-2">模型</label>
                      <select
                        value={imageProvider}
                        onChange={(e) => setImageProvider(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                      >
                        {Object.keys(IMAGE_MODELS).map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-2">分辨率</label>
                      <select
                        value={imageModel}
                        onChange={(e) => setImageModel(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                      >
                        {IMAGE_MODELS[imageProvider]?.models.map(m => (
                          <option key={m} value={m}>{m.toUpperCase()}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-2">尺寸</label>
                      <select
                        value={imageResolution}
                        onChange={(e) => setImageResolution(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                      >
                        {IMAGE_RESOLUTIONS[imageModel]?.map(r => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-2">生成数量</label>
                      <input
                        type="number"
                        min="1"
                        max="4"
                        value={imageCount}
                        onChange={(e) => setImageCount(Number(e.target.value))}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-2">参考图（最多5张）</label>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleImageReferenceUpload}
                        className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-yellow-50 file:text-yellow-700 hover:file:bg-yellow-100"
                        disabled={imageUploading || imageReferenceImages.length >= 5}
                      />
                      {imageReferenceImages.length > 0 && (
                        <div className="mt-3 grid grid-cols-3 gap-2">
                          {imageReferenceImages.map((img, i) => (
                            <div key={i} className="relative group">
                              <img src={img.preview} alt="" className="w-full h-16 object-cover rounded-lg" />
                              <button
                                onClick={() => handleImageRemoveReference(i)}
                                className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex-1">
                <form onSubmit={handleImageSubmit} className="mb-6">
                  <textarea
                    value={imagePrompt}
                    onChange={(e) => setImagePrompt(e.target.value)}
                    placeholder="输入图片描述，越详细效果越好..."
                    rows={4}
                    className="w-full border border-gray-200 rounded-2xl px-6 py-4 focus:outline-none focus:ring-2 focus:ring-yellow-400 shadow-sm resize-none"
                  />
                  <div className="flex justify-between items-center mt-4">
                    <div className="flex gap-2 flex-wrap">
                      {IMAGE_PRESETS.slice(0, 4).map(preset => (
                        <button
                          key={preset.name}
                          type="button"
                          onClick={() => setImagePrompt(preset.prompt)}
                          className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs text-gray-700 transition-colors"
                        >
                          {preset.name}
                        </button>
                      ))}
                    </div>
                    <button
                      type="submit"
                      disabled={!imagePrompt.trim() || imageUploading}
                      className="bg-yellow-500 text-white px-6 py-2.5 rounded-xl hover:bg-yellow-600 disabled:opacity-50 font-medium transition-colors"
                    >
                      生成图片
                    </button>
                  </div>
                </form>
                {/* 任务结果 */}
                <div className="space-y-6">
                  {imageTasks.map(task => (
                    <div key={task.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                      <div className="flex justify-between items-center mb-4">
                        <h4 className="font-medium text-gray-900">任务 #{task.id}</h4>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          task.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                          task.status === 'error' ? 'bg-red-100 text-red-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {task.status === 'pending' ? '生成中' : task.status === 'error' ? '失败' : '已完成'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mb-4">{task.prompt}</p>
                      {task.error && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4">
                          错误：{task.error}
                        </div>
                      )}
                      {task.result && (
                        <div className="grid grid-cols-2 gap-4">
                          {task.result.map((url, i) => (
                            <div key={i} className="relative group">
                              <img 
                                src={url} 
                                alt="" 
                                className="w-full rounded-xl"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect fill="#f3f4f6" width="400" height="400"/><text fill="#9ca3af" x="50%" y="50%" text-anchor="middle" dy=".3em">图片加载失败</text></svg>';
                                }}
                              />
                              <a
                                href={url}
                                target="_blank"
                                download
                                className="absolute bottom-2 right-2 bg-black/50 text-white px-3 py-1 rounded-lg text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                下载
                              </a>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 视频标签页 */}
        {activeTab === 'video' && (
          <div>
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">AI 视频生成</h1>
              <p className="text-gray-500">输入描述，生成您想要的视频</p>
            </div>
            <div className="max-w-3xl mx-auto">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
                <div className="mb-4">
                  <label className="block text-xs font-medium text-gray-500 mb-2">选择模型</label>
                  <select
                    value={videoModel}
                    onChange={(e) => setVideoModel(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  >
                    {VIDEO_MODELS.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <form onSubmit={handleVideoSubmit}>
                  <textarea
                    value={videoPrompt}
                    onChange={(e) => setVideoPrompt(e.target.value)}
                    placeholder="输入视频描述，例如：一只可爱的小猫在草地上奔跑，阳光明媚..."
                    rows={4}
                    className="w-full border border-gray-200 rounded-2xl px-6 py-4 focus:outline-none focus:ring-2 focus:ring-yellow-400 shadow-sm resize-none mb-4"
                  />
                  <button
                    type="submit"
                    disabled={!videoPrompt.trim() || videoLoading}
                    className="w-full bg-yellow-500 text-white py-3 rounded-xl hover:bg-yellow-600 disabled:opacity-50 font-medium transition-colors"
                  >
                    {videoLoading ? '生成中...' : '生成视频'}
                  </button>
                </form>
              </div>
              <div className="space-y-4">
                {videoTasks.map(task => (
                  <div key={task.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="font-medium text-gray-900">任务 #{task.id}</h4>
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        task.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                        task.status === 'error' ? 'bg-red-100 text-red-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {task.status === 'pending' ? '生成中' : task.status === 'error' ? '失败' : '已完成'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mb-4">{task.prompt}</p>
                    {task.error && (
                      <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4">
                        错误：{task.error}
                      </div>
                    )}
                    {task.result && (
                      <video 
                        src={task.result} 
                        controls 
                        className="w-full rounded-xl"
                        onError={(e) => {
                          console.error('视频加载失败:', task.result);
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 个人中心标签页 */}
        {activeTab === 'profile' && (
          <div>
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">个人中心</h1>
              <p className="text-gray-500">查看您的账户信息和消费记录</p>
            </div>
            <div className="max-w-3xl mx-auto">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">账户信息</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 rounded-xl p-4">
                    <div className="text-xs text-gray-500 mb-1">用户ID</div>
                    <div className="text-lg font-medium text-gray-900">{userId || '未登录'}</div>
                  </div>
                  <div className="bg-yellow-50 rounded-xl p-4">
                    <div className="text-xs text-gray-500 mb-1">当前积分</div>
                    <div className="text-lg font-medium text-yellow-600">{points.toFixed(2)} 积分</div>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">消费记录</h3>
                {pointHistory.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">暂无消费记录</div>
                ) : (
                  <div className="space-y-3">
                    {pointHistory.map((item, i) => (
                      <div key={i} className="flex justify-between items-center py-3 border-b border-gray-100 last:border-0">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{item.description}</div>
                          <div className="text-xs text-gray-500">{new Date(item.createdAt).toLocaleString()}</div>
                        </div>
                        <div className="text-red-500 font-medium">-{item.amount.toFixed(2)} 积分</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
