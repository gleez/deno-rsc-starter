import { type Cookie, deleteCookie, getCookies, setCookie } from '@std/http/cookie';
import { cache as reactCache } from 'react';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface BaseContext {
  request: Request;
}

export interface ClientRouteState {
  revalidatePaths: { path: string; type?: 'page' | 'layout' }[];
  redirect?: { url: string; status: number } | undefined;
}

export interface RouteStorage<T extends BaseContext = BaseContext> {
  context: T;
  date: number;
  redirect: (url: string, options?: { status?: number }) => void;
  revalidatePath: (path: string, type?: 'page' | 'layout') => void;
  responseHeaders: Headers;
  getCurrentClientRouteState: () => ClientRouteState;
}

const routeStorage = new AsyncLocalStorage<RouteStorage<BaseContext>>();

const throwErr = (err: string) => () => {
  throw Error(err);
};

const getRouteCache = reactCache<() => RouteStorage<BaseContext>>(() => ({
  date: Date.now(),
  redirect: throwErr('Not available'),
  revalidatePath: throwErr('Not available'),
  getCurrentClientRouteState: throwErr('Not available'),
  responseHeaders: new Headers(),
  context: {
    get request(): Request {
      return throwErr('Not available')();
    },
  },
}));

const getRouteContext = () => {
  const store = routeStorage.getStore() ?? getRouteCache();
  if (!store) console.warn("Doesn't run inside route context");
  return store;
};

export const createRouteStorage = (
  context: BaseContext,
  responseHeaders: Headers,
): RouteStorage<BaseContext> => {
  const currentClientRouteState: ClientRouteState = {
    redirect: undefined,
    revalidatePaths: [],
  };
  return ({
    context,
    responseHeaders,
    date: Date.now(),
    getCurrentClientRouteState: () => structuredClone(currentClientRouteState),
    redirect: (url, options) => {
      currentClientRouteState.redirect = {
        url,
        status: options?.status ?? 303,
      };
    },
    revalidatePath: (path, type) => {
      currentClientRouteState.revalidatePaths.push({ path, type });
    },
  });
};

export const runWithRouteStorage: <R, TArgs extends unknown[]>(
  store: RouteStorage<BaseContext>,
  callback: (...args: TArgs) => R,
  ...args: TArgs
) => R = (store, ...v) => {
  Object.assign(getRouteCache(), store);
  Object.assign(getRouteContext(), store);
  return routeStorage.run(store, ...v);
};

export const context = <T extends BaseContext>(): RouteStorage<T>['context'] =>
  getRouteContext().context as RouteStorage<T>['context'];

export const redirect: RouteStorage['redirect'] = (...v) => getRouteContext().redirect(...v);

export const revalidatePath: RouteStorage['revalidatePath'] = (...v) =>
  getRouteContext().revalidatePath(...v);

export const headers = (): Headers => getRouteContext().context.request.headers;

export const responseHeaders = (): Headers => getRouteContext().responseHeaders;

export const cookies = (): {
  get: (name: string) => string | undefined;
  set: (
    name: string,
    value: string,
    options?: Omit<Cookie, 'name' | 'value'>,
  ) => void;
  delete: (name: string, options?: Pick<Cookie, 'path' | 'domain'>) => void;
} => {
  const requestHeaders = getRouteContext().context.request.headers;
  const respHeaders = getRouteContext().responseHeaders;
  return {
    get: (name) => getCookies(requestHeaders)[name],
    set: (name, value, options) => setCookie(respHeaders, { name, value, path: '/', ...options }),
    delete: (name, options) => deleteCookie(respHeaders, name, { path: '/', ...options }),
  };
};
