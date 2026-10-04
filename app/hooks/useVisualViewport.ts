import * as React from "react";

const HEIGHT_PROPERTY = "--visual-viewport-height";
const OFFSET_TOP_PROPERTY = "--visual-viewport-offset-top";

// Syncs the ACTUAL visual viewport to two CSS variables so elements can respect the space taken by the mobile keyboard
// (not written on mount: until the viewport changes the CSS fallbacks match, and every write restyles the whole document)
export function useVisualViewport() {
	React.useEffect(() => {
		const viewport = window.visualViewport;
		if (!viewport) return;

		let lastHeight: number | null = null;
		let lastOffsetTop: number | null = null;

		const update = () => {
			const { height, offsetTop } = viewport;
			if (height === lastHeight && offsetTop === lastOffsetTop) return;

			lastHeight = height;
			lastOffsetTop = offsetTop;

			const style = document.documentElement.style;
			style.setProperty(HEIGHT_PROPERTY, `${height}px`);
			style.setProperty(OFFSET_TOP_PROPERTY, `${offsetTop}px`);
		};

		viewport.addEventListener("resize", update);
		viewport.addEventListener("scroll", update);

		return () => {
			viewport.removeEventListener("resize", update);
			viewport.removeEventListener("scroll", update);
			document.documentElement.style.removeProperty(HEIGHT_PROPERTY);
			document.documentElement.style.removeProperty(OFFSET_TOP_PROPERTY);
		};
	}, []);
}
