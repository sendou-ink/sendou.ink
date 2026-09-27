import * as React from "react";

/**
 * Content box size of the element `ref` is attached to, rounded to whole pixels and kept up to date as it resizes.
 * `null` until measured, so always on the server and the hydration render.
 */
export function useElementSize<T extends Element>() {
	const [size, setSize] = React.useState<{
		width: number;
		height: number;
	} | null>(null);

	const ref = (element: T | null) => {
		if (!element) return;

		const observer = new ResizeObserver(([entry]) => {
			const width = Math.round(entry.contentRect.width);
			const height = Math.round(entry.contentRect.height);
			if (width > 0 && height > 0) setSize({ width, height });
		});
		observer.observe(element);

		return () => observer.disconnect();
	};

	return { ref, size };
}
