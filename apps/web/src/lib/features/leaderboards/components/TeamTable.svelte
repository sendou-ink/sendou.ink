<script lang="ts">
import Avatar from "#lib/components/Avatar.svelte";
import InfoPopover from "#lib/components/InfoPopover.svelte";
import PlacementsTable, {
	placementDivider,
	placementRow,
} from "#lib/components/PlacementsTable.svelte";
import { hasRole } from "#lib/features/auth/user-state.ts";
import * as Seasons from "#lib/features/mmr/Seasons.ts";
import { m } from "#lib/paraglide/messages.js";
import { teamPage, userPage } from "#lib/utils/urls.ts";
import {
	type LeaderboardType,
	TEAM_LEADERBOARD_QUALIFYING_COUNT,
} from "../leaderboards-constants.ts";
import type { TeamLeaderboardEntry } from "../leaderboards-types.ts";
import TeamStaffMenu from "./TeamStaffMenu.svelte";

interface Props {
	entries: TeamLeaderboardEntry[];
	season: number;
	leaderboardType: LeaderboardType;
	showQualificationDividers?: boolean;
}

let {
	entries,
	season,
	leaderboardType,
	showQualificationDividers: showQualificationDividersProp,
}: Props = $props();

const isStaff = $derived(hasRole("STAFF"));
const showStaffActions = $derived(isStaff && leaderboardType !== "TEAM-ALL");
const isCurrentSeason = $derived(season === Seasons.current()?.nth);
const showQualificationDividers = $derived(
	showQualificationDividersProp && isCurrentSeason && entries.length > 20,
);
</script>

<PlacementsTable>
	{#each entries as entry (entry.entryId)}
		{#snippet content()}
			{#if entry.team?.avatarUrl}
				<a href={teamPage(entry.team.customUrl)} title={entry.team.name}>
					<Avatar size="xxs" url={entry.team.avatarUrl} class="avatar" />
				</a>
			{/if}
			<div class={["text-xs", { skippedTeam: entry.isSkipped }]}>
				{#each entry.members as member, i (member.id)}
					<a href={userPage(member)}>{member.username}</a
					>{i !== entry.members.length - 1 ? ", " : ""}
				{/each}
			</div>
		{/snippet}
		{#snippet staffActions()}
			<TeamStaffMenu {entry} {season} />
		{/snippet}
		{@render placementRow({
			rank: entry.placementRank,
			power: entry.power.toFixed(2),
			children: content,
			end: showStaffActions ? staffActions : undefined,
		})}
		{#if entry.placementRank === TEAM_LEADERBOARD_QUALIFYING_COUNT && showQualificationDividers}
			{#snippet qualification()}
				{m.common_leaderboard_qualification()}
				<InfoPopover tiny>
					{m.common_leaderboard_qualification_info()}
				</InfoPopover>
			{/snippet}
			{@render placementDivider(qualification)}
		{/if}
	{/each}
</PlacementsTable>

<style>
	.skippedTeam {
		text-decoration: line-through;

		a {
			color: var(--color-text-high);
		}
	}
</style>
