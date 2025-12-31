// Framework conventions (arbitrary choices for this demo):
// - Use `_rsc/actions` URL suffix to differentiate RSC requests from SSR requests
// - Use `x-rsc-action-id` header to pass server action ID
const URL_POSTFIX = '_rsc/actions';
const HEADER_ACTION_ID = 'x-rsc-action-id';

export function createRscRenderRequest(
  urlString: string,
  action?: { id: string; body: BodyInit },
): Request {
  const url = new URL(urlString);

  const headers = new Headers();
  headers.set('accept', 'text/x-component');

  if (action) {
    url.pathname += URL_POSTFIX;
    headers.set(HEADER_ACTION_ID, action.id);
    headers.set('Referer', location.href);
  }

  return new Request(url.toString(), {
    method: action ? 'POST' : 'GET',
    headers,
    body: action?.body,
  });
}
