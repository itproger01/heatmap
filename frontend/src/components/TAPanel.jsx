import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart } from 'lightweight-charts';
import HelpModal from './HelpModal';

const INTERVALS = [
  { v: '15m', label: '15м' },
  { v: '1h',  label: '1ч' },
  { v: '4h',  label: '4ч' },
  { v: '1d',  label: '1д' },
];

function fmtP(v) {
  if (v == null || !isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1000) return v.toFixed(2);
  if (a >= 1) return v.toFixed(4);
  if (a >= 0.01) return v.toFixed(5);
  return v.toFixed(8);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export default function TAPanel({ symbols, active, onClose, onSelectSymbol }) {
  const [symbol, setSymbol] = useState(active || 'BTCUSDT');
  const [interval, setIntervalV] = useState('1h');
  const [data, setData] = useState(null);
  const [candles, setCandles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  const hostRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const canvasRef = useRef(null);
  const overlayRafRef = useRef(0);
  const dataRef = useRef(null);

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const [kRes, taRes] = await Promise.all([
          fetch('/api/klines?symbol=' + symbol + '&interval=' + interval + '&limit=200').then(r => r.json()),
          fetch('/api/ta_analysis?symbol=' + symbol + '&interval=' + interval + '&limit=200').then(r => r.json()),
        ]);
        if (cancelled) return;
        if (taRes.error) setError(taRes.error);
        else setData(taRes);
        setCandles(kRes.candles || []);
      } catch (e) {
        if (!cancelled) setError(String(e).slice(0, 100));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [symbol, interval]);

  useEffect(() => {
    if (!hostRef.current) return;
    const chart = createChart(hostRef.current, {
      layout: {
        background: { type: 'solid', color: 'transparent' },
        textColor: '#8b95a5',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.025)' },
        horzLines: { color: 'rgba(255,255,255,0.025)' },
      },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.06)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.06)', timeVisible: true },
      crosshair: { mode: 1 },
      autoSize: false,
    });

    const cs = chart.addCandlestickSeries({
      upColor: '#00e070',
      downColor: '#ff2d55',
      borderUpColor: '#00ff88',
      borderDownColor: '#ff3366',
      wickUpColor: '#00ff88',
      wickDownColor: '#ff3366',
    });

    chartRef.current = chart;
    seriesRef.current = cs;

    const ro = new ResizeObserver(() => {
      if (hostRef.current) {
        chart.resize(hostRef.current.clientWidth, hostRef.current.clientHeight);
        scheduleOverlay();
      }
    });
    ro.observe(hostRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  const scheduleOverlay = useCallback(() => {
    if (overlayRafRef.current) return;
    overlayRafRef.current = requestAnimationFrame(() => {
      overlayRafRef.current = 0;
      drawOverlay();
    });
  }, []);

  const drawOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    const chart = chartRef.current;
    const series = seriesRef.current;
    const ta = dataRef.current;
    if (!canvas || !chart || !series || !ta) return;

    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (cw === 0 || ch === 0) return;
    if (canvas.width !== Math.floor(cw * dpr) || canvas.height !== Math.floor(ch * dpr)) {
      canvas.width = Math.floor(cw * dpr);
      canvas.height = Math.floor(ch * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    const ts = chart.timeScale();
    const toX = (t) => ts.timeToCoordinate(t);
    const toY = (p) => series.priceToCoordinate(p);

    let paneW = cw;
    try {
      const pw = chart.priceScale('right').width();
      if (pw) paneW = cw - pw;
    } catch (e) {}

    const drawLevel = (lv, rgb, hex) => {
      const y = toY(lv.price);
      if (y == null || y < 0 || y > ch - 20) return;

      const bandH = 28;
      const bandTop = y - bandH / 2;
      const gradBand = ctx.createLinearGradient(0, bandTop, 0, bandTop + bandH);
      gradBand.addColorStop(0, 'rgba(' + rgb + ',0)');
      gradBand.addColorStop(0.5, 'rgba(' + rgb + ',0.10)');
      gradBand.addColorStop(1, 'rgba(' + rgb + ',0)');
      ctx.fillStyle = gradBand;
      ctx.fillRect(0, bandTop, paneW, bandH);

      const gradLine = ctx.createLinearGradient(0, 0, paneW, 0);
      gradLine.addColorStop(0, 'rgba(' + rgb + ',0.15)');
      gradLine.addColorStop(0.08, 'rgba(' + rgb + ',0.8)');
      gradLine.addColorStop(0.92, 'rgba(' + rgb + ',0.8)');
      gradLine.addColorStop(1, 'rgba(' + rgb + ',0.15)');
      ctx.strokeStyle = gradLine;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(paneW, y + 0.5);
      ctx.stroke();

      const pts = lv.points_t || [];
      for (const t of pts) {
        const px = toX(t);
        if (px == null || px < 0 || px > paneW) continue;
        ctx.strokeStyle = hex;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(px, y - 8);
        ctx.lineTo(px, y + 8);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(' + rgb + ',0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(px, y, 7, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = hex;
        ctx.beginPath();
        ctx.arc(px, y, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.arc(px, y, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }

      const priceTxt = lv.price >= 1000 ? lv.price.toFixed(0) : lv.price.toFixed(4);
      const touchesTxt = (lv.touches || 0) + ' кас.';

      ctx.font = '700 11px JetBrains Mono, monospace';
      const mPrice = ctx.measureText(priceTxt);
      ctx.font = '600 10px JetBrains Mono, monospace';
      const mTouch = ctx.measureText(touchesTxt);

      const pw = mPrice.width + mTouch.width + 24;
      const ph = 22;
      const px = paneW - pw - 4;
      const py = y - ph / 2;

      const gradPill = ctx.createLinearGradient(px, 0, px + pw, 0);
      gradPill.addColorStop(0, 'rgba(8,10,14,0.96)');
      gradPill.addColorStop(1, 'rgba(' + rgb + ',0.15)');
      ctx.fillStyle = gradPill;
      roundRect(ctx, px, py, pw, ph, 5);
      ctx.fill();

      ctx.fillStyle = hex;
      roundRect(ctx, px, py + 3, 3, ph - 6, 1.5);
      ctx.fill();

      ctx.strokeStyle = hex;
      ctx.lineWidth = 1.2;
      roundRect(ctx, px, py, pw, ph, 5);
      ctx.stroke();

      ctx.fillStyle = hex;
      ctx.textBaseline = 'middle';
      ctx.font = '700 11px JetBrains Mono, monospace';
      ctx.fillText(priceTxt, px + 10, py + ph / 2 + 0.5);

      ctx.font = '600 10px JetBrains Mono, monospace';
      ctx.fillStyle = 'rgba(' + rgb + ',0.75)';
      ctx.fillText(touchesTxt, px + 10 + mPrice.width + 6, py + ph / 2 + 0.5);
    };

    (ta.support_levels || []).slice(0, 3).forEach((lv) => drawLevel(lv, '0,255,136', '#00ff88'));
    (ta.resistance_levels || []).slice(0, 3).forEach((lv) => drawLevel(lv, '255,51,102', '#ff3366'));

    const p = ta.pattern || {};
    const showPattern = p.pattern &&
      p.pattern !== 'нет чёткого паттерна' &&
      p.pattern !== 'недостаточно данных' &&
      p.confidence >= 50 &&
      p.lines && p.lines.length === 2;

    if (showPattern) {
      const upper = p.lines.find((l) => l.type === 'upper');
      const lower = p.lines.find((l) => l.type === 'lower');

      if (upper && lower) {
        const ux1 = toX(upper.time1);
        const uy1 = toY(upper.y1);
        const ux2 = toX(upper.time2);
        const uy2 = toY(upper.y2);
        const lx1 = toX(lower.time1);
        const ly1 = toY(lower.y1);
        const lx2 = toX(lower.time2);
        const ly2 = toY(lower.y2);

        if (ux1 != null && uy1 != null && ux2 != null && uy2 != null &&
            lx1 != null && ly1 != null && lx2 != null && ly2 != null) {

          const upperColor = 'rgba(217,74,99,0.85)';
          const lowerColor = 'rgba(62,207,154,0.85)';

          ctx.strokeStyle = upperColor;
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(ux1, uy1);
          ctx.lineTo(ux2, uy2);
          ctx.stroke();

          ctx.strokeStyle = lowerColor;
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(lx1, ly1);
          ctx.lineTo(lx2, ly2);
          ctx.stroke();

          ctx.fillStyle = upperColor;
          ctx.beginPath(); ctx.arc(ux1, uy1, 3, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = lowerColor;
          ctx.beginPath(); ctx.arc(lx1, ly1, 3, 0, Math.PI * 2); ctx.fill();

          ctx.beginPath();
          ctx.moveTo(ux1, uy1);
          ctx.lineTo(ux2, uy2);
          ctx.lineTo(lx2, ly2);
          ctx.lineTo(lx1, ly1);
          ctx.closePath();
          ctx.fillStyle = 'rgba(139,124,255,0.05)';
          ctx.fill();

          const conf = p.confidence || 0;
          const txt = p.pattern + '  ·  ' + conf + '%';
          ctx.font = '600 11px JetBrains Mono, monospace';
          const m = ctx.measureText(txt);
          const lw = m.width + 20;
          const lh = 22;
          let lx = ux1 - 4;
          let ly = uy1 - 30;
          if (ly < 4) ly = uy1 + 8;
          if (lx + lw > paneW) lx = paneW - lw - 4;
          if (lx < 4) lx = 4;

          ctx.fillStyle = 'rgba(30,20,60,0.94)';
          roundRect(ctx, lx, ly, lw, lh, 5);
          ctx.fill();
          ctx.strokeStyle = 'rgba(139,124,255,0.85)';
          ctx.lineWidth = 1.2;
          roundRect(ctx, lx, ly, lw, lh, 5);
          ctx.stroke();

          ctx.fillStyle = '#8b7cff';
          ctx.font = '600 12px JetBrains Mono, monospace';
          ctx.textBaseline = 'middle';
          ctx.fillText('◆', lx + 8, ly + lh / 2 + 0.5);

          ctx.fillStyle = '#c8a8ff';
          ctx.font = '600 11px JetBrains Mono, monospace';
          ctx.fillText(txt, lx + 22, ly + lh / 2 + 0.5);
        }
      }
    }
  }, []);

  useEffect(() => {
    if (!seriesRef.current || !candles.length) return;
    seriesRef.current.setData(candles);
    if (chartRef.current) chartRef.current.timeScale().fitContent();
    scheduleOverlay();
  }, [candles, scheduleOverlay]);

  useEffect(() => {
    dataRef.current = data;
    scheduleOverlay();
  }, [data, scheduleOverlay]);

  useEffect(() => {
    const chart = chartRef.current;
    const canvas = canvasRef.current;
    if (!chart || !canvas) return;
    const ts = chart.timeScale();
    const h = () => scheduleOverlay();
    ts.subscribeVisibleLogicalRangeChange(h);
    const ro = new ResizeObserver(() => scheduleOverlay());
    ro.observe(canvas);
    return () => {
      ts.unsubscribeVisibleLogicalRangeChange(h);
      ro.disconnect();
    };
  }, [scheduleOverlay]);

  const filtered = search.trim()
    ? symbols.filter(s => s.toUpperCase().includes(search.trim().toUpperCase())).slice(0, 80)
    : symbols.slice(0, 80);

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}
      onClick={onClose}
    >
      <div
        className="relative flex flex-col overflow-hidden rounded-2xl"
        style={{
          width: '1400px',
          maxWidth: '98vw',
          height: '94vh',
          background: 'linear-gradient(180deg, rgba(16,20,26,0.99) 0%, rgba(6,8,12,0.99) 100%)',
          border: '1px solid rgba(255,255,255,0.10)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-white/[0.06] px-5 py-2.5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg"
                 style={{ background: 'linear-gradient(135deg, rgba(0,229,255,0.18), rgba(124,92,255,0.18))',
                          border: '1px solid rgba(0,229,255,0.4)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00e5ff" strokeWidth="1.8">
                <path d="M3 3v18h18" />
                <path d="M7 14l3-3 4 4 6-7" />
              </svg>
            </div>
            <div>
              <div className="text-[15px] font-semibold text-white">Технический анализ</div>
              <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px]" style={{ color: 'rgba(180,188,200,0.7)' }}>
                <span>{symbol.replace('USDT', '')} · {interval}</span>
                {loading && <span className="text-amber animate-pulse">· анализ…</span>}
                {data && <span>· {data.candles_count} свечей</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-0 rounded-lg overflow-hidden"
               style={{ background: 'rgba(20,24,30,0.85)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {INTERVALS.map((iv) => {
              const isA = interval === iv.v;
              return (
                <button
                  key={iv.v}
                  onClick={() => setIntervalV(iv.v)}
                  className="px-3 py-1.5 font-mono text-[10px] transition-all"
                  style={isA ? {
                    color: '#fff',
                    background: 'linear-gradient(180deg, rgba(0,229,255,0.16) 0%, rgba(0,229,255,0.05) 100%)',
                  } : { color: 'rgba(150,158,170,0.65)' }}
                >
                  {iv.label}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => setShowHelp(true)}
            title="Инструкция по терминалу"
            className="flex h-8 w-8 items-center justify-center rounded-md text-mute transition hover:bg-white/[0.06] hover:text-neon"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12" y2="17.01" />
            </svg>
          </button>

          <button onClick={onClose}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-mute hover:bg-white/[0.06] hover:text-white">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="flex w-[200px] shrink-0 flex-col border-r border-white/[0.06]">
            <div className="shrink-0 border-b border-white/[0.06] p-2.5">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск…"
                className="h-8 w-full rounded-lg border border-white/[0.06] bg-black/50 px-3 font-mono text-[11px] text-white placeholder-mute/60 outline-none"
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto py-1">
              {filtered.map(sym => {
                const isA = sym === symbol;
                return (
                  <button key={sym}
                          onClick={() => { setSymbol(sym); onSelectSymbol && onSelectSymbol(sym); }}
                          className="mx-2 flex w-[calc(100%-16px)] items-center gap-2 rounded-lg px-2.5 py-1.5 text-left"
                          style={isA ? {
                            background: 'linear-gradient(90deg, rgba(0,229,255,0.10) 0%, transparent 100%)',
                            border: '1px solid rgba(0,229,255,0.25)',
                          } : { border: '1px solid transparent' }}>
                    <img src={'/api/icon/' + sym.replace('USDT', '')}
                         width="22" height="22" loading="lazy"
                         onError={(e) => { e.target.style.display = 'none'; }}
                         className="rounded-full shrink-0" />
                    <span className="font-mono text-[12px] truncate"
                          style={{ color: isA ? '#00e5ff' : 'rgba(230,235,245,0.85)' }}>
                      {sym.replace('USDT', '')}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="relative min-h-0 flex-1" style={{ background: '#020305' }}>
              <div ref={hostRef} className="absolute inset-0" style={{ zIndex: 1 }} />
              <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" style={{ zIndex: 2 }} />
            </div>

            <div className="shrink-0 border-t border-white/[0.06] p-4"
                 style={{ background: 'linear-gradient(180deg, rgba(6,8,14,0.85) 0%, rgba(2,3,5,0.95) 100%)',
                          maxHeight: '300px', overflowY: 'auto' }}>
              {error && <div className="font-mono text-[11px] text-crimson">⚠ {error}</div>}
              {data && !error && (
                <div className="grid gap-2.5" style={{ gridTemplateColumns: '1.1fr 1.1fr 1.1fr 0.9fr 0.9fr' }}>

                  {/* Тренд + сила */}
                  <div className="relative overflow-hidden rounded-lg pl-4 pr-4 py-2.5"
                       style={{ background: 'linear-gradient(180deg, rgba(22,26,34,0.85) 0%, rgba(10,12,18,0.95) 100%)',
                                border: '1px solid rgba(255,255,255,0.07)' }}>
                    <span className="absolute left-0 top-0 bottom-0 w-[2px]"
                          style={{ background: 'linear-gradient(180deg, transparent 0%, ' +
                            (data.trend.trend === 'up' ? '#3ecf9a' : data.trend.trend === 'down' ? '#d94a63' : '#7d8695') +
                            ' 50%, transparent 100%)' }} />
                    <div className="flex items-center justify-between mb-1.5">
                      <span style={{ fontSize: '8px', fontWeight: 600, letterSpacing: '0.26em',
                                     textTransform: 'uppercase', color: 'rgba(140,150,165,0.55)' }}>
                        Тренд
                      </span>
                      <span className="text-[12px]"
                            style={{ color: data.trend.trend === 'up' ? '#3ecf9a' : data.trend.trend === 'down' ? '#d94a63' : '#7d8695' }}>
                        {data.trend.trend === 'up' ? '↗' : data.trend.trend === 'down' ? '↘' : '↔'}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: '#e6eaf0', marginBottom: '6px' }}>
                      {data.trend.trend === 'up' ? 'Восходящий' : data.trend.trend === 'down' ? 'Нисходящий' : 'Боковик'}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {[1, 2, 3].map((n) => (
                        <div key={n} className="flex-1 h-[3px] rounded-full"
                             style={{ background: n <= (data.trend.strength || 0)
                               ? (data.trend.trend === 'up' ? '#3ecf9a' : data.trend.trend === 'down' ? '#d94a63' : '#7d8695')
                               : 'rgba(255,255,255,0.06)' }} />
                      ))}
                      <span style={{ fontSize: '10px', fontWeight: 600, color: 'rgba(200,208,220,0.7)', marginLeft: '4px' }}>
                        {data.trend.strength || 0}/3
                      </span>
                    </div>
                  </div>

                  {/* Паттерн + уверенность */}
                  <div className="relative overflow-hidden rounded-lg pl-4 pr-4 py-2.5"
                       style={{ background: 'linear-gradient(180deg, rgba(22,26,34,0.85) 0%, rgba(10,12,18,0.95) 100%)',
                                border: '1px solid rgba(255,255,255,0.07)' }}>
                    <span className="absolute left-0 top-0 bottom-0 w-[2px]"
                          style={{ background: 'linear-gradient(180deg, transparent 0%, #8b7cff 50%, transparent 100%)' }} />
                    <div className="flex items-center justify-between mb-1.5">
                      <span style={{ fontSize: '8px', fontWeight: 600, letterSpacing: '0.26em',
                                     textTransform: 'uppercase', color: 'rgba(140,150,165,0.55)' }}>
                        Паттерн
                      </span>
                      <span style={{ color: '#8b7cff', fontSize: '12px', fontWeight: 700 }}>◆</span>
                    </div>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#e6eaf0', marginBottom: '6px',
                                  minHeight: '16px', lineHeight: 1.2 }}>
                      {data.pattern.pattern}
                    </div>
                    {data.pattern.pattern && data.pattern.pattern !== 'нет чёткого паттерна' && (
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 h-[3px] rounded-full overflow-hidden"
                             style={{ background: 'rgba(255,255,255,0.06)' }}>
                          <div className="h-full rounded-full"
                               style={{ width: (data.pattern.confidence || 0) + '%',
                                        background: '#8b7cff' }} />
                        </div>
                        <span style={{ fontSize: '10px', fontWeight: 600, color: '#8b7cff' }}>
                          {data.pattern.confidence || 0}%
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Волатильность */}
                  <div className="relative overflow-hidden rounded-lg pl-4 pr-4 py-2.5"
                       style={{ background: 'linear-gradient(180deg, rgba(22,26,34,0.85) 0%, rgba(10,12,18,0.95) 100%)',
                                border: '1px solid rgba(255,255,255,0.07)' }}>
                    <span className="absolute left-0 top-0 bottom-0 w-[2px]"
                          style={{ background: 'linear-gradient(180deg, transparent 0%, #3ba8c4 50%, transparent 100%)' }} />
                    <div className="flex items-center justify-between mb-1.5">
                      <span style={{ fontSize: '8px', fontWeight: 600, letterSpacing: '0.26em',
                                     textTransform: 'uppercase', color: 'rgba(140,150,165,0.55)' }}>
                        Волатильность
                      </span>
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#e6eaf0',
                                  fontFeatureSettings: '"tnum"', marginBottom: '2px' }}>
                      {data.range && data.range.width_pct != null
                        ? data.range.width_pct.toFixed(2) + '%'
                        : '—'}
                    </div>
                    <div style={{ fontSize: '9.5px', color: 'rgba(180,188,200,0.55)' }}>
                      {data.range && data.range.width_pct > 5 ? 'высокая' :
                       data.range && data.range.width_pct > 2 ? 'средняя' : 'низкая'}
                    </div>
                  </div>

                  {/* R:R */}
                  {(() => {
                    if (!data.resistance_levels || !data.support_levels ||
                        !data.resistance_levels[0] || !data.support_levels[0]) return null;
                    const r = data.resistance_levels[0].price;
                    const s = data.support_levels[0].price;
                    const cur = data.symbol_price;
                    const up = r - cur, down = cur - s;
                    if (up <= 0 || down <= 0) return null;
                    const rr = up / down;
                    const rrColor = rr >= 1.5 ? '#3ecf9a' : rr >= 1 ? '#c49a5a' : '#d94a63';
                    return (
                      <div className="relative overflow-hidden rounded-lg pl-4 pr-4 py-2.5"
                           style={{ background: 'linear-gradient(180deg, rgba(22,26,34,0.85) 0%, rgba(10,12,18,0.95) 100%)',
                                    border: '1px solid rgba(255,255,255,0.07)' }}>
                        <span className="absolute left-0 top-0 bottom-0 w-[2px]"
                              style={{ background: 'linear-gradient(180deg, transparent 0%, ' + rrColor + ' 50%, transparent 100%)' }} />
                        <div className="flex items-center justify-between mb-1.5">
                          <span style={{ fontSize: '8px', fontWeight: 600, letterSpacing: '0.26em',
                                         textTransform: 'uppercase', color: 'rgba(140,150,165,0.55)' }}>
                            R:R
                          </span>
                        </div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: rrColor,
                                      fontFeatureSettings: '"tnum"', marginBottom: '2px',
                                      textShadow: '0 0 10px ' + rrColor + '40' }}>
                          1 : {rr.toFixed(2)}
                        </div>
                        <div style={{ fontSize: '9.5px', color: 'rgba(180,188,200,0.55)' }}>
                          риск / прибыль
                        </div>
                      </div>
                    );
                  })()}

                  {/* Цена */}
                  <div className="relative overflow-hidden rounded-lg pl-4 pr-4 py-2.5"
                       style={{ background: 'linear-gradient(180deg, rgba(22,26,34,0.85) 0%, rgba(10,12,18,0.95) 100%)',
                                border: '1px solid rgba(255,255,255,0.07)' }}>
                    <span className="absolute left-0 top-0 bottom-0 w-[2px]"
                          style={{ background: 'linear-gradient(180deg, transparent 0%, #e6eaf0 50%, transparent 100%)' }} />
                    <div className="flex items-center justify-between mb-1.5">
                      <span style={{ fontSize: '8px', fontWeight: 600, letterSpacing: '0.26em',
                                     textTransform: 'uppercase', color: 'rgba(140,150,165,0.55)' }}>
                        Цена
                      </span>
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#f0f3f8',
                                  fontFeatureSettings: '"tnum"', marginBottom: '2px' }}>
                      {fmtP(data.symbol_price)}
                    </div>
                    <div style={{ fontSize: '9.5px', color: 'rgba(180,188,200,0.55)' }}>
                      сейчас
                    </div>
                  </div>

                </div>
              )}
              {!data && !loading && !error && (
                <div className="font-mono text-[11px] text-mute">Загрузка анализа…</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </div>
  );
}
