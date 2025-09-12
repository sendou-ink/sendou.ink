<script lang="ts">
	import type { Stat, AnalyzedBuild } from '$lib/core/analyzer/types';
	import type { AbilityPoints } from '$lib/core/analyzer/types';
	import Popover from '$lib/components/popover/Popover.svelte';
	import PopoverTriggerButton from '$lib/components/popover/PopoverTriggerButton.svelte';

	type StatTuple<T = number> = [Stat<T>, Stat<T>, keyof AnalyzedBuild['stats']];

	interface Props {
		title: string;
		stat: StatTuple | StatTuple<string> | number | string;
		// suffix?: string; xxx: suffix not used yet
		popoverInfo?: string;
		testId?: string;
		context: {
			// mainWeaponId: MainWeaponId; // xxx: mainWeaponId not used yet
			abilityPoints: AbilityPoints;
			isComparing: boolean;
		};
	}

	let { title, stat, popoverInfo, testId, context }: Props = $props();

	// We have to use a derived.by with a destructure because TS wont work with two seperate deriveds
	const { isStatic, baseValue } = $derived.by(() => {
		const isStatic = typeof stat === 'number' || typeof stat === 'string';
		const baseValue = isStatic ? stat : stat[0].baseValue;
		return { isStatic, baseValue };
	});

	const showComparison = $derived(context.isComparing && !isStatic);

	function showBuildValue() {
		if (!Array.isArray(stat)) return false;
		if (context.isComparing) return true;

		// slightly hacky but handles the edge case
		// where baseValue === value which can happen when
		// you have Ninja Squid and stack swim speed
		// -> we still want to show the build value
		return [stat[0].modifiedBy].flat().some((ability) => {
			const hasStackable = (context.abilityPoints.get(ability) ?? 0) > 0;
			const hasEffect = baseValue !== stat[0].value;

			return hasEffect || hasStackable;
		});
	}

	function isHighlighted() {
		if (!Array.isArray(stat)) return false;
		if (!showComparison) return showBuildValue();

		return stat[0].value !== stat[0].baseValue || stat[1].value !== stat[1].baseValue;
	}
</script>

<div class={['card', { highlighted: isHighlighted() }]} data-testid={testId}>
	<div class="stat">
		<h3>
			{title}
			{#if popoverInfo}
				<Popover>
					{#snippet trigger()}
						<PopoverTriggerButton variant="minimal">?</PopoverTriggerButton>
					{/snippet}
					{popoverInfo}
				</Popover>
			{/if}
		</h3>
		<div class="values"></div>
	</div>
	<div class="abilities"></div>
</div>

<style>
	.card {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		padding: var(--s-2);
		border-radius: var(--radius-box);
		background-color: var(--color-base-card-section);
	}
	h3 {
		font-size: var(--font-xs);
		line-height: 1.35;
		text-align: center;
		word-break: break-word;

		:global(button.minimal) {
			display: inline;
			font-size: var(--fonts-md);
			vertical-align: baseline;
		}
	}
</style>
