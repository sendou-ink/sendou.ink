export interface VirtualizerOptions {
	count: number;
	/** Row height used until a row reports its measured size. */
	estimatedSize: number;
	/** Vertical gap between rows. */
	gap?: number;
	/** Rows rendered beyond the visible range in both directions. */
	overscan?: number;
}

export interface VirtualItem {
	index: number;
	/** Offset of the row's top edge from the top of the scroll content. */
	start: number;
}

/**
 * Framework-agnostic windowing logic for a vertical list with variable row
 * heights: rows start at an estimated size and refine as they report
 * measurements. The UI layer owns scrolling and rendering; this class only
 * answers "how tall is the content" and "which rows are visible".
 */
export class VirtualizerCore {
	private count: number;
	private estimatedSize: number;
	private gap: number;
	private overscan: number;
	private measuredSizes = new Map<number, number>();

	constructor(options: VirtualizerOptions) {
		this.count = options.count;
		this.estimatedSize = options.estimatedSize;
		this.gap = options.gap ?? 0;
		this.overscan = options.overscan ?? 3;
	}

	/** Updates the row count, dropping measurements that no longer apply. */
	setCount(count: number) {
		if (count < this.count) {
			for (const index of this.measuredSizes.keys()) {
				if (index >= count) this.measuredSizes.delete(index);
			}
		}
		this.count = count;
	}

	/** Records a row's measured size. Returns true when the size changed. */
	measure(index: number, size: number) {
		if (this.measuredSizes.get(index) === size) return false;
		this.measuredSizes.set(index, size);
		return true;
	}

	sizeOf(index: number) {
		return this.measuredSizes.get(index) ?? this.estimatedSize;
	}

	startOf(index: number) {
		let start = 0;
		for (let i = 0; i < index; i++) {
			start += this.sizeOf(i) + this.gap;
		}
		return start;
	}

	totalSize() {
		if (this.count === 0) return 0;
		return this.startOf(this.count - 1) + this.sizeOf(this.count - 1);
	}

	/** The rows overlapping the viewport, plus overscan on both sides. */
	range(scrollTop: number, viewportSize: number): VirtualItem[] {
		const items: VirtualItem[] = [];
		let start = 0;
		let firstVisible = -1;
		let lastVisible = -1;

		const starts: number[] = [];
		for (let i = 0; i < this.count; i++) {
			starts.push(start);
			const end = start + this.sizeOf(i);
			if (end >= scrollTop && firstVisible === -1) {
				firstVisible = i;
			}
			if (start <= scrollTop + viewportSize) {
				lastVisible = i;
			}
			start = end + this.gap;
		}

		if (firstVisible === -1) return items;

		const from = Math.max(0, firstVisible - this.overscan);
		const to = Math.min(this.count - 1, lastVisible + this.overscan);
		for (let i = from; i <= to; i++) {
			items.push({ index: i, start: starts[i] });
		}
		return items;
	}
}
