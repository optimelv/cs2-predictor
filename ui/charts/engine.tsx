import { useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Area, AreaChart, XAxis, YAxis } from 'recharts';
import { ChartContainer, type ChartConfig } from '../components/ui/chart';

type Point = { value: number };
type Series = { label: string; points: Point[] };
type Config = { series: Series[] };
type Domain = { min: number; max: number };

// Different histories share relative series order, never an invented date.
// A union of ordinal positions preserves every observation and the native
// keyboard/tooltip layer's exact 640×260 coordinate system.
export function ordinalRows(series: Series[]) {
  const rows = new Map<number, Record<string, number | null>>();
  series.forEach((entry, seriesIndex) => {
    entry.points.forEach((point, index) => {
      const ordinal = entry.points.length < 2 ? 0.5 : index / (entry.points.length - 1);
      const row = rows.get(ordinal) || { ordinal };
      row[`series${seriesIndex}`] = point.value;
      rows.set(ordinal, row);
    });
  });
  return [...rows.values()].sort((a, b) => Number(a.ordinal) - Number(b.ordinal));
}

export function mountChart(figure: HTMLElement, config: Config, domain: Domain) {
  const wrap = figure.querySelector<HTMLElement>('.interactive-chart-plot-wrap');
  const plot = figure.querySelector<SVGElement>('.interactive-line-chart-plot');
  if (!wrap || !plot) return () => {};
  const host = document.createElement('div');
  host.className = 'chart-engine-host';
  host.setAttribute('aria-hidden', 'true');
  host.inert = true;
  const stage = document.createElement('div');
  host.append(stage);
  wrap.prepend(host);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const chartConfig: ChartConfig = Object.fromEntries(config.series.map((entry, index) => [
    `series${index}`, { label: entry.label, color: `var(--chart-${index % 4 + 1})` },
  ]));
  const data = ordinalRows(config.series);
  let entrance: Animation | undefined;
  const selectedButton = figure.querySelector<HTMLElement>('[data-chart-series][aria-pressed="true"]');
  let selected: number | null = selectedButton ? Number(selectedButton.dataset.chartSeries) : null;
  let mounted = false;
  const ready = () => {
    figure.classList.add('is-engine-ready');
    figure.dataset.chartEngine = 'shadcn-recharts';
    if (mounted) return;
    mounted = true;
    if (!reducedMotion.matches && document.documentElement.dataset.inputMode !== 'keyboard') {
      entrance = host.animate([
        { opacity: 0.65, transform: 'translateY(4px)' },
        { opacity: 1, transform: 'none' },
      ], { duration: 150, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
    }
  };
  const root = createRoot(stage, {
    onUncaughtError: () => {
      figure.classList.remove('is-engine-ready');
      figure.dataset.chartEngine = 'fallback';
      host.hidden = true;
    },
  });
  function Plot() {
    useLayoutEffect(ready, []);
    // The outer stage scales to the native SVG. Keep Recharts geometry fixed,
    // including while a route/dialog is hidden, instead of observing 0×0.
    return <ChartContainer config={chartConfig} fixedSize={{ width: 640, height: 260 }}>
      <AreaChart data={data} margin={{ top: 20, right: 20, bottom: 34, left: 42 }} accessibilityLayer={false}>
        <XAxis dataKey="ordinal" type="number" domain={[0, 1]} hide allowDataOverflow />
        <YAxis type="number" domain={[domain.min, domain.max]} hide allowDataOverflow />
        <defs>{config.series.map((_, index) => <linearGradient key={index} id={`${figure.dataset.chartId}-engine-${index}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={`var(--chart-${index % 4 + 1})`} stopOpacity={0.2} />
          <stop offset="100%" stopColor={`var(--chart-${index % 4 + 1})`} stopOpacity={0} />
        </linearGradient>)}</defs>
        {config.series.map((_, index) => <Area key={index} type="linear" dataKey={`series${index}`}
          baseValue={domain.min} connectNulls isAnimationActive={false} dot={false} activeDot={false}
          stroke={`var(--color-series${index})`} strokeWidth={2} fill={`url(#${figure.dataset.chartId}-engine-${index})`}
          fillOpacity={1} opacity={selected === null || selected === index ? 1 : 0.18} />)}
      </AreaChart>
    </ChartContainer>;
  }
  const resize = () => {
    const { width, height } = plot.getBoundingClientRect();
    stage.style.transform = `scale(${width / 640}, ${height / 260})`;
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(plot);
  resize();
  const onSelection = (event: Event) => {
    selected = (event as CustomEvent<number | null>).detail;
    root.render(<Plot />);
  };
  const stopMotion = () => { if (reducedMotion.matches) entrance?.cancel(); };
  const onKey = () => entrance?.cancel();
  figure.addEventListener('chart-series-change', onSelection);
  figure.addEventListener('keydown', onKey);
  reducedMotion.addEventListener('change', stopMotion);
  root.render(<Plot />);
  return () => {
    entrance?.cancel();
    resizeObserver.disconnect();
    figure.removeEventListener('chart-series-change', onSelection);
    figure.removeEventListener('keydown', onKey);
    reducedMotion.removeEventListener('change', stopMotion);
    root.unmount();
    host.remove();
    figure.classList.remove('is-engine-ready');
  };
}
