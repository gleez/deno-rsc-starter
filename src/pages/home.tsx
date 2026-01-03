import { Counter } from '../components/Counter.tsx';
import { Layout } from '../components/Layout.tsx';

import viteLogo from '/vite.svg';
import reactLogo from '/react.svg';

import { useGleezContext } from '@/lib/app-state.ts';

export default function HomePage() {
  const ctx = useGleezContext();

  return (
    <Layout>
      <div className='max-w-7xl mx-auto p-8 text-center'>
        <div className='flex justify-center mb-12'>
          <a href='https://vite.dev' target='_blank'>
            <img
              src={viteLogo}
              className='h-32 p-4 transition duration-300 filter hover:drop-shadow-[0_0_2em_#646cffaa]'
              alt='Vite logo'
            />
          </a>
          <a
            href='https://react.dev/reference/rsc/server-components'
            target='_blank'
          >
            <img
              src={reactLogo}
              className='h-32 p-4 transition duration-300 filter hover:drop-shadow-[0_0_2em_#61dafbaa] motion-reduce:animation-none animate-[spin_20s_linear_infinite]'
              alt='React logo'
            />
          </a>
        </div>
        <h1 className='text-4xl font-bold'>Deno + Vite + RSC</h1>
        <div className='p-4 mt-6'>
          <Counter />
        </div>

        <div className='p-4'>Request URL: {ctx?.url.href}</div>
        <ul className='text-left text-gray-500 space-y-2'>
          <li>
            Edit <code>src/client.tsx</code> to test client HMR.
          </li>
          <li>
            Edit <code>src/root.tsx</code> to test server HMR.
          </li>
          <li>
            Visit{' '}
            <a href='?__rsc' target='_blank'>
              <code>?__rsc</code>
            </a>{' '}
            to view RSC stream payload.
          </li>
          <li>
            Visit{' '}
            <a href='?__nojs' target='_blank'>
              <code>?__nojs</code>
            </a>{' '}
            to test server action without js enabled.
          </li>
        </ul>
      </div>
    </Layout>
  );
}
