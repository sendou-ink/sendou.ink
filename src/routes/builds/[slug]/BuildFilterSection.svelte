<script lang="ts">
	import Ability from '$lib/components/Ability.svelte';
	import Button from '$lib/components/Button.svelte';
	import Select from '$lib/components/Select.svelte';
	import { PATCHES } from '$lib/constants/build';
	import { abilities } from '$lib/constants/in-game/abilities';
	import { modesShort } from '$lib/constants/in-game/modes';
	import { possibleApValues } from '$lib/core/analyzer/utils';
	import type {
		BuildFilter,
		ModeBuildFilter,
		DateBuildFilter,
		AbilityBuildFilter
	} from '$lib/core/build/filter';
	import { m } from '$lib/paraglide/messages';
	import { abilityTranslations, modesLongTranslations } from '$lib/utils/i18n';
	import { format, nextSaturday, sub } from 'date-fns';
	import X from '@lucide/svelte/icons/x';

	interface Props {
		filter: BuildFilter;
		onChange: (filter: Omit<BuildFilter, 'type'>) => void;
		remove: (type: BuildFilter['type']) => void;
	}

	let { filter, onChange, remove }: Props = $props();

	// xxx: this is not derived
	function dateSelectValue(date: string) {
		const asIsoDate = format(new Date(date), 'yyyy-MM-dd');

		if (
			PATCHES.find(({ date }) => {
				return format(new Date(date), 'yyyy-MM-dd') === asIsoDate;
			})
		) {
			return asIsoDate;
		}

		return 'CUSTOM';
	}
</script>

<section>
	<div class="stack horizontal justify-between mx-2">
		<div class="text-xs font-bold">
			{filter.type === 'ability'
				? m.builds_filters_ability_title()
				: filter.type === 'mode'
					? m.builds_filters_mode_title()
					: m.builds_filters_date_title()}
		</div>
		<div>
			<Button
				icon={X}
				size="small"
				variant="minimal-destructive"
				onclick={() => remove(filter.type)}
				aria-label="Delete filter"
				data-testid="delete-filter-button"
			/>
		</div>
	</div>

	{#if filter.type === 'ability'}
		{@render abilityFilter(filter, onChange)}
	{:else if filter.type === 'mode'}
		{@render modeFilter(filter, onChange)}
	{:else if filter.type === 'date'}
		{@render dateFilter(filter, onChange)}
	{/if}
</section>

{#snippet abilityFilter(
	filter: AbilityBuildFilter,
	onChange: (filter: Partial<Omit<BuildFilter, 'type'>>) => void
)}
	{@const abilityObject = abilities.find((a) => a.name === filter.ability)!}

	<div class="filter">
		<div class="ability-container">
			<Ability ability={filter.ability} size="TINY" />
		</div>

		<Select
			value={filter.ability}
			values={abilities.map((ability) => ({
				label: abilityTranslations[ability.name](),
				value: ability.name
			}))}
			onchange={(e) =>
				onChange({
					ability: e.currentTarget.value as AbilityBuildFilter['ability'],
					value:
						abilities.find((a) => a.name === e.currentTarget.value)!.type === 'STACKABLE' ? 0 : true
				})}
		/>

		{#if abilityObject.type !== 'STACKABLE'}
			<Select
				value={!filter.value ? 'false' : 'true'}
				values={[
					{ label: m.builds_filters_has(), value: 'true' },
					{ label: m.builds_filters_does_not_have(), value: 'false' }
				]}
				onchange={(e) => onChange({ value: e.currentTarget.value === 'true' })}
			/>
		{/if}

		{#if abilityObject.type === 'STACKABLE'}
			<Select
				value={filter.comparison}
				values={[
					{ label: m.builds_filters_atLeast(), value: 'AT_LEAST' },
					{ label: m.builds_filters_atMost(), value: 'AT_MOST' }
				]}
				onchange={(e) =>
					onChange({
						comparison: e.currentTarget.value as AbilityBuildFilter['comparison']
					})}
				data-testid="comparison-select"
			/>
		{/if}

		{#if abilityObject.type === 'STACKABLE'}
			<div class="stack horizontal sm items-center">
				<Select
					value={typeof filter.value === 'number' ? filter.value : '0'}
					values={possibleApValues().map((value) => ({
						label: value,
						value
					}))}
					class="ap-select"
					onchange={(e) => onChange({ value: Number(e.currentTarget.value) })}
				/>
				<div class="text-sm">{m.analyzer_abilityPoints_short()}</div>
			</div>
		{/if}
	</div>
{/snippet}

{#snippet modeFilter(filter: ModeBuildFilter, onChange: (filter: Partial<BuildFilter>) => void)}
	<div class={['filter', 'filter-mode']}>
		{#each modesShort as mode (mode)}
			<div class="stack horizontal xs items-center font-sm font-semi-bold">
				<input
					type="radio"
					name="mode"
					id={`filter-${mode}`}
					value={mode}
					checked={filter.mode === mode}
					onchange={() => onChange({ mode })}
				/>
				<label for={`filter-${mode}`} class="stack horizontal xs mb-0">
					<!-- <ModeImage {mode} size={18} /> -->
					{modesLongTranslations[mode]()}
				</label>
			</div>
		{/each}
	</div>
{/snippet}

{#snippet dateFilter(filter: DateBuildFilter, onChange: (filter: Partial<DateBuildFilter>) => void)}
	<div class={['filter', 'filter-date']}>
		<label class="mb-0" for="date-filter">{m.builds_filters_date_since()}</label>

		<Select
			value={dateSelectValue(filter.date)}
			values={[
				...PATCHES.map(({ date: dateString }) => ({
					label: dateString,
					value: dateString
				})),
				{ label: m.builds_filters_date_custom(), value: 'CUSTOM' }
			]}
			id="date-filter"
			class="date-select"
			data-testid="date-select"
			onchange={(e) =>
				onChange({
					date:
						e.currentTarget.value === 'CUSTOM'
							? format(nextSaturday(sub(new Date(), { days: 30 })), 'yyyy-MM-dd')
							: e.currentTarget.value
				})}
		/>

		{#if dateSelectValue(filter.date) === 'CUSTOM'}
			<input
				type="date"
				value={format(new Date(filter.date), 'yyyy-MM-dd')}
				onchange={(e) => onChange({ date: e.currentTarget.value })}
				max={format(new Date(), 'yyyy-MM-dd')}
				data-testid="date-input"
			/>
		{/if}
	</div>
{/snippet}

<style>
	.filter {
		display: flex;
		flex-direction: column;
		padding: var(--s-2-5);
		border-radius: var(--radius-box);
		background-color: var(--color-base-section);
		border: var(--border-style);
		gap: var(--s-2);

		@media screen and (min-width: 750px) {
			flex-direction: row;
		}
	}

	.filter-mode {
		gap: var(--s-6);
	}

	.filter-date {
		display: flex;
		align-items: center;
	}

	.ability-container {
		display: flex;
		width: 32px;
		align-items: center;
	}
</style>
