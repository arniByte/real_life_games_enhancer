import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, Btn, PixelIcon, SoulGlyph, Souls, motion } from '../components/kit';
import { PerkCard, perkColor } from '../components/Perk';
import { useNav } from '../nav';
import { act, useApp } from '../../core/store';
import type { ActivePerk, ShrineResult, WheelOutcome } from '../../core/types';
import {
  CHAOS_LABEL,
  COST,
  JACKPOT_SOULS,
  OUTCOME_LABEL,
  PITY_AFTER,
  castHex,
  choosePact,
  cleanse,
  hexBlockReason,
  hexCost,
  isLast,
  openPact,
  pactCurseChance,
  placeFactor,
  spinWheel,
  wheelCost,
  wheelOdds,
} from '../../core/shrine';
import { RARITY_ORDER, perkDef } from '../../core/perks/registry';
import { player, souls } from '../../core/session';
import { fx } from '../../three';
import type { WheelSector } from '../../three/textures';
import { sfx } from '../../audio/sfx';

type Phase = 'menu' | 'spinning' | 'reveal' | 'pact' | 'hex' | 'cleanse';

const WHEEL_ORDER: WheelOutcome[] = [
  'bless_common', 'curse_common', 'bless_rare', 'void', 'bless_epic', 'curse_rare', 'jackpot', 'bless_legendary', 'curse_epic',
];
const WHEEL_STYLE: Record<WheelOutcome, { color: string; label: string; ui: string }> = {
  bless_common: { color: '#5c5446', label: 'ИСКРА', ui: '#d8cfb8' },
  bless_rare: { color: '#1d5a8a', label: 'ЗНАМЕН', ui: '#4fb3ff' },
  bless_epic: { color: '#5a2d8c', label: 'ЧУДО', ui: '#b06aff' },
  bless_legendary: { color: '#a07410', label: 'БОГ', ui: '#ffc23a' },
  curse_common: { color: '#465f1e', label: 'ПОРЧА', ui: '#a5c95a' },
  curse_rare: { color: '#84261a', label: 'ПРОКЛ', ui: '#ec5a43' },
  curse_epic: { color: '#6e0820', label: 'РОК', ui: '#ff2a55' },
  void: { color: '#141118', label: 'ПУСТО', ui: '#6d6252' },
  jackpot: { color: '#1c6f7d', label: '+3 ДУШИ', ui: '#8ff0ff' },
};

export function Shrine({ playerId }: { playerId: string }) {
  const session = useApp((s) => s.session)!;
  const closeShrine = useNav((s) => s.closeShrine);
  const [phase, setPhase] = useState<Phase>(session.pact?.playerId === playerId ? 'pact' : 'menu');
  const [result, setResult] = useState<ShrineResult | null>(null);
  const [showOdds, setShowOdds] = useState(false);
  const me = player(session, playerId);
  const others = session.players.filter((p) => p.id !== playerId);
  const myCurses = me.perks.filter((k) => k.kind === 'curse');
  const odds = useMemo(() => wheelOdds(session, playerId), [session, playerId]);
  const wCost = wheelCost(session, playerId);
  const revealed = useRef(true);

  const sectorsFor = (o: Record<WheelOutcome, number>): (WheelSector & { o: WheelOutcome })[] =>
    WHEEL_ORDER.filter((k) => o[k] > 0.0001).map((k) => ({ o: k, weight: o[k], color: WHEEL_STYLE[k].color, label: WHEEL_STYLE[k].label }));

  // Paint this player's real odds on the wheel as soon as they walk in.
  useEffect(() => {
    // Deferred: the App switches the world to the shrine in a parent effect that runs after this one.
    const t = setTimeout(() => fx({ type: 'wheel.setup', sectors: sectorsFor(wheelOdds(useApp.getState().session!, playerId)) }), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  const reveal = (r: ShrineResult) => {
    revealed.current = true;
    setResult(r);
    setPhase('reveal');
    const first = r.gained[0];
    if (r.outcome === 'jackpot') {
      sfx.coin(JACKPOT_SOULS);
      sfx.blessing(2);
      fx({ type: 'shrine.reveal', tone: 'jackpot', color: '#8ff0ff' });
      fx({ type: 'flash', color: '#8ff0ff', strength: 0.5 });
      return;
    }
    if (!first) {
      if (r.type === 'wheel') sfx.voidHum();
      fx({ type: 'shrine.reveal', tone: 'void', color: '#6d6252' });
      return;
    }
    const def = perkDef(first.perk.defId);
    const rank = RARITY_ORDER.indexOf(def.rarity);
    const color = perkColor(def);
    if (def.kind === 'blessing') sfx.blessing(rank);
    else sfx.curse(rank);
    fx({ type: 'shrine.reveal', tone: def.kind, color });
    fx({ type: 'flash', color, strength: 0.25 + rank * 0.15 });
    if (rank >= 2) fx({ type: 'shake', amount: 0.08 * rank });
  };

  const spin = () => {
    if (me.souls < wCost) return sfx.error();
    const sectors = sectorsFor(odds);
    const r = act((d) => spinWheel(d, playerId));
    if (!r) return sfx.error();
    sfx.spend();
    fx({ type: 'wheel.setup', sectors });
    const total = sectors.reduce((s, x) => s + x.weight, 0);
    let acc = 0;
    let to = 0;
    for (const s of sectors) {
      if (s.o === r.outcome) {
        to = (acc + s.weight * (0.2 + Math.random() * 0.6)) / total;
        break;
      }
      acc += s.weight;
    }
    setPhase('spinning');
    revealed.current = false;
    const done = () => {
      if (!revealed.current) reveal(r);
    };
    fx({ type: 'wheel.spin', to, duration: 4.4, onTick: () => sfx.tick(), onDone: done });
    // Slow devices render fewer frames; never keep the player waiting past the spin.
    setTimeout(done, 6200);
  };

  const pact = () => {
    if (me.souls < COST.pact) return sfx.error();
    const ok = act((d) => {
      openPact(d, playerId);
      return true;
    });
    if (!ok) return sfx.error();
    sfx.pact();
    fx({ type: 'shrine.pact' });
    fx({ type: 'flash', color: '#b01020', strength: 0.4 });
    setPhase('pact');
  };

  const choose = (i: number) => {
    const r = act((d) => choosePact(d, i));
    if (r) reveal(r);
  };

  const hex = (targetId: string) => {
    const r = act((d) => castHex(d, playerId, targetId));
    if (!r) return sfx.error();
    sfx.hex();
    fx({ type: 'shrine.hex' });
    fx({ type: 'flash', color: '#6aff60', strength: 0.35 });
    setTimeout(() => reveal(r), 700);
    setPhase('spinning');
  };

  const purify = (uid: string) => {
    const r = act((d) => cleanse(d, playerId, uid));
    if (!r) return sfx.error();
    sfx.cleanse();
    fx({ type: 'shrine.cleanse' });
    fx({ type: 'flash', color: '#ffffff', strength: 0.5 });
    setResult(r);
    setPhase('reveal');
  };

  const leave = () => {
    sfx.back();
    closeShrine();
  };

  const offerings = [
    {
      id: 'wheel',
      icon: 'swirl' as const,
      title: 'Колесо Фортуны',
      cost: wCost,
      text: 'Случайный дар, проклятие, пустота или джекпот. Сектора = реальные шансы.',
      disabled: me.souls < wCost,
      onClick: spin,
    },
    {
      id: 'pact',
      icon: 'heart' as const,
      title: 'Кровавый пакт',
      cost: COST.pact,
      text: `Выбери 1 из 3 даров. Цена: ${Math.round(pactCurseChance(session, playerId) * 100)}% шанс порчи.`,
      disabled: me.souls < COST.pact,
      onClick: pact,
    },
    {
      id: 'hex',
      icon: 'skull' as const,
      title: 'Сглаз',
      cost: Math.min(...others.map((o) => hexCost(session, playerId, o.id)), COST.hex),
      text: 'Нашли проклятие на соперника. Лидера сглазить дешевле.',
      disabled: others.length === 0 || others.every((o) => hexBlockReason(session, playerId, o.id) || me.souls < hexCost(session, playerId, o.id)),
      onClick: () => setPhase('hex'),
    },
    {
      id: 'cleanse',
      icon: 'sun' as const,
      title: 'Очищение',
      cost: COST.cleanse,
      text: 'Сожги одно своё проклятие в святом огне.',
      disabled: myCurses.length === 0 || me.souls < COST.cleanse,
      onClick: () => setPhase('cleanse'),
    },
  ];

  return (
    <motion.div className="shrine" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="shrine-head panel">
        <PixelIcon id={me.sigil} color={me.color} size={26} />
        <div className="grow">
          <div className="field-label">Алтарь Судеб</div>
          <div style={{ color: me.color, fontSize: 18 }}>{me.name}</div>
        </div>
        <Souls n={me.souls} size={24} />
        {phase !== 'spinning' && (
          <Btn variant="ghost" onClick={leave}>
            Уйти
          </Btn>
        )}
      </div>

      <div className="shrine-stage">
        <AnimatePresence mode="wait">
          {phase === 'spinning' && (
            <motion.div key="spin" className="shrine-hint shadow-text" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              Судьба решается…
            </motion.div>
          )}

          {phase === 'reveal' && result && (
            <motion.div key="reveal" className="shrine-reveal" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <RevealContent result={result} visitorId={playerId} />
              <div className="row wrap" style={{ justifyContent: 'center', gap: 8 }}>
                <Btn
                  variant="soul"
                  onClick={() => {
                    setResult(null);
                    setPhase('menu');
                  }}
                >
                  Ещё подношение
                </Btn>
                <Btn variant="gold" onClick={leave}>
                  К игре ▶
                </Btn>
              </div>
            </motion.div>
          )}

          {phase === 'pact' && session.pact && (
            <motion.div key="pact" className="shrine-pact" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="shrine-hint shadow-text">Кровь пролита. Выбери дар.</div>
              <div className="pact-grid">
                {session.pact.choices.map((id, i) => (
                  <motion.button
                    key={id}
                    type="button"
                    className="pact-choice"
                    initial={{ rotateY: 90, opacity: 0 }}
                    animate={{ rotateY: 0, opacity: 1 }}
                    transition={{ delay: 0.15 + i * 0.18, type: 'spring', stiffness: 160, damping: 16 }}
                    onClick={() => choose(i)}
                    onMouseEnter={() => sfx.hover()}
                  >
                    <PerkCard def={perkDef(id)} params={session.pact!.params[i]} game={session.gameId} compact />
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence mode="wait">
        {phase === 'menu' && (
          <motion.div key="menu" className="shrine-menu panel" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ type: 'spring', stiffness: 240, damping: 26 }}>
            <div className="offerings">
              {offerings.map((o) => (
                <button key={o.id} type="button" className="offering" disabled={o.disabled} onClick={() => { sfx.click(); o.onClick(); }} onMouseEnter={() => sfx.hover()}>
                  <div className="offering-top">
                    <PixelIcon id={o.icon} color={o.disabled ? '#6d6252' : '#e9dfc7'} size={26} />
                    <span className="offering-cost">
                      {o.cost === 0 ? 'даром' : o.cost} <SoulGlyph size={14} />
                    </span>
                  </div>
                  <div className="offering-title">{o.title}</div>
                  <div className="offering-text">{o.text}</div>
                </button>
              ))}
            </div>
            <button type="button" className="odds-toggle" onClick={() => setShowOdds((v) => !v)}>
              {showOdds ? '▼' : '▶'} Шансы колеса для {me.name}
            </button>
            {showOdds && <OddsTable odds={odds} pity={me.doom >= PITY_AFTER} place={placeFactor(session, playerId)} last={isLast(session, playerId)} chaos={CHAOS_LABEL[session.enhancer.chaos]} />}
          </motion.div>
        )}

        {phase === 'hex' && (
          <motion.div key="hex" className="shrine-menu panel" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}>
            <div className="h-section">Кого сглазить?</div>
            <div className="col" style={{ gap: 8 }}>
              {others.map((o) => {
                const cost = hexCost(session, playerId, o.id);
                const block = hexBlockReason(session, playerId, o.id) ?? (me.souls < cost ? 'Не хватает душ' : null);
                return (
                  <Btn key={o.id} block disabled={!!block} onClick={() => hex(o.id)} style={{ justifyContent: 'flex-start' }}>
                    <PixelIcon id={o.sigil} color={o.color} size={20} />
                    <span className="grow" style={{ textAlign: 'left', color: o.color }}>
                      {o.name}
                      {block && <span className="faint" style={{ fontSize: 13 }}> — {block}</span>}
                    </span>
                    <span>
                      {cost} <SoulGlyph size={13} />
                    </span>
                  </Btn>
                );
              })}
            </div>
            <Btn variant="ghost" onClick={() => setPhase('menu')} style={{ marginTop: 10 }}>
              ◀ Назад
            </Btn>
          </motion.div>
        )}

        {phase === 'cleanse' && (
          <motion.div key="cleanse" className="shrine-menu panel" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}>
            <div className="h-section">Какое проклятие сжечь? ({souls(COST.cleanse)})</div>
            <div className="sheet-perks">
              {myCurses.map((k: ActivePerk) => (
                <button key={k.uid} type="button" className="pact-choice" onClick={() => purify(k.uid)}>
                  <PerkCard def={perkDef(k.defId)} params={k.params} left={k.left} game={session.gameId} compact />
                </button>
              ))}
            </div>
            <Btn variant="ghost" onClick={() => setPhase('menu')} style={{ marginTop: 10 }}>
              ◀ Назад
            </Btn>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function RevealContent({ result, visitorId }: { result: ShrineResult; visitorId: string }) {
  const session = useApp((s) => s.session)!;
  const nameOf = (id: string) => session.players.find((p) => p.id === id)?.name ?? '?';
  if (result.outcome === 'jackpot') {
    return (
      <motion.div className="reveal-big" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 12 }}>
        <div className="reveal-title" style={{ color: '#8ff0ff' }}>ДЖЕКПОТ</div>
        <Souls n={JACKPOT_SOULS} size={48} />
      </motion.div>
    );
  }
  if (result.gained.length === 0) {
    return (
      <motion.div className="reveal-big" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
        <div className="reveal-title" style={{ color: result.type === 'cleanse' ? '#ffffff' : '#a39580' }}>
          {result.type === 'cleanse' ? 'Очищено' : result.warded ? 'Рассеяно' : 'Пустота'}
        </div>
        {result.notes.map((n) => (
          <div key={n} className="shadow-text" style={{ fontSize: 18 }}>
            {n}
          </div>
        ))}
      </motion.div>
    );
  }
  return (
    <div className="reveal-cards">
      {result.gained.map((g, i) => {
        const def = perkDef(g.perk.defId);
        const target = g.playerId !== visitorId ? nameOf(g.playerId) : result.reflected ? 'тебе' : undefined;
        return (
          <motion.div
            key={g.perk.uid + i}
            className="reveal-card"
            initial={{ rotateY: 180, scale: 0.6, opacity: 0 }}
            animate={{ rotateY: 0, scale: 1, opacity: 1 }}
            transition={{ delay: i * 0.6, type: 'spring', stiffness: 120, damping: 14 }}
          >
            {target && <div className="reveal-to shadow-text">{result.reflected ? '↩ Зеркало вернуло сглаз' : `☠ Сглаз на ${target}`}</div>}
            <PerkCard def={def} params={g.perk.params} left={g.perk.left} game={session.gameId} />
          </motion.div>
        );
      })}
      {result.notes.length > 0 && (
        <div className="reveal-notes shadow-text">
          {result.notes.map((n) => (
            <div key={n}>{n}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function OddsTable({ odds, pity, place, last, chaos }: { odds: Record<WheelOutcome, number>; pity: boolean; place: number; last: boolean; chaos: string }) {
  return (
    <div className="odds">
      <div className="odds-grid">
        {WHEEL_ORDER.map((o) => (
          <div key={o} className="odds-row">
            <span className="odds-swatch" style={{ background: WHEEL_STYLE[o].ui }} />
            <span className="grow">{OUTCOME_LABEL[o]}</span>
            <b>{(odds[o] * 100).toFixed(1)}%</b>
          </div>
        ))}
      </div>
      <div className="faint" style={{ fontSize: 13, lineHeight: 1.45, marginTop: 8 }}>
        Хаос: {chaos}. {place <= 0.01 ? 'Ты лидер — боги к тебе строже: проклятий больше.' : last ? 'Ты отстаёшь — боги милосердны: проклятий меньше, редких даров больше.' : 'Твоё место влияет на шансы: чем ниже, тем милостивее боги.'}{' '}
        {pity ? 'Два проклятия подряд — милость богов: проклятий не будет.' : `После ${PITY_AFTER} проклятий подряд — вращение без проклятий.`}
      </div>
    </div>
  );
}
