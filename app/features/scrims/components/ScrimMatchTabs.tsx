import { sub } from "date-fns";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { MatchJoinTab } from "~/components/match-page/MatchJoinTab";
import { MatchRosterTab } from "~/components/match-page/MatchRosterTab";
import { MatchTabs, TAB_KEYS } from "~/components/match-page/MatchTabs";
import { useUser } from "~/features/auth/core/user";
import {
	resolveActiveRoomLink,
	useConfirmRoom,
} from "~/features/chat/room-link-utils";
import { resolveRoomPass } from "~/features/tournament-match/tournament-match-utils";
import { dateToDatabaseTimestamp } from "~/utils/dates";
import { teamPage } from "~/utils/urls";
import * as Scrim from "../core/Scrim";
import type { loader } from "../loaders/scrims.$id.server";
import type { ScrimPost } from "../scrims-types";

const SCRIM_ROOM_LINK_FRESHNESS_MINUTES = 30;

export function ScrimMatchTabs() {
	const { t } = useTranslation(["q"]);
	const user = useUser();
	const data = useLoaderData<typeof loader>();
	const { onConfirmRoom, isConfirming } = useConfirmRoom();

	const acceptedRequest = data.post.requests[0];
	const allMembers = [...data.post.users, ...acceptedRequest.users];

	const activeRoomLink = resolveActiveRoomLink({
		roomLinks: data.roomLinks,
		freshnessCutoff: dateToDatabaseTimestamp(
			sub(new Date(), { minutes: SCRIM_ROOM_LINK_FRESHNESS_MINUTES }),
		),
		viewerUserId: user?.id,
		members: allMembers,
	});

	return (
		<MatchTabs tabs={[TAB_KEYS.JOIN, TAB_KEYS.ROSTERS]}>
			<MatchJoinTab
				{...activeRoomLink}
				onConfirmRoom={onConfirmRoom}
				isConfirming={isConfirming}
				pool={Scrim.resolvePoolCode(data.post.id)}
				pass={resolveRoomPass(data.post.id)}
				showNoSplatnetAlert={data.anyUserPrefersNoSplatnet}
			/>
			<MatchRosterTab
				minMembersPerTeam={4}
				teams={[
					{
						team: mapTeam(data.post.team),
						defaultName: t("q:match.groupAlpha"),
						members: data.post.users,
					},
					{
						team: mapTeam(acceptedRequest.team),
						defaultName: t("q:match.groupBravo"),
						members: acceptedRequest.users,
					},
				]}
			/>
		</MatchTabs>
	);
}

function mapTeam(team: ScrimPost["team"]) {
	if (!team) return undefined;
	return {
		id: 0,
		name: team.name,
		url: teamPage(team.customUrl),
		avatar: team.avatarUrl ?? undefined,
	};
}
