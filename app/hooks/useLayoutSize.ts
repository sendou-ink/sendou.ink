import { useMediaQuery } from "./useMediaQuery";

/** Below this the mobile tab bar layout applies; keep in sync with the `600px` media queries of the layout CSS. */
export const MOBILE_LAYOUT_QUERY = "(width < 600px)";
const DESKTOP_LAYOUT_QUERY = "(width >= 1000px)";

type LayoutSize = "mobile" | "tablet" | "desktop";

/** Which of the three site layouts the viewport is in. `"desktop"` on the server and the hydration render. */
export function useLayoutSize(): LayoutSize {
	const isMobile = useMediaQuery(MOBILE_LAYOUT_QUERY);
	const isDesktop = useMediaQuery(DESKTOP_LAYOUT_QUERY, true);

	if (isMobile) return "mobile";
	if (isDesktop) return "desktop";
	return "tablet";
}
