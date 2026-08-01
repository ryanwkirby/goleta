import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Whether this browser has been asked not to animate.
 *
 * When it has, the table doesn't animate a quieter version — it doesn't animate
 * at all, and every card simply appears where the state says it is.
 */
export const usePrefersReducedMotion = (): boolean => {
  const [reduced, setReduced] = useState(() => window.matchMedia(QUERY).matches);

  useEffect(() => {
    const query = window.matchMedia(QUERY);
    const update = (): void => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
};
