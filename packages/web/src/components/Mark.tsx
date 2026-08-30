/**
 * The goleta, drawn inside the app rather than in the browser's chrome.
 *
 * #370 drew the ship three times and every one of them went to a surface the
 * browser owns — the tab icon, the 16px layer under it, the home-screen tile.
 * `packages/web/src` referenced none of them and carried no image of any kind,
 * so on the device this app is mostly played on the mark was very nearly
 * invisible: a phone's Chrome has no tab strip, which leaves the tab switcher
 * and the history list, and Safari only learned to render an SVG favicon in
 * Safari 26. A mark that exists only in chrome is a mark nobody sees (#395).
 *
 * **Same drawing, tile off.** The `<g>` below is the one in
 * `public/favicon.svg`, path for path, in the same 64 viewBox — the aft mast
 * still taller than the fore, which is the detail #370 says is the last thing
 * that may go. What does not come across is the rounded rect behind it. That
 * tile exists because a tab strip is not green and the mark needs its own
 * ground, and `favicon.svg` runs it a step brighter than the table's gradient so
 * it still reads as green at 16px. Here the page is *already* the felt, so the
 * tile would put a slightly lighter green rectangle on green and the two grounds
 * would meet at a rounded corner. There is nothing for it to do.
 *
 * **`currentColor`, which is the whole reason this is a component rather than an
 * `<img src="/favicon.svg">`.** Its two homes want it at two different weights —
 * full white over the landing page's title, the wordmark's `white/40` on the
 * waiting screen — and one file served as-is can only be one of those. Taking
 * the colour from the line it sits above is what lets one drawing sit correctly
 * in both.
 *
 * **A number, not a class.** The size is `width`/`height` attributes off a prop,
 * the shape `PlayingCard` already takes a `height` in (#166), rather than the
 * `h-[1em]` `QrGlyph` uses. That glyph is drawn at the type size beside it and
 * this one deliberately is not — it is half again the title it heads — so a call
 * site overriding a default would be two Tailwind height classes racing on
 * stylesheet order rather than on which was written last.
 *
 * **Decorative, and marked as it.** No `<title>`, and `aria-hidden`: the word
 * *goleta* is right there beside it in both places, and a titled mark makes a
 * screen reader read the name twice.
 *
 * This is the fourth copy of the ship, after the 64, the 16 drawn again rather
 * than scaled, and the Apple one with its own bleed. That duplication is the
 * shape of this icon set already — a medium each, and `public/favicon.svg` is
 * the drawing the rest follow. If the ship changes there, change it here.
 */
export function Mark({ size, className = "" }: { size: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden
      fill="currentColor"
      className={className}
    >
      {/* Fore mast, then the main aft of it and taller. */}
      <rect x="23" y="14" width="1.7" height="29" />
      <rect x="39.5" y="10" width="1.7" height="33" />
      {/* Jib, forward of the fore mast. */}
      <path d="M21.9 19 V42 H9.5 Z" />
      {/* Both sails set aft of their mast, which is what fore-and-aft means. */}
      <path d="M25.9 16 V42 H35.5 Z" />
      <path d="M42.4 12 V42 H53.5 Z" />
      {/* Flat deck, curved bottom: a slab reads as a bar rather than a hull. */}
      <path d="M7 44.5 H57 C 51 54.5, 14 54.5, 7 44.5 Z" />
    </svg>
  );
}
