<script lang="ts">
	import * as BuildAPI from '$lib/api/build';
	import * as AuthAPI from '$lib/api/auth';
	import * as UserAPI from '$lib/api/user';
	import BuildCard from '$lib/components/build-card/BuildCard.svelte';
	import type { MainWeaponId } from '$lib/constants/in-game/types';
	import { m } from '$lib/paraglide/messages';
	import BuildsFilters from './BuildFilters.svelte';
	import type { BuildFilter } from './types';
	import AddNewButton from '$lib/components/buttons/AddNewButton.svelte';
	import { resolve } from '$app/paths';
	import ChangeSortingDialog from './ChangeSortingDialog.svelte';

	let { params } = $props();

	const {
		builds: allBuilds,
		weaponCounts,
		buildSorting
	} = $derived(await BuildAPI.queries.byUserIdentifier(params.identifier));

	const isOwnPage = $derived(
		(await AuthAPI.queries.me())?.id ===
			(await UserAPI.queries.layoutDataByIdentifier(params.identifier)).user.id
	);

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
	{#if isOwnPage}
		<div class="stack sm horizontal items-center justify-end">
			<ChangeSortingDialog {buildSorting} />
			<AddNewButton navIcon="builds" href={resolve('/builds/new')} />
		</div>
	{/if}

	<BuildsFilters bind:filter isOwnPage builds={allBuilds} {weaponCounts} />

	{#if builds.length > 0}
		<div class="builds-container">
			<!-- eslint-disable svelte/require-each-key -- Needed so that the builds update when the data loader reruns -->
			{#each builds as build}
				<BuildCard {build} showActions={isOwnPage} />
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
