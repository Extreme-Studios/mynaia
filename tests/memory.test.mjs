import test from 'node:test';
import assert from 'node:assert/strict';
import { MEMORY_CONTEXT } from '../app/backend/memory.mjs';

test('konteks tidak tergantung Tavus dan melarang rahasia serta sapaan repetitif', () => {
  assert.match(MEMORY_CONTEXT, /password/);
  assert.match(MEMORY_CONTEXT, /Jangan selalu/);
  assert.doesNotMatch(MEMORY_CONTEXT, /memori Tavus/);
});
