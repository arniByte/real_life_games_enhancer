import { useMemo, useState } from 'react';
import { Btn, Field, PixelIcon, Seg, motion } from '../components/kit';
import { useNav } from '../nav';
import { useApp } from '../../core/store';
import type { ChaosLevel, EnhancerSettings, GameId } from '../../core/types';
import { GAME_META } from '../../games/meta';
import { CHAOS_LABEL } from '../../core/shrine';
import { sfx } from '../../audio/sfx';
import { fx } from '../../three';

const CHAOS_HINT: Record<ChaosLevel, string> = {
  calm: 'Проклятий вдвое меньше. Для детей и первой партии.',
  normal: 'Баланс даров и проклятий. Рекомендуем.',
  mayhem: 'Больше проклятий, больше эпиков и легенд. Для тех, кто пришёл страдать.',
};

export function Setup() {
  const game = useNav((s) => s.setupGame) as GameId;
  const { go, open } = useNav();
  const meta = GAME_META[game];
  const roster = useApp((s) => s.roster);
  const prefs = useApp((s) => s.setups[game]);
  const { addRosterPlayer, startSession, saveSetup } = useApp.getState();

  const [selected, setSelected] = useState<string[]>(() => (prefs?.playerIds ?? []).filter((id) => roster.some((r) => r.id === id)));
  const [options, setOptions] = useState<Record<string, unknown>>(() => ({ ...meta.defaultOptions, ...prefs?.options }));
  const [enh, setEnh] = useState<EnhancerSettings>(() => prefs?.enhancer ?? { enabled: true, chaos: 'normal', startSouls: 1 });
  const [newName, setNewName] = useState('');

  const tooFew = selected.length < meta.minPlayers;
  const tooMany = selected.length > meta.maxPlayers;

  const toggle = (id: string) => {
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    const p = addRosterPlayer(name);
    setSelected((cur) => [...cur, p.id]);
    setNewName('');
    sfx.confirm();
  };

  const move = (i: number, d: number) => {
    setSelected((cur) => {
      const next = cur.slice();
      const j = i + d;
      if (j < 0 || j >= next.length) return cur;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const shuffle = () => {
    setSelected((cur) => {
      const next = cur.slice();
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
      return next;
    });
    sfx.tick();
  };

  const start = () => {
    if (tooFew || tooMany) {
      sfx.error();
      return;
    }
    const opts = { ...options };
    saveSetup(game, { playerIds: selected, options: opts, enhancer: enh });
    startSession(game, selected, opts, enh);
    sfx.start();
    fx({ type: 'flash', color: meta.accent, strength: 0.5 });
    go('play');
  };

  const sideLabel = useMemo(() => {
    if (game === 'chess') return ['Белые', 'Чёрные'];
    if (game === 'pingpong') return ['Слева', 'Справа'];
    return null;
  }, [game]);

  return (
    <div className="setup">
      <motion.div
        className="panel setup-panel"
        initial={{ x: -40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ delay: 0.6, type: 'spring', stiffness: 200, damping: 26 }}
        style={{ ['--accent' as string]: meta.accent }}
      >
        <div className="setup-head">
          <div className="hub-game">
            <PixelIcon id={meta.icon} color={meta.accent} size={20} /> {meta.title}
          </div>
          <h1 className="h-world" style={{ fontSize: 'clamp(26px, 4.5vw, 44px)' }}>
            {meta.world}
          </h1>
        </div>

        <div className="setup-body scroll">
          <section className="col" style={{ gap: 10 }}>
            <h3 className="h-section">Игроки</h3>
            <div className="roster-chips">
              {roster.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={`roster-chip ${selected.includes(p.id) ? 'on' : ''}`}
                  style={{ ['--pc' as string]: p.color }}
                  onClick={() => {
                    toggle(p.id);
                    sfx.click();
                  }}
                >
                  <PixelIcon id={p.sigil} color={p.color} size={16} />
                  {p.name}
                </button>
              ))}
              {roster.length === 0 && <div className="faint">Пока никого. Впиши имена — они запомнятся.</div>}
            </div>
            <form
              className="row"
              style={{ gap: 6 }}
              onSubmit={(e) => {
                e.preventDefault();
                add();
              }}
            >
              <input className="input grow" placeholder="Имя нового игрока" value={newName} maxLength={16} onChange={(e) => setNewName(e.target.value)} />
              <Btn type="submit" variant="gold" disabled={!newName.trim()}>
                + Добавить
              </Btn>
            </form>
            {selected.length > 0 && (
              <div className="order-list">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="field-label">Порядок ходов</span>
                  {selected.length > 1 && (
                    <Btn size="small" variant="ghost" onClick={shuffle}>
                      🎲 Жребий
                    </Btn>
                  )}
                </div>
                {selected.map((id, i) => {
                  const p = roster.find((r) => r.id === id);
                  if (!p) return null;
                  return (
                    <motion.div layout key={id} className="order-row" style={{ ['--pc' as string]: p.color }}>
                      <span className="order-n">{i + 1}</span>
                      <PixelIcon id={p.sigil} color={p.color} size={18} />
                      <span className="grow" style={{ color: p.color }}>
                        {p.name}
                      </span>
                      {sideLabel && i < 2 && <span className="faint" style={{ fontSize: 13 }}>{sideLabel[i]}</span>}
                      <Btn size="small" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Выше">
                        ↑
                      </Btn>
                      <Btn size="small" variant="ghost" onClick={() => move(i, 1)} disabled={i === selected.length - 1} aria-label="Ниже">
                        ↓
                      </Btn>
                      <Btn size="small" variant="ghost" onClick={() => toggle(id)} aria-label="Убрать">
                        ✕
                      </Btn>
                    </motion.div>
                  );
                })}
              </div>
            )}
            {(tooFew || tooMany) && (
              <div className="setup-warn">
                {meta.minPlayers === meta.maxPlayers
                  ? `Нужно ровно ${meta.minPlayers} игрока.`
                  : tooFew
                    ? `Нужно хотя бы ${meta.minPlayers}.`
                    : `Максимум ${meta.maxPlayers}.`}
              </div>
            )}
          </section>

          <section className="col" style={{ gap: 12 }}>
            <h3 className="h-section">Правила стола</h3>
            {meta.options
              .filter((o) => !o.visible || o.visible(options))
              .map((o) =>
                o.text ? (
                  <Field key={o.key} label={o.label}>
                    <input
                      className="input"
                      placeholder="Например: Монополия"
                      maxLength={28}
                      value={String(options[o.key] ?? '')}
                      onChange={(e) => setOptions({ ...options, [o.key]: e.target.value })}
                    />
                  </Field>
                ) : (
                  <Field key={o.key} label={o.label} hint={o.hint}>
                    <Seg value={options[o.key] as string} choices={o.choices as { value: string; label: string }[]} onChange={(v) => setOptions({ ...options, [o.key]: v })} />
                  </Field>
                ),
              )}
          </section>

          <section className="col" style={{ gap: 12 }}>
            <h3 className="h-section">Энхансер</h3>
            <Field label="Режим">
              <Seg
                value={enh.enabled}
                choices={[
                  { value: true, label: '☠ Алтарь, души, перки' },
                  { value: false, label: 'Чистый счёт' },
                ]}
                onChange={(v) => setEnh({ ...enh, enabled: v })}
              />
            </Field>
            {enh.enabled && (
              <>
                <Field label="Уровень хаоса" hint={CHAOS_HINT[enh.chaos]}>
                  <Seg
                    value={enh.chaos}
                    choices={(['calm', 'normal', 'mayhem'] as ChaosLevel[]).map((c) => ({ value: c, label: CHAOS_LABEL[c] }))}
                    onChange={(v) => setEnh({ ...enh, chaos: v })}
                  />
                </Field>
                <Field label="Стартовые души">
                  <Seg value={enh.startSouls} choices={[0, 1, 2, 3].map((n) => ({ value: n, label: String(n) }))} onChange={(v) => setEnh({ ...enh, startSouls: v })} />
                </Field>
                <div className="faint" style={{ fontSize: 13, lineHeight: 1.4 }}>
                  Души: {meta.income.join(' ')} Алтарь: {meta.shrineRule}
                </div>
              </>
            )}
          </section>
        </div>

        <div className="setup-foot">
          <Btn
            variant="ghost"
            onClick={() => {
              sfx.back();
              go('hub');
            }}
          >
            ◀ Назад
          </Btn>
          <Btn variant="ghost" onClick={() => open('codex', game)}>
            📜 <span className="hide-sm">Правила</span>
          </Btn>
          <div className="grow" />
          <Btn variant="primary" size="big" onClick={start} disabled={tooFew || tooMany}>
            Начать
          </Btn>
        </div>
      </motion.div>
    </div>
  );
}
