export function createConversationController({ api, render }) {
  let phase = 'ready';
  let session = null;
  let message = '';
  let ending = false;

  function snapshot() {
    return { phase, session, message, canStart: !session && phase !== 'connecting', canEnd: Boolean(session) && !ending };
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
      // Daily room dibuka oleh view. Ini belum membuktikan audio tersambung.
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

  async function end(reason = 'manual') {
    if (!session || ending) return false;
    const current = session;
    ending = true;
    update();
    try {
      await api.end(current.conversationId);
      session = null;
      phase = 'ended';
      message = reason === 'duration' ? 'Sesi selesai karena batas durasi.' :
        reason === 'room-error' ? 'Ruang video gagal dibuka. Sesi sudah ditutup.' : 'Sesi telah selesai.';
      update();
      return true;
    } catch (error) {
      phase = 'error';
      message = error?.message || 'Gagal mengakhiri percakapan.';
      update();
      return false;
    } finally {
      ending = false;
      update();
    }
  }

  update();
  return { start, end, roomLoaded, snapshot };
}
