<script lang="ts">
	import Button from '$lib/components/button.svelte';
	import { m } from '$lib/paraglide/messages';
	import Lock from '@lucide/svelte/icons/lock';
	import LockOpen from '@lucide/svelte/icons/lock-open';
	import type { BuildFilter } from './types';
	import type { UserBuildsData } from './user-builds.remote';
	import Menu from '$lib/components/menu/Menu.svelte';
	import MenuTriggerButton from '$lib/components/menu/MenuTriggerButton.svelte';
	import { mainWeaponIds } from '$lib/constants/in-game/weapon-ids';
	import { weaponTranslations } from '$lib/utils/i18n';
	import Sword from '@lucide/svelte/icons/sword';
	import { mainWeaponImageUrl } from '$lib/utils/urls';

	interface Props {
		filter: BuildFilter;
		isOwnPage: boolean;
		builds: UserBuildsData['builds'];
		weaponCounts: UserBuildsData['weaponCounts'];
	}

	let { filter = $bindable(), isOwnPage, builds, weaponCounts }: Props = $props();

	const allBuildsCount = $derived(builds.length);
	const publicBuildsCount = $derived(builds.filter((build) => !build.private).length);
	const privateBuildsCount = $derived(builds.filter((build) => build.private).length);
</script>

<div class="stack horizontal sm flex-wrap">
	<Button
		onclick={() => (filter = 'ALL')}
		variant={filter === 'ALL' ? undefined : 'outlined'}
		size="small"
	>
		{m.builds_stats_all()} ({allBuildsCount})
	</Button>
	{#if isOwnPage && (publicBuildsCount > 0 || privateBuildsCount > 0)}
		<div
			class={{
				selected: filter === 'PUBLIC'
			}}
		>
			<Button
				onclick={() => (filter = 'PUBLIC')}
				variant={filter === 'PUBLIC' ? undefined : 'outlined'}
				size="small"
				icon={LockOpen}
			>
				{m.builds_stats_public()} ({publicBuildsCount})
			</Button>
		</div>
		<div
			class={{
				selected: filter === 'PRIVATE'
			}}
		>
			<Button
				onclick={() => (filter = 'PRIVATE')}
				variant={filter === 'PRIVATE' ? undefined : 'outlined'}
				size="small"
				icon={Lock}
			>
				{m.builds_stats_private()} ({privateBuildsCount})
			</Button>
		</div>
	{/if}

	<div
		class={{
			selected: typeof filter === 'number'
		}}
	>
		<Menu
			scrolling
			items={mainWeaponIds
				.filter((id) => weaponCounts[id] > 0)
				.map((id) => ({
					label: `${weaponTranslations[id]()} (${weaponCounts[id]})`,
					value: id,
					selected: filter === id,
					onclick: () => (filter = id),
					imgSrc: mainWeaponImageUrl(id) + '.avif' // xxx: include .avif in the function
				}))}
		>
			<MenuTriggerButton
				variant={typeof filter === 'number' ? undefined : 'outlined'}
				size="small"
				icon={Sword}
			>
				{m.builds_filters_filterByWeapon()}</MenuTriggerButton
			>
		</Menu>
	</div>
</div>

<style>
	.selected {
		:global(rect, polyline) {
			fill: var(--color-primary-content);
		}
	}
</style>
