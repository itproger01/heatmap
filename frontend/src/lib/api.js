const j = async (url, opts) => {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
};

export const api = {
  symbols: () => j('/api/symbols'),
  klines: (symbol, interval = '1m', limit = 1000) =>
    j(`/api/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`),
  history: (symbol, resolution = '1m', step = 1) =>
    j(`/api/heatmap/history?symbol=${symbol}&resolution=${resolution}&step=${step}`),
  lastCandle: (symbol, interval = '1m') =>
    j(`/api/last_candle?symbol=${symbol}&interval=${interval}`),
  walls: (symbol, minAgeSec = 1800, minUsd = 0) =>
    j(`/api/walls?symbol=${symbol}&min_age=${minAgeSec}&min_usd=${minUsd}`),
  getConfig: () => j('/api/config'),
  setConfig: (data) =>
    j('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  health: () => j('/api/health'),
};
