import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useLoaderData } from "react-router";
import { ModeImage, StageImage } from "~/components/Image";
import { useTimeFormat } from "~/hooks/useTimeFormat";
import type { RankedModeShort, StageId } from "~/modules/in-game-lists/types";
import { databaseTimestampNow } from "~/utils/dates";
import { SPLATOON_3_INK } from "~/utils/urls";
import type { FrontPageLoaderData, loader } from "../loaders/index.server";
import styles from "./SplatoonRotations.module.css";

const ROTATION_MODE_FILTERS = ["ALL", "SZ", "TC", "RM", "CB"] as const;
type RotationModeFilter = (typeof ROTATION_MODE_FILTERS)[number];

// xxx: maybe we can avoid some added translations to front.json by using native web i18n apis instead

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

	const nowUnixLive = useNowUnix();

	const allInThePast = data.rotations.every(
		(rotation) => rotation.endTime <= nowUnixLive,
	);
	if (allInThePast) return null;

	if (allInThePast || data.rotations.length === 0) return null;

	const nowUnix = databaseTimestampNow();

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
			rotation.startTime <= nowUnix && rotation.endTime > nowUnix;
		const isNext = rotation.startTime > nowUnix;

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
			<div className={styles.rotationsScroll}>
				{sortedEntries.map(([type, { current, next, nextAfter }]) =>
					current || next ? (
						<RotationCard
							key={type}
							type={type}
							current={current}
							next={next}
							nextAfter={nextAfter}
							now={nowUnixLive}
						/>
					) : null,
				)}
			</div>
			<div className={styles.rotationsFooter}>
				{/** xxx: can we use some shared component? */}
				<div className={styles.rotationsModeFilter}>
					{ROTATION_MODE_FILTERS.map((filter) => (
						<button
							key={filter}
							type="button"
							className={clsx(
								styles.rotationsModeFilterButton,
								activeFilter === filter
									? styles.rotationsModeFilterButtonActive
									: null,
							)}
							onClick={() => setActiveFilter(filter)}
						>
							{filter === "ALL" ? t("front:rotations.filter.all") : filter}
						</button>
					))}
				</div>
				<span className={styles.rotationsCredit}>
					<a href={SPLATOON_3_INK} target="_blank" rel="noopener noreferrer">
						{t("front:rotations.credit")}
					</a>
				</span>
			</div>
		</div>
	);
}

function useNowUnix() {
	const [now, setNow] = React.useState(() => Math.floor(Date.now() / 1000));

	React.useEffect(() => {
		const interval = setInterval(() => {
			setNow(Math.floor(Date.now() / 1000));
		}, 60_000);
		return () => clearInterval(interval);
	}, []);

	return now;
}

// xxx: can we use date-fns?
function timeRemaining(
	now: number,
	startTimeUnix: number,
	endTimeUnix: number,
) {
	const remaining = endTimeUnix - now;
	if (remaining <= 0) return null;

	const total = endTimeUnix - startTimeUnix;
	const elapsed = now - startTimeUnix;
	const progress = total > 0 ? Math.min(1, Math.max(0, elapsed / total)) : 0;

	const hours = Math.floor(remaining / 3600);
	const minutes = Math.floor((remaining % 3600) / 60);
	return { hours, minutes, progress };
}

// xxx: can we use date-fns?
function timeUntil(now: number, startTimeUnix: number) {
	const diff = startTimeUnix - now;
	if (diff <= 0) return null;

	const hours = Math.floor(diff / 3600);
	const minutes = Math.floor((diff % 3600) / 60);
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
	now: number;
}) {
	const { t } = useTranslation(["front", "game-misc"]);
	const remaining = timeRemaining(
		now,
		current?.startTime ?? 0,
		current?.endTime ?? 0,
	);
	const displayRotation = current ?? next;
	const nextStartsIn = timeUntil(now, next?.startTime ?? 0);
	const nextAfterStartsIn = timeUntil(now, nextAfter?.startTime ?? 0);
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
						{t("front:rotations.remaining", {
							hours: remaining.hours,
							minutes: remaining.minutes,
						})}
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
						<NextLabel startTimeUnix={next.startTime} startsIn={nextStartsIn} />
					</span>
				</div>
			) : null}
			<div className={styles.rotationCardStages}>
				<StageImage
					stageId={displayRotation.stageId1 as StageId}
					className={styles.rotationCardStageImage}
				/>
				<StageImage
					stageId={displayRotation.stageId2 as StageId}
					className={styles.rotationCardStageImage}
				/>
			</div>
			{shownNext ? (
				<div className={styles.rotationCardNext}>
					<div className={styles.rotationCardNextInfo}>
						{current && shownNext.startTime === current.endTime ? (
							t("front:rotations.nextLabel")
						) : shownNextStartsIn ? (
							<NextLabel
								startTimeUnix={shownNext.startTime}
								startsIn={shownNextStartsIn}
								compact
							/>
						) : null}
						<ModeImage mode={shownNext.mode as RankedModeShort} width={16} />{" "}
						{t(`game-misc:STAGE_${shownNext.stageId1}` as any).split(" ")[0]},{" "}
						{t(`game-misc:STAGE_${shownNext.stageId2}` as any).split(" ")[0]}
					</div>
				</div>
			) : null}
		</div>
	);
}

function NextLabel({
	startTimeUnix,
	startsIn,
	compact,
}: {
	startTimeUnix: number;
	startsIn: { hours: number; minutes: number };
	compact?: boolean;
}) {
	const { t } = useTranslation(["front"]);
	const { formatTime } = useTimeFormat();

	const withinTwoHours = startsIn.hours * 60 + startsIn.minutes <= 120;

	if (compact) {
		if (withinTwoHours) {
			return t("front:rotations.in", {
				hours: startsIn.hours,
				minutes: startsIn.minutes,
			});
		}
		return t("front:rotations.at", {
			time: formatTime(new Date(startTimeUnix * 1000)),
		});
	}

	if (withinTwoHours) {
		return t("front:rotations.next", {
			hours: startsIn.hours,
			minutes: startsIn.minutes,
		});
	}

	return t("front:rotations.nextAt", {
		time: formatTime(new Date(startTimeUnix * 1000)),
	});
}
