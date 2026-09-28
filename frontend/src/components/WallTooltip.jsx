import React, { useEffect, useState } from 'react';
import { fmtUsd, fmtPrice, fmtLifespan } from '../lib/format';

const Row = ({ label, value, accent }) => (
  <div className="flex items-center justify-between gap-6">
    <span className="text-[10px] uppercase tracking-wider text-mute">{label}</span>
    <span className={`text-[12px] font-mono ${accent ? 'text-amber' : 'text-white/90'}`}>{value}</span>
  </div>
);

// ============================================================
// Sparkline: маленький график истории объёма стены
// ============================================================
function Sparkline({ points, color, height = 36, width = 200 }) {
  if (!points || points.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-md border border-line/50 bg-black/20 text-[9px] text-mute/60 font-mono"
        style={{ height, width }}
      >
        нет истории
      </div>
    );
  }

  const padX = 2, padY = 3;
  const xs = points.map((p) => p.t);
  const ys = points.map((p) => p.u);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const spanX = xMax - xMin || 1;
  const spanY = yMax - yMin || 1;

  const sx = (t) => padX + ((t - xMin) / spanX) * (width - padX * 2);
  const sy = (v) => height - padY - ((v - yMin) / spanY) * (height - padY * 2);

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(p.t).toFixed(1)} ${sy(p.u).toFixed(1)}`)
    .join(' ');

  const areaPath =
    `${linePath} L ${sx(xMax).toFixed(1)} ${height - padY} L ${sx(xMin).toFixed(1)} ${height - padY} Z`;

  const gradId = `spark_${color.replace('#', '')}`;

  return (
    <svg width={width} height={height} className="block">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* сетка: 3 горизонт. линии */}
      {[0.25, 0.5, 0.75].map((k) => (
        <line
          key={k}
          x1={padX} x2={width - padX}
          y1={padY + k * (height - padY * 2)}
          y2={padY + k * (height - padY * 2)}
          stroke="rgba(255,255,255,0.045)"
          strokeWidth="0.5"
        />
      ))}

      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.3" strokeLinejoin="round" />

      {/* последняя точка */}
      <circle cx={sx(xs[xs.length - 1])} cy={sy(ys[ys.length - 1])} r="1.8" fill={color} />
    </svg>
  );
}

const _cache = new Map();     // key → { ts, data }
const _CACHE_MS = 10000;      // 10 сек

export default function WallTooltip({ tooltip, symbol }) {
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(false);

  // Загружаем историю при появлении tooltip / смене стены
  useEffect(() => {
    if (!tooltip || !symbol) {
      setHistory(null);
      return;
    }
    const { cell } = tooltip;
    const ctrl = new AbortController();
    setLoading(true);

    const cacheKey = `${symbol}:${cell.side}:${cell.price}`;
    const cached = _cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < _CACHE_MS) {
      setHistory(cached.data);
      setLoading(false);
      return;
    }

    const url =
      `/api/wall_history?symbol=${encodeURIComponent(symbol)}` +
      `&price=${cell.price}&side=${cell.side}&minutes=60`;

    fetch(url, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setHistory(d);
          _cache.set(cacheKey, { ts: Date.now(), data: d });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    return () => ctrl.abort();
  }, [tooltip, symbol]);

  if (!tooltip) return null;
  const { x, y, cell } = tooltip;
  const isBid = cell.side === 'bid';
  const side = isBid ? 'BID' : 'ASK';
  const sideCls = isBid ? 'text-neon' : 'text-crimson';
  const borderCls = isBid ? 'border-neon/30' : 'border-crimson/30';
  const color = isBid ? '#00ff88' : '#ff3366';

  // если близко к верхнему краю — показываем вниз
  const flip = y < 220;

  const stats = history?.stats;
  const hasHistory = stats && stats.count >= 2;
  const changePct =
    hasHistory && stats.min > 0
      ? ((stats.max - stats.min) / stats.min) * 100
      : 0;

  return (
    <div
      className="pointer-events-none absolute z-40"
      style={{
        left: x + 16,
        top: flip ? y + 14 : y - 14,
        transform: flip ? 'none' : 'translateY(-100%)',
      }}
    >
      <div className={`glass min-w-[240px] rounded-xl border px-3.5 py-3 shadow-2xl ${borderCls}`}>
        {/* Заголовок */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-[0.2em] text-mute">
            Плотностная стена
          </span>
          <span className={`font-mono text-[10px] font-semibold ${sideCls}`}>{side}</span>
        </div>

        {/* Основные метрики */}
        <div className="space-y-1.5 font-mono">
          <Row label="Цена" value={fmtPrice(cell.price)} />
          <Row label="Объём" value={fmtUsd(cell.usd)} accent />
          <Row label="Удержано" value={fmtLifespan(cell.lifespan)} />
        </div>

        {/* История */}
        <div className="mt-3 border-t border-white/5 pt-2.5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[9px] uppercase tracking-wider text-mute">
              История (1 час)
            </span>
            {loading && (
              <span className="text-[9px] font-mono text-mute/60">…</span>
            )}
            {!loading && hasHistory && changePct > 0 && (
              <span className="text-[9px] font-mono text-amber">
                ±{changePct.toFixed(0)}%
              </span>
            )}
          </div>

          <Sparkline points={history?.points} color={color} />

          {hasHistory && (
            <div className="mt-1.5 flex items-center justify-between gap-2 font-mono text-[9px] text-mute">
              <span>min <span className="text-white/60">{fmtUsd(stats.min)}</span></span>
              <span>avg <span className="text-white/60">{fmtUsd(stats.avg)}</span></span>
              <span>max <span className="text-white/80">{fmtUsd(stats.max)}</span></span>
            </div>
          )}
        </div>

        {/* Полоска-индикатор размера */}
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.min(100, (cell.usd / 5000000) * 100)}%`,
              background: `linear-gradient(90deg,${color},#00e5ff,#ffb020)`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
