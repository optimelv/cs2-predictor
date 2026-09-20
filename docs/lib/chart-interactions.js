const CHART_SELECTOR = "[data-interactive-line-chart]";
const SVG_WIDTH = 640;
const SVG_HEIGHT = 260;
const PADDING = { top: 20, right: 20, bottom: 34, left: 42 };

const rootInstallations = new WeakMap();
const chartConfigs = new WeakMap();
const chartStates = new WeakMap();

function asText(value, fallback = "Not available") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function numberOrNull(value) {
  if (value === null || value === undefined || (typeof value === "string" && !value.trim())) return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function safeId(value, fallback) {
  const id = String(value ?? "").trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return id || fallback;
}

function encodeConfig(config) {
  return encodeURIComponent(JSON.stringify(config));
}

function decodeConfig(chart) {
  if (chartConfigs.has(chart)) return chartConfigs.get(chart);
  try {
    const encoded = chart.getAttribute("data-chart-config") || "";
    const config = encoded ? JSON.parse(decodeURIComponent(encoded)) : null;
    if (!config || !Array.isArray(config.series)) return null;
    const normalized = normalizeChartSeries(config.series);
    const result = { ...config, series: normalized };
    chartConfigs.set(chart, result);
    return result;
  } catch {
    return null;
  }
}

export function normalizeChartSeries(series) {
  if (!Array.isArray(series)) return [];
  return series.map((entry, seriesIndex) => {
    const points = Array.isArray(entry?.points) ? entry.points : [];
    return {
      id: safeId(entry?.id, `series-${seriesIndex + 1}`),
      label: asText(entry?.label, `Series ${seriesIndex + 1}`),
      points: points.map((point, pointIndex) => {
        const value = numberOrNull(point?.value);
        if (value === null) return null;
        return {
          id: safeId(point?.id, `${seriesIndex + 1}-${pointIndex + 1}`),
          label: asText(point?.label),
          value,
          formattedValue: typeof point?.formattedValue === "string" ? point.formattedValue : null,
          details: Array.isArray(point?.details)
            ? point.details.map((detail) => asText(detail)).filter((detail) => detail !== "Not available")
            : [],
          originalIndex: pointIndex,
        };
      }).filter(Boolean),
    };
  }).filter((entry) => entry.points.length);
}

export function getLineChartDomain(series, baseline = null) {
  const values = series.flatMap((entry) => entry.points.map((point) => point.value));
  const finiteBaseline = numberOrNull(baseline);
  if (finiteBaseline !== null) values.push(finiteBaseline);
  if (!values.length) return { min: 0, max: 1, range: 1 };
  const low = Math.min(...values);
  const high = Math.max(...values);
  const rawRange = high - low;
  const padding = rawRange ? Math.max(rawRange * 0.12, 0.01) : Math.max(Math.abs(high) * 0.12, 0.12);
  const min = low - padding;
  const max = high + padding;
  return { min, max, range: Math.max(max - min, 0.01) };
}

export function pointToPlotPosition(point, pointIndex, pointCount, domain, dimensions = {}) {
  const width = numberOrNull(dimensions.width) ?? SVG_WIDTH;
  const height = numberOrNull(dimensions.height) ?? SVG_HEIGHT;
  const padding = { ...PADDING, ...(dimensions.padding || {}) };
  const plotWidth = Math.max(1, width - padding.left - padding.right);
  const plotHeight = Math.max(1, height - padding.top - padding.bottom);
  const x = padding.left + (pointCount < 2 ? plotWidth / 2 : pointIndex / (pointCount - 1) * plotWidth);
  const y = padding.top + (domain.max - point.value) / domain.range * plotHeight;
  return { x, y, plotWidth, plotHeight };
}

export function findNearestPoint(points, x, y, yWeight = 0.22) {
  if (!Array.isArray(points) || !points.length || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return points.reduce((nearest, point) => {
    const distance = (point.x - x) ** 2 + ((point.y - y) ** 2) * yWeight;
    return !nearest || distance < nearest.distance ? { point, distance } : nearest;
  }, null)?.point || null;
}

function formatValue(value, config, formattedValue = null) {
  if (!Number.isFinite(value)) return "Not available";
  if (formattedValue) return formattedValue;
  if (typeof config.valueFormat === "function") {
    try { return String(config.valueFormat(value)); } catch { /* fall through */ }
  }
  const decimals = Number.isInteger(config.decimals) ? Math.max(0, Math.min(config.decimals, 6)) : 2;
  return value.toFixed(decimals);
}

function linePath(points) {
  return points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
}

function setHidden(element, hidden) {
  if (!element) return;
  element.toggleAttribute("hidden", Boolean(hidden));
  element.style.display = hidden ? "none" : "";
}

function axisValue(value, config, formatter = null) {
  if (formatter) {
    try { return String(formatter(value)); } catch { /* fall through */ }
  }
  return formatValue(value, config);
}

function chartPointRows(series, config) {
  return series.flatMap((entry, seriesIndex) => entry.points.map((point, pointIndex) => ({
    ...point,
    seriesId: entry.id,
    seriesLabel: entry.label,
    seriesIndex,
    pointIndex,
  })));
}

function detailsHtml(point) {
  return point.details.length
    ? `<ul>${point.details.map((detail) => `<li>${escapeHtml(detail)}</li>`).join("")}</ul>`
    : "<span>Additional match evidence unavailable.</span>";
}

function dataTableHtml(config, rows) {
  const orderHeading = config.xMode === "ordinal" ? "Series order" : "Observation";
  return `<details class="chart-data-details"><summary>View chart data table</summary><div class="chart-data-table-wrap"><table><caption>${escapeHtml(config.title)} data</caption><thead><tr><th scope="col">Series</th><th scope="col">${orderHeading}</th><th scope="col">Date / opponent</th><th scope="col">${escapeHtml(config.metricLabel)}</th><th scope="col">Evidence</th></tr></thead><tbody>${rows.map((point) => `<tr><th scope="row">${escapeHtml(point.seriesLabel)}</th><td>${point.pointIndex + 1}</td><td>${escapeHtml(point.label)}</td><td>${escapeHtml(formatValue(point.value, config, point.formattedValue))}</td><td>${detailsHtml(point)}</td></tr>`).join("")}</tbody></table></div></details>`;
}

function legendHtml(series) {
  return `<ul class="interactive-chart-legend" aria-label="Chart series">${series.map((entry, index) => `<li class="is-series-${index % 4}"><i aria-hidden="true"></i>${escapeHtml(entry.label)}</li>`).join("")}</ul>`;
}

/**
 * Renders a self-contained, accessible ordinal line chart. Labels are displayed
 * verbatim in tooltips and the data table; ordinal comparison charts explicitly
 * identify that each line has its own series order.
 */
export function renderInteractiveLineChart(options = {}) {
  const id = safeId(options.id, "line-chart");
  const valueFormatter = typeof options.valueFormat === "function" ? options.valueFormat : null;
  const series = normalizeChartSeries(options.series).map((entry) => ({
    ...entry,
    points: entry.points.map((point) => ({
      ...point,
      formattedValue: valueFormatter ? (() => {
        try { return String(valueFormatter(point.value)); } catch { return null; }
      })() : point.formattedValue,
    })),
  }));
  const config = {
    id,
    title: asText(options.title, "Trend chart"),
    description: asText(options.description, "Use arrow keys to inspect observations."),
    series,
    baseline: numberOrNull(options.baseline),
    metricLabel: asText(options.metricLabel, "Value"),
    decimals: Number.isInteger(options.decimals) ? options.decimals : 2,
    xMode: options.xMode === "ordinal" ? "ordinal" : "ordinal",
  };
  const helpId = `${id}-help`;
  const statusId = `${id}-status`;
  const domain = getLineChartDomain(series, config.baseline);
  const rows = chartPointRows(series, config);
  const positioned = series.map((entry, seriesIndex) => ({
    ...entry,
    points: entry.points.map((point, pointIndex) => ({
      ...point,
      seriesIndex,
      pointIndex,
      ...pointToPlotPosition(point, pointIndex, entry.points.length, domain),
    })),
  }));
  const baselineY = config.baseline === null ? null : pointToPlotPosition({ value: config.baseline }, 0, 1, domain).y;
  const axisFormatter = typeof options.valueFormat === "function" ? options.valueFormat : null;
  const axisTicks = [domain.max, domain.min + domain.range / 2, domain.min].map((value) => ({
    value,
    y: pointToPlotPosition({ value }, 0, 1, domain).y,
  }));
  const empty = !positioned.length;
  const ordinalNote = positioned.length > 1
    ? "Each line follows its player or team’s own series order. Matching horizontal positions do not mean the observations happened on the same date."
    : "The horizontal axis follows the recorded series order.";
  return `<figure class="interactive-line-chart" data-interactive-line-chart data-chart-id="${escapeAttribute(id)}" data-chart-config="${escapeAttribute(encodeConfig(config))}"><figcaption><div><span class="chart-kicker">${escapeHtml(config.metricLabel)}</span><h4>${escapeHtml(config.title)}</h4><p>${escapeHtml(config.description)}</p></div>${legendHtml(positioned)}</figcaption><p class="chart-help" id="${escapeAttribute(helpId)}">Use pointer or tap to inspect a recorded point. Focus the chart, then use arrow keys, Home, End, or Escape.</p>${positioned.length > 1 ? `<p class="chart-order-note">${escapeHtml(ordinalNote)}</p>` : ""}<div class="interactive-chart-plot-wrap"><svg class="interactive-line-chart-plot" viewBox="0 0 ${SVG_WIDTH} ${SVG_HEIGHT}" preserveAspectRatio="none" role="group" tabindex="0" aria-describedby="${escapeAttribute(helpId)} ${escapeAttribute(statusId)}" aria-label="${escapeAttribute(config.title)}">${axisTicks.map((tick) => `<line class="chart-gridline" x1="${PADDING.left}" x2="${SVG_WIDTH - PADDING.right}" y1="${tick.y.toFixed(2)}" y2="${tick.y.toFixed(2)}"></line><text class="chart-axis-label" x="${PADDING.left - 7}" y="${(tick.y + 4).toFixed(2)}" text-anchor="end">${escapeHtml(axisValue(tick.value, config, axisFormatter))}</text>`).join("")}${baselineY === null ? "" : `<line class="chart-baseline" x1="${PADDING.left}" x2="${SVG_WIDTH - PADDING.right}" y1="${baselineY.toFixed(2)}" y2="${baselineY.toFixed(2)}"></line>`}${positioned.map((entry, seriesIndex) => `<path class="chart-line is-series-${seriesIndex % 4}" d="${linePath(entry.points)}"></path>`).join("")}${positioned.flatMap((entry) => entry.points).map((point) => `<circle class="chart-point is-series-${point.seriesIndex % 4}" data-chart-point="${point.seriesIndex}:${point.pointIndex}" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="4" aria-hidden="true"></circle>`).join("")}<text class="chart-order-anchor" x="${PADDING.left}" y="${SVG_HEIGHT - 10}" text-anchor="start">First recorded</text><text class="chart-order-anchor" x="${SVG_WIDTH - PADDING.right}" y="${SVG_HEIGHT - 10}" text-anchor="end">Latest recorded</text><text class="chart-axis-title" x="${SVG_WIDTH / 2}" y="${SVG_HEIGHT - 10}" text-anchor="middle">Series order</text><line class="chart-crosshair" aria-hidden="true" hidden></line><circle class="chart-active-marker" aria-hidden="true" hidden r="6"></circle>${empty ? `<text class="chart-empty-label" x="${SVG_WIDTH / 2}" y="${SVG_HEIGHT / 2}" text-anchor="middle">No recorded values are available.</text>` : ""}</svg><div class="interactive-chart-tooltip" role="tooltip" hidden></div></div><p class="sr-only" id="${escapeAttribute(statusId)}" role="status" aria-live="polite"></p>${empty ? "<p class=\"chart-empty-message\">No finite values are available for this chart.</p>" : ""}${dataTableHtml(config, rows)}</figure>`;
}

function getPointRecords(chart) {
  const config = decodeConfig(chart);
  if (!config) return [];
  const domain = getLineChartDomain(config.series, config.baseline);
  return chartPointRows(config.series, config).map((point) => ({
    ...point,
    ...pointToPlotPosition(point, point.pointIndex, config.series[point.seriesIndex].points.length, domain),
  }));
}

function getState(chart) {
  let state = chartStates.get(chart);
  if (!state) {
    state = { activeKey: null, touchSelected: false };
    chartStates.set(chart, state);
  }
  return state;
}

function pointKey(point) {
  return `${point.seriesIndex}:${point.pointIndex}`;
}

function activeElements(chart) {
  return {
    plot: chart.querySelector(".interactive-line-chart-plot"),
    tooltip: chart.querySelector(".interactive-chart-tooltip"),
    status: chart.querySelector('[role="status"]'),
    crosshair: chart.querySelector(".chart-crosshair"),
    marker: chart.querySelector(".chart-active-marker"),
  };
}

function visibleBounds(element) {
  const rect = element.getBoundingClientRect();
  let bounds = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  let ancestor = element.parentElement;
  while (ancestor && typeof window !== "undefined") {
    const styles = window.getComputedStyle(ancestor);
    if (/(auto|scroll|hidden|clip)/.test(`${styles.overflow} ${styles.overflowX} ${styles.overflowY}`)) {
      const ancestorRect = ancestor.getBoundingClientRect();
      bounds = {
        left: Math.max(bounds.left, ancestorRect.left), top: Math.max(bounds.top, ancestorRect.top),
        right: Math.min(bounds.right, ancestorRect.right), bottom: Math.min(bounds.bottom, ancestorRect.bottom),
      };
    }
    ancestor = ancestor.parentElement;
  }
  if (typeof window !== "undefined") {
    bounds.left = Math.max(bounds.left, 0); bounds.top = Math.max(bounds.top, 0);
    bounds.right = Math.min(bounds.right, window.innerWidth); bounds.bottom = Math.min(bounds.bottom, window.innerHeight);
  }
  return bounds;
}

function positionTooltip(chart, point) {
  const { plot, tooltip } = activeElements(chart);
  if (!plot || !tooltip) return;
  const offsetParent = tooltip.offsetParent instanceof Element ? tooltip.offsetParent : chart.querySelector(".interactive-chart-plot-wrap");
  if (!offsetParent) return;
  const offsetRect = offsetParent.getBoundingClientRect();
  const plotRect = plot.getBoundingClientRect();
  const x = plotRect.left + point.x / SVG_WIDTH * plotRect.width;
  const y = plotRect.top + point.y / SVG_HEIGHT * plotRect.height;
  const bounds = visibleBounds(offsetParent);
  const gap = 12;
  const availableWidth = Math.max(0, bounds.right - bounds.left - 16);
  tooltip.style.maxWidth = `${Math.floor(availableWidth)}px`;
  const width = tooltip.offsetWidth;
  const height = tooltip.offsetHeight;
  let left = x + gap;
  if (left + width > bounds.right - 8) left = x - width - gap;
  let top = y - height - gap;
  if (top < bounds.top + 8) top = y + gap;
  left = Math.max(bounds.left + 8, Math.min(left, bounds.right - width - 8));
  top = Math.max(bounds.top + 8, Math.min(top, bounds.bottom - height - 8));
  tooltip.style.left = `${Math.round(left - offsetRect.left)}px`;
  tooltip.style.top = `${Math.round(top - offsetRect.top)}px`;
}

function showPoint(chart, point, announce = false, touch = false) {
  const config = decodeConfig(chart);
  if (!config || !point) return;
  const state = getState(chart);
  const { tooltip, status, crosshair, marker } = activeElements(chart);
  state.activeKey = pointKey(point);
  state.touchSelected = touch;
  if (tooltip) {
    tooltip.replaceChildren();
    const series = document.createElement("strong");
    series.textContent = point.seriesLabel;
    const metric = document.createElement("span");
    metric.textContent = `${config.metricLabel}: ${formatValue(point.value, config, point.formattedValue)}`;
    const label = document.createElement("span");
    label.textContent = point.label;
    tooltip.append(series, metric, label);
    if (point.details.length) {
      const evidence = document.createElement("small");
      evidence.textContent = point.details.join(" · ");
      tooltip.append(evidence);
    }
    setHidden(tooltip, false);
  }
  if (crosshair) {
    crosshair.setAttribute("x1", String(point.x)); crosshair.setAttribute("x2", String(point.x));
    crosshair.setAttribute("y1", String(PADDING.top)); crosshair.setAttribute("y2", String(SVG_HEIGHT - PADDING.bottom)); setHidden(crosshair, false);
  }
  if (marker) {
    marker.setAttribute("class", `chart-active-marker is-series-${point.seriesIndex % 4}`);
    marker.setAttribute("cx", String(point.x)); marker.setAttribute("cy", String(point.y)); setHidden(marker, false);
  }
  positionTooltip(chart, point);
  if (announce && status) status.textContent = `${point.seriesLabel}. ${config.metricLabel}: ${formatValue(point.value, config, point.formattedValue)}. ${point.label}${point.details.length ? `. ${point.details.join(". ")}` : ""}`;
}

function clearPoint(chart, force = false) {
  const state = getState(chart);
  if (state.touchSelected && !force) return;
  state.activeKey = null;
  state.touchSelected = false;
  const { tooltip, status, crosshair, marker } = activeElements(chart);
  setHidden(tooltip, true);
  setHidden(crosshair, true);
  setHidden(marker, true);
  if (status) status.textContent = "";
}

function pointFromEvent(chart, event) {
  const plot = chart.querySelector(".interactive-line-chart-plot");
  if (!plot) return null;
  const rect = plot.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const x = (event.clientX - rect.left) / rect.width * SVG_WIDTH;
  const y = (event.clientY - rect.top) / rect.height * SVG_HEIGHT;
  return findNearestPoint(getPointRecords(chart), x, y);
}

function chartFromTarget(target) {
  return target instanceof Element ? target.closest(CHART_SELECTOR) : null;
}

function onPointerMove(event) {
  if (event.pointerType === "touch") return;
  const chart = chartFromTarget(event.target);
  if (!chart || !event.target.closest(".interactive-line-chart-plot")) return;
  showPoint(chart, pointFromEvent(chart, event));
}

function onPointerOut(event) {
  if (event.pointerType === "touch") return;
  const chart = chartFromTarget(event.target);
  if (!chart || chart.contains(event.relatedTarget)) return;
  clearPoint(chart);
}

function clearActiveCharts(root) {
  root.querySelectorAll?.(CHART_SELECTOR).forEach((chart) => clearPoint(chart, true));
}

function handleScroll(root) {
  root.querySelectorAll?.(CHART_SELECTOR).forEach((chart) => {
    const state = getState(chart);
    if (state.touchSelected) { clearPoint(chart, true); return; }
    const point = getPointRecords(chart).find((item) => pointKey(item) === state.activeKey);
    if (point) positionTooltip(chart, point);
  });
}

function onPointerUp(event, root) {
  if (event.pointerType !== "touch") return;
  const chart = chartFromTarget(event.target);
  if (!chart) { clearActiveCharts(root); return; }
  if (!event.target.closest(".interactive-line-chart-plot")) { clearPoint(chart, true); return; }
  showPoint(chart, pointFromEvent(chart, event), true, true);
}

function onFocusIn(event) {
  const plot = event.target instanceof Element ? event.target.closest(".interactive-line-chart-plot") : null;
  const chart = plot?.closest(CHART_SELECTOR);
  if (!chart) return;
  const points = getPointRecords(chart);
  const active = getState(chart).activeKey;
  showPoint(chart, points.find((point) => pointKey(point) === active) || points[0], true);
}

function onFocusOut(event) {
  const chart = chartFromTarget(event.target);
  if (!chart || chart.contains(event.relatedTarget)) return;
  clearPoint(chart);
}

function onKeyDown(event) {
  const plot = event.target instanceof Element ? event.target.closest(".interactive-line-chart-plot") : null;
  const chart = plot?.closest(CHART_SELECTOR);
  if (!chart) return;
  const points = getPointRecords(chart);
  if (!points.length) return;
  if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); clearPoint(chart, true); return; }
  const currentKey = getState(chart).activeKey;
  const current = Math.max(0, points.findIndex((point) => pointKey(point) === currentKey));
  let index = current;
  if (["ArrowRight", "ArrowDown"].includes(event.key)) index = Math.min(points.length - 1, current + 1);
  else if (["ArrowLeft", "ArrowUp"].includes(event.key)) index = Math.max(0, current - 1);
  else if (event.key === "Home") index = 0;
  else if (event.key === "End") index = points.length - 1;
  else if (!["Enter", " "].includes(event.key)) return;
  event.preventDefault();
  showPoint(chart, points[index], true);
}

function repositionActiveCharts(root) {
  const charts = root.querySelectorAll?.(CHART_SELECTOR) || [];
  charts.forEach((chart) => {
    const active = getState(chart).activeKey;
    const point = getPointRecords(chart).find((item) => pointKey(item) === active);
    if (point) positionTooltip(chart, point);
  });
}

/** Installs one delegated listener set for a root. Safe to call after every render. */
export function installChartInteractions(root = typeof document === "undefined" ? null : document) {
  if (!root || rootInstallations.has(root)) return rootInstallations.get(root)?.destroy || (() => {});
  const handlers = {
    onPointerMove,
    onPointerOut,
    onPointerUp: (event) => onPointerUp(event, root),
    onFocusIn,
    onFocusOut,
    onKeyDown,
    onScroll: () => handleScroll(root),
    onVisibilityChange: () => clearActiveCharts(root),
  };
  root.addEventListener("pointermove", handlers.onPointerMove);
  root.addEventListener("pointerout", handlers.onPointerOut);
  root.addEventListener("pointerup", handlers.onPointerUp);
  root.addEventListener("focusin", handlers.onFocusIn);
  root.addEventListener("focusout", handlers.onFocusOut);
  root.addEventListener("keydown", handlers.onKeyDown, true);
  root.addEventListener("scroll", handlers.onScroll, true);
  root.addEventListener("visibilitychange", handlers.onVisibilityChange);
  const onResize = () => repositionActiveCharts(root);
  if (typeof window !== "undefined") window.addEventListener("resize", onResize, { passive: true });
  const installation = {
    destroy() {
      root.removeEventListener("pointermove", handlers.onPointerMove);
      root.removeEventListener("pointerout", handlers.onPointerOut);
      root.removeEventListener("pointerup", handlers.onPointerUp);
      root.removeEventListener("focusin", handlers.onFocusIn);
      root.removeEventListener("focusout", handlers.onFocusOut);
      root.removeEventListener("keydown", handlers.onKeyDown, true);
      root.removeEventListener("scroll", handlers.onScroll, true);
      root.removeEventListener("visibilitychange", handlers.onVisibilityChange);
      if (typeof window !== "undefined") window.removeEventListener("resize", onResize);
      rootInstallations.delete(root);
    },
  };
  rootInstallations.set(root, installation);
  return installation.destroy;
}

export function destroyChartInteractions(root = typeof document === "undefined" ? null : document) {
  const installation = root && rootInstallations.get(root);
  installation?.destroy();
}
