import { useIsomorphicLayoutEffect } from "./useIsomorphicLayoutEffect";

const HEIGHT_PROPERTY = "--visual-viewport-height";
const OFFSET_TOP_PROPERTY = "--visual-viewport-offset-top";

// Syncs the ACTUAL visual viewport to two CSS variables so elements can respect the space taken by the mobile keyboard
export function useVisualViewport() {
	useIsomorphicLayoutEffect(() => {
		const viewport = window.visualViewport;
		if (!viewport) return;

		const update = () => {
			const style = document.documentElement.style;
			style.setProperty(HEIGHT_PROPERTY, `${viewport.height}px`);
			style.setProperty(OFFSET_TOP_PROPERTY, `${viewport.offsetTop}px`);
		};

		update();

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
