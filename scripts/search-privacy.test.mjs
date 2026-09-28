import './byok-test-hook.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { NextRequest } from 'next/server';
import { pg } from './security-test-db.mjs';
import { saveAiSettings } from '../src/lib/ai-settings-store.ts';
import { parseSettingsInput } from '../src/lib/ai-settings.ts';
import { PROVIDER_CATALOG } from '../src/lib/ai-providers.ts';

process.env.BYOK_SECRET_KEY = Buffer.alloc(32,17).toString('base64');
await pg.exec(readFileSync(new URL('../drizzle/0021_bumpy_warpath.sql',import.meta.url),'utf8'));
await pg.exec("insert into companies(id,name) values ('a','A'); insert into company_privacy(company_id,allowed_providers,revision) values ('a',ARRAY['google'],0)");
await saveAiSettings('a',parseSettingsInput({primary:'groq',fallback:null,providers:['groq','google'].map(provider => ({provider,model:PROVIDER_CATALOG[provider].models[0],apiKey:'own-'+provider}))}));
const state = globalThis.searchPrivacyTest = { calls: [] };
const mocks = {
  '@/lib/auth-guard': `export const requireUser = async () => ({ok:true,user:{id:'u',companyId:'a',role:'admin'}});`,
  '@/lib/subscription': `export const resolvePlanById = async () => ({company:{id:'a'},limits:{maxEmployees:10,maxDocuments:10}}); export const isSeatActive = async () => true; export const SEAT_FROZEN_MESSAGE = '';`,
  '@/lib/embeddings': `export const getEmbedding = async (...args) => { globalThis.searchPrivacyTest.calls.push(args); return [1]; };`,
  '@/lib/retrieval': `export const retrieveChunks = async () => [];`,
};
registerHooks({resolve(spec,context,next) {
  if (context.parentURL?.endsWith('/api/search/route.ts') && mocks[spec]) return {url:'data:text/javascript,'+encodeURIComponent(mocks[spec]),shortCircuit:true};
  return next(spec,context);
}});
const { GET } = await import('../src/app/api/search/route.ts');
const request = () => new NextRequest('https://test.invalid/api/search?q=SOP');
assert.equal((await GET(request())).status,200);
assert.equal(state.calls.length,1);
assert.equal(state.calls[0][1],'own-google');
assert.deepEqual(state.calls[0][2].allowedProviders,['google']);
await pg.exec("update company_privacy set allowed_providers=ARRAY[]::text[],revision=1 where company_id='a'");
const blocked = await GET(request());
assert.equal(blocked.status,503);
assert.equal((await blocked.json()).error,'PRIVACY_BLOCKED');
assert.equal(state.calls.length,1);
await pg.close();
console.log('PASS search uses permitted embedding key even when generation provider is disabled; denied Google never dispatches');
