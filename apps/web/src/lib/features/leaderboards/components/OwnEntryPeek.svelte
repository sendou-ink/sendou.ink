<script lang="ts">
import Avatar from "#lib/components/Avatar.svelte";
import TierImage from "#lib/components/TierImage.svelte";
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
		<div class="tierHeader">
			<TierImage tier={entry.firstOfTier} width={32} />
			{entry.firstOfTier.name}{entry.firstOfTier.isPlus ? "+" : ""}
		</div>
	{/if}
	<div>
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
				<div class="tablePower">{entry.power}</div>
			</div>
		</a>
	</div>
	{#if nextTier}
		<div class="text-xs text-lighter ml-auto stack items-end">
			{nextTier.name}{nextTier.isPlus ? "+" : ""} @ {ordinalToSp(
				nextTier.neededOrdinal!,
			)}SP
		</div>
	{/if}
</div>
