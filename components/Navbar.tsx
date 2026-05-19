'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ADMIN_USER_ID } from '@/lib/config';

export default function Navbar() {
  const [userId, setUserId] = useState('');
  const [points, setPoints] = useState<number | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    const storedUserId = localStorage.getItem('userId');
    if (storedUserId) {
      setUserId(storedUserId);
      // 获取用户积分，实时从数据库拉取，保证和个人中心同步
      fetch(`/api/balance?userId=${storedUserId}`)
        .then(res => res.json())
        .then(data => {
          if (data.points !== undefined) {
            setPoints(data.points);
          }
        });
    }
  }, []);

  const isAdmin = userId === ADMIN_USER_ID;

  const navItems = [
    { href: '/', label: '对话' },
    { href: '/image', label: '绘图' },
    { href: '/video', label: '视频生成' },
  ];

  return (
    <nav className="bg-white border-b border-gray-100 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <div className="flex-shrink-0 flex items-center">
              <div className="w-8 h-8 bg-yellow-500 rounded-lg flex items-center justify-center mr-2">
                <span className="text-white font-bold text-sm">A</span>
              </div>
              <span className="font-bold text-xl text-gray-900">AI Studio</span>
            </div>

            <div className="hidden sm:ml-8 sm:flex sm:space-x-1">
              {navItems.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    pathname === item.href
                      ? 'bg-yellow-50 text-yellow-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* 积分显示 */}
            {points !== null && (
              <div className="flex items-center bg-yellow-50 px-4 py-2 rounded-lg">
                <svg className="w-4 h-4 text-yellow-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M8.433 7.418c.155-.103.346-.228.589-.356C10.005 6.63 11.022 6.25 12 6.25c.978 0 1.995.38 2.978.812.243.128.434.253.589.356.555.367.85.944.85 1.582v.001c0 .638-.295 1.215-.85 1.582-.155.103-.346.228-.589.356C13.995 11.37 12.978 11.75 12 11.75c-.978 0-1.995-.38-2.978-.812a6.562 6.562 0 01-.589-.356C7.88 10.215 7.585 9.638 7.585 9c0-.638.295-1.215.848-1.582z" />
                </svg>
                <span className="text-sm font-semibold text-yellow-700">{points.toFixed(2)} 积分</span>
              </div>
            )}

            {/* 个人中心 */}
            <Link
              href="/profile"
              className={`p-2 rounded-lg transition-colors ${
                pathname === '/profile'
                  ? 'bg-gray-100'
                  : 'hover:bg-gray-50'
              }`}
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </Link>

            {/* 管理后台 */}
            {isAdmin && (
              <Link
                href="/admin"
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pathname === '/admin'
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                管理后台
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
