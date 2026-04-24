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
import { MatchBannerTopRow } from "~/components/match-page/MatchBannerTopRow";
import type { ParsedMemento } from "~/db/tables";
import { SENDOUQ_BEST_OF } from "~/features/sendouq/q-constants";
import { useAutoRerender } from "~/hooks/useAutoRerender";
import type { ModeShort, StageId } from "~/modules/in-game-lists/types";
import { databaseTimestampToDate } from "~/utils/dates";
import invariant from "~/utils/invariant";
import { resolveGroupNames } from "../core/match-timeline";
import * as SendouQMatch from "../core/SendouQMatch";
import type { SendouQMatchLoaderData } from "../loaders/q.match.$id.server";

export function SendouQMatchBanner({ data }: { data: SendouQMatchLoaderData }) {
	const { t } = useTranslation(["q"]);

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
				winner:
					map.winnerGroupId === data.match.groupAlpha.id
						? "ALPHA"
						: map.winnerGroupId === data.match.groupBravo.id
							? "BRAVO"
							: undefined,
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
		const isCanceled = data.match.isLocked && cancelRequested;

		const playedStageIds = data.match.mapList
			.filter((m) => m.winnerGroupId !== null)
			.map((m) => m.stageId);

		return (
			<MatchBannerContainer>
				<SendouQMatchBannerTopRow
					data={data}
					awaitingConfirmation={awaitingConfirmation}
				/>
				{isCanceled ? (
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
				/>
			) : (
				<MatchBanner
					stageId={currentMap.stageId}
					mode={currentMap.mode}
					screenLegal={
						!data.match.groupAlpha.noScreen && !data.match.groupBravo.noScreen
					}
				>
					<CurrentMapVotesBadge data={data} currentMap={currentMap} />
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
	useAutoRerender("ten seconds");

	const countScore = (groupId: number) =>
		data.match.mapList.reduce(
			(acc, map) => acc + (map.winnerGroupId === groupId ? 1 : 0),
			0,
		);

	const now = new Date();
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
				alpha: countScore(data.match.groupAlpha.id),
				bravo: countScore(data.match.groupBravo.id),
				isFinal: Boolean(data.match.isLocked),
				count: SENDOUQ_BEST_OF,
				bestOf: true,
			}}
			time={
				data.match.isLocked || awaitingConfirmation
					? undefined
					: {
							currentMinutes: Math.max(
								0,
								differenceInMinutes(now, lastReportAt),
							),
							totalMinutes: Math.max(0, differenceInMinutes(now, startedAt)),
						}
			}
		/>
	);
}

function CurrentMapVotesBadge({
	data,
	currentMap,
}: {
	data: SendouQMatchLoaderData;
	currentMap: { mode: ModeShort; stageId: StageId; source: string };
}) {
	const { t } = useTranslation(["q"]);

	const voterIds = currentMapVoterIds({
		currentMap,
		groupAlpha: data.match.groupAlpha,
		groupBravo: data.match.groupBravo,
		pools: data.match.memento?.pools,
	});

	if (voterIds.length === 0) return null;

	const userIdToUser = (userId: number) =>
		[...data.match.groupAlpha.members, ...data.match.groupBravo.members].find(
			(m) => m.id === userId,
		);

	return (
		<SendouPopover
			trigger={
				<SendouButton variant="minimal" className={bannerStyles.infoBadge}>
					{voterIds.length} <Vote />
				</SendouButton>
			}
		>
			<div className="stack sm">
				<div className="text-sm text-lighter font-semi-bold">
					{t("q:match.mapVoters.header")}
				</div>
				{voterIds.map((userId) => {
					const user = userIdToUser(userId);
					return (
						<div key={userId} className="stack sm horizontal items-center xs">
							<Avatar user={user} size="xxs" />
							{user?.username}
						</div>
					);
				})}
			</div>
		</SendouPopover>
	);
}

// xxx: probably can be made cleaner -> more work in the loader
function currentMapVoterIds({
	currentMap,
	groupAlpha,
	groupBravo,
	pools,
}: {
	currentMap: { mode: ModeShort; stageId: StageId; source: string };
	groupAlpha: { id: number; members: Array<{ id: number }> };
	groupBravo: { id: number; members: Array<{ id: number }> };
	pools: ParsedMemento["pools"] | undefined;
}): number[] {
	if (!pools) return [];

	const pickerGroups = [groupAlpha, groupBravo].filter(
		(g) => currentMap.source === "BOTH" || String(g.id) === currentMap.source,
	);
	if (pickerGroups.length === 0) return [];

	const result: number[] = [];
	for (const pickerGroup of pickerGroups) {
		for (const { userId, pool } of pools) {
			if (!pickerGroup.members.some((m) => m.id === userId)) continue;
			const modePool = pool.find((p) => p.mode === currentMap.mode);
			if (modePool?.stages.includes(currentMap.stageId)) {
				result.push(userId);
			}
		}
	}
	return result;
}
