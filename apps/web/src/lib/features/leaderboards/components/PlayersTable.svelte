<script lang="ts">
import Avatar from "#lib/components/Avatar.svelte";
import PlacementsTable, {
	placementName,
	placementRow,
	placementTierHeader,
} from "#lib/components/PlacementsTable.svelte";
import WeaponImage from "#lib/components/WeaponImage.svelte";
import { userSeasonsPage } from "#lib/utils/urls.ts";
import type { UserLeaderboardEntry } from "../leaderboards-types.ts";

interface Props {
	entries: UserLeaderboardEntry[];
	season: number;
	showTiers?: boolean;
	showingTopTen?: boolean;
}

let { entries, season, showTiers, showingTopTen }: Props = $props();

const shownEntries = $derived(
	// hide normal rows that are showed in "fancy" top 10 format
	entries.filter((_, i) => !showingTopTen || i > 9),
);
</script>

<PlacementsTable>
	{#each shownEntries as entry (entry.entryId)}
		{#if entry.firstOfTier && showTiers}
			{@render placementTierHeader(entry.firstOfTier)}
		{/if}
		{#snippet content()}
			<div>
				<Avatar size="xxs" user={entry} />
			</div>
			{#if typeof entry.weaponSplId === "number"}
				<WeaponImage
					class="tableWeapon"
					variant="build"
					weaponSplId={entry.weaponSplId}
					width={32}
					height={32}
				/>
			{/if}
			{@render placementName(entry.username)}
			{#if entry.pendingPlusTier}
				<div class="text-xs text-theme whitespace-nowrap">
					➜ +{entry.pendingPlusTier}
				</div>
			{/if}
		{/snippet}
		{@render placementRow({
			href: userSeasonsPage({ user: entry, season }),
			rank: entry.placementRank,
			power: entry.power.toFixed(2),
			children: content,
		})}
	{/each}
</PlacementsTable>
