import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';

import Sidebar from './components/Sidebar';
import MainMenu from './components/MainMenu';
import TickerInfo from './components/TickerInfo';
import ScannerPanel from './components/ScannerPanel';
import LiquidationPanel from './components/LiquidationPanel';
import TAPanel from './components/TAPanel';
import HeatmapChart from './components/HeatmapChart';
import ChartControls from './components/ChartControls';
import SettingsPanel from './components/SettingsPanel';

import { api } from './lib/api';
import { socket } from './lib/socket';
import { coinLabel, fmtUsd } from './lib/format';

const POLL_MS = 4000;

const AGE_LABEL = (sec) => {
  if (sec === 0) return 'все';
  if (sec < 3600) return `${Math.round(sec / 60)} мин`;
  if (sec < 86400) return `${Math.round(sec / 3600)} ч`;
  return `${Math.round(sec / 86400)} дн`;
};

function autoStepFromPrice(price) {
  if (!isFinite(price) || price <= 0) return 1;
  if (price > 50000) return 100;
  if (price > 10000) return 50;
  if (price > 5000)  return 10;
  if (price > 1000)  return 5;
  if (price > 500)   return 1;
  if (price > 100)   return 0.5;
  if (price > 10)    return 0.1;
  if (price > 1)     return 0.01;
  if (price > 0.1)   return 0.001;
  if (price > 0.01)  return 0.0001;
  return 0.00001;
}

export default function App() {
  const [connected, setConnected] = useState(socket.connected);
  const [symbols, setSymbols] = useState([]);
  const [scores, setScores] = useState([]);
  const [active, setActive] = useState('BTCUSDT');

  const [resolution, setResolution] = useState('15m');
  const [showHeatmap] = useState(true);
  const [showCandles] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [liqOpen, setLiqOpen] = useState(false);
  const [taOpen, setTaOpen] = useState(false);
  const [activeTool, setActiveTool] = useState(null);
  const [drawings, setDrawings] = useState([]);
  const [minWallAge, setMinWallAge] = useState(1800);
  const [minWallUsd, setMinWallUsd] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [candles, setCandles] = useState([]);
  const [walls, setWalls] = useState([]);
  const [liveCandle, setLiveCandle] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const [wallCount, setWallCount] = useState(0);
  const [dbCount, setDbCount] = useState(0);
  const [liveCount, setLiveCount] = useState(0);
  const [drawnCount, setDrawnCount] = useState(0);
  const [offCount, setOffCount] = useState(0);

  const activeRef = useRef(active);
  useEffect(() => { activeRef.current = active; }, [active]);

  // Авто-агрегация по цене
  const step = useMemo(() => {
    if (!candles.length) return 1;
    return autoStepFromPrice(candles[candles.length - 1].close);
  }, [candles]);

  // Список монет
  useEffect(() => {
    let cancelled = false;
    const pull = async () => {
      try {
        const r = await api.symbols();
        if (cancelled) return;
        if (Array.isArray(r.symbols) && r.symbols.length) {
          setSymbols(r.symbols);
          setScores(r.scores || []);
        }
      } catch {}
    };
    pull();
    const id = setInterval(() => {
      if (!cancelled && symbols.length === 0) pull();
    }, 3000);
    return () => { cancelled = true; clearInterval(id); };
  }, [symbols.length]);

  // Socket
  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onSymbolsList = ({ symbols }) => {
      if (Array.isArray(symbols) && symbols.length) setSymbols(symbols);
    };
    const onScores = (payload) => { if (Array.isArray(payload)) setScores(payload); };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('symbols:list', onSymbolsList);
    socket.on('symbols:scores', onScores);
    if (!socket.connected) socket.connect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('symbols:list', onSymbolsList);
      socket.off('symbols:scores', onScores);
    };
  }, []);

  // Свечи
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoading(true);
    setErr('');
    (async () => {
      try {
        const kl = await api.klines(active, resolution, 1000);
        if (cancelled) return;
        setCandles(kl.candles || []);
      } catch (e) {
        if (!cancelled) { setErr(`Свечи: ${e.message}`); setCandles([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [active, resolution]);

  // Live-обновление последней свечи — каждые 2 сек
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timer = 0;

    const poll = async () => {
      try {
        const r = await api.lastCandle(active, resolution);
        if (cancelled) return;
        const c = r.candles || [];
        if (c.length) {
          // передаём последнюю свечу + время открытия (для определения "новая ли")
          setLiveCandle({
            candle: c[c.length - 1],
            prevTime: c.length > 1 ? c[c.length - 2].time : null,
            ts: Date.now(),
          });
        }
      } catch (e) {
        // silent
      }
      if (!cancelled) timer = setTimeout(poll, 2000);
    };
    poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [active, resolution]);

  // Плотности
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timer = 0;

    const poll = async () => {
      try {
        const w = await api.walls(active, minWallAge, minWallUsd);
        if (cancelled) return;
        setDbCount(w.db_count || 0);
        setLiveCount(w.live_count || 0);
        setWalls(w.rows || []);
        setWallCount((w.rows || []).length);
      } catch (e) {
        if (!cancelled) setErr(`Плотности: ${e.message}`);
      }
      if (!cancelled) timer = setTimeout(poll, POLL_MS);
    };
    poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [active, minWallAge, minWallUsd]);

  const activeScore = useMemo(
    () => scores.find((s) => s.symbol === active) || { score: 0, walls: 0 },
    [scores, active]
  );

  // Загрузка рисунков при смене символа
  useEffect(() => {
    if (!active) return;
    import('./components/DrawingLayer').then(({ loadDrawings }) => {
      setDrawings(loadDrawings(active));
      setActiveTool(null);
    });
  }, [active]);

  const handleSelect = useCallback((sym) => setActive(sym), []);
  const handleStats = useCallback(({ drawn, off }) => {
    setDrawnCount(drawn);
    setOffCount(off);
  }, []);

  return (
    <div className="fixed inset-0 flex overflow-hidden text-white"
      style={{
        background: '#000000',
        backgroundImage:
          'radial-gradient(1200px 800px at 50% -10%, rgba(255,255,255,0.045) 0%, transparent 55%),' +
          'radial-gradient(900px 700px at 100% 100%, rgba(120,130,150,0.035) 0%, transparent 60%),' +
          'linear-gradient(180deg, #08090d 0%, #000000 50%, #000000 100%)',
      }}>
      {sidebarOpen && (
        <Sidebar symbols={symbols} scores={scores} active={active}
          onSelect={handleSelect} connected={connected}
          onClose={() => setSidebarOpen(false)} />
      )}

      <main className="relative flex flex-1 flex-col overflow-hidden">
        <header className="relative z-50 flex shrink-0 items-center justify-between border-b border-line bg-panel/60 px-4 py-2.5 backdrop-blur overflow-visible">
          <div className="flex items-center gap-3">
            <MainMenu onAction={(id) => {
              if (id === 'pumpdump') setScannerOpen(true);
              if (id === 'liquidations') setLiqOpen(true);
              if (id === 'ta') setTaOpen(true);
            }} />

            <h1 className="font-mono text-[17px] font-semibold tracking-tight text-white">
              {coinLabel(active)}
              <span className="ml-1.5 text-[11px] font-normal text-mute">USDT · PERP</span>
            </h1>

            <TickerInfo symbol={active} />

            {loading && <span className="font-mono text-[10px] text-mute">загрузка…</span>}
            {err && <span className="font-mono text-[10px] text-crimson">{err}</span>}
          </div>
        </header>

        <ChartControls
          resolution={resolution} setResolution={setResolution}
          onOpenSettings={() => setSettingsOpen(true)}
          activeTool={activeTool} setActiveTool={setActiveTool}
          drawingsCount={drawings.length}
          onClearDrawings={() => setDrawings([])}
        
          sidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
        />

        <div className="relative min-h-0 flex-1 overflow-hidden">
          <HeatmapChart
            
            activeTool={activeTool} setActiveTool={setActiveTool}
            drawings={drawings} setDrawings={setDrawings}
            symbol={active}
            candles={candles}
            walls={walls}
            step={step}
            showHeatmap={showHeatmap}
            showCandles={showCandles}
            onStats={handleStats}
            liveCandle={liveCandle}
          />
        </div>
      </main>

      {liqOpen && (
        <LiquidationPanel symbols={symbols} onClose={() => setLiqOpen(false)} />
      )}

      {scannerOpen && (
        <ScannerPanel
          onClose={() => setScannerOpen(false)}
          onSelectSymbol={(sym) => setActive(sym)}
        />
      )}

      {taOpen && (
        <TAPanel
          symbols={symbols}
          active={active}
          onClose={() => setTaOpen(false)}
          onSelectSymbol={(sym) => setActive(sym)}
        />
      )}

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        minWallAge={minWallAge} setMinWallAge={setMinWallAge}
        minWallUsd={minWallUsd} setMinWallUsd={setMinWallUsd}
        resolution={resolution} setResolution={setResolution}
      />
    </div>
  );
}
