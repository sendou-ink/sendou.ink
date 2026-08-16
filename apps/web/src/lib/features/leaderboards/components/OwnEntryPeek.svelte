<script lang="ts">
import Avatar from "#lib/components/Avatar.svelte";
import {
	placementName,
	placementRow,
	placementTierHeader,
} from "#lib/components/PlacementsTable.svelte";
import WeaponImage from "#lib/components/WeaponImage.svelte";
import { ordinalToSp } from "#lib/features/mmr/mmr-utils.ts";
import { userSeasonsPage } from "#lib/utils/urls.ts";
import type { OwnEntryPeekData } from "../leaderboards-types.ts";

interface Props {
	entry: OwnEntryPeekData["entry"];
	nextTier: OwnEntryPeekData["nextTier"];
	season: number;
}

let { entry, nextTier, season }: Props = $props();
</script>

<div>
	{#if entry.firstOfTier}
		{@render placementTierHeader(entry.firstOfTier)}
	{/if}
	<div>
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
		{/snippet}
		{@render placementRow({
			href: userSeasonsPage({ user: entry, season }),
			rank: entry.placementRank,
			power: entry.power,
			children: content,
		})}
	</div>
	{#if nextTier}
		<div class="text-xs text-lighter ml-auto stack items-end">
			{nextTier.name}{nextTier.isPlus ? "+" : ""} @ {ordinalToSp(
				nextTier.neededOrdinal!,
			)}SP
		</div>
	{/if}
</div>
