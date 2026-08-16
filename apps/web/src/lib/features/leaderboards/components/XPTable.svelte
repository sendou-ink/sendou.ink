<script lang="ts">
import Avatar from "#lib/components/Avatar.svelte";
import WeaponImage from "#lib/components/WeaponImage.svelte";
import { topSearchPlayerPage } from "#lib/utils/urls.ts";
import type { XPLeaderboardEntry } from "../leaderboards-types.ts";

interface Props {
	entries: XPLeaderboardEntry[];
}

let { entries }: Props = $props();
</script>

<div class="table">
	{#each entries as entry (entry.entryId)}
		<a href={topSearchPlayerPage(entry.playerId)} class="tableRow">
			<div class="tableInnerRow">
				<div class="tableRank">{entry.placementRank}</div>
				{#if entry.discordId}
					<Avatar
						size="xxs"
						user={{
							discordId: entry.discordId,
							discordAvatar: entry.discordAvatar,
							customAvatarUrl: entry.customAvatarUrl,
						}}
					/>
				{/if}
				<WeaponImage
					class="tableWeapon"
					variant="build"
					weaponSplId={entry.weaponSplId}
					width={32}
					height={32}
				/>
				<div>{entry.name}</div>
				<div class="tablePower">{entry.power.toFixed(1)}</div>
			</div>
		</a>
	{/each}
</div>
