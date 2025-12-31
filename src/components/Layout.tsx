// import { ViteClient } from 'vite-ssr-components/react'
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
        <title>
          {title ??
            'Gleez | Build Trust Fast with Secure, Compliant Productivity'}
        </title>
        {
          /*
          WORKAROUND: Manually check for development environment before rendering ViteClient.
          ViteClient is expected to handle this branching internally, but due to compatibility
          issues with RSC (React Server Components) build process, it doesn't work as expected.
          This explicit environment check ensures ViteClient only renders in development.
        */
        }
        {/* {import.meta.env.DEV && <ViteClient />} */}
      </head>
      <body className='min-h-screen flex flex-col'>
        <main className='main-content grow bg-gray-100'>
          <Suspense fallback={<div>loading...</div>}>
            {children}
          </Suspense>
        </main>
      </body>
    </html>
  );
};
