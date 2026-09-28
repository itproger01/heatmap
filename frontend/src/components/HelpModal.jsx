import React from 'react';

function Section({ title, color, children }) {
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-3">
        <span className="w-1 h-4 rounded-full" style={{ background: color }} />
        <h3 className="text-[13px] font-semibold" style={{ color }}>
          {title}
        </h3>
      </div>
      <div className="text-[12px] leading-relaxed" style={{ color: 'rgba(200,208,220,0.8)' }}>
        {children}
      </div>
    </div>
  );
}

function Row({ icon, title, children }) {
  return (
    <div className="flex gap-3 items-start">
      <span className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-[13px]"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {icon}
      </span>
      <div className="flex-1">
        <div className="text-[12px] font-semibold text-white/90 mb-0.5">{title}</div>
        <div className="text-[11.5px] leading-relaxed" style={{ color: 'rgba(200,208,220,0.7)' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function Bullet({ children }) {
  return (
    <div className="flex gap-2 items-start">
      <span className="shrink-0 mt-2 w-1 h-1 rounded-full" style={{ background: '#ffb020' }} />
      <div style={{ color: 'rgba(200,208,220,0.75)' }}>{children}</div>
    </div>
  );
}

export default function HelpModal({ onClose }) {
  return (
    <div
      className="fixed inset-0 z-[600] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-[860px] max-w-[96vw] max-h-[90vh] overflow-y-auto rounded-2xl"
        style={{
          background: 'linear-gradient(180deg, rgba(18,22,28,0.99) 0%, rgba(8,10,14,0.99) 100%)',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 40px 120px -20px rgba(0,0,0,0.95), inset 0 1px 0 rgba(255,255,255,0.08)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px"
             style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)' }} />

        <div className="flex items-center justify-between gap-4 border-b border-white/[0.06] px-6 py-4 sticky top-0"
             style={{ background: 'linear-gradient(180deg, rgba(18,22,28,0.99) 0%, rgba(18,22,28,0.95) 100%)', zIndex: 10 }}>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg"
                 style={{ background: 'linear-gradient(135deg, rgba(0,229,255,0.18), rgba(124,92,255,0.18))',
                          border: '1px solid rgba(0,229,255,0.4)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00e5ff" strokeWidth="1.8">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12" y2="17.01" />
              </svg>
            </div>
            <div>
              <div className="text-[16px] font-semibold text-white">Как читать технический анализ</div>
              <div className="text-[10.5px] text-mute mt-0.5">Инструкция по всем элементам системы</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-mute hover:bg-white/[0.06] hover:text-white"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">

          <Section title="Что это" color="#00e5ff">
            Терминал автоматически анализирует график и подсвечивает <b>ключевые ценовые уровни</b> и <b>графические паттерны</b>.
            Это помогает понять — где цена раньше останавливалась, куда она движется, и какие фигуры формируются.
          </Section>

          <Section title="Ценовые уровни (поддержка / сопротивление)" color="#00ff88">
            <div className="space-y-3">
              <Row icon="🟢" title="Поддержка (Support)">
                Уровень <b>снизу</b> от текущей цены. Цена несколько раз отскакивала <b>вверх</b> от него.
                Чем больше касаний — тем сильнее уровень.
              </Row>
              <Row icon="🔴" title="Сопротивление (Resistance)">
                Уровень <b>сверху</b> от текущей цены. Цена несколько раз отскакивала <b>вниз</b> от него.
              </Row>
              <Row icon="│" title="Вертикальные штрихи на уровне">
                <b>Тики касаний</b> — показывают точное место, где цена касалась уровня.
                Один штрих = одно касание.
              </Row>
              <Row icon="🏷" title="Метка справа">
                Показывает <b>цену уровня</b> и <b>количество касаний</b> (например <code>84,662 10 кас.</code>).
              </Row>
            </div>
          </Section>

          <Section title="Графические паттерны" color="#8b7cff">
            <div className="space-y-3">
              <Row icon="△" title="Восходящий треугольник">
                Верхняя граница <b>горизонтальная</b>, нижняя <b>растёт вверх</b>. Обычно → пробой вверх.
              </Row>
              <Row icon="▽" title="Нисходящий треугольник">
                Нижняя граница <b>горизонтальная</b>, верхняя <b>падает</b>. Часто → пробой вниз.
              </Row>
              <Row icon="◈" title="Симметричный треугольник">
                Обе линии <b>сходятся друг к другу</b>. Направление пробоя непредсказуемо.
              </Row>
              <Row icon="═" title="Канал (восходящий / нисходящий)">
                Две <b>параллельные</b> линии. Цена движется между ними.
              </Row>
              <Row icon="↔" title="Боковик">
                Обе линии <b>горизонтальные</b>. Цена ходит в узком диапазоне.
              </Row>
              <Row icon="%" title="Проценты на паттерне">
                <b>Уверенность алгоритма</b> (0-100%). Выше 65% — паттерн чёткий.
              </Row>
            </div>
          </Section>

          <Section title="Определение тренда" color="#00e5ff">
            <div className="space-y-3">
              <Row icon="↗" title="Восходящий тренд">
                Цена стабильно движется <b>вверх</b>.
              </Row>
              <Row icon="↘" title="Нисходящий тренд">
                Цена стабильно движется <b>вниз</b>.
              </Row>
              <Row icon="↔" title="Боковик (флэт)">
                Цена <b>без направления</b>, ходит в диапазоне.
              </Row>
              <Row icon="▓" title="Сила тренда 1-3">
                <b>1</b> — слабый, <b>2</b> — умеренный, <b>3</b> — сильный.
              </Row>
            </div>
          </Section>

          <Section title="Как читать сигналы" color="#ffb020">
            <div className="space-y-2 text-[12px]">
              <Bullet>
                <b>Цена у поддержки</b> — следи за реакцией. Отскок вверх → сигнал роста. Пробой вниз → сигнал падения.
              </Bullet>
              <Bullet>
                <b>Цена у сопротивления</b> — отскок вниз → сигнал падения. Пробой вверх → сигнал роста.
              </Bullet>
              <Bullet>
                <b>Сжатие внутри треугольника</b> — готовится движение. Чем уже сжатие — тем сильнее пробой.
              </Bullet>
              <Bullet>
                <b>Больше касаний</b> у уровня = сильнее уровень. 5+ касаний = институциональный.
              </Bullet>
              <Bullet>
                <b>Тренд + Паттерн совпадают</b> — максимальная уверенность в направлении.
              </Bullet>
            </div>
          </Section>

          <div className="rounded-xl px-4 py-3 mt-2"
               style={{ background: 'rgba(255,51,102,0.06)', border: '1px solid rgba(255,51,102,0.22)' }}>
            <div className="flex items-start gap-3">
              <span className="text-[16px] mt-0.5" style={{ color: '#ff3366' }}>⚠</span>
              <div>
                <div className="text-[12px] font-semibold mb-1" style={{ color: '#ff3366' }}>
                  Это не финансовый совет
                </div>
                <div className="text-[11.5px] leading-relaxed" style={{ color: 'rgba(220,226,235,0.75)' }}>
                  Терминал показывает <b>технические паттерны</b>, но не даёт рекомендаций покупать или продавать.
                  Все решения принимайте самостоятельно.
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
