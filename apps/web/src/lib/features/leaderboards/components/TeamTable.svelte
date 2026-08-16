<script lang="ts">
import Avatar from "#lib/components/Avatar.svelte";
import InfoPopover from "#lib/components/InfoPopover.svelte";
import { hasRole } from "#lib/features/auth/user-state.ts";
import * as Seasons from "#lib/features/mmr/Seasons.ts";
import { m } from "#lib/paraglide/messages.js";
import { teamPage, userPage } from "#lib/utils/urls.ts";
import { TEAM_LEADERBOARD_QUALIFYING_COUNT } from "../leaderboards-constants.ts";
import type { LeaderboardsQueryArgs } from "../leaderboards-schemas.ts";
import type { TeamLeaderboardEntry } from "../leaderboards-types.ts";
import TeamStaffMenu from "./TeamStaffMenu.svelte";

interface Props {
	entries: TeamLeaderboardEntry[];
	season: number;
	queryArgs: LeaderboardsQueryArgs;
	showQualificationDividers?: boolean;
}

let {
	entries,
	season,
	queryArgs,
	showQualificationDividers: showQualificationDividersProp,
}: Props = $props();

const isStaff = $derived(hasRole("STAFF"));
const showStaffActions = $derived(isStaff && queryArgs.type !== "TEAM-ALL");
const isCurrentSeason = $derived(season === Seasons.current()?.nth);
const showQualificationDividers = $derived(
	showQualificationDividersProp && isCurrentSeason && entries.length > 20,
);
</script>

<div class="table">
	{#each entries as entry (entry.entryId)}
		<div class="tableRow">
			<div class="tableInnerRow">
				<div class="tableRank">{entry.placementRank}</div>
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
				<div class="tablePower">{entry.power.toFixed(2)}</div>
				{#if showStaffActions}
					<TeamStaffMenu {entry} {season} {queryArgs} />
				{/if}
			</div>
		</div>
		{#if entry.placementRank === TEAM_LEADERBOARD_QUALIFYING_COUNT && showQualificationDividers}
			<div class="tableRow tableRowQualification">
				{m.common_leaderboard_qualification()}
				<InfoPopover tiny>
					{m.common_leaderboard_qualification_info()}
				</InfoPopover>
			</div>
		{/if}
	{/each}
</div>
