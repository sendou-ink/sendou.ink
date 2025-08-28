<script lang="ts">
	import { getChartColors, createLineAnimation } from './utils';
	import Chart from 'chart.js/auto';
	import Popover from '../popover/Popover.svelte';
	import PopoverTriggerButton from '../popover/PopoverTriggerButton.svelte';

	function test(element: HTMLCanvasElement) {
		const colors = getChartColors();

		const data = [];

		for (let i = 0; i < 100; i++) {
			const sineWave = Math.sin(i / 5) * 150;
			const trend = i * 3;
			const randomness = Math.random() * 100;

			const event = i % 25 === 0 ? 200 : 0;

			const value = Math.round(sineWave + trend + randomness + event);
			data.push({ year: 1920 + i, count: Math.max(0, value) });
		}

		const chart = new Chart(element, {
			type: 'line',
			data: {
				labels: data.map((row, i) => row.year),
				datasets: [
					{
						label: 'Acquisitions',
						data: data.map((row) => row.count)
					}
				]
			},
			options: {
				animations: createLineAnimation(data, 500),
				responsive: true,
				maintainAspectRatio: true,
				aspectRatio: 2,
				interaction: {
					mode: 'index',
					intersect: false
				},
				elements: {
					line: {
						borderWidth: 2,
						borderColor: colors.line,
						tension: 0.0
					},
					point: {
						radius: 0,
						backgroundColor: colors.line,
						hoverRadius: 5
					}
				},
				scales: {
					x: {
						ticks: {
							font: {
								family: 'monospace'
							},
							color: colors.text,
							padding: 5,
							maxRotation: 0,
							autoSkipPadding: 10
						},
						grid: {
							color: colors.grid,
							tickColor: colors.border
						},
						border: {
							color: colors.border
						}
					},
					y: {
						ticks: {
							font: {
								family: 'monospace'
							},
							color: colors.text,
							padding: 5,
							maxRotation: 0,
							autoSkipPadding: 5
						},
						grid: {
							color: colors.grid,
							tickColor: colors.border
						},
						border: {
							color: colors.border
						}
					}
				},
				plugins: {
					legend: {
						display: false
					},
					title: {
						font: {
							family: 'lexend',
							size: 18
						},
						text: 'Line Chart Example',
						color: colors.heading,
						display: true
					},
					tooltip: {
						backgroundColor: colors.bg,
						borderColor: colors.border,
						borderWidth: 1,
						caretPadding: 10,
						boxPadding: 2,
						titleFont: {
							family: 'lexend'
						},
						bodyFont: {
							family: 'lexend'
						}
					}
				}
			}
		});

		return () => {
			chart.destroy();
		};
	}
</script>

<Popover>
	{#snippet trigger()}
		<PopoverTriggerButton>Show Chart Data</PopoverTriggerButton>
	{/snippet}
	<div>
		<canvas {@attach test}></canvas>
	</div>
</Popover>

<style>
	div {
		position: relative;
		width: 80vw;
		aspect-ratio: 2 / 1;
	}

	canvas {
		width: 100%;
		height: 100%;
	}
</style>
