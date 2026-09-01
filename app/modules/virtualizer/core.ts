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
 *
 * Row offsets are cached as prefix sums, recomputed from the first row whose
 * size changed, so offsets are O(1) and the visible range a binary search.
 */
export class VirtualizerCore {
	private count: number;
	private estimatedSize: number;
	private gap: number;
	private overscan: number;
	private measuredSizes = new Map<number, number>();
	private offsets: number[] = [];
	/** Entries of `offsets` before this index are up to date. */
	private validOffsets = 0;

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
			this.offsets.length = count;
			this.validOffsets = Math.min(this.validOffsets, count);
		}
		this.count = count;
	}

	/** Records a row's measured size. Returns true when the size changed. */
	measure(index: number, size: number) {
		if (this.measuredSizes.get(index) === size) return false;
		this.measuredSizes.set(index, size);
		this.validOffsets = Math.min(this.validOffsets, index + 1);
		return true;
	}

	sizeOf(index: number) {
		return this.measuredSizes.get(index) ?? this.estimatedSize;
	}

	startOf(index: number) {
		this.computeOffsetsThrough(index);
		return this.offsets[index];
	}

	totalSize() {
		if (this.count === 0) return 0;
		return this.startOf(this.count - 1) + this.sizeOf(this.count - 1);
	}

	/** The rows overlapping the viewport, plus overscan on both sides. */
	range(scrollTop: number, viewportSize: number): VirtualItem[] {
		if (this.count === 0) return [];
		this.computeOffsetsThrough(this.count - 1);

		const firstVisible = this.lowerBound(
			(index) => this.offsets[index] + this.sizeOf(index) >= scrollTop,
		);
		if (firstVisible === this.count) return [];
		const lastVisible =
			this.lowerBound(
				(index) => this.offsets[index] > scrollTop + viewportSize,
			) - 1;

		const from = Math.max(0, firstVisible - this.overscan);
		const to = Math.min(this.count - 1, lastVisible + this.overscan);
		const items: VirtualItem[] = [];
		for (let i = from; i <= to; i++) {
			items.push({ index: i, start: this.offsets[i] });
		}
		return items;
	}

	private computeOffsetsThrough(index: number) {
		for (let i = this.validOffsets; i <= index; i++) {
			this.offsets[i] =
				i === 0 ? 0 : this.offsets[i - 1] + this.sizeOf(i - 1) + this.gap;
		}
		this.validOffsets = Math.max(this.validOffsets, index + 1);
	}

	/** First index for which `holds` is true (`count` when none); `holds` must be false-then-true over the rows. */
	private lowerBound(holds: (index: number) => boolean) {
		let low = 0;
		let high = this.count;
		while (low < high) {
			const middle = (low + high) >>> 1;
			if (holds(middle)) {
				high = middle;
			} else {
				low = middle + 1;
			}
		}
		return low;
	}
}
