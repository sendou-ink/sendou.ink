import type { Data } from './LineChart.svelte';

const rulePrefix = '--chart-';
const rulesToExtract = [
	'heading',
	'text',
	'grid',
	'axis',
	'line',
	'line-2',
	'line-3',
	'bg',
	'border'
] as const;

/*
xxx: ideally we would pass the canvas element into this function,
     which would allow each chart component to override the vars colors in their style tag
	 but currently not possible because of the onMount bug
	 tracked: https://github.com/sveltejs/svelte/issues/16582
*/
export function getChartColors() {
	const styles = getComputedStyle(document.documentElement);
	const colors = {} as Record<(typeof rulesToExtract)[number], string>;

	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = 1;
	const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

	for (const rule of rulesToExtract) {
		const value = styles.getPropertyValue(`${rulePrefix}${rule}`).trim();
		if (!value) continue;

		ctx.clearRect(0, 0, 1, 1);
		ctx.fillStyle = value;
		ctx.fillRect(0, 0, 1, 1);
		colors[rule] = `rgba(${ctx.getImageData(0, 0, 1, 1).data.join(',')})`;
	}

	canvas.remove();
	return colors;
}

// xxx: types.....
export function createLineAnimation(data: Data[], duration: number): any {
	const delayBetweenPoints = duration / data.length;

	return {
		x: {
			properties: ['x'],
			type: 'number',
			easing: 'linear',
			duration: delayBetweenPoints,
			from: NaN,
			delay: (ctx: any) => {
				if (!ctx) return 0;
				if (ctx.type !== 'data' || ctx.xStarted) return 0;

				ctx.xStarted = true;
				return ctx.dataIndex * delayBetweenPoints;
			}
		},
		y: {
			properties: ['y'],
			type: 'number',
			easing: 'linear',
			duration: delayBetweenPoints,
			from: NaN,
			delay(ctx: any) {
				if (!ctx) return 0;
				if (ctx.type !== 'data' || ctx.yStarted) return 0;

				ctx.yStarted = true;
				return ctx.dataIndex * delayBetweenPoints;
			}
		}
	};
}

export function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
	const result = { ...target };

	for (const key in source) {
		if (
			typeof source[key] === 'object' &&
			source[key] !== null &&
			!Array.isArray(source[key]) &&
			typeof result[key] === 'object' &&
			result[key] !== null &&
			!Array.isArray(result[key])
		) {
			result[key] = deepMerge(result[key], source[key]);
		} else if (source[key] !== undefined) {
			result[key] = source[key];
		}
	}

	return result;
}
