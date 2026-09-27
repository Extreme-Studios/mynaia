import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeTavusClient, MAX_CALL_SECONDS, TavusError } from './tavus.mjs';
import { geminiConfig } from './gemini.mjs';
import { makeSupabaseStore, StorageError } from './supabase.mjs';
import { makeMemoryService } from './memory-service.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, '..', '..');
const frontend = join(root, 'app', 'frontend');
const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/controller.mjs', ['controller.mjs', 'text/javascript; charset=utf-8']],
]);

function json(response, status, data) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(JSON.stringify(data));
}

export function createNayaServer({ client = makeTavusClient(), gemini = geminiConfig(),
  memory = makeMemoryService({ store: makeSupabaseStore(), tavus: client, palId: process.env.TAVUS_PAL_ID, faceId: 'rc9cff32ceba' }) } = {}) {
  let activeConversation;
  let creating = false;
  let endTimer;

  async function finishConversation(id) {
    if (!activeConversation || activeConversation.conversationId !== id) {
      throw new TavusError('NOT_ACTIVE', 'Conversation tidak aktif di server ini.', 404);
    }
    await client.endConversation(id);
    activeConversation = undefined;
    clearTimeout(endTimer);
    try { await memory.recordEnded(id); }
    catch (error) { console.error('Memory sync failed:', error?.code || 'ERROR'); }
  }

  return createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    try {
      if (request.method === 'GET' && path === '/api/health') {
        json(response, 200, { status: 'ok', milestone: 4 });
        return;
      }
      if (request.method === 'GET' && path === '/api/memory/status') {
        json(response, 200, await memory.status());
        return;
      }

      if (request.method === 'POST' && path === '/api/memory/sync') {
        json(response, 200, await memory.processPending());
        return;
      }

      if (request.method === 'GET' && path === '/api/gemini/status') {
        json(response, 200, { configured: gemini.configured, model: gemini.model });
        return;
      }

      if (request.method === 'GET' && path === '/api/tavus/status') {
        json(response, 200, {
          configured: client.configured,
          palConfigured: Boolean(await client.configuredPalId()),
          conversationActive: Boolean(activeConversation),
        });
        return;
      }

      if (request.method === 'POST' && path === '/api/conversations') {
        if (!client.configured) throw new TavusError('KEY_REQUIRED', 'TAVUS_API_KEY belum diatur.', 503);
        if (creating || activeConversation) {
          throw new TavusError('CONVERSATION_ACTIVE', 'Conversation sedang dibuat atau masih aktif.', 409);
        }
        creating = true;
        try {
          const context = await memory.prepareContext();
          const session = await client.createConversation({ conversationalContext: context });
          try { await memory.recordStarted(session.conversationId); }
          catch (error) {
            try { await client.endConversation(session.conversationId); } catch { /* Prevent an orphaned call. */ }
            throw error;
          }
          activeConversation = session;
          endTimer = setTimeout(async () => {
            try { await finishConversation(session.conversationId); }
            catch { console.warn('Conversation timeout cleanup gagal; periksa dashboard Tavus.'); }
          }, (MAX_CALL_SECONDS + 5) * 1000);
          endTimer.unref();
          json(response, 201, session);
        } finally {
          creating = false;
        }
        return;
      }

      const endMatch = path.match(/^\/api\/conversations\/([A-Za-z0-9_-]{4,80})\/end$/);
      if (request.method === 'POST' && endMatch) {
        await finishConversation(endMatch[1]);
        json(response, 200, { status: 'ended' });
        return;
      }

      const file = request.method === 'GET' ? files.get(path) : undefined;
      if (!file) {
        json(response, 404, { error: 'Tidak ditemukan.' });
        return;
      }
      const body = await readFile(join(frontend, file[0]));
      response.writeHead(200, {
        'content-type': file[1],
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      });
      response.end(body);
    } catch (error) {
      if (error instanceof TavusError) {
        json(response, error.status, { error: error.message, code: error.code });
      } else if (error instanceof StorageError) {
        json(response, 503, { error: 'Penyimpanan memori belum tersedia.', code: error.code });
      } else {
        console.error('Server error:', error?.name || 'UnknownError');
        json(response, 500, { error: 'Terjadi kesalahan pada server.' });
      }
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const envFile = join(root, '.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const port = Number(process.env.PORT || 3000);
  const gemini = geminiConfig();
  createNayaServer({ client: makeTavusClient({
    gemini: { apiKey: process.env.GEMINI_API_KEY, model: gemini.model },
  }), gemini }).listen(port, '127.0.0.1', () => {
    console.log(`Naya Milestone 4: http://127.0.0.1:${port}`);
  });
}
