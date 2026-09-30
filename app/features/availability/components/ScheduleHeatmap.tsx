import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import * as R from "remeda";
import { Avatar } from "~/components/Avatar";
import type { TeamLoaderData } from "~/features/team/loaders/t.$customUrl.server";
import { getMemberRoleType } from "~/features/team/team-utils";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import { databaseTimestampToDate } from "~/utils/dates";
import { AVAILABILITY } from "../availability-constants";
import type { DayTimeRange, TimeRange } from "../availability-types";
import * as Availability from "../core/Availability";
import type { TeamScheduleLoaderData } from "../loaders/t.$customUrl.schedule.server";
import { PlayableWindowsSummary, TierDot } from "./PlayableWindowsSummary";
import { useRangeText } from "./ScheduleDayCell";
import styles from "./ScheduleHeatmap.module.css";
import { ClockAxis, useClockWindow } from "./ScheduleTracks";
import trackStyles from "./ScheduleTracks.module.css";

const MINUTE_IN_SECONDS = 60;
/** Counts past this all read as the strongest shade. */
const MAX_SHADE_COUNT = 5;
/** One block per hour: a member counts in it when free for the whole hour. */
const CELL_MINUTES = 60;

type WeekData = NonNullable<TeamScheduleLoaderData["weeks"]>[number];
type TeamMember = TeamLoaderData["team"]["members"][number];
type MemberRow = WeekData["members"][number] & { member: TeamMember };

/**
 * The week as day tracks shaded by how many of the counted members are free at once. Chips
 * pick who counts, so pairing off for a duo or pulling a sub in is the same view with fewer
 * or different members; the playable windows below follow the pick.
 */
export function ScheduleHeatmap({
	week,
	members,
}: {
	week: WeekData;
	members: Array<TeamMember>;
}) {
	const { t } = useTranslation(["schedule"]);
	const rangeText = useRangeText();
	const { formatter: dayFormatter } = useDateTimeFormat({
		weekday: "short",
		day: "numeric",
	});

	const rows: Array<MemberRow> = week.members.flatMap((row) => {
		const member = members.find((candidate) => candidate.id === row.userId);

		return member ? [{ ...row, member }] : [];
	});
	const orderedRows = [
		...rows.filter(({ member }) => getMemberRoleType(member) !== "OTHER"),
		...rows.filter(({ member }) => getMemberRoleType(member) === "OTHER"),
	];

	const [selectedIds, setSelectedIds] = React.useState<Array<number>>(() =>
		rows
			.filter(({ member }) => getMemberRoleType(member) !== "OTHER")
			.map((row) => row.userId),
	);
	const selectedRows = orderedRows.filter((row) =>
		selectedIds.includes(row.userId),
	);
	const [hoveredCell, setHoveredCell] = React.useState<HoveredCell | null>(
		null,
	);
	const minPlayers = Math.min(
		AVAILABILITY.DEFAULT_MIN_PLAYERS,
		selectedRows.length,
	);

	const toDayRange = (
		range: TimeRange,
		day: WeekData["days"][number],
	): DayTimeRange => ({
		start: (range.startsAt - day.startsAt) / MINUTE_IN_SECONDS,
		end: (range.endsAt - day.startsAt) / MINUTE_IN_SECONDS,
	});

	const clockWindow = useClockWindow({
		fitTo: rows.flatMap((row) =>
			row.days.flatMap((day, dayIndex) =>
				day.ranges.map((range) => toDayRange(range, week.days[dayIndex])),
			),
		),
	});

	const cellStarts = R.range(
		0,
		(clockWindow.trackEnd - clockWindow.trackStart) / CELL_MINUTES,
	).map((index) => clockWindow.trackStart + index * CELL_MINUTES);

	const dayViews = week.days.map((day, dayIndex) => ({
		day,
		dayIndex,
		cells: cellStarts.map((startMinutes) => {
			const startsAt = day.startsAt + startMinutes * MINUTE_IN_SECONDS;
			const endsAt = startsAt + CELL_MINUTES * MINUTE_IN_SECONDS;

			return {
				startsAt,
				endsAt,
				userIds: selectedRows
					.filter((row) =>
						row.days[dayIndex].ranges.some(
							(range) => range.startsAt <= startsAt && range.endsAt >= endsAt,
						),
					)
					.map((row) => row.userId),
			};
		}),
		segments: Availability.availabilitySegments(
			selectedRows.map((row) => ({
				userId: row.userId,
				ranges: row.days[dayIndex].ranges,
			})),
		).filter((segment) => segment.userIds.length > 0),
	}));

	const windows = Availability.playableWindows({
		members: selectedRows.map((row) => ({
			userId: row.userId,
			ranges: row.days.flatMap((day) => day.ranges),
		})),
		minPlayers,
	});
	const dayTier = (dayIndex: number) => {
		const tiers = windows
			.filter((window) => dayIndexOf(window.startsAt, week.days) === dayIndex)
			.map((window) => window.tier);

		if (tiers.includes("FULL")) return "FULL";
		if (tiers.includes("ONE_SHORT")) return "ONE_SHORT";
		return null;
	};

	const segmentTitle = (
		segment: (typeof dayViews)[number]["segments"][number],
	) =>
		`${rangeText(segment)} · ${t("schedule:picker.free", {
			amount: segment.userIds.length,
		})} · ${segment.userIds
			.flatMap((userId) => {
				const username = rows.find((row) => row.userId === userId)?.member
					.username;

				return username ? [username] : [];
			})
			.join(", ")}`;

	const shadeClass = (count: number) =>
		styles[`count${Math.min(count, MAX_SHADE_COUNT)}`];

	const unreportedNames = selectedRows
		.filter((row) => !row.reported)
		.map((row) => row.member.username);

	// the list variant skips the test id so the hidden copy of a day never doubles it
	const dayLabel = (dayIndex: number, { withTestId = false } = {}) => {
		const tier = dayTier(dayIndex);

		return (
			<div className={trackStyles.dayLabel}>
				<span className={styles.dotSlot}>
					{tier ? (
						<TierDot
							full={tier === "FULL"}
							testId={withTestId ? `schedule-day-dot-${dayIndex}` : undefined}
						/>
					) : null}
				</span>
				{dayFormatter.format(week.days[dayIndex].noonAt)}
			</div>
		);
	};

	return (
		<div
			className={clsx("stack md", styles.heatmap)}
			data-testid="schedule-heatmap"
		>
			<div className={styles.chips}>
				{orderedRows.map((row) => (
					<MemberChip
						key={row.userId}
						row={row}
						selected={selectedIds.includes(row.userId)}
						onToggle={() =>
							setSelectedIds((ids) =>
								ids.includes(row.userId)
									? ids.filter((id) => id !== row.userId)
									: [...ids, row.userId],
							)
						}
					/>
				))}
			</div>
			<div className={trackStyles.container}>
				<div className={trackStyles.tracks}>
					<ClockAxis
						clockWindow={clockWindow}
						dayStartsAt={databaseTimestampToDate(week.days[0].startsAt)}
					/>
					{dayViews.map(({ day, dayIndex, cells }) => (
						<React.Fragment key={day.date}>
							{dayLabel(dayIndex, { withTestId: true })}
							{/** biome-ignore lint/a11y/noStaticElementInteractions: hover-only detail, the list view and summary carry the same info */}
							<div
								className={styles.cellRow}
								style={{ "--cells": cells.length } as React.CSSProperties}
								onMouseLeave={() => setHoveredCell(null)}
							>
								{cells.map((cell) => (
									// biome-ignore lint/a11y/noStaticElementInteractions: hover-only detail, the list view and summary carry the same info
									<div
										key={cell.startsAt}
										className={clsx(
											styles.cell,
											cell.userIds.length > 0
												? shadeClass(cell.userIds.length)
												: undefined,
										)}
										onMouseEnter={(event) =>
											setHoveredCell({
												cell,
												anchor: tooltipAnchor(event.currentTarget),
											})
										}
										data-testid="schedule-heatmap-cell"
										data-count={cell.userIds.length}
									/>
								))}
							</div>
							{/* keeps the day rows in step with the axis row's "later" expander */}
							<div />
						</React.Fragment>
					))}
				</div>
				<div className={trackStyles.list}>
					{dayViews.map(({ day, dayIndex, segments }) => (
						<div key={day.date} className={trackStyles.listDay}>
							<div className={trackStyles.listDayHeader}>
								{dayLabel(dayIndex)}
							</div>
							{segments.length === 0 ? (
								<span className="text-lighter text-xs">—</span>
							) : (
								<div className={trackStyles.listDayBody}>
									{segments.map((segment) => (
										<span
											key={segment.startsAt}
											className={styles.listChip}
											title={segmentTitle(segment)}
										>
											<span
												className={clsx(
													styles.legendSwatch,
													shadeClass(segment.userIds.length),
												)}
											/>
											{rangeText(segment)} ·{" "}
											{t("schedule:picker.free", {
												amount: segment.userIds.length,
											})}
										</span>
									))}
								</div>
							)}
						</div>
					))}
				</div>
			</div>
			{hoveredCell ? (
				<div
					className={clsx(styles.tooltip, {
						[styles.tooltipBelow]: hoveredCell.anchor.below,
					})}
					style={{ left: hoveredCell.anchor.x, top: hoveredCell.anchor.y }}
					data-testid="schedule-heatmap-tooltip"
				>
					<div className={styles.tooltipTime}>
						{rangeText(hoveredCell.cell)}
					</div>
					<div className={styles.tooltipCount}>
						{t("schedule:scrims.availableOfRoster", {
							amount: hoveredCell.cell.userIds.length,
							total: selectedRows.length,
						})}
					</div>
					<ul className={styles.tooltipMembers}>
						{selectedRows.map((row) => (
							<li
								key={row.userId}
								className={clsx(styles.tooltipMember, {
									[styles.tooltipMemberOff]: !hoveredCell.cell.userIds.includes(
										row.userId,
									),
								})}
							>
								<span
									className={clsx(styles.tooltipDot, {
										[styles.tooltipDotUnknown]: !row.reported,
									})}
								/>
								{row.member.username}
								{!row.reported ? ` · ${t("schedule:team.noSchedule")}` : null}
							</li>
						))}
					</ul>
				</div>
			) : null}
			{selectedRows.length > 0 ? (
				<div className={styles.legend}>
					{R.range(1, Math.min(selectedRows.length, MAX_SHADE_COUNT) + 1).map(
						(count) => (
							<span key={count} className={styles.legendItem}>
								<span
									className={clsx(styles.legendSwatch, shadeClass(count))}
								/>
								{count === MAX_SHADE_COUNT &&
								selectedRows.length > MAX_SHADE_COUNT
									? `${count}+`
									: count}
							</span>
						),
					)}
					<span>{t("schedule:team.legendFreeAtOnce")}</span>
				</div>
			) : null}
			{unreportedNames.length > 0 ? (
				<div
					className={styles.unreported}
					data-testid="schedule-heatmap-unreported"
				>
					{t("schedule:picker.noSchedule", {
						users: unreportedNames.join(", "),
					})}
				</div>
			) : null}
			<PlayableWindowsSummary windows={windows} minPlayers={minPlayers} />
		</div>
	);
}

function MemberChip({
	row,
	selected,
	onToggle,
}: {
	row: MemberRow;
	selected: boolean;
	onToggle: () => void;
}) {
	const { t } = useTranslation(["schedule"]);

	return (
		<button
			type="button"
			className={styles.chip}
			aria-pressed={selected}
			onClick={onToggle}
			data-testid={`heatmap-member-${row.userId}`}
		>
			<Avatar user={row.member} size="xxxs" />
			{row.member.username}
			{!row.reported ? (
				<span
					className={styles.chipUnknown}
					title={t("schedule:team.noSchedule")}
				>
					?
				</span>
			) : null}
		</button>
	);
}

interface HoveredCell {
	cell: { startsAt: number; endsAt: number; userIds: Array<number> };
	anchor: { x: number; y: number; below: boolean };
}

/** Under this far from the viewport top the tooltip opens below the cell instead of above. */
const TOOLTIP_FLIP_THRESHOLD_PX = 160;
/** Half the tooltip's max width, so a clamped anchor keeps it on screen. */
const TOOLTIP_EDGE_PX = 130;

function tooltipAnchor(element: HTMLElement): HoveredCell["anchor"] {
	const rect = element.getBoundingClientRect();
	const below = rect.top < TOOLTIP_FLIP_THRESHOLD_PX;

	return {
		x: R.clamp(rect.left + rect.width / 2, {
			min: TOOLTIP_EDGE_PX,
			max: window.innerWidth - TOOLTIP_EDGE_PX,
		}),
		y: below ? rect.bottom : rect.top,
		below,
	};
}

/** Index of the day a timestamp falls in, the last day whose midnight is not past it. */
function dayIndexOf(timestamp: number, days: Array<{ startsAt: number }>) {
	return R.findLastIndex(days, (day) => day.startsAt <= timestamp);
}
