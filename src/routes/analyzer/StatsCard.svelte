<script lang="ts">
	import type { Stat, AnalyzedBuild } from '$lib/core/analyzer/types';
	import type { AbilityPoints, SpecialEffectType } from '$lib/core/analyzer/types';
	import { m } from '$lib/paraglide/messages';
	import { SPECIAL_EFFECTS, effectToImgUrl } from '$lib/core/analyzer/specialEffects';
	import Popover from '$lib/components/popover/Popover.svelte';
	import PopoverTriggerButton from '$lib/components/popover/PopoverTriggerButton.svelte';

	type StatTuple<T = number> = [Stat<T>, Stat<T>, keyof AnalyzedBuild['stats']];

	interface Props {
		title: string;
		stat: StatTuple | StatTuple<string> | number | string;
		suffix?: string;
		popoverInfo?: string;
		testId?: string;
		context: {
			// mainWeaponId: MainWeaponId; // xxx: mainWeaponId not used yet
			abilityPointsA: AbilityPoints;
			abilityPointsB: AbilityPoints;
			effectsA: Partial<Record<SpecialEffectType, boolean | number>>;
			effectsB: Partial<Record<SpecialEffectType, boolean | number>>;
			emptyA: boolean;
			emptyB: boolean;
		};
	}

	let { title, stat, suffix, popoverInfo, testId, context }: Props = $props();

	// We have to use a derived.by with a destructure because TS wont work with two seperate deriveds
	const { isStatic, baseValue } = $derived.by(() => {
		const isStatic = typeof stat === 'number' || typeof stat === 'string';
		const baseValue = isStatic ? stat : stat[0].baseValue;
		return { isStatic, baseValue };
	});

	const isComparing = $derived(!context.emptyA && !context.emptyB);

	function getAllRelevantEffects(statIndex: 0 | 1) {
		if (!Array.isArray(stat)) return [];

		const modifiedBy = [stat[statIndex].modifiedBy].flat();
		const relevantEffects = SPECIAL_EFFECTS.filter((effect) => {
			if (effect.type === 'LDE')
				return effect.values(0).some((value) => modifiedBy.includes(value.type));
			return effect.values.some((value) => modifiedBy.includes(value.type));
		});

		return relevantEffects.reduce((acc, effect) => {
			if (context[`effects${statIndex === 0 ? 'A' : 'B'}`][effect.type]) {
				acc.push(effect.type);
			}
			return acc;
		}, [] as SpecialEffectType[]);
	}

	// slightly hacky but handles the edge case
	// where baseValue === value which can happen when
	// you have Ninja Squid and stack swim speed
	// -> we still want to show the build value
	function checkBuildHasEffect(statIndex: 0 | 1, abilityPoints: AbilityPoints) {
		if (!Array.isArray(stat)) return false;

		return [stat[statIndex].modifiedBy].flat().some((ability) => {
			const hasStackable = (abilityPoints.get(ability) ?? 0) > 0;
			const hasEffect = baseValue !== stat[statIndex].value;

			return hasEffect || hasStackable;
		});
	}

	function isHighlighted() {
		if (!Array.isArray(stat)) return false;

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
		<div class={['values', { comparing: isComparing }]}>
			<div>
				<h4>
					{m.analyzer_base()}
				</h4>
				<p>{baseValue}{suffix}</p>
			</div>
			{#if !isStatic && checkBuildHasEffect(0, context.abilityPointsA)}
				<div>
					<h4>
						{m.analyzer_build1()}
					</h4>
					<p>
						{(stat as StatTuple)[0].value}
						{suffix}
					</p>
					<div>
						{#each getAllRelevantEffects(0) as effect (effect)}
							<img src={effectToImgUrl(effect)} alt="" />
						{/each}
					</div>
				</div>
			{/if}
			{#if !isStatic && checkBuildHasEffect(1, context.abilityPointsB)}
				<div>
					<h4>
						{m.analyzer_build2()}
					</h4>
					<p>
						{(stat as StatTuple)[1].value}
						{suffix}
					</p>
					<div>
						{#each getAllRelevantEffects(1) as effect (effect)}
							<img src={effectToImgUrl(effect)} alt="" />
						{/each}
					</div>
				</div>
			{/if}
		</div>
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
