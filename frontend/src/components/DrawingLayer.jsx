import React, { useEffect, useRef, useCallback, useState } from 'react';
import { TOOLS } from './DrawingTools';

const STORAGE_PREFIX = 'apexscalp_drawings_';

export function loadDrawings(symbol) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + symbol);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveDrawings(symbol, list) {
  try {
    localStorage.setItem(STORAGE_PREFIX + symbol, JSON.stringify(list));
  } catch {}
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

export default function DrawingLayer({
  hostRef, chartRef, seriesRef, symbol,
  activeTool, setActiveTool,
  drawings, setDrawings,
}) {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const pendingRef = useRef(null);
  const cursorRef = useRef(null);
  const dragRef = useRef(null);
  const stateRef = useRef({});
  const [hoveredId, setHoveredId] = useState(null);

  stateRef.current = { drawings: drawings || [], activeTool, hoveredId };

  useEffect(() => {
    if (symbol) saveDrawings(symbol, drawings || []);
  }, [drawings, symbol]);

  useEffect(() => {
    pendingRef.current = null;
    cursorRef.current = null;
    dragRef.current = null;
  }, [symbol, activeTool]);

  // ---------- size ----------
  // кэш размеров pane — не вызываем priceScale()/timeScale() в hot path
  const paneSizeRef = useRef({ w: 0, h: 0 });

  const updatePaneSize = useCallback(() => {
    const chart = chartRef.current;
    const canvas = canvasRef.current;
    if (!chart || !canvas) return;
    let w = canvas.clientWidth, h = canvas.clientHeight;
    try {
      const pw = chart.priceScale('right').width();
      if (pw) w -= pw;
      const th = chart.timeScale().height();
      if (th) h -= th;
    } catch {}
    paneSizeRef.current = { w: Math.max(0, w), h: Math.max(0, h) };
  }, [chartRef]);

  // обновляем размер раз в 500 мс (вместо каждого вызова)
  useEffect(() => {
    updatePaneSize();
    const id = setInterval(updatePaneSize, 500);
    return () => clearInterval(id);
  }, [updatePaneSize]);

  const getPaneSize = useCallback(() => paneSizeRef.current, []);

  // ---------- coords ----------
  const xToTime = useCallback((x) => {
    const chart = chartRef.current, series = seriesRef.current;
    if (!chart || !series) return null;
    try {
      const data = series.data();
      if (!data || !data.length) return null;
      const logical = chart.timeScale().coordinateToLogical(x);
      if (logical == null) return null;
      const idx = Math.round(logical);
      if (idx >= 0 && idx < data.length) return data[idx].time;
      const last = data[data.length - 1];
      const prev = data[Math.max(0, data.length - 2)];
      const barSec = Math.max(1, last.time - prev.time);
      return last.time + (idx - (data.length - 1)) * barSec;
    } catch { return null; }
  }, [chartRef, seriesRef]);

  const timeToX = useCallback((t) => {
    const chart = chartRef.current, series = seriesRef.current;
    if (!chart || !series) return null;
    try {
      const data = series.data();
      if (!data || !data.length) return null;
      let lo = 0, hi = data.length - 1, best = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (data[mid].time <= t) { best = mid; lo = mid + 1; }
        else hi = mid - 1;
      }
      return chart.timeScale().logicalToCoordinate(best);
    } catch { return null; }
  }, [chartRef, seriesRef]);

  const yToPrice = useCallback((y) => {
    const s = seriesRef.current;
    if (!s) return null;
    try { return s.coordinateToPrice(y); } catch { return null; }
  }, [seriesRef]);

  const priceToY = useCallback((p) => {
    const s = seriesRef.current;
    if (!s) return null;
    try { return s.priceToCoordinate(p); } catch { return null; }
  }, [seriesRef]);

  // ---------- delete button position ----------
  const deleteButtonPos = useCallback((d) => {
    const { w: paneW } = getPaneSize();
    const y1 = priceToY(d.p1.price);
    if (y1 == null) return null;
    if (!d.p2) return { x: paneW - 20, y: y1 - 12 };
    const x1 = timeToX(d.p1.time), x2 = timeToX(d.p2.time), y2 = priceToY(d.p2.price);
    if (x1 == null || x2 == null || y2 == null) return null;
    return { x: (x1 + x2) / 2 + 10, y: (y1 + y2) / 2 - 14 };
  }, [getPaneSize, priceToY, timeToX]);

  const findDeleteHit = useCallback((mx, my) => {
    const list = stateRef.current.drawings;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = deleteButtonPos(list[i]);
      if (!p) continue;
      const dx = mx - p.x, dy = my - p.y;
      if (dx*dx + dy*dy <= 14*14) return list[i].id;
    }
    return null;
  }, [deleteButtonPos]);

  const findHandleAt = useCallback((mx, my) => {
    const list = stateRef.current.drawings;
    if (!list.length) return null;
    const HE = 10, HL = 6;
    for (let i = list.length - 1; i >= 0; i--) {
      const d = list[i];
      if (d.type === 'hline' || d.type === 'stoploss') {
        const y1 = priceToY(d.p1.price);
        if (y1 != null && Math.abs(y1 - my) <= HL) return { id: d.id, mode: 'hline' };
        continue;
      }
      if (!d.p2) continue;
      const x1 = timeToX(d.p1.time), y1 = priceToY(d.p1.price);
      const x2 = timeToX(d.p2.time), y2 = priceToY(d.p2.price);
      if (x1 == null || y1 == null || x2 == null || y2 == null) continue;
      if (Math.hypot(mx - x1, my - y1) <= HE) return { id: d.id, mode: 'p1' };
      if (Math.hypot(mx - x2, my - y2) <= HE) return { id: d.id, mode: 'p2' };
      const dx = x2 - x1, dy = y2 - y1;
      const len = dx*dx + dy*dy;
      let dist;
      if (len < 1) dist = Math.hypot(mx - x1, my - y1);
      else {
        let t = ((mx - x1) * dx + (my - y1) * dy) / len;
        t = Math.max(0, Math.min(1, t));
        dist = Math.hypot(mx - (x1 + t*dx), my - (y1 + t*dy));
      }
      if (dist <= HL) return { id: d.id, mode: 'body' };
    }
    return null;
  }, [priceToY, timeToX]);

  // ---------- draw ----------
  const drawOne = useCallback((ctx, d, isPreview) => {
    const isSL = d.type === 'stoploss';
    const color = isSL ? '#e8b4b8' : '#c8cdd4';
    const colorBright = isSL ? '#ffd0d4' : '#e8eaee';
    const a = d.p1;
    if (!a) return;
    const b = d.p2 || a;
    const y1 = priceToY(a.price);
    if (y1 == null) return;
    const x1 = timeToX(a.time);
    const { w: paneW } = getPaneSize();

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (d.type === 'hline' || d.type === 'stoploss') {
      ctx.strokeStyle = color;
      ctx.lineWidth = isPreview ? 0.9 : 1.0;
      ctx.setLineDash(isPreview ? [3, 3] : []);
      ctx.globalAlpha = isPreview ? 0.5 : 0.9;
      ctx.beginPath(); ctx.moveTo(0, y1 + 0.5); ctx.lineTo(paneW, y1 + 0.5); ctx.stroke();
      ctx.globalAlpha = 1; ctx.setLineDash([]);

      const label = isSL ? `SL · ${a.price.toFixed(a.price > 100 ? 2 : 4)}` : a.price.toFixed(a.price > 100 ? 2 : 4);
      ctx.font = '500 10px JetBrains Mono, monospace';
      const m = ctx.measureText(label);
      const pw = m.width + 16, ph = 16;
      const px = 6, py = y1 - ph / 2;
      ctx.fillStyle = isSL ? 'rgba(28,12,14,0.94)' : 'rgba(14,16,20,0.94)';
      roundRect(ctx, px, py, pw, ph, 3); ctx.fill();
      ctx.strokeStyle = isSL ? 'rgba(232,180,184,0.5)' : 'rgba(200,205,212,0.35)';
      ctx.lineWidth = 0.8; roundRect(ctx, px, py, pw, ph, 3); ctx.stroke();
      ctx.fillStyle = color; ctx.fillRect(px + 1, py + 3, 1.5, ph - 6);
      ctx.fillStyle = colorBright; ctx.textBaseline = 'middle';
      ctx.fillText(label, px + 9, py + ph / 2 + 0.5);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(paneW - 4, y1 + 0.5, 2, 0, Math.PI * 2); ctx.fill();
    }

    const x2 = timeToX(b.time), y2 = priceToY(b.price);
    if (x2 == null || y2 == null) { ctx.restore(); return; }

    const grad = () => {
      const g = ctx.createLinearGradient(x1, y1, x2, y2);
      g.addColorStop(0, 'rgba(232,234,238,0.9)');
      g.addColorStop(1, 'rgba(154,161,173,0.75)');
      return g;
    };

    if (d.type === 'trendline') {
      ctx.strokeStyle = grad();
      ctx.lineWidth = isPreview ? 0.9 : 1.0;
      ctx.setLineDash(isPreview ? [3, 3] : []);
      ctx.globalAlpha = isPreview ? 0.55 : 0.95;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      [[x1, y1], [x2, y2]].forEach(([px, py]) => {
        ctx.fillStyle = 'rgba(14,16,20,0.9)';
        ctx.beginPath(); ctx.arc(px, py, 3.2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(232,234,238,0.9)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(px, py, 3.2, 0, Math.PI * 2); ctx.stroke();
      });
    }

    if (d.type === 'ray') {
      const dx = x2 - x1, dy = y2 - y1;
      const t = dx !== 0 ? (paneW - x1) / dx : 1;
      const rx = paneW, ry = y1 + dy * t;
      ctx.strokeStyle = grad();
      ctx.lineWidth = isPreview ? 0.9 : 1.0;
      ctx.setLineDash(isPreview ? [3, 3] : []);
      ctx.globalAlpha = isPreview ? 0.55 : 0.95;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(rx, ry); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      const ang = Math.atan2(ry - y1, rx - x1), ah = 7;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - ah * Math.cos(ang - 0.4), ry - ah * Math.sin(ang - 0.4));
      ctx.lineTo(rx - ah * Math.cos(ang + 0.4), ry - ah * Math.sin(ang + 0.4));
      ctx.closePath(); ctx.fillStyle = 'rgba(200,205,212,0.9)'; ctx.fill();
      ctx.fillStyle = 'rgba(14,16,20,0.9)';
      ctx.beginPath(); ctx.arc(x1, y1, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(232,234,238,0.9)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x1, y1, 3.2, 0, Math.PI * 2); ctx.stroke();
    }

    if (d.type === 'arrow') {
      ctx.strokeStyle = grad();
      ctx.lineWidth = isPreview ? 1.0 : 1.2;
      ctx.setLineDash(isPreview ? [3, 3] : []);
      ctx.globalAlpha = isPreview ? 0.55 : 0.95;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      const ang = Math.atan2(y2 - y1, x2 - x1), ah = 9;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - ah * Math.cos(ang - 0.42), y2 - ah * Math.sin(ang - 0.42));
      ctx.lineTo(x2 - ah * Math.cos(ang + 0.42), y2 - ah * Math.sin(ang + 0.42));
      ctx.closePath(); ctx.fillStyle = 'rgba(232,234,238,0.95)'; ctx.fill();
    }

    if (d.type === 'ruler') {
      const rx = Math.min(x1, x2), ry = Math.min(y1, y2);
      const rw = Math.abs(x2 - x1), rh = Math.abs(y2 - y1);
      ctx.fillStyle = 'rgba(200,205,212,0.05)'; ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = 'rgba(200,205,212,0.5)';
      ctx.lineWidth = isPreview ? 0.8 : 1.0;
      ctx.setLineDash(isPreview ? [3, 3] : [4, 2]);
      ctx.strokeRect(rx + 0.5, ry + 0.5, rw, rh); ctx.setLineDash([]);

      ctx.globalAlpha = 0.35; ctx.strokeStyle = 'rgba(200,205,212,0.9)'; ctx.lineWidth = 0.7;
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(0, y2); ctx.lineTo(paneW, y2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, y1); ctx.lineTo(paneW, y1); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;

      const dPrice = b.price - a.price;
      const pct = a.price ? (dPrice / a.price) * 100 : 0;
      const secs = Math.abs(b.time - a.time);
      const tStr = secs < 60 ? `${secs}с` :
        secs < 3600 ? `${Math.floor(secs/60)}м ${secs%60}с` :
        secs < 86400 ? `${Math.floor(secs/3600)}ч ${Math.floor((secs%3600)/60)}м` :
        `${Math.floor(secs/86400)}д ${Math.floor((secs%86400)/3600)}ч`;

      const isUp = pct >= 0;
      const accent = isUp ? '#8ee8b4' : '#e8a4b4';
      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
      const lines = [
        `${dPrice >= 0 ? '+' : ''}${dPrice.toFixed(Math.abs(dPrice) > 100 ? 2 : 4)}`,
        `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`,
        tStr,
      ];
      ctx.font = '600 10px JetBrains Mono, monospace';
      const wMax = Math.max(...lines.map((l) => ctx.measureText(l).width));
      const pw = wMax + 22, ph = 14 * lines.length + 12;
      ctx.fillStyle = 'rgba(12,14,18,0.94)';
      roundRect(ctx, cx - pw/2, cy - ph/2, pw, ph, 5); ctx.fill();
      ctx.strokeStyle = 'rgba(200,205,212,0.35)'; ctx.lineWidth = 0.9;
      roundRect(ctx, cx - pw/2, cy - ph/2, pw, ph, 5); ctx.stroke();
      ctx.fillStyle = accent;
      roundRect(ctx, cx - pw/2 + 1, cy - ph/2 + 4, 2, ph - 8, 1); ctx.fill();
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      const tx = cx - pw/2 + 10;
      lines.forEach((l, i) => {
        ctx.fillStyle = i === 0 ? accent : 'rgba(220,224,230,0.9)';
        ctx.fillText(l, tx, cy - ph/2 + 10 + i * 14);
      });
      ctx.textAlign = 'start';
    }

    ctx.restore();
  }, [getPaneSize, priceToY, timeToX]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current, chart = chartRef.current, series = seriesRef.current;
    if (!canvas || !chart || !series) return;
    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (cw === 0 || ch === 0) return;
    if (canvas.width !== Math.floor(cw * dpr) || canvas.height !== Math.floor(ch * dpr)) {
      canvas.width = Math.floor(cw * dpr);
      canvas.height = Math.floor(ch * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    const list = stateRef.current.drawings;
    for (const d of list) drawOne(ctx, d, false);

    const p = pendingRef.current;
    if (p) drawOne(ctx, { type: p.type, p1: p.p1, p2: cursorRef.current || p.p1, color: p.color }, true);

    if (!stateRef.current.activeTool) {
      for (const d of list) {
        const posD = deleteButtonPos(d);
        if (!posD) continue;
        const isHov = stateRef.current.hoveredId === d.id;
        ctx.save();
        ctx.globalAlpha = isHov ? 1 : 0.5;
        ctx.fillStyle = 'rgba(20,22,26,0.95)';
        ctx.beginPath(); ctx.arc(posD.x, posD.y, 8, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(232,234,238,0.55)'; ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.arc(posD.x, posD.y, 8, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(232,234,238,0.95)'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
        const s = 2.8;
        ctx.beginPath();
        ctx.moveTo(posD.x - s, posD.y - s); ctx.lineTo(posD.x + s, posD.y + s);
        ctx.moveTo(posD.x + s, posD.y - s); ctx.lineTo(posD.x - s, posD.y + s);
        ctx.stroke();
        ctx.restore();
      }
    }
  }, [drawOne, deleteButtonPos]);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; draw(); });
  }, [draw]);

  useEffect(() => { scheduleDraw(); }, [drawings, activeTool, hoveredId, scheduleDraw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      updatePaneSize();
      scheduleDraw();
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [scheduleDraw, updatePaneSize]);

  // debounced redraw after chart pan
  const redrawTimer = useRef(0);
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const ts = chart.timeScale();
    const h = () => {
      if (redrawTimer.current) cancelAnimationFrame(redrawTimer.current);
      redrawTimer.current = requestAnimationFrame(() => {
        redrawTimer.current = 0;
        scheduleDraw();
      });
    };
    ts.subscribeVisibleLogicalRangeChange(h);
    return () => {
      ts.unsubscribeVisibleLogicalRangeChange(h);
      if (redrawTimer.current) cancelAnimationFrame(redrawTimer.current);
    };
  }, [chartRef, scheduleDraw]);

  // =============== listeners on host (capture) ===============
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let hovering = false;

    const localXY = (e) => {
      const r = hostRef.current?.getBoundingClientRect();
      if (!r) return { x: 0, y: 0 };
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const onDown = (e) => {
      if (e.button !== 0) return;
      const { x, y } = localXY(e);

      // 1) активный инструмент → рисуем
      if (stateRef.current.activeTool) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const price = yToPrice(y), time = xToTime(x);
        if (price == null || time == null) return;
        const tool = TOOLS.find((t) => t.id === stateRef.current.activeTool);
        if (stateRef.current.activeTool === 'hline' || stateRef.current.activeTool === 'stoploss') {
          setDrawings((prev) => [...(prev || []), {
            id: Date.now() + Math.random(),
            type: stateRef.current.activeTool,
            p1: { price, time },
            color: stateRef.current.activeTool === 'stoploss' ? '#e8b4b8' : '#c8cdd4',
          }]);
          setActiveTool(null);
          return;
        }
        if (!pendingRef.current) {
          pendingRef.current = { type: stateRef.current.activeTool, p1: { price, time }, color: tool?.color };
          scheduleDraw();
          return;
        }
        setDrawings((prev) => [...(prev || []), {
          id: Date.now() + Math.random(),
          type: pendingRef.current.type,
          p1: pendingRef.current.p1,
          p2: { price, time },
          color: pendingRef.current.color,
        }]);
        pendingRef.current = null;
        cursorRef.current = null;
        setActiveTool(null);
        return;
      }

      // 2) клик по крестику
      const delId = findDeleteHit(x, y);
      if (delId != null) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setDrawings((prev) => (prev || []).filter((d) => d.id !== delId));
        setHoveredId(null);
        scheduleDraw();
        return;
      }

      // 3) захват линии
      const handle = findHandleAt(x, y);
      if (handle) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        const target = stateRef.current.drawings.find((d) => d.id === handle.id);
        if (!target) return;
        dragRef.current = {
          id: handle.id,
          mode: handle.mode,
          orig: JSON.parse(JSON.stringify(target)),
          startPrice: yToPrice(y),
          startTime: xToTime(x),
        };
        document.body.style.cursor = 'grabbing';
        return;
      }
    };

    const onMove = (e) => {
      const r = hostRef.current?.getBoundingClientRect();
      if (!r) return;
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) {
        if (!dragRef.current && hovering) {
          hovering = false;
          document.body.style.cursor = '';
          setHoveredId(null);
        }
        return;
      }
      const { x, y } = localXY(e);

      // drag
      if (dragRef.current) {
        const { id, mode, orig, startPrice, startTime } = dragRef.current;
        if (mode === 'hline') {
          const np = yToPrice(y);
          if (np != null) setDrawings((prev) => (prev || []).map((d) => d.id === id ? { ...d, p1: { ...orig.p1, price: np } } : d));
        } else if (mode === 'p1') {
          const np = yToPrice(y), nt = xToTime(x);
          if (np != null && nt != null) setDrawings((prev) => (prev || []).map((d) => d.id === id ? { ...d, p1: { price: np, time: nt } } : d));
        } else if (mode === 'p2') {
          const np = yToPrice(y), nt = xToTime(x);
          if (np != null && nt != null) setDrawings((prev) => (prev || []).map((d) => d.id === id ? { ...d, p2: { price: np, time: nt } } : d));
        } else if (mode === 'body') {
          const cp = yToPrice(y), ct = xToTime(x);
          if (cp == null || ct == null) return;
          const dP = cp - startPrice, dT = ct - startTime;
          const p1 = { price: orig.p1.price + dP, time: orig.p1.time + dT };
          const p2 = orig.p2 ? { price: orig.p2.price + dP, time: orig.p2.time + dT } : undefined;
          setDrawings((prev) => (prev || []).map((d) => d.id === id ? { ...d, p1, ...(p2 ? { p2 } : {}) } : d));
        }
        return;
      }

      // preview
      if (pendingRef.current) {
        const price = yToPrice(y), time = xToTime(x);
        if (price != null && time != null) {
          cursorRef.current = { price, time };
          scheduleDraw();
        }
        return;
      }

      // hover
      hovering = true;
      const handle = findHandleAt(x, y);
      if (handle) {
        document.body.style.cursor = (handle.mode === 'p1' || handle.mode === 'p2') ? 'crosshair' : 'grab';
        if (stateRef.current.hoveredId !== handle.id) setHoveredId(handle.id);
      } else {
        if (!stateRef.current.activeTool) document.body.style.cursor = '';
        if (stateRef.current.hoveredId !== null) setHoveredId(null);
      }
    };

    const onUp = () => {
      if (dragRef.current) {
        dragRef.current = null;
        document.body.style.cursor = '';
      }
      scheduleDraw();
    };

    const onCtx = (e) => {
      const { x, y } = localXY(e);
      const handle = findHandleAt(x, y);
      if (handle) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setDrawings((prev) => (prev || []).filter((d) => d.id !== handle.id));
        scheduleDraw();
      }
    };

    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('mouseup', onUp, true);
    window.addEventListener('contextmenu', onCtx, true);

    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('mouseup', onUp, true);
      window.removeEventListener('contextmenu', onCtx, true);
      document.body.style.cursor = '';
    };
  }, [hostRef, chartRef, seriesRef, setDrawings, setActiveTool, scheduleDraw, findDeleteHit, findHandleAt, yToPrice, xToTime]);

  // Esc
  useEffect(() => {
    const h = (e) => {
      if (e.key === 'Escape') {
        pendingRef.current = null;
        cursorRef.current = null;
        setActiveTool(null);
        scheduleDraw();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [setActiveTool, scheduleDraw]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full"
      style={{ pointerEvents: 'none', zIndex: 30 }}
    />
  );
}
