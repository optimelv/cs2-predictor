export function installInputMode(doc) {
  doc.documentElement.dataset.inputMode = 'pointer';
  doc.addEventListener('pointerdown', () => { doc.documentElement.dataset.inputMode = 'pointer'; }, true);
  doc.addEventListener('keydown', () => { doc.documentElement.dataset.inputMode = 'keyboard'; }, true);
}

export function motionDuration(duration) {
  return document.documentElement.dataset.inputMode === 'keyboard' || matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : duration;
}

// Small, local confirmation. Never animate the probabilities or the full desk.
export function confirmVetoStep(element) {
  if (!element || !motionDuration(140)) return;
  element.getAnimations().forEach((animation) => animation.cancel());
  const opacity = getComputedStyle(element).opacity;
  element.animate([{ opacity: 0.3 }, { opacity }], {
    duration: 140,
    easing: getComputedStyle(document.documentElement).getPropertyValue('--ease-out').trim(),
  });
}

// Preserve the indicator's visual position across a toolbar render. The text
// stays still; only the small background moves (FLIP, one measurement pass).
export function captureSelections(root) {
  return [...root.querySelectorAll('.match-days, .match-status-filters')].map((group) => ({
    selector: group.classList.contains('match-days') ? '.match-days' : '.match-status-filters',
    scrollLeft: group.scrollLeft,
    rect: group.querySelector('.selection-indicator')?.getBoundingClientRect(),
    key: group.querySelector('[aria-pressed="true"]')?.textContent,
  }));
}

export function restoreSelections(root, previous = []) {
  for (const { selector, scrollLeft } of previous) {
    const group = root.querySelector(selector);
    if (group) group.scrollLeft = scrollLeft;
  }
  const measurements = previous.map(({ selector, rect, key }) => {
    const group = root.querySelector(selector);
    if (!group) return null;
    const active = group.querySelector('[aria-pressed="true"]');
    const indicator = group.querySelector('.selection-indicator');
    return { indicator, rect, next: indicator?.getBoundingClientRect(), changed: key !== active?.textContent };
  });
  if (!motionDuration(180)) return;
  for (const item of measurements) {
    if (!item?.changed || !item.rect?.width || !item.next?.width || !item.indicator?.animate) continue;
    const { rect, next, indicator } = item;
    indicator.animate([
      { transform: `translate(${rect.left - next.left}px, ${rect.top - next.top}px) scale(${rect.width / next.width}, ${rect.height / next.height})` },
      { transform: 'none' },
    ], { duration: 180, easing: getComputedStyle(document.documentElement).getPropertyValue('--ease-out').trim() });
  }
}

// Short continuity cue on a user-requested content replacement. Values are
// already final; they never count up or interpolate through invented data.
export function revealMatch(element) {
  if (!element?.animate || !motionDuration(150)) return;
  element.getAnimations().forEach((animation) => animation.cancel());
  element.animate([{ opacity: 0.65, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], {
    duration: 150,
    easing: getComputedStyle(document.documentElement).getPropertyValue('--ease-out').trim(),
  });
}
