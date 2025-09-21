<script lang="ts">
	import type { PageProps } from './$types';
	import * as BracketAPI from '$lib/api/tournament-bracket';
	import Bracket from './Bracket.svelte';
	import Button from '$lib/components/buttons/Button.svelte';
	import { bracketState } from './compact.svelte';
	import EyeOff from '@lucide/svelte/icons/eye-off';
	import Eye from '@lucide/svelte/icons/eye';

	const { params }: PageProps = $props();

	const bracket = $derived(
		await BracketAPI.queries.findBracket({ bracketIdx: params.idx, tournamentId: params.id })
	);
</script>

<div class="stack lg">
	<div class="ml-auto">
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
	<Bracket {bracket} tournamentId={params.id} />
</div>
