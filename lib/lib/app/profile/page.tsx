'use client';
import { useState, useEffect } from 'react';
import { RECHARGE_TIERS, PAYMENT_QRCODE } from '@/lib/config';

type Deduction = {
  id: number;
  amount: number;
  description: string;
  created_at: string;
};

export default function ProfilePage() {
  const [userId, setUserId] = useState('');
  const [points, setPoints] = useState<number | null>(null);
  const [selectedTier, setSelectedTier] = useState<number | null>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deductions, setDeductions] = useState<Deduction[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    const storedUserId = localStorage.getItem('userId');
    if (storedUserId) {
      setUserId(storedUserId);
      // 获取用户积分，实时从数据库拉取
      fetch(`/api/balance?userId=${storedUserId}`)
        .then(res => res.json())
        .then(data => {
          if (data.points !== undefined) {
            setPoints(data.points);
          }
        });
      
      // 获取扣费历史
      setLoadingHistory(true);
      fetch(`/api/point-history?userId=${storedUserId}`)
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
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // 简单的base64编码
      const reader = new FileReader();
      reader.onload = (event) => {
        setScreenshot(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    if (selectedTier === null || !screenshot) {
      alert('请选择充值档位并上传付款截图');
      return;
    }

    setLoading(true);
    try {
      const tier = RECHARGE_TIERS[selectedTier];
      const response = await fetch('/api/recharge', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
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
      // 刷新积分，实时同步
      fetch(`/api/balance?userId=${userId}`)
        .then(res => res.json())
        .then(data => {
          if (data.points !== undefined) {
            setPoints(data.points);
          }
        });
    } catch (error: any) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  // 格式化时间
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

  return (
    <div className="min-h-screen bg-white" style={{ backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">个人中心</h1>
          <p className="text-gray-500">查看您的账户信息和积分余额</p>
        </div>

        {/* 积分卡片 */}
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
              <p className="text-sm font-mono text-gray-700">{userId}</p>
            </div>
          </div>
        </div>

        {/* 充值区域 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-6">积分充值</h2>

          {/* 充值档位 */}
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
                {/* 收款码 */}
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

                {/* 上传截图 */}
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
                    onClick={handleSubmit}
                    disabled={loading || !screenshot}
                    className="w-full mt-4 bg-yellow-500 text-white py-3 rounded-xl font-medium hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {loading ? '提交中...' : '提交充值申请'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 扣费历史区域 */}
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
  );
}
