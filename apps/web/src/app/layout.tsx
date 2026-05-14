import type { Metadata } from 'next';
import { Newsreader, JetBrains_Mono } from 'next/font/google';
import { Providers } from './providers';

// 选字考量（按 skill 的要求避开 Inter/Roboto/Arial 一类）：
// - Newsreader 是 Google 的可变 serif，自带 opsz（光学尺寸）轴，标题/正文一字体即可拉开层次
// - JetBrains Mono 用于题号、分数、ID 这类需要"知识感"的位置
const newsreader = Newsreader({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['300', '400', '500', '600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: '教研室 · 教师批改',
  description: '老师拍照批改试卷，多模态 LLM 自动批改 + 学情资产沉淀',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={`${newsreader.variable} ${mono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
