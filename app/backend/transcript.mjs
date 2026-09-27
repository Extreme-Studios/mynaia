export function redactSensitive(value) {
  return String(value || '')
    .replace(/\b[a-f0-9]{32}\b/gi, '[REDACTED_SECRET]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_SECRET]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|sb_secret_[A-Za-z0-9_-]+|AIza[A-Za-z0-9_-]{20,})\b/g, '[REDACTED_SECRET]')
    .replace(/\b((?:api[ _-]?key|password|kata sandi|token|secret)\s*(?:adalah|is|:|=)\s*)\S+/gi, '$1[REDACTED_SECRET]')
    .replace(/\b(?:\d[ -]*?){13,19}\b/g, (match) => {
      const digits = match.replace(/\D/g, '');
      let sum = 0; let double = false;
      for (let i = digits.length - 1; i >= 0; i--) { let n = +digits[i]; if (double) { n *= 2; if (n > 9) n -= 9; } sum += n; double = !double; }
      return sum % 10 === 0 ? '[REDACTED_CARD]' : match;
    });
}

export function parseTranscript(conversation) {
  const event = conversation?.events?.find((item) =>
    (item.event_type || item.type || item.event) === 'application.transcription_ready');
  if (!event || !Array.isArray(event.properties?.transcript)) return null;
  return event.properties.transcript.flatMap((entry, position) => {
    if (!['user', 'assistant', 'system', 'tool'].includes(entry.role) || typeof entry.content !== 'string') return [];
    const timestamp = Number(entry.timestamp);
    return [{ position, role: entry.role, content: redactSensitive(entry.content),
      spoken_at: Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp * 1000).toISOString() : null,
      seconds_from_start: Number.isFinite(Number(entry.seconds_from_start)) ? Number(entry.seconds_from_start) : null,
      duration: Number.isFinite(Number(entry.duration)) ? Number(entry.duration) : null }];
  });
}
