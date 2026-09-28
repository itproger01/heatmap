import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { createChart, CrosshairMode, LineStyle } from 'lightweight-charts';
import { fmtUsd, fmtPrice, fmtLifespan } from '../lib/format';
import DrawingLayer from './DrawingLayer';

function priceFormatFor(price) {
  if (!isFinite(price) || price <= 0) return { precision: 2, minMove: 0.01 };
  const a = Math.abs(price);
  if (a >= 10000) return { precision: 1, minMove: 0.1 };
  if (a >= 1000) return { precision: 2, minMove: 0.01 };
  if (a >= 100) return { precision: 3, minMove: 0.001 };
  if (a >= 10) return { precision: 4, minMove: 0.0001 };
  if (a >= 1) return { precision: 5, minMove: 0.00001 };
  if (a >= 0.1) return { precision: 5, minMove: 0.00001 };
  if (a >= 0.01) return { precision: 6, minMove: 0.000001 };
  if (a >= 0.001) return { precision: 7, minMove: 0.0000001 };
  return { precision: 8, minMove: 0.00000001 };
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

const DEFAULT_VISIBLE_BARS = 180;
const RIGHT_OFFSET_BARS = 8;

export default function HeatmapChart({
  symbol, candles, walls, step = 1, showHeatmap = true, showCandles = true, onStats, liveCandle,
  activeTool, setActiveTool, drawings, setDrawings,
}) {
  const wrapRef = useRef(null);
  const hostRef = useRef(null);
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const volRef = useRef(null);
  const wallsRef = useRef([]);
  const linesRef = useRef([]);
  const rafRef = useRef(0);
  const lastSymbolRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);
  const scheduleDrawRef = useRef(() => {});

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!canvas || !chart || !series) return;

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

    linesRef.current = [];

    if (!showHeatmap) {
      if (onStats) onStats({ drawn: 0, off: 0 });
      return;
    }

    const list = wallsRef.current;
    if (!list.length) {
      if (onStats) onStats({ drawn: 0, off: 0 });
      return;
    }

    let paneW = cw - 68;
    let paneH = ch - 28;
    try {
      const pw = chart.priceScale('right').width();
      if (pw) paneW = cw - pw;
      const th = chart.timeScale().height();
      if (th) paneH = ch - th;
    } catch (_) {}

    const ts = chart.timeScale();
    const data = series.data();
    const lastIdx = Math.max(0, data.length - 1);
    const lastX = ts.logicalToCoordinate(lastIdx);
    const x0 = ts.logicalToCoordinate(0);
    const x1 = ts.logicalToCoordinate(1);
    const barW = (x0 != null && x1 != null) ? Math.abs(x1 - x0) : 5;

    let lineStartX = (lastX != null && isFinite(lastX) && lastX > 0 && lastX < paneW)
      ? lastX + barW * 1.5
      : paneW * 0.6;
    const lineEndX = paneW - 2;

    const maxUsd = list.reduce((m, w) => Math.max(m, w.u || 0), 1);
    const lines = [];
    let drawn = 0, off = 0;

    for (const w of list) {
      const y = series.priceToCoordinate(w.p);
      if (y == null) continue;
      if (y < 2 || y > paneH - 2) { off++; continue; }
      drawn++;

      const isBid = w.s === 'bid';
      const color = isBid ? '#00ff88' : '#ff3366';
      const intensity = Math.min(1, (w.u || 0) / maxUsd);
      const py = Math.round(y) + 0.5;
      const lw = 1.0 + intensity * 0.8;
      const alpha = 0.85 + intensity * 0.15;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(lineStartX, py);
      ctx.lineTo(lineEndX, py);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(lineStartX, py, 2.5 + intensity * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      const label = fmtLifespan(w.l) + ' · ' + fmtUsd(w.u);
      ctx.font = '11px "JetBrains Mono", monospace';
      const m = ctx.measureText(label);
      const pillH = 17;
      const pillW = m.width + 16;
      const pillX = paneW - pillW - 3;
      const pillY = py - pillH / 2;

      if (pillY > 2 && pillY + pillH < paneH - 2) {
        ctx.save();
        ctx.globalAlpha = 0.96;
        ctx.fillStyle = isBid ? 'rgba(0,26,16,0.96)' : 'rgba(28,4,12,0.96)';
        roundRect(ctx, pillX, pillY, pillW, pillH, 4);
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.2;
        roundRect(ctx, pillX, pillY, pillW, pillH, 4);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.textBaseline = 'middle';
        ctx.fillText(label, pillX + 8, pillY + pillH / 2 + 0.5);
        ctx.restore();
      }

      lines.push({ y, w });
    }

    linesRef.current = lines;
    if (onStats) onStats({ drawn, off });
  }, [showHeatmap, onStats]);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      draw();
    });
  }, [draw]);

  useEffect(() => { scheduleDrawRef.current = scheduleDraw; }, [scheduleDraw]);

  // ============ INIT ============
  useLayoutEffect(() => {
    if (!hostRef.current) return;

    const chart = createChart(hostRef.current, {
      layout: {
        background: { type: 'solid', color: 'transparent' },
        textColor: '#8b95a5',
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.028)', style: LineStyle.Solid },
        horzLines: { color: 'rgba(255,255,255,0.028)', style: LineStyle.Solid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(0,255,136,0.5)', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#00ff88' },
        horzLine: { color: 'rgba(0,255,136,0.5)', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#00ff88' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.06)',
        scaleMargins: { top: 0.08, bottom: 0.22 },
        borderVisible: true,
        ticksVisible: true,
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.08)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: RIGHT_OFFSET_BARS,
        barSpacing: 6,
        minBarSpacing: 0.5,
      },
      handleScale: { axisPressedMouseMove: true },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      autoSize: false,
    });

    const cs = chart.addCandlestickSeries({
      upColor: '#00e070',
      downColor: '#ff2d55',
      borderUpColor: '#00ff88',
      borderDownColor: '#ff3366',
      wickUpColor: '#00ff88',
      wickDownColor: '#ff3366',
      borderVisible: true,
      wickVisible: true,
      priceLineVisible: false,
      lastValueVisible: true,
    });

    const vs = chart.addHistogramSeries({
      color: 'rgba(0,255,136,0.35)',
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale('vol').applyOptions({
      scaleMargins: { top: 0.86, bottom: 0 },
      borderVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = cs;
    volRef.current = vs;

    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      chart.resize(width, height);
      scheduleDrawRef.current();
    });
    ro.observe(hostRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volRef.current = null;
    };
  }, []);

  // ============ CANDLES ============
  useEffect(() => {
    const series = seriesRef.current;
    const vol = volRef.current;
    if (!series || !vol) return;
    if (!candles || !candles.length) return;

    const lastPrice = candles[candles.length - 1].close;
    const pf = priceFormatFor(lastPrice);
    series.applyOptions({ priceFormat: { type: 'price', precision: pf.precision, minMove: pf.minMove } });

    series.setData(candles);

    const vols = candles.map((c) => ({
      time: c.time,
      value: c.volume || 0,
      color: c.close >= c.open ? 'rgba(0,224,112,0.35)' : 'rgba(255,45,85,0.35)',
    }));
    vol.setData(vols);

    // если символ НЕ менялся — не сбрасываем view
    if (lastSymbolRef.current !== symbol) {
      lastSymbolRef.current = symbol;
      const chart = chartRef.current;
      if (chart) {
        const ts = chart.timeScale();
        const total = candles.length;
        if (total > DEFAULT_VISIBLE_BARS) {
          ts.setVisibleLogicalRange({ from: total - DEFAULT_VISIBLE_BARS, to: total + RIGHT_OFFSET_BARS });
        } else {
          ts.fitContent();
        }
      }
    }

    scheduleDrawRef.current();
  }, [candles, symbol]);

  useEffect(() => {
    const series = seriesRef.current;
    const vol = volRef.current;
    if (series) series.applyOptions({ visible: showCandles });
    if (vol) vol.applyOptions({ visible: showCandles });
  }, [showCandles]);

  // ============ LIVE UPDATE LAST CANDLE ============
  useEffect(() => {
    if (!liveCandle || !liveCandle.candle) return;
    const series = seriesRef.current;
    const vol = volRef.current;
    if (!series || !vol) return;

    const c = liveCandle.candle;
    try {
      // series.update() обновит последнюю свечу или добавит новую
      // БЕЗ сброса view и БЕЗ полной перерисовки серии
      series.update({
        time: c.time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      });
      vol.update({
        time: c.time,
        value: c.volume || 0,
        color: c.close >= c.open ? 'rgba(0,224,112,0.35)' : 'rgba(255,45,85,0.35)',
      });

      // перерисуем плотности (последняя свеча сдвинулась)
      scheduleDrawRef.current();
    } catch (e) {
      // Тихо — time должен быть >= последнего в серии
    }
  }, [liveCandle]);

  // ============ WALLS ============
  useEffect(() => {
    wallsRef.current = walls || [];
    scheduleDrawRef.current();
  }, [walls]);

  // ============ REDRAW ON SCROLL/ZOOM ============
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const ts = chart.timeScale();
    const h = () => scheduleDrawRef.current();
    ts.subscribeVisibleLogicalRangeChange(h);
    return () => ts.unsubscribeVisibleLogicalRangeChange(h);
  }, []);

  // ============ RESIZE CANVAS ============
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => scheduleDrawRef.current());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // ============ TOOLTIP ============
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onMove = (e) => {
      const rect = wrap.getBoundingClientRect();
      if (e.clientX < rect.left || e.clientX > rect.right ||
          e.clientY < rect.top || e.clientY > rect.bottom) {
        setTooltip((t) => (t ? null : t));
        return;
      }
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const lines = linesRef.current;
      let best = null, bestDist = 8;
      for (const item of lines) {
        const d = Math.abs(item.y - y);
        if (d < bestDist) { bestDist = d; best = item; }
      }
      if (best) setTooltip({ x, y: best.y, w: best.w });
      else setTooltip((t) => (t ? null : t));
    };
    const onLeave = () => setTooltip(null);
    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('blur', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('blur', onLeave);
    };
  }, []);

  return (
    <div className="absolute inset-0">
      <div ref={wrapRef} className="relative h-full w-full">
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
          style={{ zIndex: 1 }}
        />
      <DrawingLayer
        hostRef={hostRef}
        chartRef={chartRef}
        seriesRef={seriesRef}
        symbol={symbol}
        activeTool={activeTool}
        setActiveTool={setActiveTool}
        drawings={drawings || []}
        setDrawings={setDrawings}
      />

        <div
          ref={hostRef}
          className="absolute inset-0 h-full w-full"
          style={{ zIndex: 2 }}
        />
        {tooltip && <SimpleTooltip tooltip={tooltip} />}
      </div>
    </div>
  );
}

function SimpleTooltip({ tooltip }) {
  const { x, y, w } = tooltip;
  const isBid = w.s === 'bid';
  const flip = y < 120;
  return (
    <div
      className="pointer-events-none absolute z-40"
      style={{
        left: x + 16,
        top: flip ? y + 14 : y - 14,
        transform: flip ? 'none' : 'translateY(-100%)',
      }}
    >
      <div
        className="glass min-w-[200px] rounded-xl border px-3.5 py-3 shadow-2xl"
        style={{ borderColor: isBid ? 'rgba(0,255,136,0.3)' : 'rgba(255,51,102,0.3)' }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-[0.2em] text-mute">Плотность</span>
          <span
            className="font-mono text-[10px] font-semibold"
            style={{ color: isBid ? '#00ff88' : '#ff3366' }}
          >
            {isBid ? 'BID' : 'ASK'}
          </span>
        </div>
        <div className="space-y-1 font-mono text-[11px]">
          <div className="flex justify-between">
            <span className="text-mute">Цена</span>
            <span className="text-white/90">{fmtPrice(w.p)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-mute">Объём</span>
            <span className="text-amber">{fmtUsd(w.u)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-mute">Удержано</span>
            <span className="text-white/90">{fmtLifespan(w.l)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
