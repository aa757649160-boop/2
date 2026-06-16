'use client';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';

export default function Navbar() {
  const [userId, setUserId] = useState('');
  const [points, setPoints] = useState(0);
  const pathname = usePathname();

  useEffect(() => {
    const id = localStorage.getItem('userId');
    if (id) {
      setUserId(id);
      
      // 只有当用户登录了才去请求积分
      fetch(`/api/balance?userId=${id}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.points !== undefined) {
            setPoints(Number(data.points));
          }
        })
        .catch(() => {
          // 出错了也不报错，保持默认的0
        });
    }
  }, [pathname]);

  const handleLogout = () => {
    localStorage.removeItem('userId');
    window.location.href = '/login';
  };

  return (
    <nav className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <a href="/" className="flex items-center">
              <div className="w-8 h-8 bg-yellow-500 rounded-lg flex items-center justify-center mr-2">
                <span className="text-white font-bold">A</span>
              </div>
              <span className="text-xl font-bold text-gray-900">AI Studio</span>
            </a>
            <div className="ml-10 flex items-center space-x-4">
              <a href="/" className="text-gray-600 hover:text-gray-900 text-sm">对话</a>
              <a href="/image" className="text-gray-600 hover:text-gray-900 text-sm">绘图</a>
              <a href="/video" className="text-gray-600 hover:text-gray-900 text-sm">视频生成</a>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {userId ? (
              <>
                <div className="flex items-center text-sm">
                  <span className="text-gray-600">积分：</span>
                  <span className="font-medium text-yellow-600 ml-1">
                    {points?.toFixed?.(2) || 0}
                  </span>
                </div>
                <a href="/profile" className="text-gray-600 hover:text-gray-900 text-sm">
                  个人中心
                </a>
                <button
                  onClick={handleLogout}
                  className="text-gray-600 hover:text-gray-900 text-sm"
                >
                  退出登录
                </button>
              </>
            ) : (
              <>
                <a href="/login" className="text-gray-600 hover:text-gray-900 text-sm">
                  登录
                </a>
                <a
                  href="/register"
                  className="bg-yellow-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-yellow-600"
                >
                  注册
                </a>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
