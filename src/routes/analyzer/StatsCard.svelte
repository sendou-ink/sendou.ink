<script lang="ts">
	import type { Stat, AnalyzedBuild } from '$lib/core/analyzer/types';
	import type { AbilityPoints, SpecialEffectType } from '$lib/core/analyzer/types';
	import type { MainWeaponId } from '$lib/constants/in-game/types';
	import { m } from '$lib/paraglide/messages';
	import { SPECIAL_EFFECTS, effectToImgUrl } from '$lib/core/analyzer/specialEffects';
	import Popover from '$lib/components/popover/Popover.svelte';
	import PopoverTriggerButton from '$lib/components/popover/PopoverTriggerButton.svelte';
	import Ability from '$lib/components/builder/Ability.svelte';
	import StatsChart from './StatsChart.svelte';

	type StatTuple<T = number> = [Stat<T>, Stat<T>, keyof AnalyzedBuild['stats']];

	interface Props {
		title: string;
		stat: StatTuple | StatTuple<string> | number | string;
		suffix?: string;
		popoverInfo?: string;
		testId?: string;
		context: {
			mainWeaponId: MainWeaponId;
			abilityPointsA: AbilityPoints;
			abilityPointsB: AbilityPoints;
			effectsA: Partial<Record<SpecialEffectType, boolean | number>>;
			effectsB: Partial<Record<SpecialEffectType, boolean | number>>;
		};
	}

	let { title, stat, suffix, popoverInfo, testId, context }: Props = $props();

	// We have to use a derived.by with a destructure because TS wont work with two seperate deriveds
	const { isStatic, baseValue } = $derived.by(() => {
		const isStatic = typeof stat === 'number' || typeof stat === 'string';
		const baseValue = isStatic ? stat : stat[0].baseValue;
		return { isStatic, baseValue };
	});

	const showA = $derived(statIsNotBaseValue(0, context.abilityPointsA) && !isStatic);
	const showB = $derived(statIsNotBaseValue(1, context.abilityPointsB) && !isStatic);
	const highlighted = $derived(showA || showB);

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
	function statIsNotBaseValue(statIndex: 0 | 1, abilityPoints: AbilityPoints) {
		if (!Array.isArray(stat)) return false;

		return [stat[statIndex].modifiedBy].flat().some((ability) => {
			const hasStackable = (abilityPoints.get(ability) ?? 0) > 0;
			const hasEffect = baseValue !== stat[statIndex].value;

			return hasEffect || hasStackable;
		});
	}
</script>

<div class={['card', { highlighted }]} data-testid={testId}>
	<div>
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
		<div class={['values', { comparing: showA && showB, unchanged: !highlighted }]}>
			<div>
				<h4>
					{m.analyzer_base()}
				</h4>
				<p>{baseValue}{suffix}</p>
			</div>
			{#if showA}
				<div>
					<h4>
						{m.analyzer_build1()}
					</h4>
					<p>
						{(stat as StatTuple)[0].value}
						{suffix}
					</p>
					<div class="effects">
						{#each getAllRelevantEffects(0) as effect (effect)}
							<img src={effectToImgUrl(effect)} alt="" width="24" height="24" />
						{/each}
					</div>
				</div>
			{/if}
			{#if showB}
				<div>
					<h4>
						{m.analyzer_build2()}
					</h4>
					<p>
						{(stat as StatTuple)[1].value}
						{suffix}
					</p>
					<div class="effects">
						{#each getAllRelevantEffects(1) as effect (effect)}
							<img src={effectToImgUrl(effect)} alt="" width="24" height="24" />
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</div>
	<div class="abilities">
		{#if Array.isArray(stat)}
			{@const modifiedArray = Array.isArray(stat[0].modifiedBy)
				? stat[0].modifiedBy
				: [stat[0].modifiedBy]}
			<div>
				{#each modifiedArray as ability (ability)}
					<Ability {ability} size="SUBTINY" />
				{/each}
			</div>
			<StatsChart
				{title}
				{suffix}
				mainWeaponId={context.mainWeaponId}
				statKey={stat[2]}
				modifiedBy={modifiedArray}
			/>
		{/if}
	</div>
</div>

<style>
	.card {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		padding: var(--s-2);
		border-radius: var(--radius-box);
		background-color: var(--color-base-card-section);
		font-size: var(--fonts-md);
		gap: var(--s-4);

		&.highlighted {
			background-color: var(--color-base-card);
		}

		:global(.chart-button) {
			border-radius: 99999px;
			padding: 4px;
			border: none;
		}
	}

	.values {
		display: grid;
		gap: var(--s-2) var(--s-2);
		margin-top: var(--s-4);
		justify-items: center;
		grid-template-areas: 'A B';

		> :nth-child(1) {
			grid-area: A;
		}

		> :nth-child(2) {
			grid-area: B;
		}

		> :nth-child(3) {
			grid-area: C;
		}

		> div {
			display: flex;
			flex-direction: column;
			align-items: center;

			.effects {
				display: grid;
				grid-template-columns: repeat(2, 24px);
			}
		}

		&.comparing {
			grid-template-areas:
				'A A'
				'B C';
		}

		&.unchanged {
			grid-template-areas: 'A';
		}
	}

	.abilities {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	h3 {
		font-size: var(--fonts-xs);
		line-height: 1.35;
		text-align: center;
		word-break: break-word;

		:global(button.minimal) {
			display: inline;
			font-size: var(--fonts-md);
			vertical-align: baseline;
		}
	}

	h4 {
		color: var(--color-base-content-secondary);
		font-size: var(--fonts-xxs);
		font-weight: 400;
		letter-spacing: 0.5px;
		text-transform: uppercase;
	}
</style>
