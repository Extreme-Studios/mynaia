export const MODES = Object.freeze(['naya', 'dr_paws']);
export const DURATION_SECONDS = Object.freeze({ 3: 180, 5: 300, 10: 600, 20: 1200 });

export function parseMode(value) {
  if (MODES.includes(value)) return value;
  throw new TypeError('MODE_INVALID');
}

export function parseDuration(value = 5) {
  if (!Object.hasOwn(DURATION_SECONDS, String(value))) throw new TypeError('DURATION_INVALID');
  return DURATION_SECONDS[String(value)];
}
