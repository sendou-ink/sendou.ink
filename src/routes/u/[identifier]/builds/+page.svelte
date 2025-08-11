<script lang="ts">
	import { BuildAPI } from '$lib/api/build';
	import BuildCard from '$lib/components/build-card/BuildCard.svelte';
	import type { MainWeaponId } from '$lib/constants/in-game/types';
	import { m } from '$lib/paraglide/messages';
	import BuildsFilters from './BuildFilters.svelte';
	import type { BuildFilter } from './types';

	let { params } = $props();

	// const isOwnPage = $derived(user?.id === layoutData.user.id);

	const { builds: allBuilds, weaponCounts } = $derived(
		await BuildAPI.byUserIdentifier(params.identifier)
	);

	// Sorting dialog state
	// let changingSorting = $state<boolean>(() => {
	// 	const param = getSearchParam('sorting');
	// 	return param === 'true' && isOwnPage;
	// });

	// function setChangingSorting(value: boolean) {
	// 	changingSorting = value;
	// 	setSearchParam('sorting', value && isOwnPage ? 'true' : null);
	// }

	// const closeSortingDialog = () => setChangingSorting(false);

	// Filtered builds

	let filter = $state<BuildFilter>('ALL');

	const builds = $derived.by(() => {
		if (filter === 'ALL') {
			return allBuilds;
		} else if (filter === 'PUBLIC') {
			return allBuilds.filter((build) => !build.private);
		} else if (filter === 'PRIVATE') {
			return allBuilds.filter((build) => build.private);
		} else {
			return allBuilds.filter((build) =>
				build.weapons.map((wpn) => wpn.weaponSplId).includes(filter as MainWeaponId)
			);
		}
	});
</script>

<div class="stack lg">
	<!-- {#if changingSorting}
		<ChangeSortingDialog close={closeSortingDialog} />
	{/if} -->

	<!-- {#if isOwnPage}
		<div class="stack sm horizontal items-center justify-end">
			<Button
				onclick={() => setChangingSorting(true)}
				size="small"
				variant="outlined"
				icon={SortIcon}
				data-testid="change-sorting-button"
			>
				{m.user_builds_sorting_changeButton()}
			</Button>
			<AddNewButton navIcon="builds" href={userNewBuildPage(user)} />
		</div>
	{/if} -->

	<BuildsFilters bind:filter isOwnPage builds={allBuilds} {weaponCounts} />

	{#if builds.length > 0}
		<div class="builds-container">
			<!-- eslint-disable svelte/require-each-key -- Needed so that the builds update when the data loader reruns -->
			{#each builds as build}
				<!-- xxx: actual args -->
				<BuildCard {build} />
			{/each}
		</div>
	{:else}
		<div class="text-center text-lg text-lighter font-semi-bold">
			{m.builds_noBuilds()}
		</div>
	{/if}
</div>

<style>
	.builds-container {
		display: grid;
		justify-content: center;
		gap: var(--s-4) var(--s-3);
		grid-template-columns: repeat(auto-fit, 240px);
	}
</style>
