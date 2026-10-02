import { randomInt } from 'node:crypto';

// Server-side WIB clock: reliable even when Vercel runs in UTC.
export function naiaSessionOpening({ now = new Date(), variant = randomInt(3) } = {}) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta', hour: '2-digit', hourCycle: 'h23',
  }).format(now));
  const period = hour >= 5 && hour < 11 ? 'pagi' : hour >= 11 && hour < 15 ? 'siang' : hour >= 15 && hour < 18 ? 'sore' : 'malam';
  const openings = [
    `Selamat ${period}. Gimana kabarmu? Mau cerita apa hari ini?`,
    `Selamat ${period}. Aku dengerin, mau cerita atau bahas ide bareng?`,
    `Selamat ${period}. Lagi pengin ngobrol santai atau mikirin proyekmu?`,
  ];
  return {
    greeting: openings[((variant % openings.length) + openings.length) % openings.length],
    context: `Waktu lokal pengguna saat sesi dimulai: ${period}, zona Asia/Jakarta (WIB). Pembuka sudah disampaikan; lanjutkan isi ucapan pengguna tanpa perkenalan atau sapaan berulang.`,
  };
}
