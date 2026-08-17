import type { Snippet } from "svelte";

export interface FilterBarPill {
	key: string;
	/** Translated filter name shown on the pill and in the add filter menu. */
	name: string;
	/** Translated current value shown on the pill. Null when the filter is at its default. */
	formattedValue: string | null;
	/** Popover content. Inputs inside write search params directly (instant apply). */
	popover: Snippet;
	/** Resets the pill's param(s) to defaults. Renders the remove button. */
	onRemove?: () => void;
	/** Writes a starting value when the pill is added from the menu. */
	onAdd?: () => void;
	icon?: Snippet;
	popoverClass?: string;
	testId?: string;
}
