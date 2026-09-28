import React, { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

function fmtUsd(v) {
  if (!isFinite(v) || v === 0) return '$0';
  const a = Math.abs(v);
  if (a >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
  return '$' + v.toFixed(0);
}

function fmtTime(ts) {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString('ru-RU', { hour12: false });
}

function fmtP(v) {
  if (v == null || !isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1000) return v.toFixed(2);
  if (a >= 1) return v.toFixed(4);
  if (a >= 0.01) return v.toFixed(5);
  return v.toFixed(8);
}

const THRESHOLDS = [
  { v: 0,      label: 'Все' },
  { v: 50000,  label: '>$50K' },
  { v: 100000, label: '>$100K' },
  { v: 500000, label: '>$500K' },
  { v: 1000000, label: '>$1M' },
];

export default function LiquidationPanel({ symbols, onClose }) {
  const [active, setActive] = useState('BTCUSDT');
  const [search, setSearch] = useState('');
  const [minUsd, setMinUsd] = useState(0);
  const [events, setEvents] = useState([]);
  const [stats, setStats] = useState({ seen: 0, total_usd: 0 });
  const [loading, setLoading] = useState(false);

  const activeRef = useRef(active);
  useEffect(() => { activeRef.current = active; }, [active]);

  // загрузка initial + polling
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoading(true);

    const load = async () => {
      try {
        const r = await fetch(
          '/api/liquidations/live?symbol=' + active + '&limit=100&min_usd=' + minUsd
        );
        const d = await r.json();
        if (cancelled) return;
        setEvents(d.events || []);
      } catch (e) {
        console.error('liq load', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();

    const id = setInterval(load, 2000);
    return () => { cancelled = true; clearInterval(id); };
  }, [active, minUsd]);

  // stats — раз в 5 сек
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch('/api/liquidations/stats');
        const d = await r.json();
        if (!cancelled) setStats(d.engine || { seen: 0, total_usd: 0 });
      } catch (e) {}
    };
    load();
    const id = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const filtered = search.trim()
    ? (symbols || []).filter((s) => s.toUpperCase().includes(search.trim().toUpperCase())).slice(0, 80)
    : (symbols || []).slice(0, 80);

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}
      onClick={onClose}
    >
      <div
        className="relative flex flex-col overflow-hidden rounded-2xl"
        style={{
          width: '1200px',
          maxWidth: '96vw',
          height: '85vh',
          background: 'linear-gradient(180deg, rgba(16,20,26,0.99) 0%, rgba(6,8,12,0.99) 100%)',
          border: '1px solid rgba(255,255,255,0.10)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-white/[0.06] px-5 py-3">
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg"
              style={{
                background: 'linear-gradient(135deg, rgba(255,51,102,0.2), rgba(139,124,255,0.2))',
                border: '1px solid rgba(255,51,102,0.4)',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff3366" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <div>
              <div className="text-[16px] font-semibold text-white">Карта ликвидаций</div>
              <div className="text-[10.5px] text-mute mt-0.5 font-mono">
                {active.replace('USDT', '')} · Live поток · Всего: {stats.seen} · {fmtUsd(stats.total_usd)}
              </div>
            </div>
          </div>

          {/* Filter pills */}
          <div className="flex items-center gap-1 rounded-lg p-1"
               style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {THRESHOLDS.map((t) => {
              const isA = minUsd === t.v;
              return (
                <button
                  key={t.v}
                  onClick={() => setMinUsd(t.v)}
                  className="rounded-md px-2.5 py-1 font-mono text-[10px] transition-all"
                  style={isA ? {
                    color: '#fff',
                    background: 'linear-gradient(180deg, rgba(255,51,102,0.25) 0%, rgba(255,51,102,0.1) 100%)',
                    textShadow: '0 0 10px rgba(255,51,102,0.6)',
                  } : { color: 'rgba(150,158,170,0.7)' }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-mute hover:bg-white/[0.06] hover:text-white"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* BODY */}
        <div className="flex min-h-0 flex-1">
          {/* SIDEBAR */}
          <div className="flex w-[200px] shrink-0 flex-col border-r border-white/[0.06]">
            <div className="shrink-0 border-b border-white/[0.06] p-2.5">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск…"
                className="h-8 w-full rounded-lg border border-white/[0.06] bg-black/50 px-3 font-mono text-[11px] text-white placeholder-mute/60 outline-none focus:border-crimson/40"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto py-1">
              {filtered.map((sym) => {
                const isA = sym === active;
                return (
                  <button
                    key={sym}
                    onClick={() => setActive(sym)}
                    className="mx-2 flex w-[calc(100%-16px)] items-center gap-2 rounded-lg px-2.5 py-1.5 text-left"
                    style={isA ? {
                      background: 'linear-gradient(90deg, rgba(255,51,102,0.10) 0%, transparent 100%)',
                      border: '1px solid rgba(255,51,102,0.25)',
                    } : { border: '1px solid transparent' }}
                  >
                    <img
                      src={'/api/icon/' + sym.replace('USDT', '')}
                      width="22" height="22" loading="lazy"
                      onError={(e) => { e.target.style.display = 'none'; }}
                      className="rounded-full shrink-0"
                    />
                    <span
                      className="font-mono text-[12px] truncate"
                      style={{ color: isA ? '#ff3366' : 'rgba(230,235,245,0.85)' }}
                    >
                      {sym.replace('USDT', '')}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* LIVE FEED */}
          <div className="flex min-h-0 flex-1 flex-col">
            <div
              className="grid shrink-0 grid-cols-[100px_80px_120px_1fr_120px] items-center gap-3 border-b border-white/[0.06] px-5 py-2 font-mono text-[9px] uppercase tracking-[0.18em]"
              style={{ color: 'rgba(160,168,180,0.55)' }}
            >
              <div>Время</div>
              <div>Сторона</div>
              <div className="text-right">Объём</div>
              <div className="text-right">Цена</div>
              <div className="text-right">Размер</div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {!events.length && (
                <div className="flex h-full items-center justify-center font-mono text-[12px] text-mute">
                  {loading ? 'Загрузка…' : 'Ожидание ликвидаций…'}
                </div>
              )}
              {events.map((e, i) => {
                const isLong = e.side === 'long';
                const color = isLong ? '#ff3366' : '#00ff88';
                const sideText = isLong ? 'LONG' : 'SHORT';
                const big = e.usd >= 500000;
                return (
                  <div
                    key={i}
                    className="grid grid-cols-[100px_80px_120px_1fr_120px] items-center gap-3 border-b border-white/[0.02] px-5 py-1.5 font-mono text-[11px] tabular-nums transition-all hover:bg-white/[0.03]"
                    style={big ? { background: 'rgba(' + (isLong ? '255,51,102' : '0,255,136') + ',0.04)' } : undefined}
                  >
                    <div style={{ color: 'rgba(180,188,200,0.7)' }}>{fmtTime(e.ts)}</div>
                    <div style={{ color, fontWeight: 700 }}>{sideText}</div>
                    <div className="text-right" style={{ color: '#e6eaf0', fontWeight: 600 }}>
                      {fmtUsd(e.usd)}
                    </div>
                    <div className="text-right" style={{ color: 'rgba(200,208,220,0.7)' }}>
                      {fmtP(e.price)}
                    </div>
                    <div className="text-right" style={{ color: 'rgba(150,158,170,0.6)' }}>
                      {e.qty.toFixed(4)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
