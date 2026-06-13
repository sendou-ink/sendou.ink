import { differenceInMinutes } from "date-fns";
import { Ban, Vote } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import {
	IconBanner,
	MatchBanner,
	MatchBannerContainer,
	MultiMatchBanner,
} from "~/components/match-page/MatchBanner";
import bannerStyles from "~/components/match-page/MatchBanner.module.css";
import { MatchBannerBottomRow } from "~/components/match-page/MatchBannerBottomRow";
import { MatchBannerStartedAt } from "~/components/match-page/MatchBannerStartedAt";
import { MatchBannerTimer } from "~/components/match-page/MatchBannerTimer";
import { MatchBannerTopRow } from "~/components/match-page/MatchBannerTopRow";
import { useUser } from "~/features/auth/core/user";
import { resolveActiveRoomLink } from "~/features/chat/room-link-utils";
import { SENDOUQ_BEST_OF } from "~/features/sendouq/q-constants";
import { useAutoRerender } from "~/hooks/useAutoRerender";
import { databaseTimestampToDate } from "~/utils/dates";
import invariant from "~/utils/invariant";
import { resolveGroupNames } from "../core/match-timeline";
import * as SendouQMatch from "../core/SendouQMatch";
import type { SendouQMatchLoaderData } from "../loaders/q.match.$id.server";

export function SendouQMatchBanner({ data }: { data: SendouQMatchLoaderData }) {
	const { t } = useTranslation(["q"]);
	const user = useUser();

	const cancelRequested = Boolean(data.match.cancelRequestedByUserId);
	const cancelRequesterSide = SendouQMatch.resolveGroupMemberOf({
		groupAlpha: data.match.groupAlpha,
		groupBravo: data.match.groupBravo,
		userId: data.match.cancelRequestedByUserId,
	});
	const groupNames = resolveGroupNames(data.match, t);
	const cancelRequesterName = cancelRequested
		? cancelRequesterSide === "ALPHA"
			? groupNames.alpha
			: groupNames.bravo
		: undefined;

	const bottomRow = (
		<MatchBannerBottomRow
			games={data.match.mapList.map((map) => ({
				mode: map.mode,
			}))}
			activeRosters={{
				alpha: data.match.groupAlpha.members,
				bravo: data.match.groupBravo.members,
			}}
		/>
	);

	const awaitingConfirmation =
		!data.match.isLocked && SendouQMatch.score(data.match).isDecisive;

	if (data.match.isLocked || awaitingConfirmation) {
		const playedStageIds = data.match.mapList
			.filter((m) => m.winnerGroupId !== null)
			.map((m) => m.stageId);

		return (
			<MatchBannerContainer>
				<SendouQMatchBannerTopRow
					data={data}
					awaitingConfirmation={awaitingConfirmation}
				/>
				{data.match.isCanceled ? (
					<IconBanner icon={<Ban size={32} />} header={t("q:match.canceled")} />
				) : (
					<MultiMatchBanner stageIds={playedStageIds} />
				)}
				{bottomRow}
			</MatchBannerContainer>
		);
	}

	const currentMap = data.match.currentMap;
	invariant(currentMap);

	const isParticipant = Boolean(
		SendouQMatch.resolveGroupMemberOf({
			groupAlpha: data.match.groupAlpha,
			groupBravo: data.match.groupBravo,
			userId: user?.id,
		}),
	);

	const joinPool = isParticipant ? `SQ${String(data.match.id).at(-1)}` : null;
	const activeRoomLink = resolveActiveRoomLink({
		roomLinks: data.roomLinks,
		freshnessCutoff: data.match.createdAt,
		viewerUserId: user?.id,
		members: [
			...data.match.groupAlpha.members,
			...data.match.groupBravo.members,
		],
	});
	const joinViaQr = Boolean(activeRoomLink.joinLink) && !activeRoomLink.isStale;

	return (
		<MatchBannerContainer>
			<SendouQMatchBannerTopRow data={data} awaitingConfirmation={false} />
			{cancelRequesterName ? (
				<IconBanner
					icon={<Ban size={32} />}
					header={t("q:match.cancelRequested")}
					subtitle={t("q:match.cancelRequested.subtitle", {
						teamName: cancelRequesterName,
					})}
					joinPool={joinPool}
					joinViaQr={joinViaQr}
				/>
			) : (
				<MatchBanner
					stageId={currentMap.stageId}
					mode={currentMap.mode}
					screenLegal={
						!data.match.groupAlpha.noScreen && !data.match.groupBravo.noScreen
					}
					joinPool={joinPool}
					joinViaQr={joinViaQr}
				>
					<CurrentMapVotesBadge voters={currentMap.voters} />
				</MatchBanner>
			)}
			{bottomRow}
		</MatchBannerContainer>
	);
}

function SendouQMatchBannerTopRow({
	data,
	awaitingConfirmation,
}: {
	data: SendouQMatchLoaderData;
	awaitingConfirmation: boolean;
}) {
	const now = useAutoRerender("ten seconds");

	const { alphaWins, bravoWins } = SendouQMatch.score(data.match);

	const startedAt = databaseTimestampToDate(data.match.createdAt);

	const lastMapReportedAt = data.match.mapList.reduce<number | null>(
		(acc, m) =>
			m.reportedAt && (!acc || m.reportedAt > acc) ? m.reportedAt : acc,
		null,
	);
	const lastReportAt = lastMapReportedAt
		? databaseTimestampToDate(lastMapReportedAt)
		: startedAt;

	return (
		<MatchBannerTopRow
			score={{
				alpha: alphaWins,
				bravo: bravoWins,
				isFinal: Boolean(data.match.isLocked),
				count: SENDOUQ_BEST_OF,
				bestOf: true,
			}}
		>
			{data.match.isLocked || awaitingConfirmation ? (
				<MatchBannerStartedAt time={startedAt} />
			) : (
				<MatchBannerTimer
					time={{
						currentMinutes: Math.max(0, differenceInMinutes(now, lastReportAt)),
						totalMinutes: Math.max(0, differenceInMinutes(now, startedAt)),
					}}
				/>
			)}
		</MatchBannerTopRow>
	);
}

function CurrentMapVotesBadge({
	voters,
}: {
	voters: NonNullable<SendouQMatchLoaderData["match"]["currentMap"]>["voters"];
}) {
	const { t } = useTranslation(["q"]);

	if (voters.length === 0) return null;

	return (
		<SendouPopover
			trigger={
				<SendouButton variant="minimal" className={bannerStyles.infoBadge}>
					{voters.length} <Vote />
				</SendouButton>
			}
		>
			<div className="stack sm">
				<div className="text-sm text-lighter font-semi-bold">
					{t("q:match.mapVoters.header")}
				</div>
				{voters.map((voter) => (
					<div key={voter.id} className="stack sm horizontal items-center xs">
						<Avatar user={voter} size="xxs" />
						{voter.username}
					</div>
				))}
			</div>
		</SendouPopover>
	);
}
