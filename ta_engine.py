"""
Движок технического анализа.
Определяет: swing points, уровни S/R, тренды, каналы, паттерны.
"""
import math
from typing import List, Dict, Any, Tuple


def find_pivots(highs, lows, left=5, right=5):
    """Находит swing high/low точки (pivots)."""
    ph, pl = [], []
    n = len(highs)
    for i in range(left, n - right):
        window_h = highs[i - left:i + right + 1]
        window_l = lows[i - left:i + right + 1]
        if highs[i] == max(window_h):
            ph.append({"i": i, "p": highs[i]})
        if lows[i] == min(window_l):
            pl.append({"i": i, "p": lows[i]})
    return ph, pl


def cluster_levels(points, tolerance_pct=0.5, candles=None):
    """Кластеризация близких точек в уровни с координатами касаний."""
    if not points:
        return []
    pts = sorted(points, key=lambda x: x["p"])
    clusters = []
    cur = [pts[0]]
    for p in pts[1:]:
        ref = cur[-1]["p"]
        if abs(p["p"] - ref) / ref * 100 <= tolerance_pct:
            cur.append(p)
        else:
            clusters.append(cur)
            cur = [p]
    clusters.append(cur)

    total_bars = len(candles) if candles else 0
    levels = []
    for c in clusters:
        if len(c) < 2:
            continue
        avg_p = sum(x["p"] for x in c) / len(c)
        last_i = max(x["i"] for x in c)
        first_i = min(x["i"] for x in c)
        bars_ago = total_bars - 1 - last_i if total_bars else 0
        levels.append({
            "price": avg_p,
            "touches": len(c),
            "last_i": last_i,
            "first_i": first_i,
            "bars_ago": bars_ago,
            "strength": min(100, len(c) * 20),
            "points_i": [int(x["i"]) for x in c],
        })
    levels.sort(key=lambda x: (-x["strength"], -x["touches"]))
    return levels


def linreg(y):
    """Линейная регрессия. Возвращает (slope, intercept)."""
    n = len(y)
    if n < 2:
        return 0, y[0] if y else 0
    xs = list(range(n))
    mx = sum(xs) / n
    my = sum(y) / n
    num = sum((xs[i] - mx) * (y[i] - my) for i in range(n))
    den = sum((xs[i] - mx) ** 2 for i in range(n))
    slope = num / den if den else 0
    return slope, my - slope * mx


def detect_trend(closes, highs, lows):
    """Определяет тренд по линейной регрессии закрытий."""
    n = len(closes)
    if n < 20:
        return {"trend": "unknown", "strength": 0, "slope_pct": 0}

    sample = closes[-50:] if n >= 50 else closes
    k = len(sample)
    ys = sample
    xs = list(range(k))
    mx = sum(xs) / k
    my = sum(ys) / k
    num = sum((xs[i] - mx) * (ys[i] - my) for i in range(k))
    den = sum((xs[i] - mx) ** 2 for i in range(k))
    slope = num / den if den else 0
    slope_pct = (slope / my * 100) if my else 0

    ph, pl = find_pivots(highs, lows, 3, 3)
    recent_ph = [p for p in ph if p["i"] > n - 40]
    recent_pl = [p for p in pl if p["i"] > n - 40]

    hl_higher = len(recent_ph) >= 2 and recent_ph[-1]["p"] > recent_ph[0]["p"]
    ll_higher = len(recent_pl) >= 2 and recent_pl[-1]["p"] > recent_pl[0]["p"]
    hl_lower = len(recent_ph) >= 2 and recent_ph[-1]["p"] < recent_ph[0]["p"]
    ll_lower = len(recent_pl) >= 2 and recent_pl[-1]["p"] < recent_pl[0]["p"]

    if slope_pct > 0.05 and hl_higher and ll_higher:
        trend, strength = "up", 3
    elif slope_pct > 0.02:
        trend, strength = "up", 2
    elif slope_pct > 0.005:
        trend, strength = "up", 1
    elif slope_pct < -0.05 and hl_lower and ll_lower:
        trend, strength = "down", 3
    elif slope_pct < -0.02:
        trend, strength = "down", 2
    elif slope_pct < -0.005:
        trend, strength = "down", 1
    else:
        trend, strength = "flat", 0

    return {
        "trend": trend,
        "strength": strength,
        "slope_pct": round(slope_pct, 4),
        "bars_analyzed": len(sample),
    }


def detect_range(highs, lows, closes, lookback=50):
    """Определяет боковик (range)."""
    if len(closes) < lookback:
        lookback = len(closes)
    h = max(highs[-lookback:])
    l = min(lows[-lookback:])
    mid = (h + l) / 2
    width_pct = (h - l) / mid * 100

    touches_hi = sum(1 for c in closes[-lookback:] if c >= h * 0.995)
    touches_lo = sum(1 for c in closes[-lookback:] if c <= l * 1.005)

    is_range = width_pct < 8 and touches_hi >= 1 and touches_lo >= 1

    return {
        "is_range": is_range,
        "high": h,
        "low": l,
        "width_pct": round(width_pct, 2),
        "touches_high": touches_hi,
        "touches_low": touches_lo,
    }


def detect_pattern(highs, lows, closes):
    """
    Паттерн по OBB (огибающим) линиям.
    Верхняя линия — через максимумы в начале и конце окна.
    Нижняя — через минимумы.
    """
    n = len(closes)
    empty = {"pattern": "нет чёткого паттерна", "confidence": 0, "lines": [],
             "start_i": 0, "end_i": n - 1, "hi_slope": 0, "lo_slope": 0}
    if n < 40:
        return empty

    ph, pl = find_pivots(highs, lows, 3, 3)
    win_start = int(n * 0.3)
    recent_ph = [p for p in ph if p["i"] >= win_start]
    recent_pl = [p for p in pl if p["i"] >= win_start]

    if len(recent_ph) < 3 or len(recent_pl) < 3:
        return empty

    i_lo = recent_ph[0]["i"]
    i_hi = n - 1
    span = i_hi - i_lo
    if span <= 0:
        return empty

    def top_pivot_in(range_lo, range_hi):
        candidates = [p for p in recent_ph if range_lo <= p["i"] <= range_hi]
        if not candidates:
            return None
        return max(candidates, key=lambda p: p["p"])

    def bottom_pivot_in(range_lo, range_hi):
        candidates = [p for p in recent_pl if range_lo <= p["i"] <= range_hi]
        if not candidates:
            return None
        return min(candidates, key=lambda p: p["p"])

    t1_lo, t1_hi = i_lo, i_lo + span // 3
    t3_lo, t3_hi = i_hi - span // 3, i_hi

    hi_p1 = top_pivot_in(t1_lo, t1_hi)
    hi_p2 = top_pivot_in(t3_lo, t3_hi)
    lo_p1 = bottom_pivot_in(t1_lo, t1_hi)
    lo_p2 = bottom_pivot_in(t3_lo, t3_hi)

    if not (hi_p1 and hi_p2 and lo_p1 and lo_p2):
        return empty

    hi_slope = (hi_p2["p"] - hi_p1["p"]) / max(1, hi_p2["i"] - hi_p1["i"])
    lo_slope = (lo_p2["p"] - lo_p1["p"]) / max(1, lo_p2["i"] - lo_p1["i"])

    avg_price = sum(closes[-50:]) / min(50, len(closes))
    hi_pct = (hi_slope / avg_price) * 100
    lo_pct = (lo_slope / avg_price) * 100

    FLAT = 0.025
    SLOPE = 0.06

    hi_flat = abs(hi_pct) < FLAT
    lo_flat = abs(lo_pct) < FLAT
    hi_up = hi_pct > SLOPE
    hi_down = hi_pct < -SLOPE
    lo_up = lo_pct > SLOPE
    lo_down = lo_pct < -SLOPE

    w_start = hi_p1["p"] - lo_p1["p"]
    w_end = hi_p2["p"] - lo_p2["p"]
    if w_start <= 0:
        w_start = avg_price * 0.01
    if w_end <= 0:
        w_end = avg_price * 0.005
    shrink = (w_start - w_end) / w_start

    pattern = "нет чёткого паттерна"
    confidence = 0

    if hi_flat and lo_flat:
        pattern = "Боковик"
        confidence = 75
    elif shrink > 0.35:
        if hi_flat and lo_up:
            pattern = "Восходящий треугольник"
            confidence = min(90, 65 + int(shrink * 30))
        elif lo_flat and hi_down:
            pattern = "Нисходящий треугольник"
            confidence = min(90, 65 + int(shrink * 30))
        elif hi_down and lo_up:
            pattern = "Симметричный треугольник"
            confidence = min(88, 60 + int(shrink * 30))
    elif shrink < -0.35 and hi_up and lo_down:
        pattern = "Расширяющийся треугольник"
        confidence = 60
    else:
        slope_diff = abs(hi_pct - lo_pct)
        max_slope = max(abs(hi_pct), abs(lo_pct))
        parallel = max_slope > 0 and slope_diff / max_slope < 0.5
        if parallel and hi_up and lo_up:
            pattern = "Восходящий канал"
            confidence = 65
        elif parallel and hi_down and lo_down:
            pattern = "Нисходящий канал"
            confidence = 65
        elif hi_down and lo_up and shrink > 0.15:
            pattern = "Симметричный треугольник"
            confidence = 55

    hi_int = hi_p1["p"] - hi_slope * hi_p1["i"]
    lo_int = lo_p1["p"] - lo_slope * lo_p1["i"]

    start_i = min(hi_p1["i"], lo_p1["i"])
    end_i = n - 1

    hi_y1 = hi_slope * start_i + hi_int
    hi_y2 = hi_slope * end_i + hi_int
    lo_y1 = lo_slope * start_i + lo_int
    lo_y2 = lo_slope * end_i + lo_int

    max_above = 0
    min_below = 0
    for i in range(start_i, end_i + 1):
        h = highs[i]
        l = lows[i]
        hi_line_y = hi_slope * i + hi_int
        lo_line_y = lo_slope * i + lo_int
        if h > hi_line_y:
            max_above = max(max_above, h - hi_line_y)
        if l < lo_line_y:
            min_below = max(min_below, lo_line_y - l)

    recent_highs = highs[win_start:]
    recent_lows = lows[win_start:]
    atr = sum(h - l for h, l in zip(recent_highs, recent_lows)) / max(1, len(recent_highs))
    padding = atr * 0.1

    hi_y1 += max_above + padding
    hi_y2 += max_above + padding
    lo_y1 -= (min_below + padding)
    lo_y2 -= (min_below + padding)

    lines = [
        {"type": "upper", "x1": start_i, "y1": hi_y1, "x2": end_i, "y2": hi_y2},
        {"type": "lower", "x1": start_i, "y1": lo_y1, "x2": end_i, "y2": lo_y2},
    ]

    return {
        "pattern": pattern,
        "confidence": confidence,
        "hi_slope": round(hi_pct, 4),
        "lo_slope": round(lo_pct, 4),
        "start_i": start_i,
        "end_i": end_i,
        "lines": lines,
    }


def build_trend_lines(highs, lows, closes, ph, pl):
    """Строит линии тренда через линейную регрессию по всем pivots."""
    n = len(closes)
    lines = []
    cutoff_i = max(0, n - 80)

    def fit(points):
        if len(points) < 2:
            return None
        xs = [p["i"] for p in points]
        ys = [p["p"] for p in points]
        k = len(xs)
        mx = sum(xs) / k
        my = sum(ys) / k
        num = sum((xs[i] - mx) * (ys[i] - my) for i in range(k))
        den = sum((xs[i] - mx) ** 2 for i in range(k))
        if den == 0:
            return None
        slope = num / den
        intercept = my - slope * mx
        return slope, intercept

    recent_pl = [p for p in pl if p["i"] >= cutoff_i]
    if len(recent_pl) >= 2:
        f = fit(recent_pl)
        if f:
            slope, intercept = f
            x1 = recent_pl[0]["i"]
            y1 = slope * x1 + intercept
            x2 = n - 1
            y2 = slope * x2 + intercept
            lines.append({
                "type": "support_trend",
                "x1": x1, "y1": y1,
                "x2": x2, "y2": y2,
                "slope": slope,
            })

    recent_ph = [p for p in ph if p["i"] >= cutoff_i]
    if len(recent_ph) >= 2:
        f = fit(recent_ph)
        if f:
            slope, intercept = f
            x1 = recent_ph[0]["i"]
            y1 = slope * x1 + intercept
            x2 = n - 1
            y2 = slope * x2 + intercept
            lines.append({
                "type": "resistance_trend",
                "x1": x1, "y1": y1,
                "x2": x2, "y2": y2,
                "slope": slope,
            })

    return lines


def generate_summary(trend, range_info, pattern, levels_sup, levels_res):
    """Текстовый анализ."""
    out = []
    t = trend["trend"]
    s = trend["strength"]

    if t == "up":
        if s >= 3:
            out.append(("Тренд", "Сильный восходящий", "green",
                        "Цена уверенно растёт."))
        elif s == 2:
            out.append(("Тренд", "Восходящий", "green",
                        "Умеренный рост. Возможны коррекции."))
        else:
            out.append(("Тренд", "Слабый восходящий", "lime",
                        "Рост едва заметен."))
    elif t == "down":
        if s >= 3:
            out.append(("Тренд", "Сильный нисходящий", "red",
                        "Активное падение."))
        elif s == 2:
            out.append(("Тренд", "Нисходящий", "red",
                        "Умеренное снижение."))
        else:
            out.append(("Тренд", "Слабый нисходящий", "orange",
                        "Лёгкое снижение."))
    else:
        out.append(("Тренд", "Боковик", "gray",
                    "Цена в диапазоне."))

    if range_info["is_range"]:
        out.append(("Диапазон",
                    f"{range_info['low']:.6g} — {range_info['high']:.6g}",
                    "cyan",
                    f"Ширина {range_info['width_pct']:.1f}%."))

    out.append(("Паттерн", pattern["pattern"], "violet",
                f"Уверенность {pattern['confidence']}%"))

    if levels_sup:
        top = levels_sup[0]
        out.append(("Ближ. поддержка",
                    f"{top['price']:.6g}  ({top['touches']} кас.)",
                    "green",
                    "Отскок вверх → сигнал роста."))

    if levels_res:
        top = levels_res[0]
        out.append(("Ближ. сопротивление",
                    f"{top['price']:.6g}  ({top['touches']} кас.)",
                    "red",
                    "Отскок вниз → сигнал падения."))

    return out


def attach_time(levels, times, all_pivots):
    """Заполняет time и points_t для уровня."""
    for lv in levels:
        idx = lv.get("last_i", 0)
        if 0 <= idx < len(times):
            lv["time"] = times[idx]
        else:
            lv["time"] = times[-1] if times else 0

        price = lv["price"]
        tol = max(abs(price) * 0.001, 1e-8)
        pts_t = []
        for piv in all_pivots:
            if abs(piv["p"] - price) <= tol:
                pi = piv["i"]
                if 0 <= pi < len(times):
                    pts_t.append(times[pi])

        if len(pts_t) < lv.get("touches", 0):
            for pi in lv.get("points_i", []):
                if 0 <= pi < len(times):
                    t = times[pi]
                    if t not in pts_t:
                        pts_t.append(t)

        pts_t.sort()
        lv["points_t"] = pts_t
        lv.pop("points_i", None)

    return levels


def analyze_candles(candles: List[Dict]) -> Dict[str, Any]:
    """Полный анализ свечей."""
    if len(candles) < 30:
        return {"error": "Недостаточно данных"}

    closes = [c["close"] for c in candles]
    highs = [c["high"] for c in candles]
    lows = [c["low"] for c in candles]
    times = [c["time"] for c in candles]

    ph, pl = find_pivots(highs, lows, 3, 3)
    levels_sup_raw = [{"p": p["p"], "i": p["i"]} for p in pl]
    levels_res_raw = [{"p": p["p"], "i": p["i"]} for p in ph]

    tolerance = 0.4
    sup_levels_all = cluster_levels(levels_sup_raw, tolerance)
    res_levels_all = cluster_levels(levels_res_raw, tolerance)

    cur = closes[-1]

    sup_levels = [l for l in sup_levels_all if l["price"] < cur * 0.9995]
    sup_levels.sort(key=lambda x: -x["price"])
    sup_levels = sup_levels[:4]

    res_levels = [l for l in res_levels_all if l["price"] > cur * 1.0005]
    res_levels.sort(key=lambda x: x["price"])
    res_levels = res_levels[:4]

    trend = detect_trend(closes, highs, lows)
    range_info = detect_range(highs, lows, closes)
    pattern = detect_pattern(highs, lows, closes)
    trend_lines = build_trend_lines(highs, lows, closes, ph, pl)
    summary = generate_summary(trend, range_info, pattern, sup_levels, res_levels)

    # объединяем все pivots для поиска касаний
    all_pivots_combined = list(ph) + list(pl)
    sup_levels = attach_time(sup_levels, times, all_pivots_combined)
    res_levels = attach_time(res_levels, times, all_pivots_combined)

    # конвертируем индексы trend_lines в time
    for tl in trend_lines:
        i1 = int(tl.get("x1", 0))
        i2 = int(tl.get("x2", 0))
        i1 = max(0, min(len(times) - 1, i1))
        i2 = max(0, min(len(times) - 1, i2))
        tl["time1"] = times[i1]
        tl["time2"] = times[i2]

    # конвертируем индексы паттерна в time
    if pattern.get("start_i") is not None and 0 <= pattern["start_i"] < len(times):
        pattern["start_time"] = times[pattern["start_i"]]
    if pattern.get("end_i") is not None and 0 <= pattern["end_i"] < len(times):
        pattern["end_time"] = times[pattern["end_i"]]

    for line in pattern.get("lines", []):
        i1 = int(line.get("x1", 0))
        i2 = int(line.get("x2", 0))
        i1 = max(0, min(len(times) - 1, i1))
        i2 = max(0, min(len(times) - 1, i2))
        line["time1"] = times[i1]
        line["time2"] = times[i2]

    return {
        "symbol_price": cur,
        "trend": trend,
        "range": range_info,
        "pattern": pattern,
        "support_levels": sup_levels,
        "resistance_levels": res_levels,
        "trend_lines": trend_lines,
        "summary": summary,
        "candles_count": len(candles),
    }
