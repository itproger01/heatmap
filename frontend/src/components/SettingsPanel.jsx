import React from 'react';
import clsx from 'clsx';

const WALL_AGES = [
  { v: 1800,   label: '30 мин' },
  { v: 3600,   label: '1 час' },
  { v: 7200,   label: '2 часа' },
  { v: 14400,  label: '4 часа' },
  { v: 28800,  label: '8 часов' },
  { v: 43200,  label: '12 часов' },
  { v: 86400,  label: '24 часа' },
  { v: 0,      label: 'все' },
];

const MIN_USD = [
  { v: 0,         label: '$0' },
  { v: 25000,     label: '$25K' },
  { v: 50000,     label: '$50K' },
  { v: 100000,    label: '$100K' },
  { v: 250000,    label: '$250K' },
  { v: 500000,    label: '$500K' },
  { v: 1000000,   label: '$1M' },
  { v: 5000000,   label: '$5M' },
];

const TIMEFRAMES = [
  { v: '1m',  label: '1м' },
  { v: '5m',  label: '5м' },
  { v: '15m', label: '15м' },
  { v: '30m', label: '30м' },
  { v: '1h',  label: '1ч' },
  { v: '4h',  label: '4ч' },
  { v: '1d',  label: '1д' },
  { v: '1M',  label: '1мес' },
];

function SectionTitle({ children }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="g-label text-[10px] uppercase tracking-[0.22em]">{children}</span>
      <span className="h-px flex-1 bg-gradient-to-r from-line to-transparent" />
    </div>
  );
}

function Radio({ checked, color = 'neon' }) {
  const c = color === 'amber' ? '#ffb020' : '#00ff88';
  return (
    <span
      className={clsx('flex h-4 w-4 items-center justify-center rounded-full border transition', !checked && 'border-mute/40 bg-white/[0.02]')}
      style={checked ? { borderColor: c } : undefined}
    >
      {checked && (
        <span className="h-1.5 w-1.5 rounded-full"
              style={{ background: c, boxShadow: `0 0 6px ${c}` }} />
      )}
    </span>
  );
}

export default function SettingsPanel({
  open, onClose,
  minWallAge, setMinWallAge,
  minWallUsd, setMinWallUsd,
  resolution, setResolution,
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass-panel relative w-[460px] overflow-hidden rounded-2xl p-6"
        style={{
        background: [
          'linear-gradient(180deg,',
          '  rgba(255,255,255,0.22) 0%,',
          '  rgba(200,210,220,0.12) 8%,',
          '  rgba(120,130,145,0.30) 22%,',
          '  rgba(55,60,70,0.55) 55%,',
          '  rgba(35,40,48,0.68) 100%)',
        ].join(''),
        backdropFilter: 'blur(32px) saturate(115%)',
        WebkitBackdropFilter: 'blur(32px) saturate(115%)',
        border: '1px solid rgba(255,255,255,0.18)',
        boxShadow: [
          '0 24px 70px -12px rgba(0,0,0,0.7)',
          'inset 0 1px 0 rgba(255,255,255,0.35)',
          'inset 0 -1px 0 rgba(0,0,0,0.25)',
          'inset 0 0 0 0.5px rgba(255,255,255,0.06)',
        ].join(', '),
      }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* зеркальные блики */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.6) 50%, transparent 100%)',
          }}
        />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 25%)',
            borderRadius: 'inherit',
          }}
        />
        <div className="relative z-10">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="g-title text-[15px] font-semibold tracking-tight text-white">
              Фильтр отображения
            </h3>
            <p className="g-sub mt-0.5 text-[11px]">
              Настройки применяются мгновенно
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-mute transition hover:bg-white/[0.06] hover:text-white"
          >
            ✕
          </button>
        </div>

        <SectionTitle>Мин. объём плотности</SectionTitle>
        <p className="g-sub mb-3 text-[11px] leading-relaxed">
          Скрывать стены, чей объём меньше указанной суммы в USD.
        </p>
        <div className="mb-5 grid grid-cols-4 gap-1.5">
          {MIN_USD.map((opt) => {
            const active = minWallUsd === opt.v;
            return (
              <button
                key={opt.v}
                onClick={() => setMinWallUsd(opt.v)}
                className={clsx(
                  'g-item flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 font-mono text-[11px] font-medium transition-all',
                  active
                    ? 'border-cyan/60 bg-cyan/15 text-cyan shadow-[0_0_10px_rgba(0,229,255,0.25)]'
                    : 'border-white/10 bg-white/[0.05] text-white/75 hover:border-white/25 hover:bg-white/[0.08] hover:text-white'
                )}
              >
                <Radio checked={active} color="cyan" />
                {opt.label}
              </button>
            );
          })}
        </div>

        <SectionTitle>Мин. жизнь плотности</SectionTitle>
        <p className="g-sub mb-3 text-[11px] leading-relaxed">
          Показывать только стены, которые держатся в стакане
          не меньше указанного времени.
        </p>
        <div className="mb-5 grid grid-cols-4 gap-1.5">
          {WALL_AGES.map((opt) => {
            const active = minWallAge === opt.v;
            return (
              <button
                key={opt.v}
                onClick={() => setMinWallAge(opt.v)}
                className={clsx(
                  'g-item flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 font-mono text-[11px] font-medium transition-all',
                  active
                    ? 'border-amber/60 bg-amber/15 text-amber shadow-[0_0_10px_rgba(255,176,32,0.25)]'
                    : 'border-white/10 bg-white/[0.05] text-white/75 hover:border-white/25 hover:bg-white/[0.08] hover:text-white'
                )}
              >
                <Radio checked={active} color="amber" />
                {opt.label}
              </button>
            );
          })}
        </div>

        <SectionTitle>Таймфрейм свечей</SectionTitle>
        <div className="mb-5 flex flex-wrap gap-1.5">
          {TIMEFRAMES.map((tf) => {
            const active = resolution === tf.v;
            return (
              <button
                key={tf.v}
                onClick={() => setResolution(tf.v)}
                className={clsx(
                  'g-item rounded-lg border px-3 py-1.5 font-mono text-[11px] font-medium transition-all',
                  active
                    ? 'border-neon/60 bg-neon/15 text-neon shadow-[0_0_10px_rgba(0,255,136,0.3)]'
                    : 'border-white/10 bg-white/[0.05] text-white/75 hover:border-white/25 hover:bg-white/[0.08] hover:text-white'
                )}
              >
                {tf.label}
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg bg-gradient-to-b from-neon to-[#00d676] px-4 py-2 font-mono text-[11px] font-semibold text-obsidian shadow-[0_0_14px_rgba(0,255,136,0.35)] transition hover:brightness-110"
          >
            Применить
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
