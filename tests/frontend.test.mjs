import test from 'node:test';
import assert from 'node:assert/strict';
import { createConversationController } from '../app/frontend/controller.mjs';

test('Start terkunci selama request dan End mengembalikan state selesai', async () => {
  let resolveStart;
  let calls = 0;
  const gate = new Promise((resolve) => { resolveStart = resolve; });
  const snapshots = [];
  const controller = createConversationController({
    api: { start: async () => { calls += 1; await gate; return { conversationId: 'c12345', conversationUrl: 'https://tavus.daily.co/c12345' }; }, end: async () => ({ status: 'ended' }) },
    render: (state) => snapshots.push(state),
  });
  const first = controller.start();
  assert.equal(snapshots.at(-1).phase, 'connecting');
  assert.equal(snapshots.at(-1).canStart, false);
  assert.equal(await controller.start(), false);
  resolveStart();
  assert.equal(await first, true);
  assert.equal(calls, 1);
  controller.roomLoaded();
  assert.equal(controller.snapshot().phase, 'connected');
  assert.equal(await controller.end(), true);
  assert.equal(controller.snapshot().phase, 'ended');
  assert.equal(controller.snapshot().canStart, true);
});

test('error Start ditampilkan dan tombol dapat dicoba lagi secara manual', async () => {
  const controller = createConversationController({
    api: { start: async () => { throw Error('Tavus menolak permintaan.'); }, end: async () => {} },
    render: () => {},
  });
  assert.equal(await controller.start(), false);
  assert.equal(controller.snapshot().phase, 'error');
  assert.match(controller.snapshot().message, /Tavus menolak/);
  assert.equal(controller.snapshot().canStart, true);
});
