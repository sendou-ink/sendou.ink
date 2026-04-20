import { differenceInMinutes } from "date-fns";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { MatchJoinTab } from "~/components/match-page/MatchJoinTab";
import { MatchResultTab } from "~/components/match-page/MatchResultTab";
import { MatchRosterTab } from "~/components/match-page/MatchRosterTab";
import { MatchTabs } from "~/components/match-page/MatchTabs";
import { Redirect } from "~/components/Redirect";
import { useUser } from "~/features/auth/core/user";
import { DISPLAY_VOTE_RESULT_SECONDS } from "~/features/sendouq/q-constants";
import { resolveRoomPass } from "~/features/tournament-match/tournament-match-utils";
import { useHasRole } from "~/modules/permissions/hooks";
import { databaseTimestampToDate } from "~/utils/dates";
import { SENDOUQ_LOOKING_PAGE, teamPage } from "~/utils/urls";
import {
	resolveTimelineMaps,
	resolveTimelineSpChanges,
	resolveTimelineTeams,
} from "../core/match-timeline";
import * as SendouQMatch from "../core/SendouQMatch";
import type { SendouQMatchLoaderData } from "../loaders/q.match.$id.server";
import { resolveGroupMemberOf } from "../q-match-utils";
import { SendouQMatchActionTab } from "./SendouQMatchActionTab";

export function SendouQMatchTabs({ data }: { data: SendouQMatchLoaderData }) {
	const user = useUser();
	const isStaff = useHasRole("STAFF");
	const confirmFetcher = useFetcher();
	const { t } = useTranslation(["q"]);

	const currentMap = data.match.currentMap;

	const userSide = resolveGroupMemberOf({
		groupAlpha: data.match.groupAlpha,
		groupBravo: data.match.groupBravo,
		userId: user?.id,
	});
	const isStaffOnly = isStaff && !userSide;
	const ownTeamId =
		userSide === "ALPHA"
			? data.match.groupAlpha.id
			: userSide === "BRAVO"
				? data.match.groupBravo.id
				: isStaffOnly
					? null
					: data.match.groupAlpha.id;

	const { alphaWins, bravoWins, isDecisive } = SendouQMatch.score(data.match);
	const awaitingConfirmation = !data.match.isLocked && isDecisive;
	const isLocked = data.match.isLocked;
	const isCanceled = data.match.cancelAcceptedByUserId != null;

	const isParticipant = Boolean(userSide);
	const migrated = data.migratedToGroupId != null && isParticipant;

	// xxx: hmm is this really correct?
	if (migrated) {
		return <Redirect to={SENDOUQ_LOOKING_PAGE} />;
	}

	const now = Math.floor(Date.now() / 1000);
	const lockedVoteVisible =
		data.match.confirmedAt !== null &&
		now < data.match.confirmedAt + DISPLAY_VOTE_RESULT_SECONDS;

	const matchInProgress = !isLocked && !awaitingConfirmation && currentMap;

	const showActionTab =
		(isParticipant || (isStaffOnly && Boolean(matchInProgress))) &&
		!isCanceled &&
		(matchInProgress ||
			awaitingConfirmation ||
			(isLocked && lockedVoteVisible));

	const tabs: Array<"join" | "rosters" | "action" | "result"> = [];
	if (isLocked) {
		tabs.push("result", "rosters");
	} else {
		if (isParticipant) tabs.push("join");
		tabs.push("rosters");
	}
	if (showActionTab) tabs.push("action");

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
			{isLocked ? (
				<MatchResultTab
					teams={resolveTimelineTeams(data.match)}
					score={{ alpha: alphaWins, bravo: bravoWins }}
					maps={resolveTimelineMaps(data.match, data.reportedWeapons)}
					spChanges={resolveTimelineSpChanges(data.match)}
				>
					{data.match.cancelRequestedByUserId ? (
						<p className="text-lighter text-xxs text-center mt-4">
							{t("q:match.canceled.detail", {
								requester: resolveCancelRequesterUsername(data.match),
								accepter: resolveCancelAccepterUsername(data.match),
							})}
						</p>
					) : null}
				</MatchResultTab>
			) : null}
			{!isLocked && isParticipant ? (
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
			) : null}
			<MatchRosterTab
				minMembersPerTeam={4}
				canEditSubbedOut={[false, false]}
				teams={[
					{
						team: mapRosterTeam(data.match.groupAlpha.team),
						defaultName: t("q:match.groupAlpha"),
						members: mapRosterMembers(data.match.groupAlpha.members),
						tier: data.match.groupAlpha.tier ?? undefined,
					},
					{
						team: mapRosterTeam(data.match.groupBravo.team),
						defaultName: t("q:match.groupBravo"),
						members: mapRosterMembers(data.match.groupBravo.members),
						tier: data.match.groupBravo.tier ?? undefined,
					},
				]}
			/>
			{showActionTab ? (
				<SendouQMatchActionTab
					data={data}
					currentMap={currentMap ?? undefined}
					ownTeamId={ownTeamId}
					reportedCount={
						data.match.mapList.filter((m) => m.winnerGroupId !== null).length
					}
					viewerSide={userSide}
				/>
			) : null}
		</MatchTabs>
	);
}

type MatchData = SendouQMatchLoaderData["match"];

function resolveCancelRequesterUsername(match: MatchData) {
	const allMembers = [...match.groupAlpha.members, ...match.groupBravo.members];
	return (
		allMembers.find((m) => m.id === match.cancelRequestedByUserId)?.username ??
		"?"
	);
}

function resolveCancelAccepterUsername(match: MatchData) {
	const allMembers = [...match.groupAlpha.members, ...match.groupBravo.members];
	return (
		allMembers.find((m) => m.id === match.cancelAcceptedByUserId)?.username ??
		"?"
	);
}

function mapRosterMembers(members: MatchData["groupAlpha"]["members"]) {
	return members.map((member) => ({
		...member,
		tier:
			member.skill === "CALCULATING"
				? ("CALCULATING" as const)
				: member.skill?.tier,
		plusTier: member.plusTier ?? undefined,
		weaponPool: member.weapons?.map((w) => w.weaponSplId),
	}));
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
