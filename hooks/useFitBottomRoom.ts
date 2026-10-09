import { useLayoutEffect, type RefObject } from "react";

/**
 * How far the room may shrink. Only used when the last card marks its
 * bottom-right corner as free (`data-corner-free`, e.g. the centred "Keine
 * Vertretungen" card): the refresh button then sits over empty card space.
 */
const MAX_TRIM_PX = 40;

/**
 * The page keeps room at the bottom so the round refresh button does not
 * cover the last card. When only that room would make an otherwise fitting
 * page scroll by a few pixels, and the button would just cover the empty
 * corner of the last card, the room shrinks by exactly that much.
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

    let trim = 0;
    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const last = main.lastElementChild;
        if (!last) {
          return;
        }
        const room = parseFloat(getComputedStyle(main).paddingBottom) + trim;
        // Relative to the page itself: right while the settings lock the
        // scroll position and while pull-to-refresh moves the page.
        const contentHeight = last.getBoundingClientRect().bottom - main.getBoundingClientRect().top;
        // Stable height: Safari's collapsing toolbar does not change it.
        const overflow = Math.ceil(contentHeight + room - document.documentElement.clientHeight);
        const cornerFree = last.lastElementChild?.hasAttribute("data-corner-free") ?? false;
        const next = cornerFree && overflow > 0 && overflow <= MAX_TRIM_PX ? overflow : 0;
        if (next !== trim) {
          trim = next;
          main.style.setProperty("--bottom-trim", `${next}px`);
        }
      });
    };

    // Every section's size counts: one growing moves the last one down.
    const resizes = new ResizeObserver(fit);
    Array.from(main.children).forEach((child) => resizes.observe(child));
    const sections = new MutationObserver((records) => {
      records.forEach((record) => {
        record.addedNodes.forEach((node) => node instanceof Element && resizes.observe(node));
        record.removedNodes.forEach((node) => node instanceof Element && resizes.unobserve(node));
      });
      fit();
    });
    sections.observe(main, { childList: true });
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
