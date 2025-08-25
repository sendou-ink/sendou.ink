<script lang="ts">
	import AbilityBuilder from '../../lib/components/builder/AbilityBuilder.svelte';
	import type { BuildAbilitiesTupleWithUnknown } from '$lib/constants/in-game/types';

	let abilities: BuildAbilitiesTupleWithUnknown = $state([
		['UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN'],
		['UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN'],
		['UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN']
	]);
</script>

<AbilityBuilder bind:abilities />
