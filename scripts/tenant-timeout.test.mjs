// Run with the TS resolver only: exercise the real tenant helper, no live DB.
import './ts-resolve-hook.mjs';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const state = globalThis.tenantTimeoutTest = { phase: '', closed: 0, callbacks: 0 };
const pending = () => new Promise(() => {});
state.pending = pending;
const mocks = {
  '@neondatabase/serverless': `
    export const neonConfig = {};
    export class Client {
      on() {}
      connect() { return globalThis.tenantTimeoutTest.phase === 'connect' ? globalThis.tenantTimeoutTest.pending() : Promise.resolve(); }
      end() { globalThis.tenantTimeoutTest.closed++; return globalThis.tenantTimeoutTest.phase === 'close' ? globalThis.tenantTimeoutTest.pending() : Promise.resolve(); }
    }
    export class Pool extends Client {}`,
  'drizzle-orm/neon-serverless': `
    export const drizzle = () => ({ transaction: async fn => fn({
      execute: async () => { if (globalThis.tenantTimeoutTest.phase === 'query') await globalThis.tenantTimeoutTest.pending(); }
    }) });`,
};
registerHooks({ resolve(spec, context, next) {
  if (mocks[spec]) return { url: 'data:text/javascript,' + encodeURIComponent(mocks[spec]), shortCircuit: true };
  return next(spec, context);
} });
const { withTenant } = await import('../src/lib/db/tenant.ts');
for (const phase of ['connect', 'query', 'callback', 'close']) {
  state.phase = phase;
  state.closed = 0;
  const start = Date.now();
  await assert.rejects(withTenant('tenant', async (_tx, signal) => {
    if (phase === 'callback') {
      await new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    }
    return 1;
  }, { timeoutMs: 30 }), { name: 'TimeoutError' });
  assert.ok(Date.now() - start < 1000, phase + ' has bounded completion');
  assert.equal(state.closed, 1, phase + ' closes the underlying client');
}
state.phase = 'connect';
const controller = new AbortController();
const call = withTenant('tenant', async () => { state.callbacks++; }, { signal: controller.signal, timeoutMs: 1000 });
controller.abort();
await assert.rejects(call, { name: 'AbortError' });
assert.equal(state.callbacks, 0);
state.phase = '';
assert.equal(await withTenant('tenant', async () => 42, { timeoutMs: 100 }), 42);
console.log('PASS real tenant helper: cancellation and deadlines close stalled connections, queries, callbacks and shutdown');
