<script lang="ts">
	import Button from '$lib/components/button.svelte';
	import { m } from '$lib/paraglide/messages';
	import Lock from '@lucide/svelte/icons/lock';
	import LockOpen from '@lucide/svelte/icons/lock-open';
	import type { BuildFilter } from './types';

	interface Props {
		filter: BuildFilter;
		isOwnPage: boolean;
	}

	let { filter = $bindable(), isOwnPage }: Props = $props();

	const allBuildsCount = 0;
	const publicBuildsCount = 0;
	const privateBuildsCount = 0;
</script>

<div class="stack horizontal sm flex-wrap">
	<Button
		onclick={() => (filter = 'ALL')}
		variant={filter === 'ALL' ? undefined : 'outlined'}
		size="small"
	>
		{m.builds_stats_all()} ({allBuildsCount})
	</Button>
	{#if isOwnPage}
		<Button
			onclick={() => (filter = 'PUBLIC')}
			variant={filter === 'PUBLIC' ? undefined : 'outlined'}
			size="small"
			icon={LockOpen}
		>
			{m.builds_stats_public()} ({publicBuildsCount})
		</Button>
		<Button
			onclick={() => (filter = 'PRIVATE')}
			variant={filter === 'PRIVATE' ? undefined : 'outlined'}
			size="small"
			icon={Lock}
		>
			{m.builds_stats_private()} ({privateBuildsCount})
		</Button>
	{/if}

	<!-- <WeaponFilterMenu
				mainWeaponIds={mainWeaponIds}
				counts={data.weaponCounts}
				weaponFilter={weaponFilter}
				setWeaponFilter={setWeaponFilter}
			/> -->
</div>
