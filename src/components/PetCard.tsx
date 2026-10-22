import { useState } from 'react';
import { useSave } from '../app/store';
import { RARITY_LABEL, habitatName, petDef } from '../content/config';
import { adoptedAt, feed, feedPet, fedByUser, petFed, petMaxFeed, petStage, type FeedResult } from '../domain/game';
import { Modal, Progress, fmtDateTime } from './ui';
import { PetArt } from './PetArt';

/** 寵物卡：成長階段、餵食、每位成員餵了多少。 */
export function PetCard({ petId, onClose }: { petId: string; onClose: () => void }) {
  const { save, update, notify } = useSave();
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const p = petDef(petId)!;
  const fed = petFed(save, p.id);
  const stage = petStage(p, fed);
  const grown = stage === 3;
  const prev = stage === 0 ? 0 : p.thresholds[stage - 1];
  const next = grown ? petMaxFeed(p) : p.thresholds[stage];
  const have = feed(save);
  const names = new Map(save.memberships.map((m) => [m.userId, m.demoNickname ?? `${save.profile.nickname}（你）`]));
  const feeders = [...fedByUser(save, p.id)].sort((a, b) => b[1] - a[1]);

  const give = (input: number | 'all') => {
    let r: FeedResult | null = null;
    update((s) => {
      r = feedPet(s, s.profile.id, p.id, input, Date.now());
      return r.ok ? r.save : s;
    });
    const res = r as FeedResult | null;
    if (!res) return;
    if (!res.ok) return setMsg({ text: res.error, error: true });
    if (res.to > res.from) {
      const text = `${p.name}長大了：${p.stages[res.from]} → ${p.stages[res.to]}！`;
      setMsg({ text });
      notify(text);
    } else setMsg({ text: `餵了 ${res.spent} 份飼料，再 ${(res.to === 3 ? petMaxFeed(p) : p.thresholds[res.to]) - (fed + res.spent)} 份就會長大。` });
  };

  return (
    <Modal title={`${p.name}・${p.stages[stage]}`} onClose={onClose}>
      <div className="species-hero">
        <PetArt id={p.id} stage={stage} size={140} />
      </div>
      <ol className="stage-strip" aria-label="成長階段">
        {p.stages.map((name, i) => (
          <li key={name} className={i <= stage ? 'reached' : ''}>
            <PetArt id={p.id} stage={i} size={36} hidden={i > stage} />
            <span className="small">{name}</span>
          </li>
        ))}
      </ol>
      {grown ? (
        <p className="center-text">已經長大了，會一直待在{habitatName(p.habitatId)}陪你。</p>
      ) : (
        <>
          <Progress value={(fed - prev) / (next - prev)} label="成長進度" />
          <p className="small center-text">
            再 {next - fed} 份飼料長成「{p.stages[stage + 1]}」
          </p>
          <div className="row center">
            <button onClick={() => give(1)} disabled={have < 1}>
              餵 1 份
            </button>
            <button onClick={() => give(5)} disabled={have < 1}>
              餵 5 份
            </button>
            <button className="primary" onClick={() => give('all')} disabled={have < 1}>
              全部餵（{Math.min(have, petMaxFeed(p) - fed)}）
            </button>
          </div>
          <p className="small muted center-text">你有 🌾 {have} 份飼料。完成專注每 5 分鐘得 1 份。</p>
        </>
      )}
      {msg && (
        <p className={msg.error ? 'error center-text' : 'center-text'} role={msg.error ? 'alert' : 'status'}>
          {msg.text}
        </p>
      )}
      <dl className="facts">
        <dt>等級</dt>
        <dd>{RARITY_LABEL[p.rarity]}</dd>
        <dt>住在</dt>
        <dd>{habitatName(p.habitatId)}</dd>
        <dt>領養於</dt>
        <dd>{fmtDateTime(adoptedAt(save, p.id)!)}</dd>
        <dt>累計飼料</dt>
        <dd>
          {fed} / {petMaxFeed(p)}
        </dd>
      </dl>
      {feeders.length > 0 && (
        <p className="small">
          一起照顧：{feeders.map(([uid, n]) => `${names.get(uid) ?? '成員'} ${n} 份`).join('、')}
        </p>
      )}
      <p className="muted small">{p.blurb}</p>
    </Modal>
  );
}
