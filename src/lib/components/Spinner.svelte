<script lang="ts">
	type Color = 'theme' | 'green' | 'red' | 'currentColor';

	type Props = {
		color?: Color;
		size?: number | string;
		strokeWidth?: number | string;
	};

	let { color = 'currentColor', size = 24, strokeWidth = 2 }: Props = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	viewBox="0 0 24 24"
	fill="none"
	stroke-linecap="round"
	stroke-linejoin="round"
	stroke="currentColor"
	width={size}
	height={size}
	stroke-width={strokeWidth}
	class={`spinner ${color}`}
>
	<g>
		<circle cx="12" cy="12" r="9.5"
			><animate
				attributeName="stroke-dasharray"
				calcMode="spline"
				dur="1.5s"
				keySplines="0.42,0,0.58,1;0.42,0,0.58,1;0.42,0,0.58,1"
				keyTimes="0;0.475;0.95;1"
				repeatCount="indefinite"
				values="0 150;42 150;42 150;42 150"
			/><animate
				attributeName="stroke-dashoffset"
				calcMode="spline"
				dur="1.5s"
				keySplines="0.42,0,0.58,1;0.42,0,0.58,1;0.42,0,0.58,1"
				keyTimes="0;0.475;0.95;1"
				repeatCount="indefinite"
				values="0;-16;-59;-59"
			/></circle
		><animateTransform
			attributeName="transform"
			dur="2s"
			repeatCount="indefinite"
			type="rotate"
			values="0 12 12;360 12 12"
		/></g
	>
</svg>

<style>
	.theme {
		stroke: var(--color-primary);
	}

	.green {
		stroke: var(--color-success);
	}

	.red {
		stroke: var(--color-error);
	}

	.neutral {
		stroke: var(--color-base-content);
	}

	.currentColor {
		stroke: currentColor;
	}
</style>
