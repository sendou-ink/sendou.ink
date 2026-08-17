<script lang="ts">
import MatchResultTab from "#lib/components/match-page/MatchResultTab.svelte";
import MatchRosterTab from "#lib/components/match-page/MatchRosterTab.svelte";
import MatchTabs from "#lib/components/match-page/MatchTabs.svelte";
import {
	TAB_KEYS,
	type MatchTabsKey,
} from "#lib/components/match-page/match-page-constants.ts";
import type { TimelineMap } from "#lib/components/match-page/MatchTimeline.svelte";
import { m } from "#lib/paraglide/messages.js";
import { databaseTimestampToJavascriptTimestamp } from "#lib/utils/dates.ts";
import { teamPage } from "#lib/utils/urls.ts";
import * as Scrim from "../Scrim.ts";
import type { ScrimPageData } from "../scrims.remote.ts";
import type { ScrimPost } from "../scrims-types.ts";
import ScrimMatchActionTab from "./ScrimMatchActionTab.svelte";
import ScrimMatchStatsTab from "./ScrimMatchStatsTab.svelte";

interface Props {
	data: ScrimPageData;
}

let { data }: Props = $props();

const acceptedRequest = $derived(data.post.requests[0]);

const tabs = $derived.by(() => {
	const resolved: MatchTabsKey[] = [TAB_KEYS.ROSTERS];

	if (!data.mapByMap.locked) {
		resolved.push(TAB_KEYS.ACTION);
	}

	if (data.mapByMap.maps.length > 0) {
		resolved.push(TAB_KEYS.RESULT);
	}

	if (
		data.mapByMap.maps.some((map) => map.reportedAt !== null) &&
		data.mapByMap.viewerSide !== null
	) {
		resolved.push(TAB_KEYS.STATS);
	}

	return resolved;
});

function mapTeam(team: ScrimPost["team"]) {
	if (!team) return undefined;
	return {
		id: 0,
		name: team.name,
		url: teamPage(team.customUrl),
		avatar: team.avatarUrl ?? undefined,
	};
}

const timelineMaps = $derived<TimelineMap[]>(
	data.mapByMap.maps
		.filter((map) => map.winnerSide !== null && map.reportedAt !== null)
		.map((map) => ({
			stageId: map.stageId,
			mode: map.mode,
			timestamp: databaseTimestampToJavascriptTimestamp(map.reportedAt!),
			winner: map.winnerSide === "ALPHA" ? ("ALPHA" as const) : ("BRAVO" as const),
			rosters: {
				alpha: data.post.users,
				bravo: acceptedRequest.users,
			},
		})),
);
</script>

<MatchTabs {tabs}>
	<MatchRosterTab
		teams={[
			{
				team: mapTeam(data.post.team),
				defaultName: m.q_match_groupAlpha(),
				members: data.post.users,
			},
			{
				team: mapTeam(acceptedRequest.team),
				defaultName: m.q_match_groupBravo(),
				members: acceptedRequest.users,
			},
		]}
	/>
	<ScrimMatchActionTab {data} />
	<MatchResultTab
		teams={{
			alpha: {
				name: data.post.team
					? Scrim.sideDisplayName(data.post)
					: m.q_match_groupAlpha(),
				avatar: data.post.team?.avatarUrl ?? undefined,
			},
			bravo: {
				name: acceptedRequest.team
					? Scrim.sideDisplayName(acceptedRequest)
					: m.q_match_groupBravo(),
				avatar: acceptedRequest.team?.avatarUrl ?? undefined,
			},
		}}
		maps={timelineMaps}
		isOngoing={!data.mapByMap.locked && data.mapByMap.currentMap !== null}
	/>
	<ScrimMatchStatsTab {data} />
</MatchTabs>
