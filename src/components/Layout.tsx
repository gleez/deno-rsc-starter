import React, { Suspense } from 'react';
import type { Props } from '../framework/rsc-renderer.tsx';
import '../style.css';

declare module '../framework/rsc-renderer.tsx' {
  interface Props {
    title?: string;
  }
}

export const Layout: React.FC<Props> = ({ children, title }) => {
  return (
    <html>
      <head>
        <meta charSet='utf-8' />
        <meta
          name='viewport'
          content='width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no'
        />
        <link rel='icon' type='image/svg+xml' href='/vite.svg' />
        <title>
          {title ?? 'Deno + Vite + RSC'}
        </title>
      </head>
      <body className='min-h-screen-1'>
        <main className='m-0 flex items-center justify-center min-w-[320px] min-h-screen'>
          <Suspense fallback={<div>loading...</div>}>
            {children}
          </Suspense>
        </main>
      </body>
    </html>
  );
};
