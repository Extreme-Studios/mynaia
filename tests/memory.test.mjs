import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStoreTag, MEMORY_CONTEXT } from '../app/backend/memory.mjs';

test('server memilih tag default atau override yang stabil', () => {
  assert.equal(memoryStoreTag({}), 'naya-primary-user-v1');
  assert.equal(memoryStoreTag({ NAYA_MEMORY_STORE: ' naya_user_abc ' }), 'naya_user_abc');
  assert.throws(() => memoryStoreTag({ NAYA_MEMORY_STORE: 'invalid tag' }));
});

test('konteks tidak tergantung Tavus dan melarang rahasia serta sapaan repetitif', () => {
  assert.match(MEMORY_CONTEXT, /password/);
  assert.match(MEMORY_CONTEXT, /Jangan selalu/);
  assert.doesNotMatch(MEMORY_CONTEXT, /memori Tavus/);
});
