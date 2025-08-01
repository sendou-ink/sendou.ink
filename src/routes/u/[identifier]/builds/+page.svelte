<script lang="ts">
	import BuildCard from '$lib/components/build-card.svelte';
	import { m } from '$lib/paraglide/messages';
	import { userBuilds } from './user-builds.remote';

	let { params } = $props();

	// const isOwnPage = $derived(user?.id === layoutData.user.id);

	const builds = $derived((await userBuilds(params.identifier)).builds);

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
	// const builds = $derived(() => {
	// 	if (weaponFilter === 'ALL') {
	// 		return data.builds;
	// 	} else if (weaponFilter === 'PUBLIC') {
	// 		return data.builds.filter((build) => !build.private);
	// 	} else if (weaponFilter === 'PRIVATE') {
	// 		return data.builds.filter((build) => build.private);
	// 	} else {
	// 		return data.builds.filter((build) =>
	// 			build.weapons.map((wpn) => wpn.weaponSplId).includes(weaponFilter as number)
	// 		);
	// 	}
	// });
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

	<!-- <BuildsFilters
		{weaponFilter}
		{setWeaponFilter}
	/> -->

	{#if builds.length > 0}
		<div class="builds-container">
			{#each builds as build (build.id)}
				<!-- xxx: actual args -->
				<BuildCard {build} withAbilitySorting={true} />
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
