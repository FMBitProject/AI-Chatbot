// Run with node scripts/frontend-review.test.mjs. No network or database access.
// Execute the real handlers from the TSX AST with controlled browser/SDK inputs.
// This tests async/state transitions; it does not replace browser hydration tests.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function source(path) {
  return ts.createSourceFile(path, readFileSync(new URL(`../${path}`, import.meta.url), "utf8"),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
function find(tree, predicate) {
  if (predicate(tree)) return tree;
  let found;
  ts.forEachChild(tree, (child) => { found ??= find(child, predicate); });
  return found;
}
function handlers(path, names, globals) {
  const tree = source(path);
  const code = names.map((name) => {
    const node = find(tree, (n) => ts.isFunctionDeclaration(n) && n.name?.text === name);
    assert.ok(node, `${path}: ${name} exists`);
    return node.getText(tree);
  }).join("\n");
  const context = vm.createContext(globals);
  vm.runInContext(ts.transpile(code), context);
  return context;
}
const event = { preventDefault() {} };
const offline = async () => { throw new TypeError("simulated offline"); };

// Search: stale responses must not overwrite newer results or clear their loading state.
{
  const state = {};
  const pending = [];
  const ctx = handlers("src/app/search/page.tsx", ["doSearch", "handleChange"], {
    AbortController, requestRef: { current: null }, debounceRef: { current: null },
    clearTimeout() {}, setTimeout() { return 1; },
    fetch: () => new Promise((resolve, reject) => pending.push({ resolve, reject })),
    ...Object.fromEntries(["Query", "Results", "Notice", "Loading", "Searched"].map((key) =>
      [`set${key}`, (value) => { state[key] = value; }])),
  });
  const reply = (i, data, ok = true) => pending[i].resolve({ ok, json: async () => data });
  const a = ctx.doSearch("old");
  const b = ctx.doSearch("new");
  reply(0, ["old"]); await a;
  assert.equal(state.Loading, true);
  reply(1, ["new"]); await b;
  assert.equal(state.Results[0], "new");
  const c = ctx.doSearch("slow");
  ctx.handleChange({ target: { value: "" } });
  reply(2, ["stale"]); await c;
  assert.equal(state.Results.length, 0);
  assert.equal(state.Searched, false);
  assert.equal(state.Loading, false);
  const d = ctx.doSearch("failed");
  reply(3, { error: "Internal Server Error" }, false); await d;
  assert.ok(state.Notice);
  const e = ctx.doSearch("offline");
  assert.equal(state.Notice, null);
  pending[4].reject(new TypeError("offline")); await e;
  assert.ok(state.Notice);
  assert.equal(state.Loading, false);
  const f = ctx.doSearch("empty");
  reply(5, []); await f;
  assert.equal(state.Notice, null);
  assert.equal(state.Results.length, 0);
}

// Auth failures settle their loading states and report failure without navigation.
{
  const state = {};
  const toasts = [];
  const ctx = handlers("src/app/two-factor/page.tsx", ["sendOtp", "handleVerify"], {
    authClient: { twoFactor: { sendOtp: offline, verifyOtp: offline } }, code: "123456",
    setSending: (v) => { state.sending = v; }, setVerifying: (v) => { state.verifying = v; },
    setError: (v) => { state.error = v; }, setResendCooldown() { assert.fail("failed send has no cooldown"); },
    router: { push() { assert.fail("must not navigate on network failure"); } },
  });
  await ctx.sendOtp(); assert.equal(state.sending, false); assert.ok(state.error);
  await ctx.handleVerify(event); assert.equal(state.verifying, false); assert.ok(state.error);

  for (const [path, name, sdkMethod] of [
    ["src/app/login/page.tsx", "resendVerification", "sendVerificationEmail"],
    ["src/app/reset-password/page.tsx", "handleSubmit", "resetPassword"],
  ]) {
    const handler = handlers(path, [name], {
      authClient: { [sdkMethod]: offline }, form: { email: "a@example.com", password: "Password!123" },
      token: "test", passwordOk: true, mismatch: false, lang: "en", T: { loginFailed: "Failed", error: "Retry" },
      setResending: (v) => { state.loading = v; }, setLoading: (v) => { state.loading = v; },
      toast: (value) => toasts.push(value), router: { push() { assert.fail("must not navigate"); } },
    });
    await handler[name](event);
    assert.equal(state.loading, false);
    assert.equal(toasts.at(-1).variant, "destructive");
  }

  const reset = handlers("src/app/forgot-password/page.tsx", ["handleSubmit"], {
    email: "a@example.com", authClient: { requestPasswordReset: offline },
    setLoading: (v) => { state.loading = v; }, setFailed: (v) => { state.failed = v; },
    setSent: (v) => { state.sent = v; },
  });
  for (const response of [offline, async () => ({ error: { status: 500 } })]) {
    state.sent = false;
    reset.authClient.requestPasswordReset = response;
    await reset.handleSubmit(event);
    assert.equal(state.sent, false); assert.equal(state.failed, true); assert.equal(state.loading, false);
  }
  reset.authClient.requestPasswordReset = async () => ({ error: null });
  await reset.handleSubmit(event);
  assert.equal(state.sent, true); assert.equal(state.failed, false);
}

// Consent: denied reads still show the banner; denied writes dismiss safely.
{
  let visible = false;
  let notified = false;
  const globals = {
    localStorage: { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("SecurityError"); } },
    setVisible: (v) => { visible = v; }, Event,
    window: { dispatchEvent() { notified = true; } },
  };
  const tree = source("src/components/CookieConsent.tsx");
  const effect = find(tree, (n) => ts.isCallExpression(n) && n.expression.getText(tree) === "useEffect");
  assert.ok(effect);
  const ctx = handlers("src/components/CookieConsent.tsx", ["saveConsent"], globals);
  vm.runInContext(ts.transpile(`(${effect.arguments[0].getText(tree)})();`), ctx);
  assert.equal(visible, true);
  ctx.saveConsent("accepted");
  assert.equal(visible, false); assert.equal(notified, false);
  ctx.localStorage.setItem = () => {};
  ctx.saveConsent("accepted"); assert.equal(notified, true);
}

// Motion preference subscription receives changes and releases its listener.
{
  let listener;
  let updates = 0;
  const ctx = handlers("src/components/ui/hero-3.tsx", ["subscribeReducedMotion"], {
    reducedMotionQuery: "(prefers-reduced-motion: reduce)",
    window: { matchMedia: () => ({
      addEventListener: (_, fn) => { listener = fn; },
      removeEventListener: (_, fn) => { assert.equal(fn, listener); listener = null; },
    }) },
  });
  const cleanup = ctx.subscribeReducedMotion(() => { updates++; });
  listener(); assert.equal(updates, 1);
  cleanup(); assert.equal(listener, null);
}
console.log("Frontend review regressions passed (search, auth, consent, motion).");
