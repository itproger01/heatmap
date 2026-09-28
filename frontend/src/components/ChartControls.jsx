import React, { useState } from 'react';
import clsx from 'clsx';
import DrawingTools from './DrawingTools';

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

export default function ChartControls({
  resolution, setResolution,
  onOpenSettings,
  activeTool, setActiveTool,
  drawingsCount, onClearDrawings,
  sidebarOpen, onToggleSidebar,
}) {
  const [toolsOpen, setToolsOpen] = useState(false);

  return (
    <div className="relative z-40 flex items-center gap-2.5 border-b border-line bg-panel/60 px-3 py-1.5 backdrop-blur">

      {onToggleSidebar && (
        <button
          onClick={onToggleSidebar}
          title={sidebarOpen ? 'Скрыть список монет' : 'Показать список монет'}
          className="flex h-6 items-center gap-1.5 rounded-md border border-line bg-panel2/90 px-2 font-mono text-[10px] text-mute transition hover:border-neon/40 hover:text-neon"
        >
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M2 3h8M2 6h8M2 9h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <span>Монеты</span>
        </button>
      )}

      <span className="text-[9px] uppercase tracking-[0.18em] text-mute">
        ТФ
      </span>

      <div className="flex items-center gap-0.5 rounded-lg border border-line bg-panel2/90 p-[3px] shadow-inner">
        {TIMEFRAMES.map((tf) => {
          const isActive = resolution === tf.v;
          return (
            <button
              key={tf.v}
              onClick={() => setResolution(tf.v)}
              className={clsx(
                'relative rounded-md px-2 py-[3px] font-mono text-[10px] font-medium leading-none tracking-tight transition-all duration-150',
                isActive
                  ? 'text-obsidian'
                  : 'text-mute hover:text-white/90 hover:bg-white/[0.04]'
              )}
              style={
                isActive
                  ? {
                      background: 'linear-gradient(180deg, #00ff88 0%, #00d676 100%)',
                      boxShadow: '0 0 8px rgba(0,255,136,0.4), inset 0 1px 0 rgba(255,255,255,0.3)',
                    }
                  : undefined
              }
            >
              {tf.label}
            </button>
          );
        })}
      </div>

      <div className="relative ml-auto">
        <button
          onClick={() => setToolsOpen((v) => !v)}
          className={clsx(
            'flex h-6 items-center gap-1.5 rounded-md border px-2 font-mono text-[10px] transition',
            toolsOpen || activeTool
              ? 'border-cyan/50 bg-cyan/10 text-cyan'
              : 'border-line bg-panel2/90 text-mute hover:border-cyan/40 hover:text-cyan'
          )}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
          <span>Инструменты</span>
          {drawingsCount > 0 && (
            <span className="rounded-full bg-cyan/20 px-1.5 py-[1px] text-[9px] text-cyan">
              {drawingsCount}
            </span>
          )}
        </button>

        <DrawingTools
          open={toolsOpen}
          onClose={() => setToolsOpen(false)}
          activeTool={activeTool}
          onSelect={(t) => setActiveTool(activeTool === t ? null : t)}
          onClearAll={onClearDrawings}
          count={drawingsCount || 0}
        />
      </div>

      <button
        onClick={onOpenSettings}
        className="rounded-lg border border-line bg-panel2/90 px-2.5 py-[4px] font-mono text-[10px] text-mute transition hover:border-neon/40 hover:text-neon"
      >
        ⚙ Фильтр
      </button>
    </div>
  );
}
