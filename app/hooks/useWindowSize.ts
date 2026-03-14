import { useState } from "react";
import { useEventListener } from "./useEventListener";
import { useIsomorphicLayoutEffect } from "./useIsomorphicLayoutEffect";

interface WindowSize {
	width: number;
	height: number;
}

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

export function useWindowSize(): WindowSize {
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
