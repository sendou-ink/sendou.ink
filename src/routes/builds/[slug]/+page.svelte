<script lang="ts">
	import BuildCard from '$lib/components/build-card/BuildCard.svelte';
	import Button from '$lib/components/buttons/Button.svelte';
	import Main from '$lib/components/layout/Main.svelte';
	import OpenGraphMeta from '$lib/components/OpenGraphMeta.svelte';
	import { BUILDS_PAGE_BATCH_SIZE, PATCHES } from '$lib/constants/build';
	import { m } from '$lib/paraglide/messages';
	import { weaponTranslations } from '$lib/utils/i18n';
	import { buildsBySlug } from './builds-by-slug.remote';
	import { resolve } from '$app/paths';
	import Flame from '@lucide/svelte/icons/flame';
	import ChartNoAxesColumnDecreasing from '@lucide/svelte/icons/chart-no-axes-column-decreasing';
	import Menu from '$lib/components/menu/Menu.svelte';
	import Funnel from '@lucide/svelte/icons/funnel';
	import MenuTriggerButton from '$lib/components/menu/MenuTriggerButton.svelte';
	import FlaskRound from '@lucide/svelte/icons/flask-round';
	import Map from '@lucide/svelte/icons/map';
	import Calendar from '@lucide/svelte/icons/calendar';
	import { SearchParamState } from '$lib/runes/search-param-state.svelte';
	import { buildFiltersSearchParams, type BuildFiltersFromSearchParams } from '../schemas';
	import BuildFilterSection from './BuildFilterSection.svelte';
	import type { BuildFilter } from '$lib/core/build/filter';

	let { params } = $props();

	let limit = $state(BUILDS_PAGE_BATCH_SIZE);

	const filters = new SearchParamState({
		key: 'f',
		defaultValue: [],
		schema: buildFiltersSearchParams
	});

	// xxx: skip if filters state the only change is default ability filter (ISM 0 AP)
	const { builds, weaponId, hasMore } = $derived(
		await buildsBySlug({
			slug: params.slug,
			limit,
			filters: filters.state
		})
	);

	const weaponNameInEnglish = $derived(weaponTranslations[weaponId]({}, { locale: 'en' }));

	function handleFilterAdd(type: BuildFiltersFromSearchParams[number]['type']) {
		const newFilter: BuildFiltersFromSearchParams[number] =
			type === 'ability'
				? {
						type: 'ability',
						ability: 'ISM',
						comparison: 'AT_LEAST',
						value: 0
					}
				: type === 'date'
					? {
							type: 'date',
							date: PATCHES[0].date
						}
					: {
							type: 'mode',
							mode: 'SZ'
						};

		filters.update([...filters.state, newFilter]);
	}

	function handleFilterChange(type: BuildFilter['type'], newFilter: Partial<BuildFilter>) {
		const newFilters = filters.state.map((filter) =>
			filter.type === type ? { ...filter, ...(newFilter as typeof filter) } : filter
		);

		filters.update(newFilters);
	}

	function handleFilterDelete(type: BuildFiltersFromSearchParams[number]['type']) {
		filters.update(filters.state.filter((f) => f.type !== type));
	}
</script>

<OpenGraphMeta
	title={`${weaponNameInEnglish} builds`}
	ogTitle={`${weaponNameInEnglish} Splatoon 3 builds`}
	description={`Collection of ${weaponNameInEnglish} builds from the top competitive players. Find the best combination of abilities and level up your gameplay.`}
/>

<Main class="stack lg" bigger>
	<div class="builds-buttons">
		<Menu
			items={[
				{
					icon: FlaskRound,
					label: m.builds_filters_type_ability(),
					onclick: () => handleFilterAdd('ability'),
					disabled: filters.state.some((f) => f.type === 'ability')
				},
				{
					icon: Map,
					label: m.builds_filters_type_mode(),
					onclick: () => handleFilterAdd('mode'),
					disabled: filters.state.some((f) => f.type === 'mode')
				},
				{
					icon: Calendar,
					label: m.builds_filters_type_date(),
					onclick: () => handleFilterAdd('date'),
					disabled: filters.state.some((f) => f.type === 'date')
				}
			]}
		>
			<MenuTriggerButton
				variant="outlined"
				size="small"
				icon={Funnel}
				data-testid="add-filter-button"
			>
				{m.builds_addFilter()}
			</MenuTriggerButton>
		</Menu>
		<div class="builds-buttons-link">
			<Button
				href={resolve(`/builds/${params.slug}/stats`)}
				icon={ChartNoAxesColumnDecreasing}
				variant="outlined"
				size="small"
			>
				{m.builds_linkButton_abilityStats()}
			</Button>
			<Button
				href={resolve(`/builds/${params.slug}/popular`)}
				icon={Flame}
				variant="outlined"
				size="small"
			>
				{m.builds_linkButton_popularBuilds()}
			</Button>
		</div>
	</div>

	{#if filters.state && filters.state.length > 0}
		<div class="stack md">
			{#each filters.state as filter (filter.type)}
				<BuildFilterSection
					{filter}
					onChange={(newFilter) => handleFilterChange(filter.type, newFilter)}
					remove={handleFilterDelete}
				/>
			{/each}
		</div>
	{/if}

	<div class="builds-container">
		<!-- xxx: ability sorting -->
		{#each builds as build (build.id)}
			<BuildCard {build} owner={build} canEdit={false} />
		{/each}
	</div>
	{#if hasMore}
		<Button class="m-0-auto" size="small" onclick={() => (limit += BUILDS_PAGE_BATCH_SIZE)}>
			{m.common_actions_loadMore()}
		</Button>
	{/if}
</Main>

<style>
	.builds-container {
		display: grid;
		justify-content: center;
		gap: var(--s-4) var(--s-3);
		grid-template-columns: repeat(auto-fit, 240px);
	}

	.builds-buttons {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;

		:global(svg) {
			stroke-width: 3.25px;
			fill: var(--color-primary);
		}
	}

	.builds-buttons-link {
		display: flex;
		flex-direction: column;
		gap: var(--s-2);

		@media screen and (min-width: 480px) {
			flex-direction: row;
		}
	}
</style>
