export function chooseQuality({ width = 1366, memory = 8, cores = 8, reduced = false } = {}) {
  if (reduced || width < 500 || memory <= 2 || cores <= 2) return { level: 'low', particles: 80, pixelRatio: 1.2 };
  if (width < 1100 || memory <= 4 || cores <= 4) return { level: 'medium', particles: 160, pixelRatio: 1.5 };
  return { level: 'high', particles: 300, pixelRatio: 1.75 };
}
