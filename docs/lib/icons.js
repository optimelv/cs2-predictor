// RuneIcons, Apache-2.0. Selected outline SVGs, pinned to f649e467d1bc9f272aae3f8daa329d4c924e7340.
const names = new Set(["search","activity","calendar","users","bookmark","link","arrow","refresh","check","close","plus"]);
export function runeIcon(name) {
  if (!names.has(name)) return '';
  return '<svg class="rune-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="./vendor/runeicons.svg#' + name + '"></use></svg>';
}
