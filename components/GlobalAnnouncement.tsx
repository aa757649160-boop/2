'use client';
import { globalAnnouncement } from '@/config/announcement';

export default function GlobalAnnouncement() {
  // 如果配置里设置了隐藏，就不显示
  if (!globalAnnouncement.isShow) {
    return null;
  }

  const { title, contentList, style } = globalAnnouncement;

  return (
    <div 
      className="fixed left-0 top-0 h-full z-50 overflow-y-auto"
      style={{
        width: style.width,
        backgroundColor: style.bgColor,
        borderRight: `1px solid ${style.borderColor}`,
        padding: '20px 16px'
      }}
    >
      <h3 
        className="text-lg font-bold mb-4"
        style={{ color: style.titleColor }}
      >
        {title}
      </h3>
      <ul className="space-y-3">
        {contentList.map((item, index) => (
          <li 
            key={index}
            className="text-sm leading-relaxed"
            style={{ color: style.textColor }}
          >
            {item}
          </li>
        ))}
      </ul>
      <div className="mt-6 pt-4 border-t border-amber-200">
        <p className="text-xs text-amber-600">
          更新时间：{new Date().toLocaleDateString()}
        </p>
      </div>
    </div>
  );
}
