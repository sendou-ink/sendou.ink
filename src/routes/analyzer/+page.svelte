<script lang="ts">
	import type { BuildAbilitiesTupleWithUnknown } from '$lib/constants/in-game/types';
	import AbilityBuilder from '../../lib/components/builder/AbilityBuilder.svelte';
	import { emptyBuild } from '$lib/constants/in-game/abilities';

	let abilities: BuildAbilitiesTupleWithUnknown = $state(emptyBuild);
</script>

<AbilityBuilder bind:abilities />
