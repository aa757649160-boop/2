'use client';
import { useState, useEffect, useRef } from 'react';
import Navbar from '@/components/Navbar';
import { IMAGE_MODELS, IMAGE_RESOLUTIONS, MODEL_PRICING, IMAGE_PRESETS, VIDEO_MODELS, RECHARGE_TIERS, PAYMENT_QRCODE } from '@/lib/config';

type TabType = 'image' | 'video' | 'profile';

// ==================== 绘图模块 ====================
const uploadToScdn = async (file: File): Promise<string> => {
  const formData = new FormData();
  formData.append('image', file);
  formData.append('cdn_domain', 'img.scdn.io');
  formData.append('outputFormat', 'auto');
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

type ImageTask = {
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

// ==================== 视频模块 ====================
const uploadVideoToScdn = async (file: File): Promise<string> => {
  const formData = new FormData();
  formData.append('image', file);
  formData.append('cdn_domain', 'img.scdn.io');
  formData.append('outputFormat', 'auto');
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

type VideoTask = {
  id: number;
  status: 'pending' | 'complete';
  result: string | null;
  prompt: string;
  params?: {
    userId: string;
    model: string;
    taskId?: string;
    baseUrl?: string;
    apiKey?: string;
    referenceFiles: {url: string, width: number, height: number}[];
    enhancePrompt?: boolean;
    aspectRatio?: string;
    resolution?: string;
    ratio?: string;
    seed?: number;
    generateAudio?: boolean;
    duration?: number;
  };
};

// ==================== 个人中心模块类型 ====================
type Deduction = {
  id: number;
  amount: number;
  description: string;
  created_at: string;
};

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<TabType>('image');

  // ==================== 绘图模块状态 ====================
  const [imageUserId, setImageUserId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [provider, setProvider] = useState<string>('gpt-image-2');
  const [model, setModel] = useState<string>('');
  const [resolution, setResolution] = useState<string>('1024x1024');
  const [aspectRatio, setAspectRatio] = useState<string>('auto');
  const [count, setCount] = useState(1);
  const [referenceImages, setReferenceImages] = useState<{file: File, preview: string, url: string, width: number, height: number}[]>([]);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageHistory, setImageHistory] = useState<Array<{time: number, images: string[], prompt: string}>>([]);
  
  const loadPersistedImageTasks = () => {
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
  const initialImageTaskState = loadPersistedImageTasks();
  const [imageTasks, setImageTasks] = useState<ImageTask[]>(initialImageTaskState.tasks);
  const [activeImageTaskId, setActiveImageTaskId] = useState<number | null>(initialImageTaskState.activeTaskId);
  const [nextImageTaskId, setNextImageTaskId] = useState<number>(initialImageTaskState.nextTaskId);

  // ==================== 视频模块状态 ====================
  const [videoUserId, setVideoUserId] = useState('');
  const [videoPrompt, setVideoPrompt] = useState('');
  const [videoModel, setVideoModel] = useState<string>(VIDEO_MODELS[0]);
  const [referenceFiles, setReferenceFiles] = useState<{file: File, preview: string, url: string, width: number, height: number}[]>([]);
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoHistory, setVideoHistory] = useState<Array<{time: number, video: string, prompt: string}>>([]);
  
  const loadPersistedVideoTasks = () => {
    try {
      const storedTasks = localStorage.getItem('videoTasks');
      const storedNextId = localStorage.getItem('videoNextTaskId');
      const storedActiveId = localStorage.getItem('videoActiveTaskId');
      return {
        tasks: storedTasks ? JSON.parse(storedTasks) : [],
        nextTaskId: storedNextId ? parseInt(storedNextId) : 1,
        activeTaskId: storedActiveId ? parseInt(storedActiveId) : null
      };
    } catch {
      return { tasks: [], nextTaskId: 1, activeTaskId: null };
    }
  };
  const initialVideoTaskState = loadPersistedVideoTasks();
  const [videoTasks, setVideoTasks] = useState<VideoTask[]>(initialVideoTaskState.tasks);
  const [activeVideoTaskId, setActiveVideoTaskId] = useState<number | null>(initialVideoTaskState.activeTaskId);
  const [nextVideoTaskId, setNextVideoTaskId] = useState<number>(initialVideoTaskState.nextTaskId);
  
  const [enhancePrompt, setEnhancePrompt] = useState(false);
  const [videoAspectRatio, setVideoAspectRatio] = useState('9:16');
  const [resolutionVideo, setResolutionVideo] = useState('720p');
  const [ratio, setRatio] = useState('keep_ratio');
  const [seed, setSeed] = useState<number | undefined>(undefined);
  const [cameraFixed, setCameraFixed] = useState(false);
  const [generateAudio, setGenerateAudio] = useState(false);
  const [duration, setDuration] = useState(5);

  // ==================== 个人中心模块状态 ====================
  const [profileUserId, setProfileUserId] = useState('');
  const [points, setPoints] = useState<number | null>(null);
  const [selectedTier, setSelectedTier] = useState<number | null>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [deductions, setDeductions] = useState<Deduction[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const imageMountedRef = useRef(true);
  const videoMountedRef = useRef(true);

  // ==================== 同步任务到localStorage ====================
  useEffect(() => {
    localStorage.setItem('imageTasks', JSON.stringify(imageTasks));
  }, [imageTasks]);
  useEffect(() => {
    localStorage.setItem('imageNextTaskId', nextImageTaskId.toString());
  }, [nextImageTaskId]);
  useEffect(() => {
    if (activeImageTaskId !== null) {
      localStorage.setItem('imageActiveTaskId', activeImageTaskId.toString());
    } else {
      localStorage.removeItem('imageActiveTaskId');
    }
  }, [activeImageTaskId]);

  useEffect(() => {
    localStorage.setItem('videoTasks', JSON.stringify(videoTasks));
  }, [videoTasks]);
  useEffect(() => {
    localStorage.setItem('videoNextTaskId', nextVideoTaskId.toString());
  }, [nextVideoTaskId]);
  useEffect(() => {
    if (activeVideoTaskId !== null) {
      localStorage.setItem('videoActiveTaskId', activeVideoTaskId.toString());
    } else {
      localStorage.removeItem('videoActiveTaskId');
    }
  }, [activeVideoTaskId]);

  useEffect(() => {
    imageMountedRef.current = true;
    videoMountedRef.current = true;
    return () => {
      imageMountedRef.current = false;
      videoMountedRef.current = false;
    };
  }, []);

  // ==================== 初始化数据 ====================
  useEffect(() => {
    const storedUserId = localStorage.getItem('userId');
    if (storedUserId) {
      setImageUserId(storedUserId);
      setVideoUserId(storedUserId);
      setProfileUserId(storedUserId);
    }

    const storedImageHistory = localStorage.getItem('imageHistory');
    if (storedImageHistory) {
      try {
        const parsed = JSON.parse(storedImageHistory);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTimestamp = today.getTime();
        const filtered = parsed.filter((item: any) => item.time >= todayTimestamp);
        setImageHistory(filtered);
        if (filtered.length !== parsed.length) {
          localStorage.setItem('imageHistory', JSON.stringify(filtered));
        }
      } catch (e) {}
    }

    const storedVideoHistory = localStorage.getItem('videoHistory');
    if (storedVideoHistory) {
      try {
        const parsed = JSON.parse(storedVideoHistory);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTimestamp = today.getTime();
        const filtered = parsed.filter((item: any) => item.time >= todayTimestamp);
        setVideoHistory(filtered);
        if (filtered.length !== parsed.length) {
          localStorage.setItem('videoHistory', JSON.stringify(filtered));
        }
      } catch (e) {}
    }

    const modelConfig = IMAGE_MODELS['gpt-image-2'];
    const models = modelConfig.models;
    if (models && models.length > 0) {
      setModel(models[0]);
    }

    // 恢复pending任务
    imageTasks.forEach(task => {
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
              if (imageMountedRef.current) {
                setImageTasks(prev => prev.filter(t => t.id !== task.id));
              }
              return;
            }
            const imageUrls = data.imageUrls;
            if (imageMountedRef.current) {
              setImageTasks(prev => prev.map(t => {
                if (t.id === task.id) {
                  return {
                    ...t,
                    status: 'complete',
                    result: imageUrls,
                  };
                }
                return t;
              }));
            }
            const newRecord = {
              time: Date.now(),
              images: imageUrls,
              prompt: task.prompt,
            };
            setImageHistory(prev => {
              const newHistory = [newRecord, ...prev];
              localStorage.setItem('imageHistory', JSON.stringify(newHistory));
              return newHistory;
            });
          } catch (error: any) {
            if (imageMountedRef.current) {
              setImageTasks(prev => prev.filter(t => t.id !== task.id));
            }
          }
        })();
      }
    });
  }, []);

  // 个人中心初始化
  useEffect(() => {
    if (activeTab === 'profile' && profileUserId) {
      fetch(`/api/balance?userId=${profileUserId}`)
        .then(res => res.json())
        .then(data => {
          if (data.points !== undefined) {
            setPoints(data.points);
          }
        });
      
      setLoadingHistory(true);
      fetch(`/api/point-history?userId=${profileUserId}`)
        .then(res => res.json())
        .then(data => {
          if (data.deductions) {
            setDeductions(data.deductions);
          }
        })
        .finally(() => {
          setLoadingHistory(false);
        });
    }
  }, [activeTab, profileUserId]);

  // ==================== 绘图模块函数 ====================
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

  const handleSingleImageDownload = async (url: string, index: number) => {
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

  const handleBatchImageDownload = async (urls: string[]) => {
    for (let i = 0; i < urls.length; i++) {
      await handleSingleImageDownload(urls[i], i);
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  };

  const handleImageReferenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newFiles = Array.from(files).slice(0, 5 - referenceImages.length);
    setImageUploading(true);
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
      setImageUploading(false);
    }
    e.target.value = '';
  };

  const handleRemoveImageReference = (index: number) => {
    const img = referenceImages[index];
    if (img) {
      URL.revokeObjectURL(img.preview);
    }
    setReferenceImages(prev => prev.filter((_, i) => i !== index));
  };

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

  const activeImageTask = imageTasks.find(t => t.id === activeImageTaskId) || null;

  const handleImageSubmit = async (e: any) => {
    if (e) e.preventDefault();
    if (!prompt.trim() || imageUploading) return;

    const taskId = nextImageTaskId;
    const newTask: ImageTask = {
      id: taskId,
      status: 'pending',
      result: null,
      prompt: prompt,
      params: {
        userId: imageUserId,
        provider,
        model,
        resolution,
        aspectRatio,
        count,
        referenceImages: referenceImages.map(img => ({url: img.url, width: img.width, height: img.height})),
      },
    };
    setImageTasks(prev => [...prev, newTask]);
    setNextImageTaskId(prev => prev + 1);
    setActiveImageTaskId(taskId);

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
          userId: imageUserId,
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
          setImageTasks(prev => prev.filter(t => t.id !== taskId));
          return;
        }
        const imageUrls = data.imageUrls;
        if (imageMountedRef.current) {
          setImageTasks(prev => prev.map(t => {
            if (t.id === taskId) {
              return {
                ...t,
                status: 'complete',
                result: imageUrls,
              };
            }
            return t;
          }));
        }
        const newRecord = {
          time: Date.now(),
          images: imageUrls,
          prompt: prompt,
        };
        setImageHistory(prev => {
          const newHistory = [newRecord, ...prev];
          localStorage.setItem('imageHistory', JSON.stringify(newHistory));
          return newHistory;
        });
      } catch (error: any) {
        alert(error.message);
        setImageTasks(prev => prev.filter(t => t.id !== taskId));
      }
    })();
  };

  const handlePresetClick = async (preset: typeof IMAGE_PRESETS[0]) => {
    if (referenceImages.length === 0) {
      alert('请先上传您的照片，才能使用这个一键功能！');
      return;
    }
    setPrompt(preset.prompt);
    await handleImageSubmit(null);
  };

  // ==================== 视频模块函数 ====================
  const handleVideoDownload = async (url: string) => {
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

  const handleVideoReferenceUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const maxRef = videoModel === 'veo3.1' ? 2 : 8;
    const newFiles = Array.from(files).slice(0, maxRef - referenceFiles.length);
    setVideoUploading(true);
    try {
      for (const file of newFiles) {
        const isVeoModel = videoModel === 'veo3.1';
        if (isVeoModel && !file.type.startsWith('image/')) {
          alert('veo3.1模型仅支持图片参考文件，不支持视频和音频');
          continue;
        }
        const preview = URL.createObjectURL(file);
        let width = 0, height = 0;
        if (file.type.startsWith('image/')) {
          const img = new Image();
          img.src = preview;
          await new Promise(resolve => img.onload = resolve);
          width = img.naturalWidth;
          height = img.naturalHeight;
        }
        const url = await uploadVideoToScdn(file);
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
      setVideoUploading(false);
    }
    e.target.value = '';
  };

  const handleRemoveVideoReference = (index: number) => {
    const file = referenceFiles[index];
    if (file) {
      URL.revokeObjectURL(file.preview);
    }
    setReferenceFiles(prev => prev.filter((_, i) => i !== index));
  };

  const activeVideoTask = videoTasks.find(t => t.id === activeVideoTaskId) || null;

  const handleVideoSubmit = async (e: any) => {
    if (e) e.preventDefault();
    if (!videoPrompt.trim() || videoUploading) return;
    
    const taskId = nextVideoTaskId;
    const newTask: VideoTask = {
      id: taskId,
      status: 'pending',
      result: null,
      prompt: videoPrompt,
      params: {
        userId: videoUserId,
        model: videoModel,
        referenceFiles: referenceFiles.map(f => ({url: f.url, width: f.width, height: f.height})),
        enhancePrompt,
        aspectRatio: videoAspectRatio,
        resolution: resolutionVideo,
        ratio,
        seed,
        generateAudio,
        duration,
      },
    };
    setVideoTasks(prev => [...prev, newTask]);
    setNextVideoTaskId(prev => prev + 1);
    setActiveVideoTaskId(taskId);
    
    (async () => {
      try {
        const body: any = {
          userId: videoUserId,
          model: videoModel,
          prompt: videoPrompt,
        };
        
        if (referenceFiles.length > 0) {
          body.images = referenceFiles.map(file => file.url);
        }
        
        if (videoModel === 'veo3.1') {
          body.enhance_prompt = enhancePrompt;
          body.aspect_ratio = videoAspectRatio;
        } else if (videoModel === 'doubao-seedance-2-0-260128') {
          body.resolution = resolutionVideo;
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
          setVideoTasks(prev => prev.filter(t => t.id !== taskId));
          return;
        }
        
        if (data.videoUrl) {
          const videoUrl = data.videoUrl;
          setVideoTasks(prev => prev.map(t => {
            if (t.id === taskId) {
              return {
                ...t,
                status: 'complete',
                result: videoUrl,
              };
            }
            return t;
          }));
          const newRecord = {
            time: Date.now(),
            video: videoUrl,
            prompt: videoPrompt,
          };
          setVideoHistory(prev => {
            const newHistory = [newRecord, ...prev];
            localStorage.setItem('videoHistory', JSON.stringify(newHistory));
            return newHistory;
          });
        } else {
          const { taskId: apiTaskId, baseUrl, apiKey } = data;
          const pollTask = async () => {
            let attempts = 0;
            const maxAttempts = 900;
            
            while (attempts < maxAttempts) {
              try {
                const res = await fetch(`${baseUrl}/v2/videos/generations/${apiTaskId}`, {
                  headers: {
                    'Authorization': `Bearer ${apiKey}`,
                  },
                });
                
                const taskData = await res.json();
                const isSuccess = taskData.status === 'completed' || taskData.status === 'succeeded' || taskData.status === 'SUCCESS';
                if (isSuccess) {
                  const videoUrl = taskData.video_url || taskData.output || taskData.data?.output;
                  if (videoUrl) {
                    setVideoTasks(prev => prev.map(t => {
                      if (t.id === taskId) {
                        return {
                          ...t,
                          status: 'complete',
                          result: videoUrl,
                        };
                      }
                      return t;
                    }));
                    const newRecord = {
                      time: Date.now(),
                      video: videoUrl,
                      prompt: videoPrompt,
                    };
                    setVideoHistory(prev => {
                      const newHistory = [newRecord, ...prev];
                      localStorage.setItem('videoHistory', JSON.stringify(newHistory));
                      return newHistory;
                    });
                    alert('生成成功！');
                    return;
                  }
                } else if (taskData.status === 'failed' || taskData.status === 'FAILED') {
                  alert(taskData.fail_reason || taskData.error || '任务失败，请重试');
                  setVideoTasks(prev => prev.filter(t => t.id !== taskId));
                  return;
                }
                await new Promise(resolve => setTimeout(resolve, 2000));
                attempts++;
              } catch (e) {
                await new Promise(resolve => setTimeout(resolve, 2000));
                attempts++;
              }
            }
            alert('任务超时，请稍后查看结果');
            setVideoTasks(prev => prev.filter(t => t.id !== taskId));
          };
          pollTask();
        }
      } catch (error: any) {
        alert(error.message);
        setVideoTasks(prev => prev.filter(t => t.id !== taskId));
      }
    })();
  };

  // ==================== 个人中心模块函数 ====================
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setScreenshot(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleProfileSubmit = async () => {
    if (selectedTier === null || !screenshot) {
      alert('请选择充值档位并上传付款截图');
      return;
    }
    setProfileLoading(true);
    try {
      const tier = RECHARGE_TIERS[selectedTier];
      const response = await fetch('/api/recharge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: profileUserId,
          amount: tier.amount,
          points: tier.points,
          screenshot,
        }),
      });
      const data = await response.json();
      if (data.error) {
        alert(data.error);
        return;
      }
      alert('充值申请已提交，请等待管理员审核！');
      setSelectedTier(null);
      setScreenshot(null);
      fetch(`/api/balance?userId=${profileUserId}`)
        .then(res => res.json())
        .then(data => {
          if (data.points !== undefined) {
            setPoints(data.points);
          }
        });
    } catch (error: any) {
      alert(error.message);
    } finally {
      setProfileLoading(false);
    }
  };

  const formatTime = (timeStr: string) => {
    const date = new Date(timeStr);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // ==================== 渲染 ====================
  const fullImageModel = `${provider}-${model}`;
  const currentImagePricing = MODEL_PRICING[fullImageModel];
  const availableImageModels = IMAGE_MODELS[provider]?.models || [];

  let currentVideoPrice;
  if (videoModel === 'doubao-seedance-2-0-260128') {
    currentVideoPrice = 1.5 * duration;
    if (resolutionVideo === '1080p') {
      currentVideoPrice += 1;
    }
  } else {
    currentVideoPrice = MODEL_PRICING[videoModel]?.input || 0;
  }
  const isVeoModel = videoModel === 'veo3.1';
  const isSeedanceModel = videoModel === 'doubao-seedance-2-0-260128';
  const maxVideoRef = isVeoModel ? 2 : 8;

  return (
    <>
      <Navbar activeTab={activeTab} onTabChange={setActiveTab} />
      
      {/* 绘图页面 */}
      {activeTab === 'image' && (
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
                        {availableImageModels.map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
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
                          <span className="font-medium text-gray-700">{((currentImagePricing?.input || 0) * count).toFixed(2)} 积分</span>
                        </div>
                      </div>
                    </div>
                    {imageTasks.length > 0 && (
                      <div className="pt-3 border-t border-gray-100">
                        <h3 className="text-xs font-medium text-gray-500 mb-2">生成任务</h3>
                        <div className="flex gap-2 flex-wrap">
                          {imageTasks.map((task) => (
                            <div key={task.id} className="relative group">
                              <button
                                onClick={() => setActiveImageTaskId(task.id)}
                                className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-medium transition-colors ${
                                  activeImageTaskId === task.id
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
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setImageTasks(prev => {
                                    const remaining = prev.filter(t => t.id !== task.id);
                                    if (activeImageTaskId === task.id) {
                                      if (remaining.length > 0) {
                                        setActiveImageTaskId(remaining[0].id);
                                      } else {
                                        setActiveImageTaskId(null);
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
              <div className="flex-1">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-6 h-[400px] overflow-hidden flex items-center justify-center relative">
                  {activeImageTask ? (
                    <>
                      {activeImageTask.result ? (
                        <>
                          <div className={`grid ${activeImageTask.result.length === 1 ? 'grid-cols-1' : 'grid-cols-2'} gap-4 w-full h-full overflow-auto p-4`}>
                            {activeImageTask.result.map((url, index) => (
                              <div key={index} className="relative group">
                                <img src={url} alt={`Generated ${index+1}`} className="w-full h-auto object-contain rounded-lg" />
                                <button
                                  onClick={() => handleSingleImageDownload(url, index)}
                                  className="absolute bottom-2 right-2 bg-yellow-500 text-white px-3 py-1 rounded-lg hover:bg-yellow-600 text-sm opacity-0 group-hover:opacity-100 transition-opacity"
                                >
                                  下载
                                </button>
                              </div>
                            ))}
                          </div>
                          <button
                            onClick={() => handleBatchImageDownload(activeImageTask.result!)}
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
                            onClick={() => handleRemoveImageReference(index)}
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
                        {imageUploading ? (
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
                        onChange={handleImageReferenceUpload}
                        disabled={imageUploading}
                      />
                    </label>
                  </div>
                )}
                <form onSubmit={handleImageSubmit} className="relative">
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="尽量详细的描述您想要生成的图片"
                    rows={3}
                    className="w-full border border-gray-200 rounded-2xl px-6 py-4 pr-32 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent shadow-sm resize-none"
                    disabled={imageUploading}
                   />
                  <button
                    type="submit"
                    disabled={!prompt.trim() || imageUploading}
                    className="absolute right-2 bottom-2 bg-yellow-500 text-white px-6 py-2.5 rounded-xl hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    生成图片
                  </button>
                </form>
              </div>
              <div className="w-full md:w-56 flex-shrink-0">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sticky top-8">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">一键预设</h3>
                  <div className="space-y-3">
                    {IMAGE_PRESETS.map(preset => (
                      <button
                        key={preset.name}
                        type="button"
                        onClick={() => handlePresetClick(preset)}
                        disabled={imageUploading}
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
            {imageHistory.length > 0 && (
              <div className="mt-8 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">今日生成记录</h3>
                <div className="space-y-4">
                  {imageHistory.map((record, recordIndex) => (
                    <div key={record.time} className="border border-gray-100 rounded-xl p-4">
                      <div className="flex justify-between items-center mb-3">
                        <div>
                          <p className="text-sm text-gray-500">{new Date(record.time).toLocaleTimeString()}</p>
                          <p className="text-sm text-gray-700 truncate max-w-md">提示词：{record.prompt}</p>
                        </div>
                        <button
                          onClick={() => handleBatchImageDownload(record.images)}
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
                              onClick={() => handleSingleImageDownload(imgUrl, imgIndex)}
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
      )}

      {/* 视频页面 */}
      {activeTab === 'video' && (
        <div className="min-h-screen bg-white" style={{ backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
          <div className="max-w-6xl mx-auto px-4 py-8">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">AI 视频生成</h1>
              <p className="text-gray-500">输入提示词，生成动态视频，支持文生视频和图生视频</p>
            </div>
            <div className="flex flex-col md:flex-row gap-6">
              <div className="w-full md:w-64 flex-shrink-0">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sticky top-8">
                  <h3 className="text-sm font-semibold text-gray-700 mb-4">视频设置</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-2">
                        视频模型
                      </label>
                      <select
                        value={videoModel}
                        onChange={(e) => {
                          setVideoModel(e.target.value);
                          setReferenceFiles([]);
                        }}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                      >
                        {VIDEO_MODELS.map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                    {isVeoModel && (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-2">
                            视频比例
                          </label>
                          <select
                            value={videoAspectRatio}
                            onChange={(e) => setVideoAspectRatio(e.target.value)}
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
                    {isSeedanceModel && (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-2">
                            视频分辨率
                          </label>
                          <select
                            value={resolutionVideo}
                            onChange={(e) => setResolutionVideo(e.target.value)}
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
                          <span className="font-medium text-gray-700">{currentVideoPrice} 积分</span>
                        </div>
                      </div>
                    </div>
                    {videoTasks.length > 0 && (
                      <div className="pt-3 border-t border-gray-100">
                        <h3 className="text-xs font-medium text-gray-500 mb-2">生成任务</h3>
                        <div className="flex gap-2 flex-wrap">
                          {videoTasks.map((task) => (
                            <div key={task.id} className="relative group">
                              <button
                                onClick={() => setActiveVideoTaskId(task.id)}
                                className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-medium transition-colors ${
                                  activeVideoTaskId === task.id
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
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setVideoTasks(prev => {
                                    const remaining = prev.filter(t => t.id !== task.id);
                                    if (activeVideoTaskId === task.id) {
                                      if (remaining.length > 0) {
                                        setActiveVideoTaskId(remaining[0].id);
                                      } else {
                                        setActiveVideoTaskId(null);
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
              <div className="flex-1">
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-6 h-[400px] overflow-hidden flex items-center justify-center relative">
                  {activeVideoTask ? (
                    <>
                      {activeVideoTask.result ? (
                        <div className="relative group w-full h-full flex items-center justify-center p-4">
                          <video 
                            src={activeVideoTask.result} 
                            controls 
                            className="max-w-full max-h-full object-contain rounded-lg"
                          >
                            您的浏览器不支持视频播放
                          </video>
                          <button
                            onClick={() => handleVideoDownload(activeVideoTask.result!)}
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
                            onClick={() => handleRemoveVideoReference(index)}
                            className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      {referenceFiles.length < maxVideoRef && (
                        <label className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center cursor-pointer hover:border-yellow-400 transition-colors">
                          <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          <input
                            type="file"
                            accept="image/*,video/*,audio/*"
                            onChange={handleVideoReferenceUpload}
                            className="hidden"
                            disabled={videoUploading}
                            multiple
                          />
                        </label>
                      )}
                    </div>
                  </div>
                )}
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
                        onChange={handleVideoReferenceUpload}
                        className="hidden"
                        disabled={videoUploading}
                        multiple
                      />
                    </label>
                    {videoUploading && <span className="ml-2 text-sm text-gray-500">上传中...</span>}
                  </div>
                )}
                <form onSubmit={handleVideoSubmit} className="relative">
                  <textarea
                    value={videoPrompt}
                    onChange={(e) => setVideoPrompt(e.target.value)}
                    placeholder="描述您想要生成的视频..."
                    rows={3}
                    className="w-full border border-gray-200 rounded-2xl px-6 py-4 pr-32 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent shadow-sm resize-none"
                    disabled={videoUploading}
                  />
                  <button
                    type="submit"
                    disabled={videoUploading || !videoPrompt.trim()}
                    className="absolute right-2 bottom-2 bg-yellow-500 text-white px-6 py-2.5 rounded-xl hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
                  >
                    生成
                  </button>
                </form>
              </div>
            </div>
            {videoHistory.length > 0 && (
              <div className="mt-8 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">今日生成记录</h3>
                <div className="space-y-4">
                  {videoHistory.map((record, recordIndex) => (
                    <div key={record.time} className="border border-gray-100 rounded-xl p-4">
                      <div className="flex justify-between items-center mb-3">
                        <div>
                          <p className="text-sm text-gray-500">{new Date(record.time).toLocaleTimeString()}</p>
                          <p className="text-sm text-gray-700 truncate max-w-md">提示词：{record.prompt}</p>
                        </div>
                        <button
                          onClick={() => handleVideoDownload(record.video)}
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
                            onClick={() => handleVideoDownload(record.video)}
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
      )}

      {/* 个人中心页面 */}
      {activeTab === 'profile' && (
        <div className="min-h-screen bg-white" style={{ backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
          <div className="max-w-4xl mx-auto px-4 py-8">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">个人中心</h1>
              <p className="text-gray-500">查看您的账户信息和积分余额</p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 mb-8">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 mb-1">当前积分余额</p>
                  <div className="flex items-center">
                    <div className="w-10 h-10 bg-yellow-500 rounded-full flex items-center justify-center mr-3">
                      <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M8.433 7.418c.155-.103.346-.228.589-.356C10.005 6.63 11.022 6.25 12 6.25c.978 0 1.995.38 2.978.812.243.128.434.253.589.356.555.367.85.944.85 1.582v.001c0 .638-.295 1.215-.85 1.582-.155.103-.346.228.589-.356C13.995 11.37 12.978 11.75 12 11.75c-.978 0-1.995-.38-2.978-.812a6.562 6.562 0 01-.589-.356C7.88 10.215 7.585 9.638 7.585 9c0-.638.295-1.215.848-1.582z" />
                      </svg>
                    </div>
                    <span className="text-4xl font-bold text-gray-900">{points ?? '-'}</span>
                    <span className="text-lg text-gray-500 ml-2">积分</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500">用户ID</p>
                  <p className="text-sm font-mono text-gray-700">{profileUserId}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 mb-8">
              <h2 className="text-xl font-bold text-gray-900 mb-6">积分充值</h2>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">选择充值档位</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {RECHARGE_TIERS.map((tier, index) => (
                    <button
                      key={index}
                      onClick={() => setSelectedTier(index)}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        selectedTier === index
                          ? 'border-yellow-500 bg-yellow-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="text-2xl font-bold text-gray-900">{tier.amount}元</div>
                      <div className="text-sm text-gray-500">{tier.points} 积分</div>
                    </button>
                  ))}
                </div>
              </div>
              {selectedTier !== null && (
                <div className="border-t border-gray-100 pt-6">
                  <div className="grid md:grid-cols-2 gap-8">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-3">
                        1. 扫码付款
                      </label>
                      <div className="bg-gray-50 rounded-xl p-6 flex flex-col items-center">
                        <img
                          src={PAYMENT_QRCODE}
                          alt="收款码"
                          className="w-48 h-48 rounded-lg shadow-sm"
                        />
                        <p className="text-sm text-gray-500 mt-3">
                          扫码支付 {RECHARGE_TIERS[selectedTier].amount} 元
                        </p>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-3">
                        2. 上传付款截图
                      </label>
                      <div className="bg-gray-50 rounded-xl p-6">
                        {!screenshot ? (
                          <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-yellow-400 transition-colors">
                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                              <svg className="w-8 h-8 mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                              </svg>
                              <p className="mb-2 text-sm text-gray-500">
                                <span className="font-semibold">点击上传</span> 或拖拽文件
                              </p>
                              <p className="text-xs text-gray-400">PNG, JPG 最大 10MB</p>
                            </div>
                            <input
                              type="file"
                              className="hidden"
                              accept="image/*"
                              onChange={handleFileChange}
                            />
                          </label>
                        ) : (
                          <div className="relative">
                            <img
                              src={screenshot}
                              alt="截图预览"
                              className="w-full h-48 object-contain rounded-lg"
                            />
                            <button
                              onClick={() => setScreenshot(null)}
                              className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full hover:bg-red-600"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={handleProfileSubmit}
                        disabled={profileLoading || !screenshot}
                        className="w-full mt-4 bg-yellow-500 text-white py-3 rounded-xl font-medium hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {profileLoading ? '提交中...' : '提交充值申请'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-6">积分扣费历史</h2>
              {loadingHistory ? (
                <div className="text-center py-8">
                  <div className="animate-spin w-6 h-6 border-2 border-yellow-500 border-t-transparent rounded-full mx-auto"></div>
                  <p className="text-sm text-gray-500 mt-2">加载中...</p>
                </div>
              ) : deductions.length === 0 ? (
                <div className="text-center py-8">
                  <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <p className="text-gray-500">暂无扣费记录</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">扣费时间</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">扣费内容</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">扣费数值</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deductions.map((deduction) => (
                        <tr key={deduction.id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="py-4 px-4 text-sm text-gray-600">
                            {formatTime(deduction.created_at)}
                          </td>
                          <td className="py-4 px-4 text-sm text-gray-800">
                            {deduction.description}
                          </td>
                          <td className="py-4 px-4 text-sm text-right">
                            <span className="text-red-500 font-medium">-{deduction.amount.toFixed(2)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
