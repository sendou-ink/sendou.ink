<script lang="ts">
import type { TierName } from "#lib/features/mmr/mmr-constants.ts";
import { TIER_PLUS_URL, tierImageUrl } from "#lib/utils/urls.ts";
import Image from "./Image.svelte";

interface Props {
	tier: { name: TierName; isPlus: boolean };
	class?: string;
	width?: number;
}

let { tier, class: className, width = 200 }: Props = $props();

const title = $derived(`${tier.name}${tier.isPlus ? "+" : ""}`);
const height = $derived(width * 0.8675);
</script>

<div class={["tierContainer", className]} style="width: {width}px">
	<Image
		path={tierImageUrl(tier.name)}
		{width}
		{height}
		alt={title}
		{title}
		containerClass="tierImg"
	/>
	{#if tier.isPlus}
		<Image
			path={TIER_PLUS_URL}
			{width}
			{height}
			alt={title}
			{title}
			containerClass="tierImg"
		/>
	{/if}
</div>

<style>
	.tierContainer {
		display: grid;
	}

	.tierContainer :global(.tierImg) {
		grid-column: 1;
		grid-row: 1;
	}
</style>
