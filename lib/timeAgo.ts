export function timeAgo(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diff = now - t;

  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hour = Math.floor(min / 60);
  const day = Math.floor(hour / 24);

  if (sec < 60) return "たった今";
  if (min < 60) return `${min}分前`;
  if (hour < 24) return `${hour}時間前`;
  if (day === 1) return "昨日";
  return `${day}日前`;
}