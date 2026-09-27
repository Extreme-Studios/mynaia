export function createConversationController({ api, render }) {
  let phase = 'ready';
  let session = null;
  let message = '';

  function snapshot() {
    return { phase, session, message, canStart: !session && phase !== 'connecting', canEnd: Boolean(session) };
  }

  function update() { render(snapshot()); }

  async function start() {
    if (phase === 'connecting' || session) return false;
    phase = 'connecting';
    message = '';
    update();
    try {
      session = await api.start();
      if (!session?.conversationId || !session?.conversationUrl) throw new Error('Data conversation tidak lengkap.');
      // Iframe baru akan dibuka oleh view. Ini belum membuktikan audio tersambung.
      update();
      return true;
    } catch (error) {
      phase = 'error';
      session = null;
      message = error?.message || 'Gagal memulai percakapan.';
      update();
      return false;
    }
  }

  function roomLoaded() {
    if (phase === 'connecting' && session) {
      phase = 'connected';
      update();
    }
  }

  async function end() {
    if (!session) return false;
    const current = session;
    try {
      await api.end(current.conversationId);
      session = null;
      phase = 'ended';
      message = '';
      update();
      return true;
    } catch (error) {
      phase = 'error';
      message = error?.message || 'Gagal mengakhiri percakapan.';
      update();
      return false;
    }
  }

  update();
  return { start, end, roomLoaded, snapshot };
}
