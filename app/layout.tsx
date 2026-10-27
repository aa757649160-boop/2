import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import GlobalAnnouncement from '@/components/GlobalAnnouncement';
import { globalAnnouncement } from '@/config/announcement';
const inter = Inter({ subsets: ['latin'] });

// 所有页面强制动态渲染，HTML 返回 no-store，避免 EdgeOne/CDN 缓存旧版本导致前端加载旧代码
// （参考图图床线路、新功能等改动部署后都能立即生效，无需清 CDN 缓存）
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'AI Studio',
  description: 'AI 绘图、视频生成平台',
};
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 计算内容区域的左边距，避免被公告栏遮挡
  const contentMarginLeft = globalAnnouncement.isShow ? globalAnnouncement.style.width : '0';
  return (
    <html lang="zh-CN">
      <body className={inter.className}>
        {/* 全局固定左侧公告栏 */}
        <GlobalAnnouncement />
        {/* 主内容区域，向右偏移避免遮挡 */}
        <div className="md:ml-[var(--announcement-margin)]" style={{ "--announcement-margin": `${contentMarginLeft}px` } as React.CSSProperties}>
          {children}
        </div>
      </body>
    </html>
  );
}
