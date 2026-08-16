<script lang="ts">
import Avatar from "#lib/components/Avatar.svelte";
import TierImage from "#lib/components/TierImage.svelte";
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

<div class="table">
	{#each shownEntries as entry (entry.entryId)}
		{#if entry.firstOfTier && showTiers}
			<div class="tierHeader">
				<TierImage tier={entry.firstOfTier} width={32} />
				{entry.firstOfTier.name}{entry.firstOfTier.isPlus ? "+" : ""}
			</div>
		{/if}
		<a href={userSeasonsPage({ user: entry, season })} class="tableRow">
			<div class="tableInnerRow">
				<div class="tableRank">{entry.placementRank}</div>
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
				<div class="tableName">{entry.username}</div>
				{#if entry.pendingPlusTier}
					<div class="text-xs text-theme whitespace-nowrap">
						➜ +{entry.pendingPlusTier}
					</div>
				{/if}
				<div class="tablePower">{entry.power.toFixed(2)}</div>
			</div>
		</a>
	{/each}
</div>
