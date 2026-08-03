'use client';
import { useState, useEffect } from 'react';
import type { RechargeRequest } from '@/lib/db';

export default function AdminPage() {
  const [recharges, setRecharges] = useState<RechargeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string>('');

  useEffect(() => {
    const storedUserId = localStorage.getItem('userId');
    if (storedUserId) {
      setUserId(storedUserId);
    }
  }, []);

  const loadRecharges = async () => {
    try {
      const response = await fetch(`/api/admin/recharges?userId=${userId}`);
      const data = await response.json();
      setRecharges(data.recharges || []);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId) {
      loadRecharges();
    }
  }, [userId]);

  const handleApprove = async (id: number) => {
    if (!confirm('确定要批准这个充值申请吗？')) return;

    try {
      const response = await fetch('/api/admin/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          userId: userId,
          rechargeId: id, 
          action: 'approve' 
        }),
      });
      const data = await response.json();
      if (data.error) {
        alert(data.error);
      } else {
        alert('已批准！');
        loadRecharges();
        // 刷新积分显示，让右上角也同步更新
        fetch(`/api/balance?userId=${userId}`)
          .then(res => res.json())
          .then(data => {
            if (data.points !== undefined) {
              // 更新localStorage里的积分，让导航栏也能更新
              localStorage.setItem('points', data.points.toString());
            }
          });
      }
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleReject = async (id: number) => {
    if (!confirm('确定要拒绝这个充值申请吗？')) return;

    try {
      const response = await fetch('/api/admin/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          userId: userId,
          rechargeId: id, 
          action: 'reject' 
        }),
      });
      const data = await response.json();
      if (data.error) {
        alert(data.error);
      } else {
        alert('已拒绝！');
        loadRecharges();
      }
    } catch (error: any) {
      alert(error.message);
    }
  };

  const pendingRecharges = recharges.filter(r => r.status === 'pending');
  const processedRecharges = recharges.filter(r => r.status !== 'pending');

  return (
    <div className="min-h-screen bg-white" style={{ backgroundImage: 'radial-gradient(#e5e7eb 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">管理后台</h1>
          <p className="text-gray-500">审核用户的充值申请</p>
        </div>

        {/* 待审核 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
            <span className="w-3 h-3 bg-yellow-500 rounded-full mr-2"></span>
            待审核申请
            <span className="ml-2 text-sm font-normal text-gray-500">
              ({pendingRecharges.length} 条)
            </span>
          </h2>

          {loading ? (
            <div className="text-center py-8 text-gray-500">加载中...</div>
          ) : pendingRecharges.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              暂无待审核的申请
            </div>
          ) : (
            <div className="space-y-4">
              {pendingRecharges.map(recharge => (
                <div key={recharge.id} className="border border-gray-200 rounded-xl p-6">
                  <div className="flex items-start gap-6">
                    <div className="flex-1">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                        <div>
                          <p className="text-xs text-gray-500">用户ID</p>
                          <p className="text-sm font-mono text-gray-900">{recharge.user_id}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">充值金额</p>
                          <p className="text-sm font-semibold text-gray-900">{recharge.amount} 元</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">赠送积分</p>
                          <p className="text-sm font-semibold text-yellow-600">{recharge.points} 积分</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500">申请时间</p>
                          <p className="text-sm text-gray-700">
                            {new Date(recharge.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex-shrink-0">
                      <img
                        src={recharge.screenshot_url}
                        alt="付款截图"
                        className="w-32 h-32 object-cover rounded-lg border border-gray-200"
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 mt-4 pt-4 border-t border-gray-100">
                    <button
                      onClick={() => handleApprove(recharge.id)}
                      className="flex-1 bg-green-500 text-white py-2.5 rounded-xl font-medium hover:bg-green-600 transition-colors"
                    >
                      批准
                    </button>
                    <button
                      onClick={() => handleReject(recharge.id)}
                      className="flex-1 bg-red-500 text-white py-2.5 rounded-xl font-medium hover:bg-red-600 transition-colors"
                    >
                      拒绝
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 历史记录 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-6">历史记录</h2>

          {processedRecharges.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              暂无历史记录
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-xs text-gray-500 uppercase">
                    <th className="pb-3">用户ID</th>
                    <th className="pb-3">金额</th>
                    <th className="pb-3">积分</th>
                    <th className="pb-3">状态</th>
                    <th className="pb-3">时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {processedRecharges.map(recharge => (
                    <tr key={recharge.id}>
                      <td className="py-3 text-sm font-mono text-gray-700">{recharge.user_id}</td>
                      <td className="py-3 text-sm text-gray-900">{recharge.amount} 元</td>
                      <td className="py-3 text-sm text-yellow-600">{recharge.points} 积分</td>
                      <td className="py-3">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          recharge.status === 'approved'
                            ? 'bg-green-50 text-green-700'
                            : 'bg-red-50 text-red-700'
                        }`}>
                          {recharge.status === 'approved' ? '已批准' : '已拒绝'}
                        </span>
                      </td>
                      <td className="py-3 text-sm text-gray-500">
                        {new Date(recharge.created_at).toLocaleString()}
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
