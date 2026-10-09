import { useLayoutEffect, type RefObject } from "react";

/**
 * At most this much of the room for the refresh button may be given up: the
 * button then covers only the last card's inner padding.
 */
const MAX_TRIM_PX = 28;

/**
 * The page keeps room at the bottom so the round refresh button does not
 * cover the last card. When the content itself fits on the screen and only
 * that room would make the page scroll by a few pixels, the room shrinks by
 * exactly that much: no pointless scrolling.
 *
 * Expects `--bottom-room` on the element (its full bottom padding) and uses
 * `padding-bottom: calc(var(--bottom-room) - var(--bottom-trim, 0px))`.
 */
export function useFitBottomRoom(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const main = ref.current;
    if (!main || typeof ResizeObserver === "undefined") {
      return;
    }

    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const last = main.lastElementChild;
        if (!last) {
          return;
        }
        const style = getComputedStyle(main);
        const trim = parseFloat(style.getPropertyValue("--bottom-trim")) || 0;
        const room = parseFloat(style.paddingBottom) + trim;
        // Independent of the current trim, so setting it never loops.
        const contentBottom = last.getBoundingClientRect().bottom + window.scrollY;
        const overflow = Math.ceil(contentBottom + room - window.innerHeight);
        const next = overflow > 0 && overflow <= MAX_TRIM_PX ? overflow : 0;
        if (next !== trim) {
          main.style.setProperty("--bottom-trim", `${next}px`);
        }
      });
    };

    // Every section's size counts (one growing moves the last one down);
    // sections come and go, e.g. the day tabs once the plan is loaded.
    const resizes = new ResizeObserver(fit);
    const observeSections = () => {
      resizes.disconnect();
      Array.from(main.children).forEach((child) => resizes.observe(child));
      fit();
    };
    const sections = new MutationObserver(observeSections);
    sections.observe(main, { childList: true });
    observeSections();
    window.addEventListener("resize", fit);
    // The opening animation moves the sections without resizing them.
    main.addEventListener("animationend", fit);
    return () => {
      cancelAnimationFrame(frame);
      resizes.disconnect();
      sections.disconnect();
      window.removeEventListener("resize", fit);
      main.removeEventListener("animationend", fit);
    };
  }, [ref]);
}
