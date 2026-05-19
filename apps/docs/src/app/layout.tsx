import './global.css';
import { Geist, JetBrains_Mono, Noto_Sans_SC } from 'next/font/google';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: {
    default: 'Chemd Docs',
    template: '%s | Chemd Docs',
  },
};

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
});

const notoSansSc = Noto_Sans_SC({
  subsets: ['latin'],
  variable: '--font-noto-sans-sc',
});

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="zh-CN"
      className={`${geist.variable} ${jetbrainsMono.variable} ${notoSansSc.variable}`}
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col font-sans">
        {children}
      </body>
    </html>
  );
}
