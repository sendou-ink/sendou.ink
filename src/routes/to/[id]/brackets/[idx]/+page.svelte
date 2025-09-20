<script lang="ts">
	import type { PageProps } from './$types';
	import * as BracketAPI from '$lib/api/tournament-bracket';
	import Bracket from './Bracket.svelte';

	const { params }: PageProps = $props();

	const bracket = $derived(
		await BracketAPI.queries.findBracket({ bracketIdx: params.idx, tournamentId: params.id })
	);
</script>

<Bracket {bracket} tournamentId={params.id} />
