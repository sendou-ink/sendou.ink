import * as React from "react";
import { type VirtualItem, VirtualizerCore } from "./core";

type MeasureRef = (element: HTMLElement | null) => (() => void) | undefined;

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
	const renderedWindowRef = React.useRef({ first: -1, last: -1, totalSize: 0 });

	React.useEffect(() => {
		const container = scrollRef.current;
		if (!container) return;

		// scrolling re-renders only when a row enters or leaves the window, not
		// on every scrolled pixel
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

			const nextWindow = windowOf(core.range(next.scrollTop, next.height));
			const rendered = renderedWindowRef.current;
			if (
				nextWindow.first === rendered.first &&
				nextWindow.last === rendered.last &&
				core.totalSize() === rendered.totalSize
			) {
				return;
			}
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

	const indexByElementRef = React.useRef(new WeakMap<Element, number>());
	const resizeObserverRef = React.useRef<ResizeObserver | null>(null);
	const resizeObserver = () => {
		resizeObserverRef.current ??= new ResizeObserver((entries) => {
			let changed = false;
			for (const entry of entries) {
				const index = indexByElementRef.current.get(entry.target);
				if (index === undefined) continue;
				const size = (entry.target as HTMLElement).offsetHeight;
				if (core.measure(index, size)) changed = true;
			}
			if (changed) rerender();
		});
		return resizeObserverRef.current;
	};
	React.useEffect(() => () => resizeObserverRef.current?.disconnect(), []);

	// stable per index so React does not detach and re-observe every row on
	// each scroll-driven render
	const measureCallbacksRef = React.useRef(new Map<number, MeasureRef>());
	for (const index of measureCallbacksRef.current.keys()) {
		if (index >= count) measureCallbacksRef.current.delete(index);
	}
	const measureElement = (index: number): MeasureRef => {
		const cached = measureCallbacksRef.current.get(index);
		if (cached) return cached;

		const callback: MeasureRef = (element) => {
			if (!element) return;
			indexByElementRef.current.set(element, index);
			if (core.measure(index, element.offsetHeight)) {
				rerender();
			}
			resizeObserver().observe(element);
			return () => {
				resizeObserver().unobserve(element);
				indexByElementRef.current.delete(element);
			};
		};
		measureCallbacksRef.current.set(index, callback);
		return callback;
	};

	const { scrollTop, height } = viewportRef.current;
	const totalSize = core.totalSize();
	const items = core.range(scrollTop, height);
	renderedWindowRef.current = { ...windowOf(items), totalSize };

	return {
		totalSize,
		items,
		measureElement,
	};
}

function windowOf(items: VirtualItem[]) {
	return {
		first: items[0]?.index ?? -1,
		last: items.at(-1)?.index ?? -1,
	};
}
