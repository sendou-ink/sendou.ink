<script lang="ts">
	import BuildCard from '$lib/components/build-card/BuildCard.svelte';
	import Button from '$lib/components/Button.svelte';
	import Main from '$lib/components/Main.svelte';
	import OpenGraphMeta from '$lib/components/OpenGraphMeta.svelte';
	import { BUILDS_PAGE_BATCH_SIZE } from '$lib/constants/build';
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

	let { params } = $props();

	let limit = $state(BUILDS_PAGE_BATCH_SIZE);

	const { builds, weaponId, hasMore } = $derived(
		await buildsBySlug({
			slug: params.slug,
			limit
		})
	);

	const weaponNameInEnglish = $derived(weaponTranslations[weaponId]({}, { locale: 'en' }));

	function handleFilterAdd(_type: string) {
		return null;
	}
</script>

<OpenGraphMeta
	title={`${weaponNameInEnglish} builds`}
	ogTitle={`${weaponNameInEnglish} Splatoon 3 builds`}
	description={`Collection of ${weaponNameInEnglish} builds from the top competitive players. Find the best combination of abilities and level up your gameplay.`}
/>

<Main class="stack lg" bigger>
	<div class="builds-buttons">
		<!-- <SendouMenu
					trigger={
						<SendouButton
							variant="outlined"
							size="small"
							icon={<FilterIcon />}
							isDisabled={filters.length >= MAX_BUILD_FILTERS}
							data-testid="add-filter-button"
						>
							{t("builds:addFilter")}
						</SendouButton>
					}
				>
					<SendouMenuItem
						icon={<BeakerFilledIcon />}
						isDisabled={filters.length >= MAX_BUILD_FILTERS}
						onAction={() => handleFilterAdd("ability")}
						data-testid="menu-item-ability"
					>
						{t("builds:filters.type.ability")}
					</SendouMenuItem>
					<SendouMenuItem
						icon={<MapIcon />}
						onAction={() => handleFilterAdd("mode")}
						data-testid="menu-item-mode"
					>
						{t("builds:filters.type.mode")}
					</SendouMenuItem>
					<SendouMenuItem
						icon={<CalendarIcon />}
						isDisabled={filters.some((filter) => filter.type === "date")}
						onAction={() => handleFilterAdd("date")}
						data-testid="menu-item-date"
					>
						{t("builds:filters.type.date")}
					</SendouMenuItem>
				</SendouMenu> -->
		<Menu
			items={[
				{
					icon: FlaskRound,
					label: m.builds_filters_type_ability(),
					onclick: () => handleFilterAdd('ability')
				},
				{
					icon: Map,
					label: m.builds_filters_type_mode(),
					onclick: () => handleFilterAdd('mode')
				},
				{
					icon: Calendar,
					label: m.builds_filters_type_date(),
					onclick: () => handleFilterAdd('date'),
					disabled: true
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
		<div></div>
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
	<!-- {filters.length > 0 ? (
				<div class="stack md">
					{filters.map((filter, i) => (
						<FilterSection
							key={filter.id}
							number={i + 1}
							filter={filter}
							onChange={(newFilter) => handleFilterChange(i, newFilter)}
							remove={() => handleFilterDelete(i)}
							nthOfSame={nthOfSameFilter(i)}
						/>
					))}
				</div>
			) : null} -->
	<div class="builds-container">
		<!-- {data.builds.map((build) => {
				return (
					<BuildCard
						key={build.id}
						build={build}
						owner={build}
						canEdit={false}
						withAbilitySorting={!user?.preferences.disableBuildAbilitySorting}
					/>
				);
			})} -->
		{#each builds as build (build.id)}
			<BuildCard {build} owner={build} canEdit={false} />
		{/each}
	</div>
	<!-- {data.limit < BUILDS_PAGE_MAX_BUILDS &&
				// not considering edge case where there are amount of builds equal to current limit
				// TODO: this could be fixed by taking example from the vods page
				data.builds.length === data.limit && (
					<LinkButton
						className="m-0-auto"
						size="small"
						to={loadMoreLink()}
						preventScrollReset
					>
						{t("common:actions.loadMore")}
					</LinkButton>
				)} -->
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
