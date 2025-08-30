<script lang="ts">
	import type { BuildAbilitiesTupleWithUnknown } from '$lib/constants/in-game/types';
	import { emptyBuild } from '$lib/constants/in-game/abilities';
	import AbilityBuilder from '../../lib/components/builder/AbilityBuilder.svelte';
	import LineChart, { type DataSet } from '$lib/components/charts/LineChart.svelte';

	let datasets = $state<DataSet[]>(generateRandomData(0));

	function generateRandomData(length: number) {
		const data: any = [];
		for (let i = 0; i < 100; i++) {
			const sineWave = Math.sin((i + length) / 5) * 150;
			const trend = i * 3;
			const randomness = Math.random() * 100;

			const event = i % 25 === 0 ? 200 : 0;

			if (i === 0) {
				data.push({
					label: 'Test',
					data: []
				});
			}

			const value = Math.round(sineWave + trend + randomness + event + length * 200);
			data[0].data.push({ x: String(1920 + i), y: String(Math.max(0, value)) });
		}

		return data;
	}

	setInterval(() => {
		if (datasets.length < 3) {
			datasets = [...datasets, ...generateRandomData(datasets.length)];
		} else {
			datasets = datasets.map((ds, i) => {
				const lastData = ds.data[ds.data.length - 1];
				const lastX = parseInt(lastData.x);

				const sineWave = Math.sin((i + datasets.length) / 5) * 150;
				const trend = i * 3 * 100;
				const randomness = Math.random() * 100;
				const event = i % 25 === 0 ? 200 : 0;

				const newY = Math.round(sineWave + trend + randomness + event);
				const newData = [{ x: String(lastX + 1), y: String(Math.max(0, newY)) }];
				const newData2 = [{ x: String(lastX + 2), y: String(Math.max(0, newY + 50)) }];
				const newData3 = [{ x: String(lastX + 3), y: String(Math.max(0, newY - 30)) }];

				return {
					...ds,
					data: [...ds.data, ...newData, ...newData2, ...newData3]
				};
			});
		}
	}, 1000);

	let abilities: BuildAbilitiesTupleWithUnknown = $state(emptyBuild);
</script>

<div>
	<LineChart {datasets} animationSpeed={500} heading="Example" />
</div>
<AbilityBuilder bind:abilities />

<style>
	div {
		display: flex;
		justify-content: center;
		margin: 5rem;
	}
</style>
