import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FixedSizeList as List } from 'react-window';
import clsx from 'clsx';
import { coinLabel } from '../lib/format';

const ICON_SIZE = 22;
const failedIcons = new Set();

function badgeColor(symbol) {
  let h = 0;
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) | 0;
  const hues = [160, 190, 210, 280, 320, 350, 30, 50];
  const hue = hues[Math.abs(h) % hues.length];
  return `linear-gradient(135deg, hsl(${hue},75%,55%), hsl(${(hue + 40) % 360},70%,45%))`;
}

function CoinIcon({ symbol }) {
  const coin = useMemo(() => coinLabel(symbol), [symbol]);
  const [failed, setFailed] = useState(() => failedIcons.has(coin));
  useEffect(() => { setFailed(failedIcons.has(coin)); }, [coin]);

  if (failed) {
    return (
      <span
        className="flex items-center justify-center rounded-full font-mono text-[10px] font-bold text-white shadow-inner"
        style={{
          width: ICON_SIZE, height: ICON_SIZE,
          background: badgeColor(coin),
          flex: `0 0 ${ICON_SIZE}px`,
          textShadow: '0 1px 1px rgba(0,0,0,0.4)',
        }}
      >
        {coin[0]}
      </span>
    );
  }
  return (
    <img
      src={`/api/icon/${coin}`}
      alt={coin}
      width={ICON_SIZE}
      height={ICON_SIZE}
      loading="lazy"
      onError={() => { failedIcons.add(coin); setFailed(true); }}
      className="rounded-full"
      style={{ flex: `0 0 ${ICON_SIZE}px`, width: ICON_SIZE, height: ICON_SIZE }}
    />
  );
}

export default function Sidebar({ symbols, scores, active, onSelect, connected, onClose }) {
  const [query, setQuery] = useState('');
  const [height, setHeight] = useState(600);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!boxRef.current) return;
    const ro = new ResizeObserver(([e]) => setHeight(e.contentRect.height));
    ro.observe(boxRef.current);
    return () => ro.disconnect();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    return q ? symbols.filter((s) => s.includes(q)) : symbols;
  }, [symbols, query]);

  const Row = useCallback(({ index, style }) => {
    const sym = filtered[index];
    const isActive = sym === active;
    return (
      <div style={style}>
        <button
          onClick={() => onSelect(sym)}
          className={clsx(
            'group mx-2 flex w-[calc(100%-16px)] items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-all',
            isActive
              ? 'bg-gradient-to-r from-neon/10 to-transparent border border-neon/25'
              : 'hover:bg-white/[0.03] border border-transparent'
          )}
        >
          <CoinIcon symbol={sym} />
          <span className={clsx('font-mono text-[13px] font-medium tracking-tight truncate',
            isActive ? 'text-neon neon-text' : 'text-white/90')}>
            {coinLabel(sym)}
            <span className="ml-1 text-[10px] text-mute">USDT</span>
          </span>
        </button>
      </div>
    );
  }, [filtered, active, onSelect]);

  return (
    <aside className="flex h-full w-[240px] flex-col border-r border-line bg-panel">
      <div className="flex items-center justify-between px-4 pt-4">
        <div className="flex items-center gap-2.5">
          <svg width="28" height="28" viewBox="0 0 30 30" fill="none" className="shrink-0">
            <defs>
              <linearGradient id="asMark" x1="15" y1="2" x2="15" y2="28" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="55%" stopColor="#c8cdd4" />
                <stop offset="100%" stopColor="#6f7681" />
              </linearGradient>
            </defs>
            <path d="M 4 25 L 15 5 L 26 25" stroke="url(#asMark)" strokeWidth="1.6" strokeLinejoin="miter" strokeLinecap="square" />
            <path d="M 8 25 L 22 25" stroke="url(#asMark)" strokeWidth="0.8" strokeOpacity="0.55" />
            <circle cx="15" cy="5" r="1.05" fill="#00e0a4" />
          </svg>
          <div
            className="text-[15px] font-bold tracking-[-0.02em]"
            style={{
              backgroundImage:
                'linear-gradient(180deg, #ffffff 0%, #e8eaee 30%, #b8bdc6 55%, #8a919c 80%, #d4d8de 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
              filter: 'drop-shadow(0 1px 0 rgba(0,0,0,0.6))',
            }}
          >
            ApexScalp
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            title="Скрыть панель"
            className="flex h-7 w-7 items-center justify-center rounded-md text-mute transition hover:bg-white/[0.06] hover:text-white"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}
      </div>

      <div className="px-4 pt-3">
        <input value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск монеты…"
          className="w-full rounded-lg border border-line bg-panel2 px-3 py-2 text-[12px] text-white placeholder-mute outline-none transition focus:border-neon/40 focus:shadow-glow font-mono" />
      </div>

      <div ref={boxRef} className="flex-1 min-h-0 pt-3">
        <List height={height} width="100%" itemCount={filtered.length} itemSize={46}>
          {Row}
        </List>
      </div>
    </aside>
  );
}
