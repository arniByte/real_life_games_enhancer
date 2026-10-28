import { useState } from 'react';
import { AnimatePresence, Btn, Field, Modal, PixelIcon, Seg } from '../components/kit';
import { PerkCard } from '../components/Perk';
import { useNav } from '../nav';
import { PLAYER_COLORS, SIGILS, useApp } from '../../core/store';
import type { GameId } from '../../core/types';
import { GAME_META, GAME_ORDER } from '../../games/meta';
import { GAME_LOGIC } from '../../games/logic';
import { RARITY_ORDER, perksForGame } from '../../core/perks/registry';
import { BASE_WHEEL, COST, JACKPOT_SOULS, OUTCOME_LABEL, OUTCOMES, PITY_AFTER } from '../../core/shrine';
import { MAX_BLESSINGS, MAX_CURSES } from '../../core/session';
import { finish, log } from '../../core/session';
import { act } from '../../core/store';
import { sfx } from '../../audio/sfx';
import { Heading } from '../pixel/Type';

export function Modals() {
  const modal = useNav((s) => s.modal);
  const close = useNav((s) => s.close);
  const ask = useNav((s) => s.ask);
  const dismissAsk = useNav((s) => s.dismissAsk);
  return (
    <AnimatePresence>
      {ask && (
        <Modal key="ask" title="Уверен?" onClose={dismissAsk}>
          <div className="col" style={{ gap: 16 }}>
            <div style={{ fontSize: 17 }}>{ask.text}</div>
            <div className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
              <Btn variant="ghost" onClick={dismissAsk}>
                Отмена
              </Btn>
              <Btn
                variant="primary"
                onClick={() => {
                  ask.onYes();
                  dismissAsk();
                }}
              >
                {ask.yes}
              </Btn>
            </div>
          </div>
        </Modal>
      )}
      {modal === 'codex' && <Codex key="codex" onClose={close} />}
      {modal === 'settings' && <SettingsModal key="settings" onClose={close} />}
      {modal === 'roster' && <Roster key="roster" onClose={close} />}
      {modal === 'chronicle' && <Chronicle key="chronicle" onClose={close} />}
      {modal === 'pause' && <Pause key="pause" onClose={close} />}
      {modal === 'log' && <LogModal key="log" onClose={close} />}
    </AnimatePresence>
  );
}

// ── Codex ────────────────────────────────────────────────────

function Codex({ onClose }: { onClose: () => void }) {
  const tab = useNav((s) => s.codexTab);
  const open = useNav((s) => s.open);
  const setTab = (t: typeof tab) => open('codex', t);
  return (
    <Modal title="Кодекс" onClose={onClose} wide>
      <div className="tabs" style={{ padding: 0, marginBottom: 14 }}>
        <Btn size="small" selected={tab === 'about'} onClick={() => setTab('about')}>
          Суть
        </Btn>
        <Btn size="small" selected={tab === 'shrine'} onClick={() => setTab('shrine')}>
          Алтарь
        </Btn>
        {GAME_ORDER.map((g) => (
          <Btn key={g} size="small" selected={tab === g} onClick={() => setTab(g)}>
            <PixelIcon id={GAME_META[g].icon} size={14} color={GAME_META[g].accent} /> {GAME_META[g].title}
          </Btn>
        ))}
      </div>
      {tab === 'about' && <About />}
      {tab === 'shrine' && <ShrineCodex />}
      {tab !== 'about' && tab !== 'shrine' && <GameCodex game={tab} />}
    </Modal>
  );
}

function About() {
  return (
    <div className="codex col">
      <p>
        <b>Real Life Games Enhancer</b> — компаньон для настоящих игр. Вы играете в дартс, шахматы, карты или пинг-понг как обычно, а приложение ведёт счёт и добавляет поверх слой
        roguelike-магии.
      </p>
      <Heading>Петля</Heading>
      <ol>
        <li>Играете по обычным правилам. Приложение считает очки.</li>
        <li>За хорошие действия игроки получают <b style={{ color: 'var(--soul)' }}>души</b> — валюту алтаря.</li>
        <li>Души тратятся на <b>Алтаре Судеб</b>: колесо, пакт, сглаз, очищение.</li>
        <li>Выпадают <b>дары</b> (усиления) и <b>проклятия</b> (ослабления) — новые правила для конкретного игрока.</li>
        <li>Часть эффектов приложение применяет само (⚙ авто): множители, лишние дротики, часы. Остальное — честное слово за столом.</li>
      </ol>
      <Heading>Баланс</Heading>
      <ul>
        <li>Отстающие получают души форы, а боги к ним милостивее — проклятий меньше, редких даров больше.</li>
        <li>Лидера дешевле сглазить. Лидеру чаще выпадают проклятия.</li>
        <li>Два проклятия подряд с колеса — следующее вращение без проклятий.</li>
        <li>Слоты: до {MAX_BLESSINGS} даров и {MAX_CURSES} проклятий; лишнее вытесняет самое старое.</li>
        <li>Доход считается по «сырым» очкам: перки не раздувают экономику.</li>
      </ul>
      <Heading>За столом</Heading>
      <ul>
        <li>Положите ноутбук или телефон так, чтобы всем было видно. Один человек — ведущий.</li>
        <li>Ошиблись — «↶» отменяет любое действие (Ctrl+Z).</li>
        <li>Спорный перк трактует тот, против кого он сыгран. Веселье важнее буквы закона.</li>
      </ul>
    </div>
  );
}

function ShrineCodex() {
  const total = OUTCOMES.reduce((s, o) => s + BASE_WHEEL[o], 0);
  return (
    <div className="codex col">
      <div className="offerings codex-offerings">
        <div className="offering">
          <div className="label" style={{ color: 'var(--gold)' }}>Колесо Фортуны · {COST.wheel}</div>
          <div className="offering-text">Случайный исход. Сектора колеса нарисованы по вашим настоящим шансам.</div>
        </div>
        <div className="offering">
          <div className="label" style={{ color: 'var(--gold)' }}>Кровавый пакт · {COST.pact}</div>
          <div className="offering-text">Выбор 1 из 3 даров (чаще редкие). Цена — шанс порчи: 25% / 40% / 55% по уровню хаоса. Последнему месту — без цены.</div>
        </div>
        <div className="offering">
          <div className="label" style={{ color: 'var(--gold)' }}>Сглаз · {COST.hex}</div>
          <div className="offering-text">Случайное проклятие сопернику. Против лидера — на 1 дешевле. Нельзя, если на цели уже 2 проклятия. Оберег гасит, Зеркало отражает.</div>
        </div>
        <div className="offering">
          <div className="label" style={{ color: 'var(--gold)' }}>Очищение · {COST.cleanse}</div>
          <div className="offering-text">Снять с себя одно проклятие.</div>
        </div>
      </div>
      <Heading>Базовые шансы колеса</Heading>
      <div className="odds-grid">
        {OUTCOMES.map((o) => (
          <div key={o} className="odds-row">
            <span className="grow">{OUTCOME_LABEL[o]}</span>
            <b>{((BASE_WHEEL[o] / total) * 100).toFixed(1)}%</b>
          </div>
        ))}
      </div>
      <p className="faint">
        Модификаторы: место в таблице (лидер ×1.25 проклятий, последний ×0.65 и +35% к редким дарам), хаос (Тихий омут ×0.5 проклятий, Безумие ×1.4 и ×2 легенд), милость после {PITY_AFTER}{' '}
        проклятий подряд. Джекпот — +{JACKPOT_SOULS} души.
      </p>
    </div>
  );
}

function GameCodex({ game }: { game: GameId }) {
  const meta = GAME_META[game];
  const perks = perksForGame(game).filter((p) => p.game === game);
  const generic = perksForGame(game).filter((p) => p.game === 'any');
  const [kind, setKind] = useState<'blessing' | 'curse'>('blessing');
  return (
    <div className="codex col">
      <div className="hub-game" style={{ ['--accent' as string]: meta.accent }}>
        <PixelIcon id={meta.icon} color={meta.accent} size={22} /> {meta.world}
      </div>
      {meta.rules.map((r) => (
        <div key={r.title}>
          <Heading>{r.title}</Heading>
          <ul>
            {r.body.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      ))}
      <Heading>Как добыть души</Heading>
      <ul>
        {meta.income.map((b) => (
          <li key={b}>{b}</li>
        ))}
        <li>Алтарь: {meta.shrineRule}</li>
      </ul>
      <Heading>Перки мира</Heading>
      <Seg
        value={kind}
        choices={[
          { value: 'blessing', label: 'Дары' },
          { value: 'curse', label: 'Проклятия' },
        ]}
        onChange={setKind}
      />
      <div className="codex-perks">
        {[...perks, ...generic]
          .filter((p) => p.kind === kind)
          .sort((a, b) => RARITY_ORDER.indexOf(a.rarity) - RARITY_ORDER.indexOf(b.rarity))
          .map((p) => (
            <PerkCard key={p.id} def={p} game={game} compact />
          ))}
      </div>
    </div>
  );
}

// ── Settings ─────────────────────────────────────────────────

function SettingsModal({ onClose }: { onClose: () => void }) {
  const settings = useApp((s) => s.settings);
  const set = useApp((s) => s.setSettings);
  return (
    <Modal title="Настройки" onClose={onClose}>
      <div className="col" style={{ gap: 16 }}>
        <Field label={`Громкость · ${Math.round(settings.volume * 100)}%`}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.volume}
            onChange={(e) => {
              set({ volume: Number(e.target.value) });
              sfx.setVolume(Number(e.target.value));
            }}
            className="range"
          />
        </Field>
        <Field label="Эмбиент-музыка">
          <Seg value={settings.music} choices={[{ value: true, label: 'Вкл' }, { value: false, label: 'Выкл' }]} onChange={(v) => set({ music: v })} />
        </Field>
        <Field label="Разрешение рендера" hint="240p — настоящая PS1. Выше — чётче, но теряется шарм.">
          <Seg
            value={settings.resolution}
            choices={[
              { value: 240, label: '240p' },
              { value: 320, label: '320p' },
              { value: 480, label: '480p' },
            ]}
            onChange={(v) => set({ resolution: v })}
          />
        </Field>
        <Field label="Дрожание вершин" hint="Знаменитый «wobble» PS1: у приставки не было субпиксельной точности.">
          <Seg
            value={settings.jitter}
            choices={[
              { value: 0, label: 'Нет' },
              { value: 1, label: 'Лёгкое' },
              { value: 2, label: 'Классика' },
            ]}
            onChange={(v) => set({ jitter: v })}
          />
        </Field>
        <Field label="ЭЛТ-эффекты" hint="Скан-линии, виньетка, лёгкая бочка кинескопа.">
          <Seg value={settings.crt} choices={[{ value: true, label: 'Вкл' }, { value: false, label: 'Выкл' }]} onChange={(v) => set({ crt: v })} />
        </Field>
        <Field label="Меньше движения" hint="Без тряски камеры и резких вспышек.">
          <Seg value={settings.reducedMotion} choices={[{ value: false, label: 'Нет' }, { value: true, label: 'Да' }]} onChange={(v) => set({ reducedMotion: v })} />
        </Field>
        <div className="faint" style={{ fontSize: 15 }}>
          Сохранения хранятся в этом браузере. Приложение работает офлайн и ставится на экран как обычное (меню браузера → «Установить»).
        </div>
      </div>
    </Modal>
  );
}

// ── Roster ───────────────────────────────────────────────────

function Roster({ onClose }: { onClose: () => void }) {
  const roster = useApp((s) => s.roster);
  const { addRosterPlayer, updateRosterPlayer, removeRosterPlayer } = useApp.getState();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <Modal title="Игроки" onClose={onClose}>
      <div className="col" style={{ gap: 12 }}>
        <form
          className="row"
          style={{ gap: 6 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            addRosterPlayer(name);
            setName('');
            sfx.confirm();
          }}
        >
          <input className="input grow" placeholder="Имя" value={name} maxLength={16} onChange={(e) => setName(e.target.value)} />
          <Btn type="submit" variant="gold" disabled={!name.trim()}>
            + Добавить
          </Btn>
        </form>
        {roster.length === 0 && <div className="faint">Добавь всех, кто играет. Имена, цвета и сигилы запомнятся.</div>}
        {roster.map((p) => (
          <div key={p.id} className="roster-row panel" style={{ ['--pc' as string]: p.color }}>
            <div className="row" style={{ gap: 8 }}>
              <PixelIcon id={p.sigil} color={p.color} size={24} />
              <input className="input grow" value={p.name} maxLength={16} onChange={(e) => updateRosterPlayer(p.id, { name: e.target.value })} style={{ color: p.color }} />
              <Btn size="small" onClick={() => setEditing(editing === p.id ? null : p.id)}>
                Облик
              </Btn>
              <Btn
                size="small"
                variant="ghost"
                onClick={() => useNav.getState().confirm(`Удалить ${p.name} из списка игроков?`, () => removeRosterPlayer(p.id), 'Удалить')}
                aria-label="Удалить"
              >
                ✕
              </Btn>
            </div>
            {editing === p.id && (
              <div className="col" style={{ gap: 8, marginTop: 10 }}>
                <div className="row wrap" style={{ gap: 6 }}>
                  {PLAYER_COLORS.map((c) => (
                    <button key={c} type="button" className={`swatch ${p.color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => updateRosterPlayer(p.id, { color: c })} aria-label={c} />
                  ))}
                </div>
                <div className="row wrap" style={{ gap: 6 }}>
                  {SIGILS.map((s) => (
                    <button key={s} type="button" className={`sigil-btn ${p.sigil === s ? 'on' : ''}`} onClick={() => updateRosterPlayer(p.id, { sigil: s })} aria-label={s}>
                      <PixelIcon id={s} color={p.color} size={22} />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ── Chronicle ────────────────────────────────────────────────

function Chronicle({ onClose }: { onClose: () => void }) {
  const chronicle = useApp((s) => s.chronicle);
  const clear = useApp((s) => s.clearChronicle);
  const wins = new Map<string, { name: string; color: string; n: number }>();
  for (const c of chronicle) {
    const w = c.players[0];
    if (!w) continue;
    const cur = wins.get(w.name) ?? { name: w.name, color: w.color, n: 0 };
    cur.n += 1;
    wins.set(w.name, cur);
  }
  const hall = [...wins.values()].sort((a, b) => b.n - a.n);
  return (
    <Modal
      title="Летопись"
      onClose={onClose}
      footer={
        chronicle.length > 0 && (
          <Btn size="small" variant="ghost" onClick={() => useNav.getState().confirm('Стереть всю летопись?', clear, 'Стереть')}>
            Стереть
          </Btn>
        )
      }
    >
      {chronicle.length === 0 && <div className="faint">Здесь появятся сыгранные партии и зал славы.</div>}
      {hall.length > 0 && (
        <>
          <Heading>Зал славы</Heading>
          <div className="row wrap" style={{ gap: 8, marginBottom: 16 }}>
            {hall.map((h) => (
              <div key={h.name} className="award">
                <div className="award-who" style={{ color: h.color }}>
                  {h.name}
                </div>
                <div className="faint">
                  {h.n} {h.n === 1 ? 'победа' : h.n < 5 ? 'победы' : 'побед'}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="col" style={{ gap: 8 }}>
        {chronicle.map((c) => (
          <div key={c.id + c.at} className="chron-row">
            <PixelIcon id={GAME_META[c.gameId].icon} color={GAME_META[c.gameId].accent} size={20} />
            <div className="grow">
              <div>
                <b style={{ color: GAME_META[c.gameId].accent }}>{GAME_META[c.gameId].title}</b>
                <span className="faint"> · {new Date(c.at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="dim">
                {c.players.map((p) => (
                  <span key={p.name} style={{ marginRight: 10 }}>
                    {p.place}. <span style={{ color: p.color }}>{p.name}</span> ({p.score})
                  </span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ── Pause & log ──────────────────────────────────────────────

function Pause({ onClose }: { onClose: () => void }) {
  const session = useApp((s) => s.session);
  const { open, go } = useNav();
  if (!session) return null;
  return (
    <Modal title="Пауза" onClose={onClose}>
      <div className="col pause-menu" style={{ gap: 8 }}>
        <Btn block size="big" variant="gold" onClick={onClose} className="menu-item">
          Продолжить
        </Btn>
        <Btn block onClick={() => open('codex', session.gameId)} className="menu-item">
          Правила и перки
        </Btn>
        <Btn block onClick={() => open('log')} className="menu-item">
          Журнал событий
        </Btn>
        <Btn block onClick={() => open('settings')} className="menu-item">
          Настройки
        </Btn>
        {session.status === 'playing' && (
          <Btn
            block
            className="menu-item"
            onClick={() => {
              act((d) => {
                log(d, 'Игра завершена досрочно.', 'epic');
                finish(d, GAME_LOGIC[d.gameId].standings(d));
              });
              onClose();
            }}
          >
            Подвести итоги сейчас
          </Btn>
        )}
        <Btn
          block
          variant="primary"
          className="menu-item"
          onClick={() => {
            onClose();
            sfx.back();
            go('hub');
          }}
        >
          Выйти на Перекрёсток
        </Btn>
        <div className="label faint" style={{ textAlign: "center" }}>
          Игра сохраняется сама — можно вернуться позже.
        </div>
      </div>
    </Modal>
  );
}

function LogModal({ onClose }: { onClose: () => void }) {
  const session = useApp((s) => s.session);
  return (
    <Modal title="Журнал событий" onClose={onClose}>
      <div className="col" style={{ gap: 4 }}>
        {session?.log
          .slice()
          .reverse()
          .map((l) => (
            <div key={l.id} className={`feed-line ${l.tone}`} style={{ maxWidth: 'none', width: '100%' }}>
              {l.text}
            </div>
          ))}
      </div>
    </Modal>
  );
}
