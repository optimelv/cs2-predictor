// Shared keyboard behavior for the existing lightweight dialog layers.
export function installDialogFocus(doc) {
  const dialogs = [...doc.querySelectorAll('[role="dialog"][aria-modal="true"]')];
  const layers = dialogs.map((dialog) => dialog.parentElement);
  const background = [...doc.querySelectorAll('body > header, body > nav, body > main, body > footer')];
  const originalInert = new Map(background.map((node) => [node, node.inert]));
  let stack = [];
  const controls = (dialog) => [...dialog.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')]
    .filter((node) => !node.closest('[hidden], [inert]') && node.getClientRects().length);
  const active = () => stack.filter((layer) => !layer.hidden && layer.classList.contains('is-open')).at(-1)?.querySelector('[role="dialog"]');
  const sync = () => {
    const open = layers.filter((layer) => !layer.hidden && layer.classList.contains('is-open'));
    stack = [...stack.filter((layer) => open.includes(layer)), ...open.filter((layer) => !stack.includes(layer))];
    for (const node of background) node.inert = stack.length > 0 || originalInert.get(node);
    for (const layer of layers) layer.inert = open.includes(layer) && layer !== stack.at(-1);
    const dialog = active();
    if (dialog && !dialog.contains(doc.activeElement)) {
      dialog.tabIndex = -1;
      (controls(dialog)[0] || dialog).focus({ preventScroll: true });
    }
  };
  const observer = new MutationObserver(sync);
  layers.forEach((layer) => observer.observe(layer, { attributes: true, attributeFilter: ['hidden', 'class'] }));
  doc.addEventListener('keydown', (event) => {
    const dialog = active();
    if (!dialog) return;
    if (event.key === 'Escape') {
      const plot = event.target instanceof Element ? event.target.closest('.interactive-line-chart-plot') : null;
      const tooltip = plot?.closest('[data-interactive-line-chart]')?.querySelector('.interactive-chart-tooltip:not([hidden])');
      if (tooltip) return;
      const close = stack.at(-1).querySelector('button[aria-label^="Close"]');
      if (close) { event.preventDefault(); event.stopImmediatePropagation(); close.click(); }
      return;
    }
    if (event.key !== 'Tab') return;
    const targets = controls(dialog);
    const first = targets[0] || dialog;
    const last = targets.at(-1) || dialog;
    if (!targets.length || !dialog.contains(doc.activeElement) || (event.shiftKey && doc.activeElement === first) || (!event.shiftKey && doc.activeElement === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  }, true);
  doc.addEventListener('focusin', () => {
    const dialog = active();
    if (dialog && !dialog.contains(doc.activeElement)) (controls(dialog)[0] || dialog).focus({ preventScroll: true });
  });
  sync();
}
