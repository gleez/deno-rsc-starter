import app from '../runtime.ts';
import type { ReactFormState } from 'react-dom/client';

export type RscPayload = {
  // this demo renders/serializes/deserizlies entire root html element
  // but this mechanism can be changed to render/fetch different parts of components
  // based on your own route conventions.
  root?: React.ReactNode;
  // server action return value of non-progressive enhancement case
  returnValue?: { ok: boolean; data: unknown };
  // server action form state (e.g. useActionState) of progressive enhancement case
  formState?: ReactFormState;
};

export { app };
export default app.fetch;

if (import.meta.hot) {
  import.meta.hot.accept();
}
