import { useState } from "react";
import { useEventListener } from "./useEventListener";
import { useIsomorphicLayoutEffect } from "./useIsomorphicLayoutEffect";

const MOBILE_BREAKPOINT = 600;
const DESKTOP_BREAKPOINT = 1000;

type LayoutSize = "mobile" | "tablet" | "desktop";

interface WindowSize {
	width: number;
	height: number;
}

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

function useWindowSize(): WindowSize {
	const [windowSize, setWindowSize] = useState<WindowSize>({
		width: 0,
		height: 0,
	});

	const handleSize = () => {
		setWindowSize({
			width: window.innerWidth,
			height: window.innerHeight,
		});
	};

	useEventListener("resize", handleSize);

	// Set size at the first client-side load
	useIsomorphicLayoutEffect(() => {
		handleSize();
	}, []);

	return windowSize;
}
