<script lang="ts" generics="M">
	import type { Attachment } from 'svelte/attachments';
	import type { Snippet } from 'svelte';
	import { getChartColors, createLineAnimation, deepMerge } from './utils';
	import {
		Chart,
		CategoryScale,
		LinearScale,
		LineController,
		PointElement,
		LineElement,
		Title,
		Tooltip,
		type FontSpec,
		type TooltipOptions
	} from 'chart.js';
	import type { Data, DataSet, ChartConfig, TooltipData, TooltipAlign } from './types';

	interface Props {
		datasets: DataSet<'line', M>[];
		heading: string;
		animationSpeed?: number;
		config?: Partial<ChartConfig<'line'>>;
		tooltip?: Snippet<[data: TooltipData<'line', M>]>;
	}

	let { datasets, heading, animationSpeed = 500, config = {}, tooltip }: Props = $props();

	let tooltipElement = $state<HTMLElement>();
	let tooltipAlign = $state<TooltipAlign>('center');
	let tooltipData = $state<TooltipData<'line', M>>();

	function createLineChart(): Attachment<HTMLCanvasElement> {
		return (element) => {
			const colors = getChartColors();

			const defaultConfig: ChartConfig<'line'> = {
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
					animations: createLineAnimation(datasets[0].data, animationSpeed),
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
							boxPadding: 4,
							boxHeight: 12,
							boxWidth: 12,
							multiKeyBackground: colors.line,
							usePointStyle: true,
							position: 'nearest',
							titleColor: colors.heading,
							titleMarginBottom: 6,
							titleAlign: 'center',
							titleFont: {
								family: 'lexend',
								size: 14,
								weight: 'bold',
								lineHeight: 1.2
							},
							bodyColor: colors.heading,
							bodyFont: {
								family: 'lexend',
								size: 12,
								weight: 'normal',
								lineHeight: 1.2
							},
							enabled: tooltip ? false : true,
							external: (ctx) => {
								if (!tooltipElement) return;

								const calculated = ctx.tooltip;
								const config = ctx.chart.config.options?.plugins?.tooltip as TooltipOptions & {
									titleFont: FontSpec;
									bodyFont: FontSpec;
								};

								tooltipAlign = calculated.xAlign;
								tooltipData = {
									titleStyles: {
										style: `color: ${config.titleColor};
											 	font-family: ${config.titleFont.family};
												font-size: ${config.titleFont.size}px;
												font-weight: ${config.titleFont.weight};
												margin-bottom: ${config.titleMarginBottom}px;
												text-align: ${config.titleAlign};
												line-height: ${config.titleFont.lineHeight};`
									},
									datasets: calculated.dataPoints.map((point, i) => {
										return {
											parsed: point.parsed,
											raw: point.raw as Data<'line'>,
											metadata: datasets[i].metadata,
											itemStyles: {
												style: `color: ${config.bodyColor};
											 			font-family: ${config.bodyFont.family};
														font-size: ${config.bodyFont.size}px;
														font-weight: ${config.bodyFont.weight};
														line-height: ${config.bodyFont.lineHeight};
														display: flex;
														align-items: center;`
											},
											pointStyles: {
												style: `background-color: ${point.dataset.backgroundColor};
														width: ${config.boxWidth}px;
														height: ${config.boxHeight}px;
														margin-right: ${config.boxPadding}px;
														border-radius: 50%;`
											}
										};
									})
								};

								if (calculated.opacity === 0) {
									tooltipElement.style.opacity = '0';
									return;
								}

								tooltipElement.style.opacity = '1';
								tooltipElement.style.left = calculated.caretX + 'px';
								tooltipElement.style.top = calculated.caretY + 'px';
							}
						}
					}
				}
			};

			Chart.register(
				CategoryScale,
				LinearScale,
				LineController,
				PointElement,
				LineElement,
				Title,
				Tooltip
			);

			const chart = new Chart(element, deepMerge(defaultConfig, config));

			$effect(() => {
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

<div class="chart-container">
	<canvas {@attach createLineChart()}></canvas>
	{#if tooltip}
		<div bind:this={tooltipElement} class={['tooltip', tooltipAlign]}>
			{#if tooltipData}
				{@render tooltip(tooltipData)}
			{/if}
		</div>
	{/if}
</div>

<style>
	.chart-container {
		position: relative;
		width: 80vw;
		aspect-ratio: 2 / 1;
	}

	.tooltip {
		--offset: 16px;
		--caret-size: 6px;

		padding: var(--s-2);
		background-color: var(--chart-bg);
		border: 1px solid var(--chart-border);
		border-radius: var(--radius-field);
		position: absolute;
		pointer-events: none;
		transition: all 0.1s ease;
		opacity: 0;
		display: flex;
		flex-direction: column;

		&::before,
		&::after {
			content: '';
			position: absolute;
			top: 50%;
			transform: translateY(-50%);
			width: 0;
			height: 0;
		}

		&::before {
			border: var(--caret-size) solid transparent;
		}

		&::after {
			border: calc(var(--caret-size) - 1px) solid transparent;
		}

		&.left {
			transform: translate(var(--offset), -50%);

			&::before {
				right: 100%;
				border-right-color: var(--chart-border);
			}

			&::after {
				right: 100%;
				border-right-color: var(--chart-bg);
				margin-right: -1px;
			}
		}

		&.right {
			transform: translate(calc(-100% - var(--offset)), -50%);

			&::before {
				left: 100%;
				border-left-color: var(--chart-border);
			}

			&::after {
				left: 100%;
				border-left-color: var(--chart-bg);
				margin-left: -1px;
			}
		}
	}

	canvas {
		width: 100%;
		height: 100%;
	}
</style>
