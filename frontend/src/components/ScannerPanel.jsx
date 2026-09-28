import React, { useEffect, useState, useRef } from 'react';
import clsx from 'clsx';

const PERIODS = [
  { v: '1m',  label: '1 мин' },
  { v: '5m',  label: '5 мин' },
  { v: '15m', label: '15 мин' },
  { v: '30m', label: '30 мин' },
  { v: '1h',  label: '1 час' },
  { v: '4h',  label: '4 часа' },
  { v: '24h', label: '24 часа' },
];

const DIRECTIONS = [
  { v: 'all',  label: 'Все',       color: '#7c5cff' },
  { v: 'up',   label: '▲ Рост',    color: '#00ff88' },
  { v: 'down', label: '▼ Падение', color: '#ff3366' },
];

const PCT_PRESETS = [1, 2, 3, 5, 10, 20];

function fmtPct(v) {
  if (!isFinite(v)) return '—';
  return (v > 0 ? '+' : '') + v.toFixed(2) + '%';
}

function fmtPrice(v) {
  if (v == null || !isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1000) return v.toFixed(2);
  if (a >= 1) return v.toFixed(4);
  if (a >= 0.01) return v.toFixed(5);
  return v.toFixed(8);
}

function fmtM(v) {
  if (!isFinite(v) || v === 0) return '—';
  const a = Math.abs(v);
  if (a >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return v.toFixed(0);
}

function Sparkline({ pct }) {
  const w = 70, h = 22;
  const norm = Math.max(-1, Math.min(1, pct / 20));
  const x = 35 + norm * 32;
  const up = pct >= 0;
  const c = up ? '#00ff88' : '#ff3366';
  return (
    <svg width={w} height={h} className="shrink-0">
      <line x1="2" y1={h / 2} x2={w - 2} y2={h / 2} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      <line x1="35" y1="4" x2="35" y2={h - 4} stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="1,2" />
      <line x1="35" y1={h / 2} x2={x} y2={h / 2} stroke={c} strokeWidth="2" strokeLinecap="round" />
      <circle cx={x} cy={h / 2} r="2.5" fill={c} />
      <circle cx={x} cy={h / 2} r="5.5" fill={c} opacity="0.15" />
    </svg>
  );
}

function ScoreBadge({ score }) {
  const a = Math.abs(score);
  let cls = 'text-mute/60 border-white/5 bg-white/[0.02]';
  if (a >= 100) cls = 'text-crimson border-crimson/40 bg-crimson/12';
  else if (a >= 50) cls = 'text-amber border-amber/40 bg-amber/12';
  else if (a >= 20) cls = 'text-cyan border-cyan/35 bg-cyan/10';
  else if (a >= 5) cls = 'text-neon border-neon/30 bg-neon/10';
  return (
    <span className={clsx('inline-flex items-center rounded-md border px-1.5 py-[3px] font-mono text-[10px] font-semibold tabular-nums', cls)}>
      {score >= 0 ? '+' : ''}{score.toFixed(1)}
    </span>
  );
}

function Pill({ active, onClick, children, color }) {
  const c = color || '#00e5ff';
  return (
    <button
      onClick={onClick}
      className="group relative rounded-lg px-3.5 py-[7px] font-mono text-[11px] tracking-tight transition-all duration-200 leading-none whitespace-nowrap"
      style={{
        color: active ? '#ffffff' : 'rgba(155,163,175,0.72)',
        fontWeight: active ? 600 : 500,
        letterSpacing: '0.015em',
        background: active
          ? 'linear-gradient(180deg, ' + c + '26 0%, ' + c + '14 100%)'
          : 'rgba(255,255,255,0.012)',
        border: '1px solid ' + (active ? c + '80' : 'rgba(255,255,255,0.05)'),
        boxShadow: active
          ? '0 0 14px ' + c + '30, inset 0 1px 0 ' + c + '40, inset 0 -1px 0 rgba(0,0,0,0.3)'
          : 'inset 0 1px 0 rgba(255,255,255,0.02)',
        textShadow: active ? '0 0 10px ' + c + 'aa, 0 0 2px ' + c + '66' : 'none',
      }}
    >
      <span className="relative z-10">{children}</span>

      {/* нижний акцент-бар */}
      <span
        className="absolute left-3 right-3 bottom-[3px] h-[1.5px] rounded-full transition-all duration-200"
        style={{
          background: c,
          boxShadow: '0 0 6px ' + c,
          opacity: active ? 1 : 0,
          transform: active ? 'scaleX(1)' : 'scaleX(0.2)',
        }}
      />
    </button>
  );
}

function FilterCard({ label, hint, children, accent, icon }) {
  const c = accent || 'rgba(200,210,220,0.55)';
  return (
    <div
      className="relative flex flex-col gap-2 rounded-xl px-3 pt-2.5 pb-2.5"
      style={{
        background:
          'linear-gradient(180deg, rgba(32,36,44,0.5) 0%, rgba(12,15,20,0.7) 100%)',
        border: '1px solid rgba(255,255,255,0.055)',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.04), 0 2px 6px -2px rgba(0,0,0,0.5)',
      }}
    >
      {/* верхний блик */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px rounded-t-xl"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.14) 50%, transparent 100%)',
        }}
      />

      {/* цветная полоска слева */}
      <div
        className="pointer-events-none absolute left-0 top-3 bottom-3 w-[2px] rounded-r-full"
        style={{
          background:
            'linear-gradient(180deg, transparent 0%, ' + c + 'cc 50%, transparent 100%)',
          opacity: 0.6,
        }}
      />

      {/* header с иконкой и меткой */}
      <div className="flex items-center gap-2 pl-2">
        {icon && (
          <span
            style={{
              color: c,
              display: 'inline-flex',
              filter: 'drop-shadow(0 0 4px ' + c + '66)',
            }}
          >
            {icon}
          </span>
        )}
        <span
          className="uppercase"
          style={{
            fontFamily: '"Chakra Petch", system-ui, sans-serif',
            fontSize: '9px',
            fontWeight: 700,
            letterSpacing: '0.24em',
            color: 'rgba(230,234,242,0.9)',
            textShadow: '0 1px 2px rgba(0,0,0,0.8)',
          }}
        >
          {label}
        </span>
        {hint && (
          <span
            style={{
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: '9px',
              letterSpacing: '0.01em',
              color: 'rgba(150,158,170,0.42)',
              fontStyle: 'italic',
            }}
          >
            {hint}
          </span>
        )}
      </div>

      {/* tabs */}
      <div className="flex items-center gap-1 pl-2">
        {children}
      </div>
    </div>
  );
}

function Divider() {
  return (
    <span
      className="self-stretch w-px my-2"
      style={{
        background: 'linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.12) 50%, transparent 100%)',
      }}
    />
  );
}

function InfoDot({ title, lines }) {
  const [open, setOpen] = React.useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      style={{ verticalAlign: 'middle' }}
    >
      <span
        className="flex h-[11px] w-[11px] items-center justify-center rounded-full cursor-help"
        style={{
          border: '1px solid rgba(180,188,200,0.45)',
          background: 'rgba(255,255,255,0.03)',
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: '8px',
          fontWeight: 700,
          color: 'rgba(200,208,220,0.8)',
          lineHeight: 1,
        }}
      >
        ?
      </span>

      {open && (
        <div
          className="absolute right-0 top-full z-[9999] mt-2 w-[260px] rounded-xl p-3.5 pointer-events-none"
          style={{
            background: 'linear-gradient(180deg, rgba(38,42,50,0.98) 0%, rgba(20,23,28,0.99) 100%)',
            backdropFilter: 'blur(20px) saturate(130%)',
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: '0 20px 50px -10px rgba(0,0,0,0.85), inset 0 1px 0 rgba(255,255,255,0.08)',
          }}
        >
          <div
            className="absolute inset-x-0 top-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)' }}
          />
          <div
            className="mb-1.5 text-[10px] font-semibold text-white uppercase"
            style={{
              fontFamily: '"Chakra Petch", system-ui, sans-serif',
              letterSpacing: '0.16em',
              textShadow: '0 1px 3px rgba(0,0,0,0.9)',
            }}
          >
            {title}
          </div>
          <div
            className="space-y-1.5"
            style={{
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: '10.5px',
              lineHeight: 1.5,
              color: 'rgba(220,226,235,0.85)',
            }}
          >
            {lines.map(function(line, i) {
              return (
                <div key={i} className="flex gap-1.5">
                  <span style={{ color: 'rgba(0,229,255,0.65)', flexShrink: 0 }}>▸</span>
                  <span>{line}</span>
                </div>
              );
            })}
          </div>
          <div
            className="absolute right-3 top-[-5px] h-2 w-2 rotate-45"
            style={{
              background: 'rgba(38,42,50,0.98)',
              borderLeft: '1px solid rgba(255,255,255,0.12)',
              borderTop: '1px solid rgba(255,255,255,0.12)',
            }}
          />
        </div>
      )}
    </span>
  );
}

const _iconFailed = new Set();

function CoinIcon({ symbol, size = 28 }) {
  const coin = (symbol || '').replace('USDT', '');
  const [failed, setFailed] = React.useState(function () {
    return _iconFailed.has(coin);
  });

  React.useEffect(function () {
    setFailed(_iconFailed.has(coin));
  }, [coin]);

  if (failed) {
    // fallback: цветной кружок с первой буквой
    let h = 0;
    for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) | 0;
    const hue = Math.abs(h) % 360;
    return (
      <span
        className="flex items-center justify-center rounded-full font-mono text-[11px] font-bold text-white"
        style={{
          width: size, height: size,
          background: 'linear-gradient(135deg, hsl(' + hue + ',60%,50%), hsl(' + ((hue + 40) % 360) + ',55%,40%))',
          textShadow: '0 1px 1px rgba(0,0,0,0.5)',
          flex: '0 0 ' + size + 'px',
        }}
      >
        {coin[0]}
      </span>
    );
  }

  return (
    <img
      src={'/api/icon/' + coin}
      alt={coin}
      width={size}
      height={size}
      loading="lazy"
      onError={function () {
        _iconFailed.add(coin);
        setFailed(true);
      }}
      className="rounded-full"
      style={{ width: size, height: size, flex: '0 0 ' + size + 'px' }}
    />
  );
}

export default function ScannerPanel({ onClose, onSelectSymbol }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState('24h');
  const [direction, setDirection] = useState('all');
  const [minPct, setMinPct] = useState(3);
  const [search, setSearch] = useState('');

  const timerRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let reqId = 0;

    const load = async () => {
      if (cancelled) return;
      const myId = ++reqId;
      setLoading(true);
      setError('');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      try {
        const url = '/api/scanner?period=' + period + '&min_pct=' + minPct + '&direction=' + direction;
        const r = await fetch(url, { signal: controller.signal });
        const d = await r.json();
        if (cancelled || myId !== reqId) return;
        if (d && d.error) setError(d.error);
        else setData(d);
      } catch (e) {
        if (!cancelled && e.name !== 'AbortError' && myId === reqId) {
          setError('сеть: ' + String(e).slice(0, 80));
        }
      } finally {
        clearTimeout(timeoutId);
      }

      if (cancelled || myId !== reqId) return;
      setLoading(false);
      timerRef.current = setTimeout(load, 15000);
    };

    load();

    return () => {
      cancelled = true;
      clearTimeout(timerRef.current);
    };
  }, [period, direction, minPct]);

  const coins = (data && data.coins) || [];
  const periodLabel = (PERIODS.find((p) => p.v === period) || {}).label || '';

  const filtered = search.trim()
    ? coins.filter((c) => c.symbol.toUpperCase().includes(search.trim().toUpperCase()))
    : coins;

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)' }}
      onClick={onClose}
    >
      <div
        className="relative flex flex-col overflow-hidden rounded-2xl"
        style={{
          width: '1320px',
          maxWidth: '97vw',
          height: '92vh',
          background: 'linear-gradient(180deg, rgba(22,26,32,0.99) 0%, rgba(6,8,12,0.99) 100%)',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 40px 120px -20px rgba(0,0,0,0.95), inset 0 1px 0 rgba(255,255,255,0.08)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)' }}
        />

        {/* HEADER */}
        <div className="flex shrink-0 items-center justify-between gap-6 border-b border-white/[0.06] px-6 py-4">
          <div className="flex items-center gap-4">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-xl"
              style={{
                background: 'linear-gradient(135deg, rgba(255,176,32,0.20), rgba(255,51,102,0.20))',
                border: '1px solid rgba(255,176,32,0.45)',
                boxShadow: '0 0 24px rgba(255,176,32,0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffb020" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 15c-1 1-1 4-1 4s3 0 4-1l-3-3z" />
                <path d="M14 10l4-4c3 3 4 8 2 10-1.5 1.5-5 2-7 1l-6-6c-1-2 0-5.5 1-7 2-2 7-1 10 2z" />
              </svg>
            </div>
            <div>
              <div className="text-[18px] font-semibold tracking-tight text-white">
                Сканер пампов и дампов
              </div>
              <div className="mt-1 flex items-center gap-3 font-mono text-[10.5px]">
                <span style={{ color: 'rgba(180,188,200,0.85)' }}>
                  <span style={{ color: '#00ff88' }}>●</span>&nbsp;
                  {data ? data.total + ' найдено' : 'загрузка…'}
                </span>
                <span style={{ color: 'rgba(160,168,180,0.35)' }}>·</span>
                <span style={{ color: 'rgba(160,168,180,0.7)' }}>
                  период <span style={{ color: '#00e5ff' }}>{periodLabel}</span>
                </span>
                {loading && (
                  <>
                    <span style={{ color: 'rgba(160,168,180,0.35)' }}>·</span>
                    <span className="animate-pulse" style={{ color: '#ffb020' }}>обновление…</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-mute transition hover:bg-white/[0.06] hover:text-white"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* FILTERS */}
        <div
          className="relative shrink-0 border-b border-white/[0.05] px-6 py-4"
          style={{
            background: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.1) 100%)',
          }}
        >
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.10) 50%, transparent 100%)' }}
          />

          <div className="flex flex-wrap items-stretch gap-3">

            {/* ПЕРИОД */}
            <FilterCard
              label="Период"
              hint="за какое время"
              accent="#00e5ff"
              icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>}
            >
              {PERIODS.map((p) => (
                <Pill key={p.v} active={period === p.v} onClick={() => setPeriod(p.v)} color="#00e5ff">
                  {p.label}
                </Pill>
              ))}
            </FilterCard>

            <span
              className="self-stretch w-px my-1"
              style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)' }}
            />

            {/* НАПРАВЛЕНИЕ */}
            <FilterCard
              label="Направление"
              hint="что ищем"
              accent="#7c5cff"
              icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7M17 7H9M17 7v8" /></svg>}
            >
              {DIRECTIONS.map((d) => (
                <Pill key={d.v} active={direction === d.v} onClick={() => setDirection(d.v)} color={d.color}>
                  {d.label}
                </Pill>
              ))}
            </FilterCard>

            <span
              className="self-stretch w-px my-1"
              style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)' }}
            />

            {/* МИН % */}
            <FilterCard
              label="Мин. %"
              hint="порог движения"
              accent="#ffb020"
              icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="5" x2="5" y2="19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></svg>}
            >
              {PCT_PRESETS.map((p) => (
                <Pill key={p} active={minPct === p} onClick={() => setMinPct(p)} color="#ffb020">
                  {p}%
                </Pill>
              ))}
            </FilterCard>

          </div>

          {/* ПОИСК — отдельной строкой внизу */}
          <div className="mt-3 flex items-stretch">
            <FilterCard
              label="Поиск"
              hint="по тикеру"
              accent="#00ff88"
              icon={<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>}
            >
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="введите тикер…"
                className="h-[32px] w-[320px] rounded-lg bg-black/40 px-3 font-mono text-[11px] text-white placeholder-mute/55 outline-none transition-all focus:bg-black/60"
                style={{ border: '1px solid rgba(255,255,255,0.06)', letterSpacing: '0.02em' }}
                onFocus={(e) => { e.target.style.borderColor = 'rgba(0,255,136,0.5)'; e.target.style.boxShadow = '0 0 14px rgba(0,255,136,0.2)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.06)'; e.target.style.boxShadow = 'none'; }}
              />
            </FilterCard>
          </div>
        </div>

        {/* ERROR */}
        {error && (
          <div className="shrink-0 border-b border-crimson/20 bg-crimson/[0.06] px-6 py-2 font-mono text-[10.5px] text-crimson">
            ⚠ {error}
          </div>
        )}

        {/* TABLE */}
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Заголовок колонок */}
          <div
            className="relative grid shrink-0 items-center gap-3 border-b border-white/[0.07] px-6 pb-3 pt-3.5 font-mono text-[9px] uppercase"
            style={{
              gridTemplateColumns: '36px 1.6fr 1fr 130px 1fr 1fr 110px 100px 90px',
              background: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.2) 100%)',
              color: 'rgba(180,188,200,0.65)',
              letterSpacing: '0.16em',
            }}
          >
            {/* верхний зеркальный блик */}
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-px"
              style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.10) 50%, transparent 100%)' }}
            />

            <div></div>

            {/* МОНЕТА */}
            <div className="flex items-center gap-1.5">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(0,229,255,0.5)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v8M9 10h4a2 2 0 0 1 0 4H9" />
              </svg>
              <span style={{ color: 'rgba(200,208,220,0.75)' }}>Монета</span>
            </div>

            {/* ЦЕНА */}
            <div className="flex items-center justify-end gap-1.5">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(0,229,255,0.5)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v20M17 5H9a3 3 0 0 0 0 6h6a3 3 0 0 1 0 6H6" />
              </svg>
              <span style={{ color: 'rgba(200,208,220,0.75)' }}>Цена</span>
            </div>

            {/* Δ 24Ч */}
            <div className="flex items-center justify-center gap-1.5">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,176,32,0.6)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 17l6-6 4 4 8-8" />
                <path d="M14 7h7v7" />
              </svg>
              <span style={{ color: 'rgba(255,200,140,0.8)' }}>Δ {periodLabel}</span>
            </div>

            {/* МАКСИМУМ */}
            <div className="flex items-center justify-end gap-1.5">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(0,255,136,0.55)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
              <span style={{ color: 'rgba(190,220,205,0.75)' }}>Максимум</span>
            </div>

            {/* МИНИМУМ */}
            <div className="flex items-center justify-end gap-1.5">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,51,102,0.55)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12l7 7 7-7" />
              </svg>
              <span style={{ color: 'rgba(220,190,195,0.75)' }}>Минимум</span>
            </div>

            {/* ОБОРОТ */}
            <div className="flex items-center justify-end gap-1.5">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(124,92,255,0.6)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3v18h18" />
                <path d="M7 14l4-4 3 3 6-6" />
              </svg>
              <span style={{ color: 'rgba(200,195,225,0.75)' }}>Оборот</span>
            </div>

            {/* FUNDING */}
            <div className="flex items-center justify-end gap-1.5">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(0,255,136,0.55)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4" />
              </svg>
              <span style={{ color: 'rgba(190,220,205,0.75)' }}>Funding</span>
            </div>

            {/* СИЛА */}
            <div className="flex items-center justify-center gap-1.5">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(255,176,32,0.6)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
              <span style={{ color: 'rgba(255,200,140,0.85)' }}>Сила</span>
              <InfoDot
                title="Сила движения"
                lines={[
                  'Интегральная оценка силы движения монеты.',
                  'Учитывает: изменение цены × оборот + funding.',
                  'Чем выше — тем сильнее аномалия.',
                  '🟢 5-20 · 🔵 20-50 · 🟡 50-100 · 🔴 100+',
                ]}
              />
            </div>
          </div>

          {/* Строки */}
          <div className="min-h-0 flex-1 overflow-y-auto" style={{ padding: '8px 16px' }}>
            {!data && !error && (
              <div className="flex h-full items-center justify-center font-mono text-[12px] text-mute">
                Загрузка данных с Bybit…
              </div>
            )}
            {data && filtered.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-2">
                <div className="font-mono text-[13px] text-mute">Нет монет по фильтру</div>
                <div className="font-mono text-[10px] text-mute/50">
                  Уменьши «Мин. %» или выбери другой период
                </div>
              </div>
            )}
            {filtered.map((c, i) => {
              const up = (c.change || 0) >= 0;
              const fundCls = Math.abs(c.funding) > 0.05 ? 'text-amber' : 'text-white/60';
              const sym = c.symbol || '';
              const coin = sym.replace('USDT', '');
              const dir = up ? '#00ff88' : '#ff3366';

              return (
                <div
                  key={sym + i}
                  className="group relative grid items-center gap-3 rounded-lg mb-1 px-4 py-2.5 transition-all duration-150 cursor-pointer"
                  style={{
                    gridTemplateColumns: '36px 1.6fr 1fr 130px 1fr 1fr 110px 100px 90px',
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.012) 0%, rgba(255,255,255,0.0) 100%)',
                    border: '1px solid rgba(255,255,255,0.035)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(90deg, ' + dir + '0d 0%, rgba(255,255,255,0.02) 15%, rgba(255,255,255,0.04) 100%)';
                    e.currentTarget.style.borderColor = dir + '40';
                    e.currentTarget.style.boxShadow = '0 0 20px -4px ' + dir + '30, inset 0 1px 0 rgba(255,255,255,0.04)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'linear-gradient(180deg, rgba(255,255,255,0.012) 0%, rgba(255,255,255,0.0) 100%)';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.035)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                  onClick={() => { if (onSelectSymbol) onSelectSymbol(sym); if (onClose) onClose(); }}
                >
                  {/* Цветная полоска слева (показывает направление) */}
                  <span
                    className="absolute left-0 top-1/2 h-6 w-[2px] -translate-y-1/2 rounded-r-full transition-all"
                    style={{
                      background: 'linear-gradient(180deg, transparent 0%, ' + dir + ' 50%, transparent 100%)',
                      opacity: 0.7,
                      boxShadow: '0 0 8px ' + dir + '80',
                    }}
                  />

                  {/* Номер */}
                  <div className="font-mono text-[10px] tabular-nums pl-1"
                       style={{ color: 'rgba(120,128,140,0.5)' }}>
                    {String(i + 1).padStart(2, '0')}
                  </div>

                  {/* Монета */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <CoinIcon symbol={sym} size={26} />
                    <span className="font-mono text-[13px] font-semibold tracking-tight text-white truncate">
                      {coin}
                      <span className="ml-1 text-[9px] font-normal" style={{ color: 'rgba(150,158,170,0.6)' }}>USDT</span>
                    </span>
                  </div>

                  {/* Цена */}
                  <div className="text-right font-mono text-[12px] tabular-nums text-white/95">
                    {fmtPrice(c.price)}
                  </div>

                  {/* Δ со sparkline */}
                  <div className="flex items-center justify-center gap-2">
                    <Sparkline pct={c.change || 0} />
                    <span
                      className="font-mono text-[12px] font-semibold tabular-nums min-w-[58px]"
                      style={{
                        color: up ? '#00ff88' : '#ff3366',
                        textShadow: '0 0 10px ' + (up ? 'rgba(0,255,136,0.5)' : 'rgba(255,51,102,0.5)'),
                      }}
                    >
                      {fmtPct(c.change || 0)}
                    </span>
                  </div>

                  {/* Max */}
                  <div className="text-right font-mono text-[11px] tabular-nums"
                       style={{ color: 'rgba(220,226,235,0.7)' }}>
                    {fmtPrice(c.high24h)}
                  </div>

                  {/* Min */}
                  <div className="text-right font-mono text-[11px] tabular-nums"
                       style={{ color: 'rgba(220,226,235,0.7)' }}>
                    {fmtPrice(c.low24h)}
                  </div>

                  {/* Оборот */}
                  <div className="text-right font-mono text-[11px] tabular-nums"
                       style={{ color: 'rgba(220,226,235,0.9)' }}>
                    {'$' + fmtM(c.turnover24h)}
                  </div>

                  {/* Funding */}
                  <div className={clsx('text-right font-mono text-[11px] tabular-nums', fundCls)}>
                    {fmtPct(c.funding)}
                  </div>

                  {/* Сила */}
                  <div className="flex items-center justify-center">
                    <ScoreBadge score={c.score || 0} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* FOOTER */}
        <div
          className="flex shrink-0 items-center justify-between border-t border-white/[0.06] px-6 py-2.5 font-mono text-[9.5px]"
          style={{ color: 'rgba(160,168,180,0.55)' }}
        >
          <div className="flex items-center gap-4">
            <span>Bybit v5 · обновление каждые 15 сек</span>
            <span style={{ color: 'rgba(160,168,180,0.3)' }}>·</span>
            <span>Клик по монете → откроется в терминале</span>
          </div>
          <div>Сортировка: по силе движения</div>
        </div>
      </div>
    </div>
  );
}
