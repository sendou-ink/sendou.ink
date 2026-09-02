import { useIsomorphicLayoutEffect } from "./useIsomorphicLayoutEffect";

const CSS_VARIABLE = "--visual-viewport-height";

/** Syncs `--visual-viewport-height` on the root; CSS can't read the visual viewport, which elements above the mobile keyboard need. */
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
