import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { performance } from "node:perf_hooks";

const state = globalThis.embeddingBudgetTest = { mode:"hang", calls:0 };
const fakeAi = `export const embed = async () => ({embedding:[1]});
 export async function embedMany({abortSignal, values}) {
  globalThis.embeddingBudgetTest.calls++;
  if (globalThis.embeddingBudgetTest.mode==='429') {
   const error=new Error('rate limit'); error.statusCode=429; throw error;
  }
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>resolve({embeddings:values.map(()=>[1])}),1000);
   const abort=()=>{clearTimeout(timer);reject(abortSignal.reason);};
   if(abortSignal.aborted) abort();
   else abortSignal.addEventListener('abort',abort,{once:true});
  });
 }`;
registerHooks({resolve(spec,ctx,next) {
 if(spec==='ai') return {url:`data:text/javascript,${encodeURIComponent(fakeAi)}`,shortCircuit:true};
 return next(spec,ctx);
}});
globalThis.fetch = async()=>{throw new Error('Network disabled');};
const {getEmbeddings,EmbeddingBudgetExceededError} = await import('../src/lib/embeddings.ts');
let started=performance.now();
await assert.rejects(getEmbeddings(['text'],null,{budgetMs:25}),EmbeddingBudgetExceededError);
assert.ok(performance.now()-started<900,'caller budget interrupts the HTTP call before its normal completion');
assert.equal(state.calls,1);
state.mode='429';state.calls=0;started=performance.now();
await assert.rejects(getEmbeddings(['text'],null,{budgetMs:25}),EmbeddingBudgetExceededError);
assert.ok(performance.now()-started<900,'retry delay cannot overrun caller budget');
assert.equal(state.calls,1);
console.log('PASS embedding HTTP deadline and retry backoff obey remaining worker budget');
