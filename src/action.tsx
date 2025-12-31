'use server';

import { cookies } from '@/lib/context.ts';

// let serverCounter = 0

// export async function getServerCounter() {
//   return serverCounter
// }

// export async function updateServerCounter(change: number) {
//   serverCounter += change
// }

export async function greet(name: string): Promise<string> {
  console.log(`Server action 'greet' called with: ${name}`);
  await new Promise((resolve) => setTimeout(resolve, 500)); // Simulate async work
  const datetime = new Date().toLocaleTimeString();
  const cookieStore = await cookies();
  cookieStore.set('datetime', encodeURIComponent(datetime));
  return `Hello, ${name}! The time is ${datetime}`;
}
