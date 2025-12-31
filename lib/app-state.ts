import { context } from './context.ts';
import { type Context, createRouter } from './router.ts';

/**
 * Global application state that flows through the middleware chain.
 * Contains request-specific data, user/session information, and service connections.
 */
export interface AppState {
  /**
   * Unique identifier for the current request
   * @example "req_1234567890abcdef"
   */
  requestId?: string;

  /**
   * Client IP address
   * @example "192.168.1.1"
   */
  clientIP?: string;

  /**
   * Authenticated user information
   * @example { id: "user_123", role: "admin" }
   */
  user?: {
    /**
     * Unique user identifier
     * @example "user_123"
     */
    id: string;
    /**
     * User role for authorization
     * @example "admin", "user", "guest"
     */
    role: string;
  };

  /**
   * Current session data
   * @example { token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }
   */
  session?: {
    /**
     * Authentication token (JWT, session token, etc.)
     */
    token: string;
  };
}

export const createApp = () => createRouter<AppState>();

/**
 * Application context type combining the router's base Context with AppState.
 * Provides typed access to both request information and application state.
 *
 * @example
 * ```ts
 * router.get('/user', (ctx: GleezContext) => {
 *   const userId = ctx.state.user?.id;
 *   // ... handler logic
 * });
 * ```
 */
export type GleezContext = Context<AppState>;

/**
 * Retrieves the current Gleez request context in React Server Components.
 *
 * This function wraps `@bureaudouble/rsc-engine`'s `context()` to provide
 * a strongly-typed, application-specific context object.
 *
 * ⚠️ **Important**: Can only be called inside React Server Components (RSC),
 * not in Client Components or utility modules outside the RSC tree.
 *
 * @returns {GleezContext} The typed request context containing:
 * - `request`: Incoming HTTP request
 * - `params`: Route parameters
 * - `state`: Shared application state (e.g., NATS connection, session)
 *
 * @example
 * ```tsx
 * import { useGleezContext } from '@/lib/context';
 *
 * export default async function BlogPage() {
 *   const ctx = useGleezContext();
 *   const slug = ctx.params?.pathname.groups.slug;
 *   // ...
 * }
 * ```
 */
export function useGleezContext(): GleezContext {
  return context<GleezContext>();
}
