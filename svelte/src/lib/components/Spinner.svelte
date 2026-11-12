<script lang="ts">
const EASE_IN_OUT = "0.42,0,0.58,1;0.42,0,0.58,1;0.42,0,0.58,1";

let { class: className }: { class?: string } = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="3"
	stroke-linecap="round"
	stroke-linejoin="round"
	class={className}
	aria-hidden="true"
>
	<g>
		<circle cx="12" cy="12" r="9.5">
			<animate
				attributeName="stroke-dasharray"
				calcMode="spline"
				dur="1.5s"
				keySplines={EASE_IN_OUT}
				keyTimes="0;0.475;0.95;1"
				repeatCount="indefinite"
				values="0 150;42 150;42 150;42 150"
			/>
			<animate
				attributeName="stroke-dashoffset"
				calcMode="spline"
				dur="1.5s"
				keySplines={EASE_IN_OUT}
				keyTimes="0;0.475;0.95;1"
				repeatCount="indefinite"
				values="0;-16;-59;-59"
			/>
		</circle>
		<animateTransform
			attributeName="transform"
			dur="2s"
			repeatCount="indefinite"
			type="rotate"
			values="0 12 12;360 12 12"
		/>
	</g>
</svg>
