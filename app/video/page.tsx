'use client';
import { useState, useEffect } from 'react';
import { VIDEO_MODELS, MODEL_PRICING } from '@/lib/config';

export default function VideoPage() {
  const [userId, setUserId] = useState('');
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState<string>(VIDEO_MODELS[0]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    let storedUserId = localStorage.getItem('userId');
    if (!storedUserId) {
      storedUserId = 'user_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('userId', storedUserId);
    }
    setUserId(storedUserId);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || loading) return;

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch('/api/video', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          model,
          prompt,
        }),
      });
      const data = await response.json();
      
      if (data.error) {
        alert(data.error);
        return;
      }

      setResult(data.videoUrl);
    } catch (error: any) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const currentPricing = MODEL_PRICING[model];

  return (
    <div className="min-h-screen bg-white" style={{ backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">AI 视频生成</h1>
          <p className="text-gray-500">输入提示词，生成动态视频</p>
        </div>

        <div className="flex gap-6">
          <div className="w-64 flex-shrink-0">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sticky top-8">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">视频设置</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-2">
                    视频模型
                  </label>
                  <select
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                  >
                    {VIDEO_MODELS.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>

                <div className="pt-3 border-t border-gray-100">
                  <div className="text-xs text-gray-500">
                    <div className="flex justify-between">
                      <span>单次价格</span>
                      <span className="font-medium text-gray-700">{currentPricing?.input || 0} 积分</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1">
            {/* 结果展示 */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-6 h-[400px] overflow-hidden flex items-center justify-center">
              {result ? (
                <video src={result} controls className="max-w-full max-h-full object-contain">
                  您的浏览器不支持视频播放
                </video>
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
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p>生成的视频将显示在这里</p>
                </div>
              )}
            </div>

            {/* 输入框 */}
            <form onSubmit={handleSubmit} className="relative">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="描述您想要生成的视频..."
                rows={3}
                className="w-full border border-gray-200 rounded-2xl px-6 py-4 pr-32 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent shadow-sm resize-none"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !prompt.trim()}
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
