<script lang="ts">
	import * as TournamentAPI from '$lib/api/tournament';
	import type { PageProps } from './$types';

	const { params }: PageProps = $props();

	await TournamentAPI.queries.redirectToCurrentMainPage(params.id);
</script>
