<script lang="ts">
import { Ban, MoreHorizontal, RotateCcw } from "@lucide/svelte";
import { Button, Menu, MenuItem } from "@sendou/components";
import {
	getLeaderboards,
	skipTeam,
	unskipTeam,
} from "../leaderboards.remote.ts";
import type { LeaderboardsQueryArgs } from "../leaderboards-schemas.ts";
import type { TeamLeaderboardEntry } from "../leaderboards-types.ts";

interface Props {
	entry: Pick<TeamLeaderboardEntry, "identifier" | "isSkipped">;
	season: number;
	/** The query args of the leaderboard the client currently shows, so the mutation can update it single-flight. */
	queryArgs: LeaderboardsQueryArgs;
}

let { entry, season, queryArgs }: Props = $props();

const fields = $derived({ season, identifier: entry.identifier });
</script>

<Menu>
	{#snippet trigger(triggerProps)}
		<Button
			size="miniscule"
			variant="outlined"
			aria-label="Actions"
			aria-expanded={triggerProps["aria-expanded"]}
			aria-haspopup={triggerProps["aria-haspopup"]}
			onclick={triggerProps.onclick}
		>
			{#snippet icon()}<MoreHorizontal />{/snippet}
		</Button>
	{/snippet}
	{#if entry.isSkipped}
		<MenuItem
			onAction={() => unskipTeam(fields).updates(getLeaderboards(queryArgs))}
		>
			{#snippet icon()}<RotateCcw />{/snippet}
			Unskip
		</MenuItem>
	{:else}
		<MenuItem
			isDestructive
			onAction={() => skipTeam(fields).updates(getLeaderboards(queryArgs))}
		>
			{#snippet icon()}<Ban />{/snippet}
			Skip
		</MenuItem>
	{/if}
</Menu>
