"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

const TRIGGER_DISTANCE = 70;
const MAX_DISTANCE = 110;
const RESISTANCE = 0.5;

type PullToRefreshProps = {
  onRefresh: () => Promise<unknown>;
  children: ReactNode;
};

/**
 * Pull-to-refresh for the installed home-screen app, where the browser's own
 * gesture is not available.
 */
export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [distance, setDistance] = useState(0);
  // Only refreshes started by pulling are shown here; background refreshes
  // must not move the content around.
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const distanceRef = useRef(0);

  useEffect(() => {
    const reset = () => {
      startYRef.current = null;
      distanceRef.current = 0;
      setDistance(0);
    };

    const onTouchStart = (event: TouchEvent) => {
      startXRef.current = event.touches[0]?.clientX ?? 0;
      startYRef.current =
        window.scrollY <= 0 && event.touches.length === 1
          ? event.touches[0].clientY
          : null;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (startYRef.current === null) {
        return;
      }

      const delta = event.touches[0].clientY - startYRef.current;
      const sideways = Math.abs(event.touches[0].clientX - startXRef.current);
      // Decide the direction only after a few pixels; sideways swipes (e.g.
      // over the day tabs) are not a pull.
      if (distanceRef.current === 0 && Math.max(sideways, Math.abs(delta)) < 10) {
        return;
      }
      if (distanceRef.current === 0 && sideways > delta) {
        startYRef.current = null;
        return;
      }
      if (delta <= 0 || window.scrollY > 0) {
        if (distanceRef.current !== 0) {
          distanceRef.current = 0;
          setDistance(0);
        }
        return;
      }

      // Keep the page still while pulling.
      if (event.cancelable) {
        event.preventDefault();
      }
      distanceRef.current = Math.min(MAX_DISTANCE, delta * RESISTANCE);
      setDistance(distanceRef.current);
    };

    const onTouchEnd = () => {
      if (startYRef.current === null) {
        return;
      }
      if (distanceRef.current >= TRIGGER_DISTANCE) {
        setRefreshing(true);
        void onRefresh().finally(() => setRefreshing(false));
      }
      reset();
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", reset);

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", reset);
    };
  }, [onRefresh]);

  const isPulling = distance > 0;
  const progress = Math.min(1, distance / TRIGGER_DISTANCE);
  const offset = isPulling ? distance : refreshing ? 56 : 0;

  return (
    <>
      <div
        aria-hidden={!refreshing}
        className="pointer-events-none fixed inset-x-0 top-[env(safe-area-inset-top)] z-30 flex justify-center"
        style={{
          transform: `translateY(${offset - 44}px)`,
          opacity: isPulling ? progress : refreshing ? 1 : 0,
          transition: isPulling ? "none" : "transform 200ms ease, opacity 200ms ease",
        }}
      >
        <div className="mt-2 flex size-9 items-center justify-center rounded-full border border-line bg-surface shadow-[0_8px_24px_rgba(18,41,39,0.14)]">
          <svg
            viewBox="0 0 24 24"
            className={`size-5 text-accent ${refreshing && !isPulling ? "animate-spin" : ""}`}
            style={isPulling ? { transform: `rotate(${progress * 270}deg)` } : undefined}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
          >
            <path d="M20 12a8 8 0 1 1-2.34-5.66" />
            <path d="M20 4v5h-5" />
          </svg>
        </div>
      </div>

      {refreshing ? (
        <span className="sr-only" role="status">
          Wird aktualisiert
        </span>
      ) : null}

      <div
        style={{
          transform: offset ? `translateY(${offset * 0.6}px)` : undefined,
          transition: isPulling ? "none" : "transform 200ms ease",
        }}
      >
        {children}
      </div>
    </>
  );
}
