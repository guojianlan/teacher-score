import type { Metadata } from 'next';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: '教师批改',
  description: '老师拍照批改试卷，多模态 LLM 自动批改 + 学情资产沉淀',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
