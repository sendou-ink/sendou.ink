<script lang="ts">
	import type { PageProps } from './$types';
	import * as BracketAPI from '$lib/api/tournament-bracket';
	import Bracket from './Bracket.svelte';
	import Button from '$lib/components/buttons/Button.svelte';
	import { bracketState } from './compact.svelte';
	import { SearchParamState } from '$lib/runes/search-param-state.svelte';
	import { z } from 'zod';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import Eye from '@lucide/svelte/icons/eye';

	const { params }: PageProps = $props();

	const selectedGroup = new SearchParamState({
		key: 'group',
		schema: z.number().int().nonnegative(),
		defaultValue: 0
	});

	const bracket = $derived(
		await BracketAPI.queries.findBracket({
			bracketIdx: params.idx,
			tournamentId: params.id,
			groupIdx: selectedGroup.state
		})
	);
</script>

<div class="stack lg">
	{#if bracket.showCompactify}
		<div>
			<Button
				onclick={() => {
					bracketState.isCompact = !bracketState.isCompact;
				}}
				icon={bracketState.isCompact ? Eye : EyeOff}
				variant="outlined"
				size="miniscule"
			>
				{bracketState.isCompact ? 'Show all' : 'Compactify'}
			</Button>
		</div>
	{/if}
	<Bracket
		{bracket}
		tournamentId={params.id}
		currentGroupIdx={selectedGroup.state}
		onGroupChange={(idx) => selectedGroup.update(idx)}
	/>
</div>
