<script lang="ts">
	import invariant from "@sendou/utils/invariant";
	import Flag from "#lib/components/Flag.svelte";
	import Image from "#lib/components/Image.svelte";
	import Placement from "#lib/components/Placement.svelte";
	import { winnersImageUrl } from "#lib/utils/urls.ts";
	import { topTenPlayerData } from "./leaderboards-utils.ts";

	interface Props {
		power?: number;
		placement: number;
		season: number;
		small?: boolean;
	}

	let { power, placement, season, small = false }: Props = $props();

	const data = $derived.by(() => {
		const player = topTenPlayerData({ season, placement });
		invariant(
			player,
			`No data for season ${season} and placement ${placement}`,
		);
		return player;
	});

	const transformMultiplier = $derived(small ? 1 / 3 : 1);

	const containerStyle = $derived.by(() => {
		const styles: string[] = [];
		if (data.transforms?.top) {
			styles.push(
				`--winner-top: ${data.transforms.top * transformMultiplier}px`,
			);
		}
		if (data.transforms?.left) {
			styles.push(
				`--winner-left: ${data.transforms.left * transformMultiplier}px`,
			);
		}
		return styles.join("; ") || undefined;
	});
</script>

<div
	class={[
		"stack horizontal items-center text-main-forced",
		{ md: !small, sm: small, "mt-2": small },
	]}
>
	<div class={["container", { containerSmall: small }]}>
		<Image
			path={winnersImageUrl({ season, placement })}
			alt=""
			containerClass="imgContainer"
			class="img"
			height={small ? 50 : 150}
			{containerStyle}
		/>
	</div>
	<div>
		<div
			class="text-xs text-lighter stack horizontal xxs items-center"
			style={placement > 3 ? "margin-block-end: -4px" : undefined}
		>
			{#if placement <= 3}
				<Placement {placement} size={15} iconClass="mr-1" />
			{/if}
			<Placement {placement} textOnly showAsSuperscript={false} /> place
		</div>
		{#if !small}
			<div class="text-xl font-semi-bold">
				<Flag tiny countryCode={data.countryCode} />
				{data.name}
			</div>
			<div class="text-lg font-bold" style="line-height: 1">
				{power}
			</div>
		{/if}
	</div>
</div>

<style>
	.container {
		height: 125px;
		width: 125px;
		border-radius: var(--radius-avatar);
		background-color: var(--color-bg-high);
		overflow: hidden;
		position: relative;
	}

	.containerSmall {
		height: 41.6667px;
		width: 41.6667px;
	}

	.container :global(.imgContainer) {
		position: absolute;
		top: var(--winner-top, 5px);
		left: var(--winner-left, 25px);
	}

	.container :global(.img) {
		overflow: visible;
		max-width: initial;
	}
</style>
