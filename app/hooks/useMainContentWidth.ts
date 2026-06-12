import { useState } from "react";
import { useIsomorphicLayoutEffect } from "./useIsomorphicLayoutEffect";
import { useWindowSize } from "./useWindowSize";

const MOBILE_BREAKPOINT = 600;
const DESKTOP_BREAKPOINT = 1000;

type LayoutSize = "mobile" | "tablet" | "desktop";

export function useLayoutSize(): LayoutSize {
	const { width } = useWindowSize();

	if (width === 0) return "desktop";
	if (width < MOBILE_BREAKPOINT) return "mobile";
	if (width < DESKTOP_BREAKPOINT) return "tablet";
	return "desktop";
}

export function useMainContentWidth() {
	const [width, setWidth] = useState(0);

	useIsomorphicLayoutEffect(() => {
		const main = document.querySelector("main");
		if (!main) return;

		setWidth(main.clientWidth);

		const observer = new ResizeObserver((entries) => {
			setWidth(entries[0]?.contentRect.width);
		});

		observer.observe(main);

		return () => observer.disconnect();
	}, []);

	return width;
}
