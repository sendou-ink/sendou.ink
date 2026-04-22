import clsx from "clsx";
import { differenceInSeconds } from "date-fns";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import {
	SendouChipRadio,
	SendouChipRadioGroup,
} from "~/components/elements/ChipRadio";
import { ModeImage, StageImage } from "~/components/Image";
import { useTimeFormat } from "~/hooks/useTimeFormat";
import { shortStageName } from "~/modules/in-game-lists/stage-ids";
import type { RankedModeShort, StageId } from "~/modules/in-game-lists/types";
import {
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
} from "~/utils/dates";
import { SPLATOON_3_INK } from "~/utils/urls";
import type { FrontPageLoaderData, loader } from "../loaders/index.server";
import styles from "./SplatoonRotations.module.css";

const ROTATION_MODE_FILTERS = ["ALL", "SZ", "TC", "RM", "CB"] as const;
type RotationModeFilter = (typeof ROTATION_MODE_FILTERS)[number];

const ROTATION_TYPE_LABELS: Record<string, string> = {
	SERIES: "rotations.series",
	OPEN: "rotations.open",
	X: "rotations.x",
};

type RotationFromLoader = FrontPageLoaderData["rotations"][number];

const TYPE_ORDER = ["X", "SERIES", "OPEN"];

export function SplatoonRotations() {
	const { t } = useTranslation(["front"]);
	const data = useLoaderData<typeof loader>();
	const [activeFilter, setActiveFilter] =
		React.useState<RotationModeFilter>("ALL");

	const nowUnixLive = useNowUnix(data.now);

	const allInThePast = data.rotations.every(
		(rotation) => rotation.endTime <= nowUnixLive,
	);
	if (allInThePast) return null;

	if (allInThePast || data.rotations.length === 0) return null;

	const rotationsByType = new Map<
		string,
		{
			current: RotationFromLoader | undefined;
			next: RotationFromLoader | undefined;
			nextAfter: RotationFromLoader | undefined;
		}
	>();

	for (const rotation of data.rotations) {
		if (activeFilter !== "ALL" && rotation.mode !== activeFilter) continue;

		const isCurrent =
			rotation.startTime <= nowUnixLive && rotation.endTime > nowUnixLive;
		const isNext = rotation.startTime > nowUnixLive;

		if (!isCurrent && !isNext) continue;

		const existing = rotationsByType.get(rotation.type) ?? {
			current: undefined,
			next: undefined,
			nextAfter: undefined,
		};

		if (isCurrent && !existing.current) {
			existing.current = rotation;
		}
		if (isNext && !existing.next) {
			existing.next = rotation;
		} else if (isNext && existing.next && !existing.nextAfter) {
			existing.nextAfter = rotation;
		}

		rotationsByType.set(rotation.type, existing);
	}

	const sortedEntries = Array.from(rotationsByType.entries()).sort(
		(a, b) => TYPE_ORDER.indexOf(a[0]) - TYPE_ORDER.indexOf(b[0]),
	);

	return (
		<div className={styles.rotationsContainer}>
			<div className={clsx(styles.rotationsScroll, "scrollbar")}>
				{sortedEntries.map(([type, { current, next, nextAfter }]) =>
					current || next ? (
						<RotationCard
							key={type}
							type={type}
							current={current}
							next={next}
							nextAfter={nextAfter}
							now={databaseTimestampToDate(nowUnixLive)}
						/>
					) : null,
				)}
			</div>
			<div className={styles.rotationsFooter}>
				<SendouChipRadioGroup>
					{ROTATION_MODE_FILTERS.map((filter) => (
						<SendouChipRadio
							key={filter}
							name="rotation-mode-filter"
							value={filter}
							checked={activeFilter === filter}
							onChange={(val) => setActiveFilter(val as RotationModeFilter)}
						>
							{filter === "ALL" ? t("front:rotations.filter.all") : filter}
						</SendouChipRadio>
					))}
				</SendouChipRadioGroup>
				<span className={styles.rotationsCredit}>
					<a href={SPLATOON_3_INK} target="_blank" rel="noopener noreferrer">
						{t("front:rotations.credit")}
					</a>
				</span>
			</div>
		</div>
	);
}

function useNowUnix(initialNow: number) {
	const [now, setNow] = React.useState(initialNow);

	React.useEffect(() => {
		setNow(dateToDatabaseTimestamp(new Date()));
		const interval = setInterval(() => {
			setNow(dateToDatabaseTimestamp(new Date()));
		}, 60_000);
		return () => clearInterval(interval);
	}, []);

	return now;
}

function timeRemaining(now: Date, start: Date, end: Date) {
	const remainingSeconds = differenceInSeconds(end, now);
	if (remainingSeconds <= 0) return null;

	const totalSeconds = differenceInSeconds(end, start);
	const elapsedSeconds = differenceInSeconds(now, start);
	const progress =
		totalSeconds > 0
			? Math.min(1, Math.max(0, elapsedSeconds / totalSeconds))
			: 0;

	const hours = Math.floor(remainingSeconds / 3600);
	const minutes = Math.floor((remainingSeconds % 3600) / 60);
	return { hours, minutes, progress };
}

function timeUntil(now: Date, start: Date) {
	const diffSeconds = differenceInSeconds(start, now);
	if (diffSeconds <= 0) return null;

	const hours = Math.floor(diffSeconds / 3600);
	const minutes = Math.floor((diffSeconds % 3600) / 60);
	return { hours, minutes };
}

function RotationCard({
	type,
	current,
	next,
	nextAfter,
	now,
}: {
	type: string;
	current: RotationFromLoader | undefined;
	next: RotationFromLoader | undefined;
	nextAfter: RotationFromLoader | undefined;
	now: Date;
}) {
	const { t } = useTranslation(["front", "game-misc"]);
	const { formatTime, formatDuration, formatRelativeTime } = useTimeFormat();
	const remaining = timeRemaining(
		now,
		databaseTimestampToDate(current?.startTime ?? 0),
		databaseTimestampToDate(current?.endTime ?? 0),
	);
	const displayRotation = current ?? next;
	const nextStartsIn = timeUntil(
		now,
		databaseTimestampToDate(next?.startTime ?? 0),
	);
	const nextAfterStartsIn = timeUntil(
		now,
		databaseTimestampToDate(nextAfter?.startTime ?? 0),
	);
	const shownNext = current ? next : nextAfter;
	const shownNextStartsIn = current ? nextStartsIn : nextAfterStartsIn;

	if (!displayRotation) return null;

	return (
		<div className={styles.rotationCard}>
			<div className={styles.rotationCardType}>
				<ModeImage mode={displayRotation.mode as RankedModeShort} width={20} />
				{t(`front:${ROTATION_TYPE_LABELS[type]}` as any)}
			</div>
			{current && remaining ? (
				<div className={styles.rotationCardProgress}>
					<div
						className={styles.rotationCardProgressBar}
						style={{ width: `${remaining.progress * 100}%` }}
					/>
					<span className={styles.rotationCardProgressText}>
						{formatDuration(remaining.hours, remaining.minutes)}
					</span>
				</div>
			) : null}
			{!current && next && nextStartsIn ? (
				<div
					className={clsx(
						styles.rotationCardProgress,
						styles.rotationCardProgressStriped,
					)}
				>
					<span className={styles.rotationCardProgressText}>
						<NextLabel
							startTime={databaseTimestampToDate(next.startTime)}
							startsIn={nextStartsIn}
							formatTime={formatTime}
							formatRelativeTime={formatRelativeTime}
						/>
					</span>
				</div>
			) : null}
			<div className={styles.rotationCardStages}>
				<StageImage
					stageId={displayRotation.stageId1 as StageId}
					className={styles.rotationCardStageImage}
					height={64}
				/>
				<StageImage
					stageId={displayRotation.stageId2 as StageId}
					className={styles.rotationCardStageImage}
					height={64}
				/>
			</div>
			<div className={styles.rotationCardNext}>
				{shownNext ? (
					<div className={styles.rotationCardNextInfo}>
						{current && shownNext.startTime === current.endTime ? (
							t("front:rotations.nextLabel")
						) : shownNextStartsIn ? (
							<NextLabel
								startTime={databaseTimestampToDate(shownNext.startTime)}
								startsIn={shownNextStartsIn}
								formatTime={formatTime}
								formatRelativeTime={formatRelativeTime}
								compact
							/>
						) : null}
						<ModeImage mode={shownNext.mode as RankedModeShort} width={16} />{" "}
						{shortStageName(t(`game-misc:STAGE_${shownNext.stageId1}` as any))},{" "}
						{shortStageName(t(`game-misc:STAGE_${shownNext.stageId2}` as any))}
					</div>
				) : null}
			</div>
		</div>
	);
}

function NextLabel({
	startTime,
	startsIn,
	formatTime,
	formatRelativeTime,
	compact,
}: {
	startTime: Date;
	startsIn: { hours: number; minutes: number };
	formatTime: (date: Date) => string;
	formatRelativeTime: (hours: number, minutes: number) => string;
	compact?: boolean;
}) {
	const { t } = useTranslation(["front"]);

	const withinTwoHours = startsIn.hours * 60 + startsIn.minutes <= 120;

	if (compact) {
		if (withinTwoHours) {
			return formatRelativeTime(startsIn.hours, startsIn.minutes);
		}
		return formatTime(startTime);
	}

	if (withinTwoHours) {
		return `${t("front:rotations.nextLabel")} (${formatRelativeTime(startsIn.hours, startsIn.minutes)})`;
	}

	return `${t("front:rotations.nextLabel")} (${formatTime(startTime)})`;
}
