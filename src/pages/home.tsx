import { Counter } from '../components/Counter.tsx';
import { Layout } from '../components/Layout.tsx';

export default function HomePage() {
  return (
    <Layout>
      <div className='min-h-screen bg-linear-to-br'>
        <div className='container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 max-w-6xl space-y-12'>
          <Counter />
        </div>
      </div>
    </Layout>
  );
}
