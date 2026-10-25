// 推薦意願問卷（NPS，參考 Forest）：什麼時候該問。只看存檔和上次問的時間，不碰儲存。
import { endedSessions } from './game';
import type { SaveFile } from './types';

const DAY = 86_400_000;

export interface FeedbackMeta {
  askedAt: number | null; // 上次跳出問卷
  answeredAt: number | null; // 上次送出
}

/** 完成 5 次探索、用了 3 天以上才問；送出過隔 120 天、略過隔 30 天再問。 */
export function npsDue(save: SaveFile, meta: FeedbackMeta, now: number) {
  const done = endedSessions(save).filter((s) => s.status === 'completed');
  if (done.length < 5) return false;
  const first = Math.min(...done.map((s) => Date.parse(s.endedAt!)));
  if (now - first < 3 * DAY) return false;
  if (meta.askedAt === null) return true;
  const answered = meta.answeredAt !== null && meta.answeredAt >= meta.askedAt;
  return now - meta.askedAt >= (answered ? 120 : 30) * DAY;
}
