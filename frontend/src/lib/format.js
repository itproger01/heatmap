export const fmtUsd = (v) => {
  if (v == null || isNaN(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
};

export const fmtPrice = (v) => {
  if (v == null) return '—';
  const a = Math.abs(v);
  if (a >= 1000) return v.toFixed(2);
  if (a >= 1) return v.toFixed(4);
  if (a >= 0.01) return v.toFixed(5);
  return v.toFixed(8);
};

export const fmtLifespan = (sec) => {
  if (sec == null) return '—';
  if (sec < 60) return `${sec.toFixed(0)} сек`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} мин ${Math.floor(sec % 60)} сек`;
  const h = Math.floor(m / 60);
  return `${h} ч ${m % 60} мин`;
};

export const coinLabel = (symbol) =>
  symbol ? symbol.replace(/USDT$/, '') : '';
