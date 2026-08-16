import { useIsomorphicLayoutEffect } from "./useIsomorphicLayoutEffect";

const CSS_VARIABLE = "--visual-viewport-height";

/**
 * Keeps the `--visual-viewport-height` CSS variable in sync with the visual
 * viewport height on the document root. CSS has no native way to read the
 * visual (as opposed to layout) viewport, so elements that must stay above the
 * mobile on-screen keyboard rely on this variable to clamp their height as the
 * keyboard opens and closes.
 */
export function useVisualViewportHeight() {
	useIsomorphicLayoutEffect(() => {
		const viewport = window.visualViewport;
		if (!viewport) return;

		const update = () => {
			document.documentElement.style.setProperty(
				CSS_VARIABLE,
				`${viewport.height}px`,
			);
		};

		update();

		viewport.addEventListener("resize", update);
		viewport.addEventListener("scroll", update);

		return () => {
			viewport.removeEventListener("resize", update);
			viewport.removeEventListener("scroll", update);
			document.documentElement.style.removeProperty(CSS_VARIABLE);
		};
	}, []);
}
