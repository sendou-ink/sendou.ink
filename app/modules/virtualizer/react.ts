import * as React from "react";
import { VirtualizerCore } from "./core";

/**
 * Thin React adapter for `VirtualizerCore`: subscribes to the scroll
 * container's scroll and resize, measures rows through `measureElement` ref
 * callbacks and re-renders when the visible window changes.
 *
 * Render the returned `items` absolutely positioned (translated by
 * `item.start`) inside a relatively positioned filler div of `totalSize`
 * height, which is the scroll container's only child.
 */
export function useVirtualizer({
	count,
	scrollRef,
	estimatedSize,
	gap,
	overscan,
}: {
	count: number;
	scrollRef: React.RefObject<HTMLElement | null>;
	estimatedSize: number;
	gap?: number;
	overscan?: number;
}) {
	const [core] = React.useState(
		() => new VirtualizerCore({ count, estimatedSize, gap, overscan }),
	);
	core.setCount(count);

	const [, rerender] = React.useReducer((tick) => tick + 1, 0);
	const viewportRef = React.useRef({ scrollTop: 0, height: 0 });

	React.useEffect(() => {
		const container = scrollRef.current;
		if (!container) return;

		const syncViewport = () => {
			const next = {
				scrollTop: container.scrollTop,
				height: container.clientHeight,
			};
			const previous = viewportRef.current;
			if (
				next.scrollTop === previous.scrollTop &&
				next.height === previous.height
			) {
				return;
			}
			viewportRef.current = next;
			rerender();
		};

		syncViewport();
		container.addEventListener("scroll", syncViewport, { passive: true });
		const resizeObserver = new ResizeObserver(syncViewport);
		resizeObserver.observe(container);

		return () => {
			container.removeEventListener("scroll", syncViewport);
			resizeObserver.disconnect();
		};
	}, [scrollRef]);

	const measureElement = (index: number) => (element: HTMLElement | null) => {
		if (!element) return;

		const measure = () => {
			if (core.measure(index, element.offsetHeight)) {
				rerender();
			}
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	};

	const { scrollTop, height } = viewportRef.current;

	return {
		totalSize: core.totalSize(),
		items: core.range(scrollTop, height),
		measureElement,
	};
}
