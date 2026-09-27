(() => {
  const key = "strikesignal.home-art.v1";
  let index = Math.floor(Math.random() * 3);
  try {
    const previous = Number(window.sessionStorage.getItem(key));
    if (window.sessionStorage.getItem(key) !== null && Number.isInteger(previous) && previous >= 0 && previous < 3) {
      index = (previous + 1) % 3;
    }
    window.sessionStorage.setItem(key, String(index));
  } catch { /* Decorative art still works when storage is unavailable. */ }
  document.documentElement.dataset.homeArt = String(index);
})();
