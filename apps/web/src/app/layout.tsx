import type { Metadata } from 'next';
import { Open_Sans, Source_Serif_4, Poppins, Figtree } from 'next/font/google';
import { Providers } from './providers';
import '../styles/tokens.css';

// Slidepilot V1 字体栈（来自 docs/claude/token.json）
const openSans = Open_Sans({
  subsets: ['latin'],
  variable: '--font-body-loaded',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});
const serif = Source_Serif_4({
  subsets: ['latin'],
  variable: '--font-serif-loaded',
  weight: ['400', '600'],
  display: 'swap',
});
const poppins = Poppins({
  subsets: ['latin'],
  variable: '--font-display-loaded',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});
const figtree = Figtree({
  subsets: ['latin'],
  variable: '--font-mono-loaded',
  weight: ['400', '500', '600'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: '教师批改 SaaS',
  description: '老师拍照批改试卷，多模态 LLM 自动批改 + 学情资产沉淀',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="zh-CN"
      className={`${openSans.variable} ${serif.variable} ${poppins.variable} ${figtree.variable}`}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
