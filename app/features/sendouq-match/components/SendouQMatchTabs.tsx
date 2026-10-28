import { useTranslation } from "react-i18next";
import { MatchResultTab } from "~/components/match-page/MatchResultTab";
import { MatchRosterTab } from "~/components/match-page/MatchRosterTab";
import { MatchTabs } from "~/components/match-page/MatchTabs";
import { useUser } from "~/features/auth/core/user";
import { ACTION_TAB_AFTER_MATCH_MADE_SECONDS } from "~/features/sendouq/q-constants";
import { useHasRole } from "~/modules/permissions/hooks";
import { databaseTimestampNow } from "~/utils/dates";
import { teamPage } from "~/utils/urls";
import {
	resolveTimelineMaps,
	resolveTimelineSpChanges,
	resolveTimelineTeams,
} from "../core/match-timeline";
import * as SendouQMatch from "../core/SendouQMatch";
import type { SendouQMatchLoaderData } from "../loaders/q.match.$id.server";
import { SendouQMatchActionTab } from "./SendouQMatchActionTab";

export function SendouQMatchTabs({ data }: { data: SendouQMatchLoaderData }) {
	const user = useUser();
	const isStaff = useHasRole("STAFF");
	const { t } = useTranslation(["q"]);

	const currentMap = data.match.currentMap;

	const userSide = SendouQMatch.resolveGroupMemberOf({
		groupAlpha: data.match.groupAlpha,
		groupBravo: data.match.groupBravo,
		userId: user?.id,
	});
	const isStaffOnly = isStaff && !userSide;
	const ownTeamId = resolveOwnTeamId(data.match, userSide, isStaffOnly);

	const { alphaWins, bravoWins, isDecisive } = SendouQMatch.score(data.match);
	const awaitingConfirmation = !data.match.isLocked && isDecisive;
	const isLocked = data.match.isLocked;

	const isParticipant = Boolean(userSide);

	const showActionTab = resolveShowActionTab({
		match: data.match,
		isParticipant,
		isStaffOnly,
		awaitingConfirmation,
	});

	const hasReportedMaps = data.match.mapList.some(
		(m) => m.winnerGroupId !== null,
	);

	const viewerMustConfirmScore =
		awaitingConfirmation &&
		isParticipant &&
		isDecidingMapReportedByOtherSide(data.match, userSide);

	const tabs: Array<"rosters" | "action" | "result"> = ["rosters"];
	if (showActionTab) tabs.push("action");
	if (isLocked || hasReportedMaps) tabs.push("result");

	const alertTabs: Array<"action"> | undefined = viewerMustConfirmScore
		? ["action"]
		: undefined;

	return (
		<MatchTabs tabs={tabs} alertTabs={alertTabs}>
			{isLocked || hasReportedMaps ? (
				<MatchResultTab
					teams={resolveTimelineTeams(data.match, t)}
					score={{ alpha: alphaWins, bravo: bravoWins }}
					maps={resolveTimelineMaps(
						data.match,
						data.reportedWeapons,
						data.ingestedScoreboards,
					)}
					spChanges={resolveTimelineSpChanges(data.match)}
					isOngoing={!isLocked && hasReportedMaps}
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
type MatchSide = ReturnType<typeof SendouQMatch.resolveGroupMemberOf>;

function resolveOwnTeamId(
	match: MatchData,
	userSide: MatchSide,
	isStaffOnly: boolean,
) {
	if (userSide === "ALPHA") return match.groupAlpha.id;
	if (userSide === "BRAVO") return match.groupBravo.id;
	if (isStaffOnly) return null;

	return match.groupAlpha.id;
}

function resolveShowActionTab({
	match,
	isParticipant,
	isStaffOnly,
	awaitingConfirmation,
}: {
	match: MatchData;
	isParticipant: boolean;
	isStaffOnly: boolean;
	awaitingConfirmation: boolean;
}) {
	const lockedActionTabVisible =
		databaseTimestampNow() <
		match.createdAt + ACTION_TAB_AFTER_MATCH_MADE_SECONDS;

	const matchInProgress =
		!match.isLocked && !awaitingConfirmation && match.currentMap;

	return (
		(isParticipant ||
			(isStaffOnly && (Boolean(matchInProgress) || awaitingConfirmation))) &&
		(matchInProgress ||
			awaitingConfirmation ||
			(match.isLocked && lockedActionTabVisible))
	);
}

function isDecidingMapReportedByOtherSide(
	match: MatchData,
	userSide: MatchSide,
) {
	const decidingReportedByUserId = [...match.mapList]
		.reverse()
		.find((m) => m.winnerGroupId !== null)?.reportedByUserId;
	const reporterSide = SendouQMatch.resolveGroupMemberOf({
		groupAlpha: match.groupAlpha,
		groupBravo: match.groupBravo,
		userId: decidingReportedByUserId,
	});

	return reporterSide !== null && reporterSide !== userSide;
}

function resolveCancelRequesterUsername(match: MatchData) {
	const allMembers = SendouQMatch.allMembers(match);
	return (
		allMembers.find((m) => m.id === match.cancelRequestedByUserId)?.username ??
		"?"
	);
}

function resolveCancelAccepterUsername(match: MatchData) {
	const allMembers = SendouQMatch.allMembers(match);
	return (
		allMembers.find((m) => m.id === match.cancelAcceptedByUserId)?.username ??
		"?"
	);
}

function mapRosterMembers(members: MatchData["groupAlpha"]["members"]) {
	return members.map((member) => ({
		...member,
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
