import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { PwaRegister } from '@/components/pwa-register';
import { ToastProvider } from '@/components/ui/toast';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Forma — treino e nutrição', template: '%s · Forma' },
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Forma', statusBarStyle: 'black-translucent' },
  icons: { icon: '/icon-192.png', apple: '/apple-touch-icon.png' },
  description: 'Planos de treino, registo de séries, nutrição e acompanhamento com o teu coach.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f6f3' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0b0d' },
  ],
};

// Aplica o tema guardado antes da primeira pintura (evita "flash" de tema errado).
const themeScript = `try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-PT" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ToastProvider>{children}</ToastProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
