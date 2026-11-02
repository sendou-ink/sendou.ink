/** Splits items into the shown ones and a hidden count for a "+N" indicator, never hiding just one item since it fits where "+1" would be. */
export function truncateWithOverflow<T>(items: T[], max: number) {
	const shown = items.length > max + 1 ? items.slice(0, max) : items;

	return { shown, hiddenCount: items.length - shown.length };
}
