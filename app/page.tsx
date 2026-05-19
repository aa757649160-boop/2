'use client';
import { useState, useEffect, useRef } from 'react';
import { CHAT_MODELS, DEFAULT_CHAT_MODEL, MODEL_PRICING } from '@/lib/config';
type Message = {
  role: 'user' | 'assistant';
  content: string;
};
export default function ChatPage() {
  const [userId, setUserId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [provider, setProvider] = useState<string>('OpenAI');
  const [model, setModel] = useState<string>(DEFAULT_CHAT_MODEL);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let storedUserId = localStorage.getItem('userId');
    if (!storedUserId) {
      storedUserId = 'user_' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem('userId', storedUserId);
    }
    setUserId(storedUserId);
  }, []);
  useEffect(() => {
    const models = CHAT_MODELS[provider];
    if (models && models.length > 0) {
      setModel(models[0]);
    }
  }, [provider]);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          model,
          messages: [...messages, userMessage],
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        alert(errorData.error || '请求失败');
        return;
      }
      
      // 处理流式响应
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      
      // 先添加一个空的助手消息
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '',
      }]);
      
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          // 解码收到的chunk
          const chunk = decoder.decode(value, { stream: true });
          // 处理每一行的SSE数据
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') break;
              try {
                const parsed = JSON.parse(data);
                if (parsed.choices && parsed.choices[0]?.delta?.content) {
                  fullContent += parsed.choices[0].delta.content;
                  // 更新消息内容
                  setMessages(prev => {
                    const newMessages = [...prev];
                    newMessages[newMessages.length - 1].content = fullContent;
                    return newMessages;
                  });
                }
              } catch (e) {
                // 忽略解析错误
              }
            }
          }
        }
      }
    } catch (error: any) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };
  const currentPricing = MODEL_PRICING[model];
  const availableModels = CHAT_MODELS[provider] || [];
  return (
    <div className="min-h-screen bg-white" style={{ backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">AI 对话</h1>
          <p className="text-gray-500">选择模型，开始您的智能对话之旅</p>
        </div>
        {/* 模型选择侧边栏 */}
        <div className="flex gap-6">
          <div className="w-64 flex-shrink-0">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sticky top-8">
              <h3 className="text-sm font-semibold text-gray-700 mb-4">模型设置</h3>
              
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
                    {Object.keys(CHAT_MODELS).map(p => (
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
                <div className="pt-3 border-t border-gray-100">
                  <div className="text-xs text-gray-500">
                    <div className="flex justify-between mb-1">
                      <span>输入价格</span>
                      <span className="font-medium text-gray-700">{currentPricing?.input || 0} 积分/千token</span>
                    </div>
                    <div className="flex justify-between">
                      <span>输出价格</span>
                      <span className="font-medium text-gray-700">{currentPricing?.output || 0} 积分/千token</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* 主内容区 */}
          <div className="flex-1">
            {/* 消息列表 */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-6 h-[500px] overflow-y-auto">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                  <div className="w-16 h-16 bg-yellow-50 rounded-full flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                  </div>
                  <p>开始对话吧！</p>
                </div>
              ) : (
                <div className="p-6 space-y-6">
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-md lg:max-w-lg px-4 py-3 rounded-2xl ${
                        msg.role === 'user' 
                          ? 'bg-yellow-500 text-white' 
                          : 'bg-gray-50 text-gray-900'
                      }`}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div className="flex justify-start">
                      <div className="max-w-md lg:max-w-lg px-4 py-3 rounded-2xl bg-gray-50 text-gray-500">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                          <span className="ml-2">思考中...</span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>
            {/* 输入框 */}
            <form onSubmit={handleSubmit} className="relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="输入您的问题..."
                className="w-full border border-gray-200 rounded-2xl px-6 py-4 pr-32 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent shadow-sm"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-yellow-500 text-white px-6 py-2.5 rounded-xl hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors"
              >
                发送
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
