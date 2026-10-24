/**
 * Keeps the page behind a sheet from scrolling (also on iOS). A second sheet
 * on top of the first (the room plan over the settings) leaves the lock to
 * the first one.
 */
export function lockPageScroll() {
  const { body, documentElement } = document;
  if (body.style.position === "fixed") {
    return () => undefined;
  }
  const scrollY = window.scrollY;
  const previous = {
    position: body.style.position,
    top: body.style.top,
    width: body.style.width,
    overflow: documentElement.style.overflow,
  };
  body.style.position = "fixed";
  body.style.top = `-${scrollY}px`;
  body.style.width = "100%";
  documentElement.style.overflow = "hidden";
  return () => {
    body.style.position = previous.position;
    body.style.top = previous.top;
    body.style.width = previous.width;
    documentElement.style.overflow = previous.overflow;
    // At once, not with the page's smooth scrolling.
    window.scrollTo({ top: scrollY, behavior: "instant" });
  };
}
