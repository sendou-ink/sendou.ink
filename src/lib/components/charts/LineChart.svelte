<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import type { ChartConfiguration } from 'chart.js/auto';
	import { getChartColors, createLineAnimation, deepMerge } from './utils';
	import Chart from 'chart.js/auto';

	export interface Data {
		x: string;
		y: string;
	}

	export interface DataSet {
		label: string;
		data: Data[];
	}

	export type ChartConfig = ChartConfiguration<'line', Array<Data>, string> & {
		options: {
			animations?: never;
			animation?: never;
		};
	};

	interface Props {
		datasets: DataSet[];
		heading: string;
		animationSpeed?: number;
		config?: Partial<ChartConfig>;
	}

	let { datasets, heading, animationSpeed = 500, config = {} }: Props = $props();

	function createLineChart(): Attachment<HTMLCanvasElement> {
		return (element) => {
			const colors = getChartColors();

			const defaultConfig: ChartConfig = {
				type: 'line',
				data: {
					datasets: [
						{
							borderColor: colors.line,
							backgroundColor: colors.line,
							label: 'INIT',
							data: [{ x: '0', y: '0' }]
						}
					]
				},
				options: {
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
							tension: 0.25
						},
						point: {
							radius: 0,
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
							text: heading,
							color: colors.heading,
							display: true
						},
						tooltip: {
							backgroundColor: colors.bg,
							borderColor: colors.border,
							borderWidth: 1,
							caretPadding: 10,
							boxPadding: 2,
							multiKeyBackground: colors.line,
							usePointStyle: true,
							titleFont: {
								family: 'lexend'
							},
							bodyFont: {
								family: 'lexend'
							}
						}
					}
				}
			};

			const chart = new Chart(element, deepMerge(defaultConfig, config));

			$effect(() => {
				chart.options.animations = createLineAnimation(datasets[0].data, animationSpeed);

				// we need to snapshot because the library cant handle proxies
				const data = $state.snapshot(datasets);

				data.forEach((newDs, index) => {
					if (chart.data.datasets[index]) {
						if (chart.data.datasets[0].label !== 'INIT') {
							const newPointsStart = chart.data.datasets[index].data.length;

							chart.options.animations = {
								y: {
									type: 'number',
									easing: 'linear',
									duration: 250,
									from: (ctx) => {
										if (ctx.type !== 'data') return;
										if (ctx.dataIndex >= newPointsStart) {
											return ctx.chart
												.getDatasetMeta(ctx.datasetIndex)
												.data[ctx.dataIndex - 1].getProps(['y'], true).y;
										}
									}
								}
							};
						}

						chart.data.datasets[index].label = newDs.label;
						chart.data.datasets[index].data = newDs.data;
					} else {
						chart.options.animations = createLineAnimation(newDs.data, animationSpeed);

						const lineColor =
							colors[`line-${(index % 3) + 1}` as keyof typeof colors] || colors.line;

						chart.data.datasets.push({
							label: newDs.label,
							data: newDs.data,
							borderColor: lineColor,
							backgroundColor: lineColor
						});
					}
				});

				chart.update();
			});

			return () => chart.destroy();
		};
	}
</script>

<div>
	<canvas {@attach createLineChart()}></canvas>
</div>

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
