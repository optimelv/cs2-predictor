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
