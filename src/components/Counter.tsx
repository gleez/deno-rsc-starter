'use client';

import { useState, useTransition } from 'react';
import { greet } from '../action.tsx';

export function Counter() {
  const [count, setCount] = useState(0);
  const [message, setMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleAction = () => {
    startTransition(async () => {
      const result = await greet('World');
      // console.debug(`[Action] callServer: id=${id}`, args);
      console.log(`[Action] callServer:`, result);
      setMessage(result);
    });
  };

  return (
    <div className='px-4 py-2'>
      <h4 className='py-2'>This is a client component.</h4>
      {
        /* <p className='px-4 py-2'>
        You have clicked the button <strong>{count}</strong> times.
      </p> */
      }
      <button
        type='button'
        className='px-4 py-2 mb-4 bg-orange-400 text-white rounded cursor-pointer'
        onClick={() => setCount((c) => c + 1)}
      >
        Client Counter: {count}
      </button>
      <hr />
      <button
        type='button'
        className='px-4 py-2 mt-4 bg-green-500 text-white rounded cursor-pointer'
        onClick={handleAction}
        aria-busy={isPending}
      >
        Call Server Action
      </button>
      {message && (
        <p className='p-2'>
          <strong>Server response:</strong> {message}
        </p>
      )}
    </div>
  );
}
