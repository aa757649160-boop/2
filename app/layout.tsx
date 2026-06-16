import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import GlobalAnnouncement from '@/components/GlobalAnnouncement';
import { globalAnnouncement } from '@/config/announcement';
const inter = Inter({ subsets: ['latin'] });
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
