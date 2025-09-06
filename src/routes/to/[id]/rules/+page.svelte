<script lang="ts">
	import type { PageProps } from './$types';
	import * as TournamentAPI from '$lib/api/tournament';
	import Markdown from '$lib/components/Markdown.svelte';

	const { params }: PageProps = $props();
</script>

<div class="main">
	<Markdown content={await TournamentAPI.queries.rulesById(params.id)} />
</div>
