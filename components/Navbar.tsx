'use client';
type TabType = 'image' | 'video' | 'profile';

interface NavbarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  userId: string;
  points: number;
}

export default function Navbar({ activeTab, onTabChange, userId, points }: NavbarProps) {
  const handleLogout = () => {
    localStorage.removeItem('userId');
    window.location.href = '/login';
  };

  const navItems: { tab: TabType; label: string }[] = [
    { tab: 'image', label: '绘图' },
    { tab: 'video', label: '视频生成' },
  ];

  return (
    <nav className="bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <div className="flex items-center cursor-pointer" onClick={() => onTabChange('image')}>
              <div className="w-8 h-8 bg-yellow-500 rounded-lg flex items-center justify-center mr-2">
                <span className="text-white font-bold">A</span>
              </div>
              <span className="text-xl font-bold text-gray-900">AI Studio</span>
            </div>
            <div className="ml-10 flex items-center space-x-1">
              {navItems.map(item => (
                <button
                  key={item.tab}
                  onClick={() => onTabChange(item.tab)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === item.tab
                      ? 'bg-yellow-50 text-yellow-600'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  {item.label}
                </button>
              ))}
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
                <button
                  onClick={() => onTabChange('profile')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeTab === 'profile'
                      ? 'bg-yellow-50 text-yellow-600'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  个人中心
                </button>
                <button
                  onClick={handleLogout}
                  className="text-gray-600 hover:text-gray-900 text-sm px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
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
