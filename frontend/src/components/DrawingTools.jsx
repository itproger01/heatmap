import React, { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

export const TOOLS = [
  { id: 'hline',    label: 'Горизонтальная',  hint: 'Ценовой уровень',        icon: 'hline', color: '#c8cdd4' },
  { id: 'stoploss', label: 'Стоп-лосс',       hint: 'SL с меткой',            icon: 'sl',    color: '#e8b4b8' },
  { id: 'trendline',label: 'Трендовая',       hint: 'Линия по двум точкам',   icon: 'trend', color: '#c8cdd4' },
  { id: 'ray',      label: 'Луч',             hint: 'Продолжение вправо',     icon: 'ray',   color: '#c8cdd4' },
  { id: 'arrow',    label: 'Стрелка',         hint: 'Направление движения',   icon: 'arrow', color: '#d4d8de' },
  { id: 'ruler',    label: 'Линейка',         hint: '% / время / волатильность', icon: 'ruler', color: '#9aa1ad' },
];

function ToolIcon({ kind, color }) {
  const s = { stroke: color, strokeWidth: 1.2, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' };
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      {kind === 'hline' && <line x1="3" y1="12" x2="21" y2="12" {...s} />}
      {kind === 'sl' && (
        <>
          <line x1="3" y1="12" x2="21" y2="12" {...s} />
          <circle cx="6" cy="12" r="2" fill={color} stroke="none" />
          <text x="12" y="9" fontSize="7" fill={color} textAnchor="middle" fontFamily="monospace" fontWeight="700">SL</text>
        </>
      )}
      {kind === 'trend' && <line x1="3" y1="18" x2="21" y2="6" {...s} />}
      {kind === 'ray' && (
        <>
          <circle cx="4" cy="18" r="1.6" fill={color} stroke="none" />
          <line x1="4" y1="18" x2="21" y2="5" {...s} />
          <polyline points="18,4.5 21,5 20.5,8" {...s} />
        </>
      )}
      {kind === 'arrow' && (
        <>
          <line x1="4" y1="20" x2="20" y2="4" {...s} />
          <polyline points="13,4 20,4 20,11" {...s} />
        </>
      )}
      {kind === 'ruler' && (
        <>
          <rect x="3" y="9" width="18" height="6" rx="1" {...s} />
          <line x1="7"  y1="9" x2="7"  y2="12" {...s} />
          <line x1="12" y1="9" x2="12" y2="14" {...s} />
          <line x1="17" y1="9" x2="17" y2="12" {...s} />
        </>
      )}
    </svg>
  );
}

export default function DrawingTools({ open, onClose, activeTool, onSelect, onClearAll, count }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={ref}
      className="glass absolute right-0 top-full z-[200] mt-1.5 w-[260px] rounded-xl border border-white/10 p-1.5 shadow-2xl"
      style={{
            background: [
              // верхний зеркальный блик
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
    >
      <div className="flex items-center justify-between px-2.5 pb-1.5 pt-1">
        <span className="g-label text-[9px] uppercase tracking-[0.24em]">Инструменты</span>
        {count > 0 && (
          <button
            onClick={onClearAll}
            className="g-text flex items-center gap-1 rounded-md border border-crimson/40 bg-crimson/[0.12] px-1.5 py-0.5 font-mono text-[9px] text-crimson transition hover:border-crimson/70 hover:bg-crimson/20 hover:text-crimson"
          >
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            </svg>
            <span>все ({count})</span>
          </button>
        )}
      </div>

      <div className="relative z-10 flex flex-col gap-0.5">
        {TOOLS.map((t) => {
          const active = activeTool === t.id;
          return (
            <button
              key={t.id}
              onClick={() => { onSelect(t.id); onClose(); }}
              className={clsx(
                'flex items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-all',
                active
                  ? 'bg-white/[0.06] border border-white/10'
                  : 'border border-transparent hover:bg-white/[0.035]'
              )}
            >
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border"
                style={{
                  borderColor: active ? 'rgba(200,215,230,0.55)' : 'rgba(255,255,255,0.06)',
                  background: active ? 'rgba(200,215,230,0.08)' : 'rgba(255,255,255,0.02)',
                }}
              >
                <ToolIcon kind={t.icon} color={t.color} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="g-item text-[12px] font-medium text-white">{t.label}</span>
                <span className="g-item-sub truncate text-[10px]">{t.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="g-item-sub mt-1.5 flex items-center gap-2 border-t border-white/10 px-2.5 pt-1.5 pb-1 font-mono text-[9px]">
        <span>наведи → ✕ удалить</span>
        <span className="text-mute/30">·</span>
        <span>тяни за тело / конец</span>
      </div>
    </div>
  );
}
