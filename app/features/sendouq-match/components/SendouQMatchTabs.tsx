import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router";
import { MatchResultTab } from "~/components/match-page/MatchResultTab";
import { MatchRosterTab } from "~/components/match-page/MatchRosterTab";
import { MatchTabs } from "~/components/match-page/MatchTabs";
import { useUser } from "~/features/auth/core/user";
import { ACTION_TAB_AFTER_LOCKED_SECONDS } from "~/features/sendouq/q-constants";
import { useHasRole } from "~/modules/permissions/hooks";
import { databaseTimestampNow } from "~/utils/dates";
import { safeNumberParse } from "~/utils/number";
import { sendouQMatchPage, teamPage } from "~/utils/urls";
import {
	resolveTimelineMaps,
	resolveTimelineSpChanges,
	resolveTimelineTeams,
} from "../core/match-timeline";
import * as SendouQMatch from "../core/SendouQMatch";
import type { SendouQMatchLoaderData } from "../loaders/q.match.$id.server";
import { AddPrivateNoteDialog } from "./AddPrivateNoteDialog";
import { SendouQMatchActionTab } from "./SendouQMatchActionTab";

export function SendouQMatchTabs({ data }: { data: SendouQMatchLoaderData }) {
	const user = useUser();
	const isStaff = useHasRole("STAFF");
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();
	const { t } = useTranslation(["q"]);

	const currentMap = data.match.currentMap;

	const userSide = SendouQMatch.resolveGroupMemberOf({
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
	const isCanceled = data.match.isCanceled;

	const isParticipant = Boolean(userSide);

	const lockedActionTabVisible =
		data.match.confirmedAt !== null &&
		databaseTimestampNow() <
			data.match.confirmedAt + ACTION_TAB_AFTER_LOCKED_SECONDS;

	const matchInProgress = !isLocked && !awaitingConfirmation && currentMap;

	const showActionTab =
		(isParticipant ||
			(isStaffOnly && (Boolean(matchInProgress) || awaitingConfirmation))) &&
		!isCanceled &&
		(matchInProgress ||
			awaitingConfirmation ||
			(isLocked && lockedActionTabVisible));

	const hasReportedMaps = data.match.mapList.some(
		(m) => m.winnerGroupId !== null,
	);

	const decidingReportedByUserId = [...data.match.mapList]
		.reverse()
		.find((m) => m.winnerGroupId !== null)?.reportedByUserId;
	const reporterSide = SendouQMatch.resolveGroupMemberOf({
		groupAlpha: data.match.groupAlpha,
		groupBravo: data.match.groupBravo,
		userId: decidingReportedByUserId,
	});
	const viewerMustConfirmScore =
		awaitingConfirmation &&
		isParticipant &&
		reporterSide !== null &&
		reporterSide !== userSide;

	const tabs: Array<"rosters" | "action" | "result"> = ["rosters"];
	if (showActionTab) tabs.push("action");
	if (isLocked || hasReportedMaps) tabs.push("result");

	const alertTabs: Array<"action"> | undefined = viewerMustConfirmScore
		? ["action"]
		: undefined;

	const ownGroup =
		userSide === "ALPHA"
			? data.match.groupAlpha
			: userSide === "BRAVO"
				? data.match.groupBravo
				: null;
	const addingNoteFor = ownGroup?.members.find(
		(m) => m.id === safeNumberParse(searchParams.get("note")),
	);

	return (
		<>
			<AddPrivateNoteDialog
				aboutUser={addingNoteFor}
				close={() => navigate(sendouQMatchPage(data.match.id))}
			/>
			<MatchTabs tabs={tabs} alertTabs={alertTabs}>
				{isLocked || hasReportedMaps ? (
					<MatchResultTab
						teams={resolveTimelineTeams(data.match, t)}
						score={{ alpha: alphaWins, bravo: bravoWins }}
						maps={resolveTimelineMaps(data.match, data.reportedWeapons)}
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
							members: mapRosterMembers(data.match.groupAlpha.members, {
								viewerId: user?.id,
								isOwnTeam: userSide === "ALPHA",
							}),
							tier: data.match.groupAlpha.tier ?? undefined,
						},
						{
							team: mapRosterTeam(data.match.groupBravo.team),
							defaultName: t("q:match.groupBravo"),
							members: mapRosterMembers(data.match.groupBravo.members, {
								viewerId: user?.id,
								isOwnTeam: userSide === "BRAVO",
							}),
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
		</>
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

function mapRosterMembers(
	members: MatchData["groupAlpha"]["members"],
	{ viewerId, isOwnTeam }: { viewerId?: number; isOwnTeam: boolean },
) {
	return members.map((member) => ({
		...member,
		tier:
			member.skill === "CALCULATING"
				? ("CALCULATING" as const)
				: member.skill?.tier,
		plusTier: member.plusTier ?? undefined,
		weaponPool: member.weapons?.map((w) => w.weaponSplId),
		friendCode: member.friendCode,
		privateNote:
			viewerId !== undefined && isOwnTeam && member.id !== viewerId
				? (member.privateNote ?? null)
				: undefined,
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
