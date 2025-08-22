<script lang="ts">
	import AbilityBuilder from './AbilityBuilder.svelte';

	let abilities = $state([
		['UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN'],
		['UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN'],
		['UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN']
	]);
</script>

<AbilityBuilder bind:abilities />

<p>{JSON.stringify(abilities[0], null, 2)}</p>
<p>{JSON.stringify(abilities[1], null, 2)}</p>
<p>{JSON.stringify(abilities[2], null, 2)}</p>
