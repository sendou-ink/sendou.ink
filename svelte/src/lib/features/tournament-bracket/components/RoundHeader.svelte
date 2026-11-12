<!-- An elimination round's header; the league round dates and round timers of the React header are not ported. -->
<script lang="ts">
import type { TournamentRoundMaps } from "~/db/tables-json";

interface Props {
	name: string;
	bestOf?: number;
	showInfos?: boolean;
	maps?: TournamentRoundMaps | null;
}

let { name, bestOf, showInfos, maps }: Props = $props();

const countPrefix = $derived(maps?.type === "PLAY_ALL" ? "Play all " : "Bo");
const pickBanSuffix = $derived(
	maps?.pickBan === "COUNTERPICK"
		? " (C)"
		: maps?.pickBan === "BAN_2"
			? " (B)"
			: "",
);
</script>

<div>
	<div class="elim-round-header">{name}</div>
	{#if showInfos && bestOf}
		<div class="elim-round-header-infos">
			<div>{countPrefix}{bestOf}{pickBanSuffix}</div>
		</div>
	{:else}
		<div class="elim-round-header-infos invisible">Hidden</div>
	{/if}
</div>

<style>
	@layer features {
		.elim-round-header {
			text-align: center;
			background-color: var(--color-bg-higher);
			font-size: var(--font-xs);
			font-weight: var(--weight-semi);
			padding-block: var(--s-2);
			width: var(--match-width);
			border-radius: var(--radius-box);
		}

		.elim-round-header-infos {
			width: var(--match-width);
			display: flex;
			justify-content: space-between;
			font-size: var(--font-2xs);
			color: var(--color-text-high);
			font-weight: var(--weight-semi);
		}
	}
</style>
