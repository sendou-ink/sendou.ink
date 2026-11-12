<script lang="ts">
import type { BadgeOption } from "~/form/types";
import { m } from "#lib/paraglide/messages.js";
import BadgeDisplay from "./BadgeDisplay.svelte";

interface Props {
	options: BadgeOption[];
	selectedBadges: number[];
	onChange: (newBadges: number[]) => void;
	onBlur?: () => void;
	maxCount?: number;
	disabled?: boolean;
}

let {
	options,
	selectedBadges,
	onChange,
	onBlur,
	maxCount,
	disabled,
}: Props = $props();

const shownBadges = $derived(
	options
		.filter((badge) => selectedBadges.includes(badge.id))
		.toSorted(
			(a, b) => selectedBadges.indexOf(a.id) - selectedBadges.indexOf(b.id),
		),
);
</script>

<div class="stack md">
	{#if selectedBadges.length > 0}
		<BadgeDisplay
			badges={shownBadges}
			onChange={disabled ? () => {} : onChange}
		/>
	{:else}
		<div class="text-lighter text-md font-bold">
			{m.common_badges_selector_none()}
		</div>
	{/if}
	{#if options.length === 0}
		<div class="text-warning text-xs">
			{m.common_badges_selector_noneAvailable()}
		</div>
	{:else}
		<select
			onblur={() => onBlur?.()}
			onchange={(event) =>
				onChange([...selectedBadges, Number(event.currentTarget.value)])}
			disabled={disabled ||
				Boolean(maxCount && selectedBadges.length >= maxCount)}
			data-testid="badges-selector"
		>
			<option>{m.common_badges_selector_select()}</option>
			{#each options.filter((badge) => !selectedBadges.includes(badge.id)) as badge (badge.id)}
				<option value={badge.id}>{badge.displayName}</option>
			{/each}
		</select>
	{/if}
</div>
