<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import type { BadgeDisplayProps } from './BadgeDisplay.svelte';
	import BadgeDisplay from './BadgeDisplay.svelte';

	interface Props {
		options: BadgeDisplayProps['badges'];
		selectedBadges: number[];
		onblur?: () => void;
		children?: import('svelte').Snippet;
		maxCount?: number;
		showSelect?: boolean;
	}

	let {
		options,
		selectedBadges = $bindable(),
		onblur,
		children,
		maxCount,
		showSelect = true
	}: Props = $props();

	const selectedBadgeData = $derived(
		options
			.filter((badge) => selectedBadges.includes(badge.id))
			.sort((a, b) => {
				const aIdx = selectedBadges.indexOf(a.id);
				const bIdx = selectedBadges.indexOf(b.id);
				return aIdx - bIdx;
			})
	);

	const availableOptions = $derived(options.filter((badge) => !selectedBadges.includes(badge.id)));

	const isSelectDisabled = $derived(Boolean(maxCount && selectedBadges.length >= maxCount));

	function handleSelectChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		const newBadgeId = Number(target.value);
		if (newBadgeId) {
			selectedBadges.push(newBadgeId);
			target.value = '';
		}
	}
</script>

<div class="stack md">
	{#if selectedBadges.length > 0}
		<BadgeDisplay badges={selectedBadgeData}>
			{@render children?.()}
		</BadgeDisplay>
	{:else}
		<div class="text-lighter text-md font-bold">
			{m.common_badges_selector_none()}
		</div>
	{/if}

	{#if showSelect}
		<select
			{onblur}
			onchange={handleSelectChange}
			disabled={isSelectDisabled}
			data-testid="badges-selector"
		>
			<option value="">{m.common_badges_selector_select()}</option>
			{#each availableOptions as badge (badge.id)}
				<option value={badge.id}>
					{badge.displayName}
				</option>
			{/each}
		</select>
	{/if}
</div>
