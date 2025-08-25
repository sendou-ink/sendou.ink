<script lang="ts">
	import AbilityBuilder from './AbilityBuilder.svelte';

	let abilities = $state([
		['UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN'],
		['UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN'],
		['UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN']
	]);
</script>

<AbilityBuilder bind:abilities />
