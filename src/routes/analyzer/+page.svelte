<script lang="ts">
	import type { BuildAbilitiesTupleWithUnknown } from '$lib/constants/in-game/types';
	import { emptyBuild } from '$lib/constants/in-game/abilities';
	import AbilityBuilder from '../../lib/components/builder/AbilityBuilder.svelte';
	import LineChart, { type DataSet } from '$lib/components/charts/LineChart.svelte';

	let datasets = $state<DataSet[]>(generateRandomData());

	function generateRandomData() {
		const data: any = [];
		for (let i = 0; i < 100; i++) {
			const sineWave = Math.sin(i / 5) * 150;
			const trend = i * 3;
			const randomness = Math.random() * 100;

			const event = i % 25 === 0 ? 200 : 0;

			if (i === 0) {
				data.push({
					label: 'Test',
					data: []
				});
			}

			const value = Math.round(sineWave + trend + randomness + event);
			data[0].data.push({ x: String(1920 + i), y: String(Math.max(0, value)) });
		}

		return data;
	}

	setInterval(() => {
		// datasets = [...datasets, ...generateRandomData()];
	}, 1000);

	let abilities: BuildAbilitiesTupleWithUnknown = $state(emptyBuild);
</script>

<div>
	<LineChart {datasets} />
</div>
<AbilityBuilder bind:abilities />

<style>
	div {
		display: flex;
		justify-content: center;
		margin: 5rem;
	}
</style>
