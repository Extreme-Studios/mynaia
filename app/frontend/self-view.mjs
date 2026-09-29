// Daily owns the camera track. This module only renders its existing local track outside Prebuilt.
export function createSelfView({ createFrame, container, video, panel, layout, onJoined = () => {}, onError = () => {}, startVideoOff = false }) {
  let call;
  let mode = 'compact';
  let disposed = false;
  let currentTrack;
  let fallbackStream;
  let fallbackPending = false;
  let fallbackFailed = false;

  function updatePanel() {
    const visible = mode === 'compact' && Boolean(currentTrack) && currentTrack.readyState !== 'ended' &&
      video.readyState >= 2 && video.videoWidth > 0;
    panel.hidden = !visible;
    layout.classList.toggle('has-self-view', visible);
  }

  function syncLocal() {
    if (disposed || !call) return;
    const local = call.participants()?.local;
    const state = local?.tracks?.video;
    const cameraActive = ['playable', 'sendable'].includes(state?.state) || (!state && local?.video === true);
    const providerTrack = cameraActive ? (state?.persistentTrack || state?.track || local.videoTrack) : null;
    if (providerTrack && fallbackStream) {
      fallbackStream.getTracks().forEach((track) => track.stop());
      fallbackStream = null;
    }
    if (!cameraActive && fallbackStream) {
      fallbackStream.getTracks().forEach((track) => track.stop());
      fallbackStream = null;
    }
    const track = providerTrack || (cameraActive ? fallbackStream?.getVideoTracks()[0] : null);
    if (track !== currentTrack) {
      currentTrack = track;
      video.srcObject = track ? new MediaStream([track]) : null;
      if (track) video.play().catch(() => { panel.hidden = true; layout.classList.remove('has-self-view'); });
    }
    updatePanel();
    if (!track && cameraActive && mode === 'compact') startFallbackPreview();
  }

  async function startFallbackPreview() {
    if (fallbackPending || fallbackStream || fallbackFailed || !navigator.mediaDevices?.getUserMedia) return;
    fallbackPending = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (disposed || mode !== 'compact') stream.getTracks().forEach((track) => track.stop());
      else { fallbackStream = stream; syncLocal(); }
    } catch { fallbackFailed = true; /* Camera unavailable or denied: no empty preview card. */ }
    finally { fallbackPending = false; }
  }

  function setMode(value) {
    mode = value === 'hidden' ? 'hidden' : 'compact';
    if (mode === 'hidden' && fallbackStream) {
      fallbackStream.getTracks().forEach((track) => track.stop());
      fallbackStream = null;
      syncLocal();
    }
    updatePanel();
    if (mode === 'compact' && call) syncLocal();
  }

  async function mount(url) {
    if (call) throw new Error('ROOM_ALREADY_MOUNTED');
    disposed = false;
    call = createFrame(container, {
      showLocalVideo: false,
      iframeStyle: { position: 'absolute', inset: '0', width: '100%', height: '100%', border: '0' },
    });
    for (const event of ['participant-updated', 'track-started', 'track-stopped', 'started-camera', 'camera-error']) {
      call.on(event, syncLocal);
    }
    call.on('joined-meeting', () => { if (!disposed) { syncLocal(); onJoined(); } });
    call.on('error', () => { if (!disposed) onError(); });
    try { await call.join({ url, ...(startVideoOff ? { startVideoOff: true } : {}) }); }
    catch (error) { if (!disposed) onError(); throw error; }
    syncLocal();
  }

  async function destroy() {
    disposed = true;
    const old = call;
    call = null;
    currentTrack = null;
    fallbackStream?.getTracks().forEach((track) => track.stop());
    fallbackStream = null;
    video.srcObject = null;
    panel.hidden = true;
    layout.classList.remove('has-self-view');
    if (old) {
      try { await old.leave(); } catch { /* Room may already be closed by Tavus. */ }
      try { await old.destroy(); } catch { /* Releasing the UI is best effort. */ }
    }
  }

  video.addEventListener('playing', updatePanel);
  video.addEventListener('emptied', updatePanel);
  return { mount, destroy, setMode };
}
