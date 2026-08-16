<script lang="ts">
import Avatar from "#lib/components/Avatar.svelte";
import PlacementsTable, {
	placementRow,
} from "#lib/components/PlacementsTable.svelte";
import WeaponImage from "#lib/components/WeaponImage.svelte";
import { topSearchPlayerPage } from "#lib/utils/urls.ts";
import type { XPLeaderboardEntry } from "../leaderboards-types.ts";

interface Props {
	entries: XPLeaderboardEntry[];
}

let { entries }: Props = $props();
</script>

<PlacementsTable>
	{#each entries as entry (entry.entryId)}
		{#snippet content()}
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
		{/snippet}
		{@render placementRow({
			href: topSearchPlayerPage(entry.playerId),
			rank: entry.placementRank,
			power: entry.power.toFixed(1),
			children: content,
		})}
	{/each}
</PlacementsTable>
