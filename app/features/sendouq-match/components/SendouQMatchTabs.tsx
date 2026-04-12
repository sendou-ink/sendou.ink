import { differenceInMinutes } from "date-fns";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { MatchJoinTab } from "~/components/match-page/MatchJoinTab";
import { MatchRosterTab } from "~/components/match-page/MatchRosterTab";
import { MatchTabs } from "~/components/match-page/MatchTabs";
import { useUser } from "~/features/auth/core/user";
import { resolveRoomPass } from "~/features/tournament-bracket/tournament-bracket-utils";
import { databaseTimestampToDate } from "~/utils/dates";
import type { SerializeFrom } from "~/utils/remix";
import { teamPage } from "~/utils/urls";
import type { SendouQMatchLoaderData } from "../loaders/q.match.$id.server";
import { resolveGroupMemberOf } from "../q-match-utils";
import { SendouQMatchActionTab } from "./SendouQMatchActionTab";

export function SendouQMatchTabs({
	data,
}: {
	data: SerializeFrom<SendouQMatchLoaderData>;
}) {
	const user = useUser();
	const confirmFetcher = useFetcher();
	const { t } = useTranslation(["q"]);

	const currentMap = data.match.currentMap;

	const userSide = resolveGroupMemberOf({
		groupAlpha: data.match.groupAlpha,
		groupBravo: data.match.groupBravo,
		userId: user?.id,
	});
	const ownTeamId =
		userSide === "ALPHA"
			? data.match.groupAlpha.id
			: userSide === "BRAVO"
				? data.match.groupBravo.id
				: data.match.groupAlpha.id;

	const reportedCount = data.match.mapList.filter(
		(m) => m.winnerGroupId !== null,
	).length;

	const showActionTab = !data.match.isLocked && currentMap;

	const tabs: Array<"join" | "rosters" | "action"> = showActionTab
		? ["join", "rosters", "action"]
		: ["join", "rosters"];

	const allMembers = [
		...data.match.groupAlpha.members,
		...data.match.groupBravo.members,
	];

	// roomLinks are ordered by refreshedAt asc, so the first valid one is the oldest confirmed room
	const validRoomLink = data.roomLinks.find(
		(rl) => rl.refreshedAt >= data.match.createdAt,
	);
	const ownStaleRoomLink = validRoomLink
		? undefined
		: data.roomLinks.find((rl) => rl.userId === user?.id);

	const activeRoomLink = validRoomLink ?? ownStaleRoomLink;
	const isStale = activeRoomLink ? !validRoomLink : undefined;
	const staleMinutesAgo = ownStaleRoomLink
		? differenceInMinutes(
				new Date(),
				databaseTimestampToDate(ownStaleRoomLink.refreshedAt),
			)
		: 0;
	const hostedByUsername = activeRoomLink
		? allMembers.find((m) => m.id === activeRoomLink.userId)?.username
		: undefined;

	return (
		<MatchTabs tabs={tabs}>
			<MatchJoinTab
				joinLink={activeRoomLink?.url}
				hostedBy={hostedByUsername}
				isStale={isStale}
				staleMinutesAgo={staleMinutesAgo}
				refreshedAt={
					validRoomLink
						? databaseTimestampToDate(validRoomLink.refreshedAt)
						: undefined
				}
				onConfirmRoom={() => {
					confirmFetcher.submit(
						{ _action: "CONFIRM_ROOM" },
						{ method: "post" },
					);
				}}
				isConfirming={confirmFetcher.state !== "idle"}
				pool={`SQ${String(data.match.id).at(-1)}`}
				pass={resolveRoomPass(data.match.id)}
				showNoSplatnetAlert={data.anyUserPrefersNoSplatnet}
			/>
			<MatchRosterTab
				minMembersPerTeam={4}
				canEditSubbedOut={[false, false]}
				teams={[
					{
						team: mapRosterTeam(data.match.groupAlpha.team),
						defaultName: t("q:match.groupAlpha"),
						members: data.match.groupAlpha.members,
					},
					{
						team: mapRosterTeam(data.match.groupBravo.team),
						defaultName: t("q:match.groupBravo"),
						members: data.match.groupBravo.members,
					},
				]}
			/>
			{showActionTab ? (
				<SendouQMatchActionTab
					data={data}
					currentMap={currentMap}
					ownTeamId={ownTeamId}
					reportedCount={reportedCount}
				/>
			) : null}
		</MatchTabs>
	);
}

function mapRosterTeam(
	team: {
		id: number;
		name: string;
		customUrl: string;
		avatarUrl: string | null;
	} | null,
) {
	if (!team) return undefined;
	return {
		id: team.id,
		name: team.name,
		url: teamPage(team.customUrl),
		avatar: team.avatarUrl ?? undefined,
	};
}
