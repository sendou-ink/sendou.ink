<script lang="ts">
	import type { BuildAbilitiesTupleWithUnknown } from '$lib/constants/in-game/types';
	import AbilityBuilder from '../../lib/components/builder/AbilityBuilder.svelte';
	import { emptyBuild } from '$lib/constants/in-game/abilities';
	import LineChart from '$lib/components/charts/LineChart.svelte';

	let abilities: BuildAbilitiesTupleWithUnknown = $state(emptyBuild);
</script>

<div>
	<LineChart />
</div>
<AbilityBuilder bind:abilities />

<style>
	div {
		display: flex;
		justify-content: center;
		margin: 5rem;
	}
</style>
