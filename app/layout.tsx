import type { Metadata } from 'next';

import './globals.css';

const socialImage =
  'https://raw.githubusercontent.com/yyzhlaomao/yys/main/public/og.png';

export const metadata: Metadata = {
  title: '光影集｜图片与视频画廊',
  description: '上传你的图片和视频，自动生成整洁、响应式的媒体画廊。',
  openGraph: {
    title: '光影集｜图片与视频画廊',
    description: '每一帧，都有位置。上传图片和视频，画廊会自动排版。',
    type: 'website',
    locale: 'zh_CN',
    images: [{ url: socialImage, width: 1733, height: 909, alt: '光影集' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '光影集｜图片与视频画廊',
    description: '每一帧，都有位置。上传图片和视频，画廊会自动排版。',
    images: [socialImage],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hans">
      <body>{children}</body>
    </html>
  );
}
