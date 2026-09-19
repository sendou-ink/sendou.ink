import { useMediaQuery } from "./useMediaQuery";

/** `prefers-reduced-motion` media query; `false` on the server and the first client render. */
export function usePrefersReducedMotion() {
	return useMediaQuery("(prefers-reduced-motion: reduce)");
}
