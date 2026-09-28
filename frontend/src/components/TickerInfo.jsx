import React, { useEffect, useState } from 'react';
import { fmtPrice } from '../lib/format';

const POLL_MS = 15000;

function fmtPct(v) {
  if (!isFinite(v)) return '—';
  const sign = v > 0 ? '+' : '';
  return sign + v.toFixed(2) + '%';
}

function fmtVolume(v) {
  if (!isFinite(v) || v === 0) return '—';
  if (v >= 1e9) return (v / 1e9).toFixed(2) + ' млрд';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + ' млн';
  if (v >= 1e3) return (v / 1e3).toFixed(2) + ' тыс';
  return v.toFixed(2);
}

function RichLabel({ children }) {
  return (
    <span
      className="text-[9px] uppercase"
      style={{
        fontFamily: '"Chakra Petch", "Inter", system-ui, sans-serif',
        fontWeight: 500,
        letterSpacing: '0.16em',
        color: 'rgba(180,188,200,0.62)',
        textShadow: '0 1px 2px rgba(0,0,0,0.6)',
      }}
    >
      {children}
    </span>
  );
}

function RichValue({ children, color, accent, big }) {
  return (
    <span
      className="tabular-nums truncate"
      style={{
        fontFamily: '"Inter", system-ui, sans-serif',
        fontWeight: 600,
        fontSize: big ? '13px' : '12px',
        letterSpacing: '-0.01em',
        color: color || '#eef1f6',
        textShadow: accent
          ? '0 0 14px ' + accent + '50, 0 1px 2px rgba(0,0,0,0.5)'
          : '0 1px 2px rgba(0,0,0,0.4)',
      }}
    >
      {children}
    </span>
  );
}

function RichSub({ children }) {
  return (
    <span
      className="tabular-nums truncate"
      style={{
        fontFamily: '"Inter", system-ui, sans-serif',
        fontWeight: 400,
        fontSize: '9.5px',
        letterSpacing: '0.02em',
        color: 'rgba(155,163,175,0.6)',
      }}
    >
      {children}
    </span>
  );
}

function StatBlock({ label, value, sub, color, accent, big }) {
  return (
    <div className="flex flex-col gap-[3px] min-w-0">
      <RichLabel>{label}</RichLabel>
      <RichValue color={color} accent={accent} big={big}>{value}</RichValue>
      {sub && <RichSub>{sub}</RichSub>}
    </div>
  );
}

function Divider() {
  return (
    <span
      className="self-stretch w-px"
      style={{
        background:
          'linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.12) 50%, transparent 100%)',
      }}
    />
  );
}

// ============================================================
// ИКОНКА «?» с тултипом
// ============================================================
function InfoDot({ title, lines }) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        className="flex h-[11px] w-[11px] items-center justify-center rounded-full cursor-help"
        style={{
          border: '1px solid rgba(180,188,200,0.4)',
          background: 'rgba(255,255,255,0.03)',
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: '8px',
          fontWeight: 600,
          color: 'rgba(200,208,220,0.7)',
          lineHeight: 1,
        }}
      >
        ?
      </span>

      {open && (
        <div
          className="absolute left-1/2 top-full z-[9999] -translate-x-1/2 mt-2 w-[280px] rounded-xl p-3.5 pointer-events-none"
          style={{
            background:
              'linear-gradient(180deg, rgba(38,42,50,0.96) 0%, rgba(20,23,28,0.98) 100%)',
            backdropFilter: 'blur(20px) saturate(130%)',
            WebkitBackdropFilter: 'blur(20px) saturate(130%)',
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow:
              '0 20px 50px -10px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.08)',
          }}
        >
          {/* зеркальный блик */}
          <div
            className="absolute inset-x-0 top-0 h-px"
            style={{
              background:
                'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)',
            }}
          />
          <div
            className="mb-1.5 text-[10px] font-semibold text-white"
            style={{
              fontFamily: '"Chakra Petch", system-ui, sans-serif',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              textShadow: '0 1px 3px rgba(0,0,0,0.9)',
            }}
          >
            {title}
          </div>
          <div
            className="space-y-1.5 text-[10.5px] leading-[1.5]"
            style={{
              fontFamily: 'Inter, system-ui, sans-serif',
              fontWeight: 400,
              color: 'rgba(220,226,235,0.85)',
            }}
          >
            {lines.map((line, i) => (
              <div key={i} className="flex gap-1.5">
                <span style={{ color: 'rgba(0,229,255,0.6)', flexShrink: 0 }}>▸</span>
                <span>{line}</span>
              </div>
            ))}
          </div>
          {/* стрелка вверх */}
          <div
            className="absolute left-1/2 top-[-5px] h-2 w-2 -translate-x-1/2 rotate-45"
            style={{
              background: 'rgba(38,42,50,0.96)',
              borderLeft: '1px solid rgba(255,255,255,0.12)',
              borderTop: '1px solid rgba(255,255,255,0.12)',
            }}
          />
        </div>
      )}
    </span>
  );
}

export default function TickerInfo({ symbol }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    let timer = 0;

    const load = async () => {
      setLoading(true);
      try {
        const r = await fetch('/api/ticker_info?symbol=' + symbol);
        const d = await r.json();
        if (!cancelled && !d.error) setData(d);
      } catch (_) {}
      if (!cancelled) setLoading(false);
      if (!cancelled) timer = setTimeout(load, POLL_MS);
    };
    load();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [symbol]);

  if (!data) {
    return (
      <div
        className="flex items-center gap-3 opacity-40"
        style={{
          fontFamily: '"Chakra Petch", system-ui, sans-serif',
          letterSpacing: '0.16em',
          fontSize: '10px',
          textTransform: 'uppercase',
          color: 'rgba(180,188,200,0.6)',
        }}
      >
        <span>Загрузка…</span>
      </div>
    );
  }

  const changePct = data.priceChangePct || 0;
  const isUp = changePct >= 0;
  const funding = data.fundingRate || 0;
  const fundingPct = funding * 100;
  const fundingColor = funding > 0 ? '#00ff88' : funding < 0 ? '#ff3366' : '#8b95a5';

  const range = (data.high24h - data.low24h) || 1;
  const pos = Math.max(0, Math.min(1, (data.price - data.low24h) / range));

  return (
    <div
      className="relative flex items-center gap-5 px-4 py-1.5 rounded-xl overflow-visible"
      style={{
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.012) 100%)',
        border: '1px solid rgba(255,255,255,0.07)',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.06), 0 2px 6px -2px rgba(0,0,0,0.5)',
      }}
    >
      {/* 24h Change */}
      <div className="flex flex-col gap-[3px] min-w-0">
        <span className="flex items-center gap-1.5">
          <RichLabel>За 24 часа</RichLabel>
          <InfoDot
            title="Изменение за 24 часа"
            lines={[
              'На сколько процентов изменилась цена монеты за последние 24 часа.',
              '🟢 Зелёный — цена выросла.',
              '🔴 Красный — цена упала.',
            ]}
          />
        </span>
        <RichValue color={isUp ? '#00ff88' : '#ff3366'} accent={isUp ? '#00ff88' : '#ff3366'} big>
          {fmtPct(changePct)}
        </RichValue>
      </div>

      <Divider />

      <StatBlock label="Максимум" value={fmtPrice(data.high24h)} />
      <StatBlock label="Минимум" value={fmtPrice(data.low24h)} />

      <Divider />

      <StatBlock
        label="Оборот"
        value={'$' + fmtVolume(data.turnover24h)}
        sub={fmtVolume(data.volume24h) + ' ' + symbol.replace('USDT', '')}
      />

      <Divider />

      <StatBlock
        label="Финансирование"
        value={fmtPct(fundingPct)}
        color={fundingColor}
        accent={fundingColor}
      />

      {/* ПОЗИЦИЯ В ДНЕ с тултипом */}
      <div className="flex flex-col gap-[3px] min-w-[90px]">
        <span className="flex items-center gap-1.5">
          <RichLabel>Позиция в дне</RichLabel>
          <InfoDot
            title="Позиция в дне"
            lines={[
              'Где текущая цена находится между минимумом и максимумом за 24 часа.',
              '0% — у минимума дня (потенциальная поддержка).',
              '100% — у максимума дня (потенциальное сопротивление).',
              'Помогает понять: цена у дна, в середине или у вершины дневного диапазона.',
            ]}
          />
        </span>
        <div
          className="relative h-[3px] w-full rounded-full"
          style={{
            background:
              'linear-gradient(90deg, rgba(255,51,102,0.5) 0%, rgba(120,130,145,0.35) 50%, rgba(0,255,136,0.5) 100%)',
          }}
        >
          <span
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-[7px] w-[7px] rounded-full"
            style={{
              left: pos * 100 + '%',
              background: '#ffffff',
              boxShadow:
                '0 0 6px rgba(255,255,255,0.95), 0 0 14px rgba(255,255,255,0.5)',
            }}
          />
        </div>
        <RichSub>{(pos * 100).toFixed(0)}% от диапазона</RichSub>
      </div>
    </div>
  );
}
