import React, { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

const MENU_ITEMS = [
  {
    id: 'pumpdump',
    label: 'Памп / Дамп скриннер',
    hint: 'Мониторинг аномальных движений',
    badge: 'soon',
    icon: 'rocket',
    color: '#ffb020',
  },
  {
    id: 'liquidations',
    label: 'Карта ликвидаций',
    hint: 'Live поток ликвидаций с биржи',
    badge: 'soon',
    icon: 'flame',
    color: '#ff3366',
  },
  {
    id: 'ta',
    label: 'Технический анализ',
    hint: 'Индикаторы, паттерны, сигналы',
    badge: 'soon',
    icon: 'chart',
    color: '#00e5ff',
  },
  {
    id: 'news',
    label: 'Новости и события',
    hint: 'Лента по монетам',
    badge: 'soon',
    icon: 'news',
    color: '#7c5cff',
  },
  {
    id: 'signals',
    label: 'Торговые сигналы',
    hint: 'Уведомления на пробои и стены',
    badge: 'soon',
    icon: 'bell',
    color: '#00ff88',
  },
  { id: 'sep1', type: 'sep' },
  {
    id: 'settings',
    label: 'Настройки терминала',
    hint: 'Внешний вид, алерты, API',
    icon: 'gear',
    color: '#9aa1ad',
  },
  {
    id: 'help',
    label: 'Справка',
    hint: 'Как пользоваться',
    icon: 'help',
    color: '#9aa1ad',
  },
];

function Icon({ kind, color, size = 18 }) {
  const s = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: color, strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round',
  };
  switch (kind) {
    case 'flame':
      return (
        <svg {...s}>
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      );
    case 'rocket':
      return (
        <svg {...s}>
          <path d="M5 15c-1 1-1 4-1 4s3 0 4-1l-3-3z" />
          <path d="M14 10l4-4c3 3 4 8 2 10-1.5 1.5-5 2-7 1l-6-6c-1-2 0-5.5 1-7 2-2 7-1 10 2z" />
          <circle cx="14" cy="10" r="1.5" />
        </svg>
      );
    case 'chart':
      return (
        <svg {...s}>
          <path d="M3 3v18h18" />
          <path d="M7 14l3-3 4 4 6-7" />
        </svg>
      );
    case 'news':
      return (
        <svg {...s}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M7 8h8M7 12h10M7 16h6" />
        </svg>
      );
    case 'bell':
      return (
        <svg {...s}>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a2 2 0 0 0 3.4 0" />
        </svg>
      );
    case 'gear':
      return (
        <svg {...s}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      );
    case 'help':
      return (
        <svg {...s}>
          <circle cx="12" cy="12" r="10" />
          <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12" y2="17.01" />
        </svg>
      );
    default:
      return null;
  }
}

export default function MainMenu({ onAction }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Меню"
        className={clsx(
          'flex h-7 items-center gap-1.5 rounded-lg border px-3 font-mono text-[11px] transition',
          open
            ? 'border-neon/50 bg-neon/10 text-neon'
            : 'border-line bg-panel2/90 text-mute hover:border-neon/40 hover:text-neon'
        )}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 3h8M2 6h8M2 9h8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <span>Меню</span>
        <svg
          width="9"
          height="9"
          viewBox="0 0 12 12"
          fill="none"
          className={clsx('transition-transform', open && 'rotate-180')}
        >
          <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          className="glass-panel absolute left-0 top-full z-[200] mt-2 w-[300px] rounded-xl p-1.5"
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
          {/* зеркальный блик сверху */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-[1px]"
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
          <div className="relative z-10 px-2.5 pb-1.5 pt-1">
            <span className="g-label text-[9px] uppercase tracking-[0.24em]">
              Меню ApexScalp
            </span>
          </div>

          <div className="relative z-10 flex flex-col gap-0.5">
            {MENU_ITEMS.map((item) => {
              if (item.type === 'sep') {
                return (
                  <div
                    key={item.id}
                    className="my-1 h-px bg-gradient-to-r from-transparent via-line to-transparent"
                  />
                );
              }
              const isSoon = item.badge === 'soon';
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onAction?.(item.id);
                    setOpen(false);
                  }}
                  className={clsx(
                    'group flex items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-all',
                    'border border-transparent hover:border-white/[0.06] hover:bg-white/[0.035]'
                  )}
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border"
                    style={{
                      borderColor: `${item.color}30`,
                      background: `${item.color}0d`,
                    }}
                  >
                    <Icon kind={item.icon} color={item.color} size={16} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-1.5">
                      <span className="g-item text-[12px] font-medium text-white">
                        {item.label}
                      </span>
                      {isSoon && (
                        <span
                          className="rounded font-mono text-[8px] uppercase tracking-wider"
                          style={{
                            background: `${item.color}20`,
                            color: item.color,
                            padding: '1px 4px',
                          }}
                        >
                          soon
                        </span>
                      )}
                    </span>
                    <span className="g-item-sub truncate text-[10px]">
                      {item.hint}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
