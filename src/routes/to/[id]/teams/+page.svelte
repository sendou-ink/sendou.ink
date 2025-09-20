<script lang="ts">
	import * as TournamentAPI from '$lib/api/tournament';
	import type { PageProps } from './$types';
	import TeamWithRoster from './TeamWithRoster.svelte';

	let { params }: PageProps = $props();
</script>

<div class="stack lg">
	{#each await TournamentAPI.queries.teamsById(params.id) as team (team.id)}
		<TeamWithRoster {team} tournamentId={Number(params.id)} />
	{/each}
</div>
