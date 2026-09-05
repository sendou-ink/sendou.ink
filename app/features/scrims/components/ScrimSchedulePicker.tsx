import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import * as R from "remeda";
import { useUser } from "~/features/auth/core/user";
import type {
	DayTimeRange,
	TimeRange,
} from "~/features/availability/availability-types";
import {
	ClockAxis,
	type ClockWindow,
	TrackTicks,
	useClockWindow,
} from "~/features/availability/components/ScheduleTracks";
import trackStyles from "~/features/availability/components/ScheduleTracks.module.css";
import { WeekToggle } from "~/features/availability/components/WeekToggle";
import * as Availability from "~/features/availability/core/Availability";
import type { RosterScheduleData } from "~/features/availability/core/RosterSchedule.server";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import {
	databaseTimestampToDate,
	dateToDatabaseTimestamp,
} from "~/utils/dates";
import * as Scrim from "../core/Scrim";
import type { ScrimsNewLoaderData } from "../loaders/scrims.new.server";
import { SCRIM } from "../scrims-constants";
import styles from "./ScrimSchedulePicker.module.css";

const MINUTE_IN_SECONDS = 60;

type Week = RosterScheduleData["weeks"][number];
type Day = Week["days"][number];
/** The "With" field as the form holds it while it is being filled in. */
type FromValue =
	| { mode: "TEAM"; teamId: number }
	| { mode: "PICKUP"; users: Array<number | null | undefined> };

interface DaySlot extends Scrim.PickableSlot {
	/** The slot on its day's track, in minutes from that day's midnight. */
	range: DayTimeRange;
	/** The part of it the whole team is free for, on the same track. */
	fullRange: DayTimeRange | null;
}

/**
 * The roster's merged free time as a week of day tracks; a click fills in the post's start and
 * flexibility. Follows the "With" field, so it only appears once a team or full pick-up is picked.
 * Only a prefill: the start inputs stay authoritative, an uncovered start is warned about, never blocked.
 */
export function ScrimSchedulePicker({
	schedule,
	scheduleUsers,
	teams,
	from,
	at,
	onPick,
}: {
	schedule: RosterScheduleData;
	scheduleUsers: ScrimsNewLoaderData["scheduleUsers"];
	teams: ScrimsNewLoaderData["teams"];
	from: FromValue;
	at: Date | undefined;
	onPick: (pick: { at: Date; rangeEnd: string | null }) => void;
}) {
	const user = useUser();

	const roster = rosterUserIds({ from, teams, viewerId: user?.id });
	if (roster.length < SCRIM.MIN_MEMBERS_PER_TEAM) return null;

	return (
		<RosterTimeline
			schedule={schedule}
			names={[
				...teams.flatMap((team) => team.members),
				...scheduleUsers,
				...(user ? [user] : []),
			]}
			roster={roster}
			at={at}
			onPick={onPick}
		/>
	);
}

function RosterTimeline({
	schedule,
	names,
	roster,
	at,
	onPick,
}: {
	schedule: RosterScheduleData;
	/** Everyone whose name the timeline may need, the viewer included. */
	names: Array<{ id: number; username: string }>;
	roster: Array<number>;
	at: Date | undefined;
	onPick: (pick: { at: Date; rangeEnd: string | null }) => void;
}) {
	const { t } = useTranslation(["schedule"]);
	const [weekIndex, setWeekIndex] = React.useState(0);
	const { formatter: dayFormatter } = useDateTimeFormat({
		weekday: "short",
		day: "numeric",
	});
	const { formatter: timeFormatter } = useDateTimeFormat({
		hour: "numeric",
		minute: "2-digit",
	});

	const week = schedule.weeks[weekIndex];
	const memberById = new Map(
		schedule.members.map((member) => [member.userId, member]),
	);
	const minPlayers = Math.min(SCRIM.MIN_MEMBERS_PER_TEAM, roster.length);

	// only what can still be posted for: a start earlier today, let alone
	// earlier this week, is not a start the form would accept
	const pickableWeek = {
		startsAt: Math.max(week.startsAt, schedule.now),
		endsAt: week.endsAt,
	};
	const slots = Scrim.pickableSlots({
		members: roster.map((userId) => ({
			userId,
			ranges: Availability.clip(
				memberById.get(userId)?.ranges ?? [],
				pickableWeek,
			),
		})),
		minPlayers,
	});

	const dayRows = week.days.map((day) => ({
		day,
		slots: slotsOfDay({ slots, day }),
	}));
	const clockWindow = useClockWindow({
		fitTo: dayRows.flatMap((row) => row.slots.map((slot) => slot.range)),
	});

	const nameById = new Map(names.map((member) => [member.id, member.username]));
	const namesOf = (userIds: Array<number>) =>
		userIds.flatMap((userId) => {
			const username = nameById.get(userId);

			return username ? [username] : [];
		});
	const unknownUserIds = roster.filter(
		(userId) =>
			!memberById.get(userId)?.reportedWeekStarts.includes(week.startsAt),
	);
	const unknownNamed = namesOf(unknownUserIds);
	const unknownUnnamed = unknownUserIds.length - unknownNamed.length;

	const pickedAt = at ? dateToDatabaseTimestamp(at) : null;

	const pick = (slot: Scrim.PickableSlot) =>
		onPick({
			at: databaseTimestampToDate(slot.pick.startsAt),
			rangeEnd: slot.pick.rangeEnd,
		});

	const rangeText = (range: TimeRange) =>
		`${timeFormatter.format(range.startsAt)} – ${timeFormatter.format(range.endsAt)}`;

	const dayRow = ({ day, slots: daySlots }: (typeof dayRows)[number]) => {
		return (
			<React.Fragment key={day.startsAt}>
				<div className={trackStyles.dayLabel}>
					{dayFormatter.format(day.noonAt)}
				</div>
				<div className={trackStyles.track}>
					<TrackTicks clockWindow={clockWindow} />
					{daySlots.map((slot) => (
						<SlotBar
							key={slot.startsAt}
							clockWindow={clockWindow}
							slot={slot}
							label={`${rangeText(slot)} · ${t("schedule:picker.free", {
								amount: slot.userIds.length,
							})}`}
							members={namesOf(slot.userIds).join(", ")}
							isPicked={slot.pick.startsAt === pickedAt}
							onPick={() => pick(slot)}
						/>
					))}
				</div>
				{/* keeps the day rows in step with the axis row's "later" expander */}
				<div />
			</React.Fragment>
		);
	};

	return (
		<section className={styles.picker} data-testid="scrim-schedule-picker">
			<div className={styles.header}>
				<h3 className={styles.heading}>{t("schedule:picker.title")}</h3>
				<WeekToggle
					name="scrim-schedule-week"
					value={weekIndex === 0 ? "current" : "next"}
					onChange={(value) => setWeekIndex(value === "next" ? 1 : 0)}
				/>
			</div>
			<div className={trackStyles.container}>
				<div className={trackStyles.tracks}>
					<ClockAxis
						clockWindow={clockWindow}
						dayStartsAt={databaseTimestampToDate(week.days[0].startsAt)}
					/>
					{dayRows.map(dayRow)}
				</div>
				<div className={trackStyles.list}>
					{dayRows.map(({ day, slots: daySlots }) => {
						return (
							<div key={day.startsAt} className={trackStyles.listDay}>
								<div className={trackStyles.listDayHeader}>
									{dayFormatter.format(day.noonAt)}
								</div>
								{daySlots.length === 0 ? (
									<span className="text-lighter text-xs">—</span>
								) : (
									<div className={trackStyles.listDayBody}>
										{daySlots.map((slot) => (
											<button
												key={slot.startsAt}
												type="button"
												className={clsx(trackStyles.timeChip, styles.slotChip, {
													[styles.oneShort]: slot.tier === "ONE_SHORT",
													[styles.picked]: slot.pick.startsAt === pickedAt,
												})}
												title={namesOf(slot.userIds).join(", ")}
												onClick={() => pick(slot)}
											>
												{rangeText(slot)} ·{" "}
												{t("schedule:picker.free", {
													amount: slot.userIds.length,
												})}
											</button>
										))}
									</div>
								)}
							</div>
						);
					})}
				</div>
			</div>
			<Legend minPlayers={minPlayers} />
			{unknownUserIds.length > 0 ? (
				<div className={styles.unknown} data-testid="scrim-schedule-unknown">
					{t("schedule:picker.noSchedule", {
						users: [
							...unknownNamed,
							...(unknownUnnamed > 0
								? [t("schedule:picker.andOthers", { amount: unknownUnnamed })]
								: []),
						].join(", "),
					})}
				</div>
			) : null}
		</section>
	);
}

function SlotBar({
	clockWindow,
	slot,
	label,
	members,
	isPicked,
	onPick,
}: {
	clockWindow: ClockWindow;
	slot: DaySlot;
	label: string;
	/** Who is free for the whole slot, named on hover. */
	members: string;
	isPicked: boolean;
	onPick: () => void;
}) {
	const barStart = clockWindow.pct(slot.range.start);
	const barEnd = clockWindow.pct(slot.range.end);
	if (barEnd <= barStart) return null;

	const withinBar = (minutes: number) =>
		((clockWindow.pct(minutes) - barStart) / (barEnd - barStart)) * 100;
	return (
		<button
			type="button"
			className={clsx(styles.slotBar, {
				[styles.oneShort]: slot.tier === "ONE_SHORT",
				[styles.picked]: isPicked,
			})}
			style={clockWindow.barStyle(slot.range)}
			title={members ? `${label} · ${members}` : label}
			aria-label={label}
			data-testid="scrim-schedule-slot"
			data-tier={slot.tier}
			data-picked={isPicked || undefined}
			onClick={onPick}
		>
			{slot.fullRange ? (
				<span
					className={styles.slotFull}
					style={{
						left: `${withinBar(slot.fullRange.start)}%`,
						right: `${100 - withinBar(slot.fullRange.end)}%`,
					}}
				/>
			) : null}
			<span className={styles.slotLabel}>{label}</span>
		</button>
	);
}

function Legend({ minPlayers }: { minPlayers: number }) {
	const { t } = useTranslation(["schedule"]);

	return (
		<div className={styles.legend}>
			<span className={styles.legendItem}>
				<span className={styles.slotSwatch} />
				{t("schedule:picker.legend.full", { players: minPlayers })}
			</span>
			{minPlayers > 1 ? (
				<span className={styles.legendItem}>
					<span className={clsx(styles.slotSwatch, styles.oneShort)} />
					{t("schedule:picker.legend.oneShort", { players: minPlayers - 1 })}
				</span>
			) : null}
		</div>
	);
}

function rosterUserIds({
	from,
	teams,
	viewerId,
}: {
	from: FromValue;
	teams: ScrimsNewLoaderData["teams"];
	viewerId?: number;
}): Array<number> {
	if (!viewerId) return [];

	if (from.mode === "PICKUP") {
		return R.unique([
			viewerId,
			...from.users.filter((userId) => typeof userId === "number"),
		]);
	}

	const team = teams.find((team) => team.id === from.teamId);
	if (!team) return [];

	return R.unique([
		viewerId,
		...Scrim.teamPlayers(team.members).map((member) => member.id),
	]);
}

function slotsOfDay({
	slots,
	day,
}: {
	slots: Array<Scrim.PickableSlot>;
	day: Day;
}): Array<DaySlot> {
	return slots
		.filter((slot) => withinDay(slot.startsAt, day))
		.map((slot) => ({
			...slot,
			range: dayRange(slot, day),
			fullRange: slot.fullSpan ? dayRange(slot.fullSpan, day) : null,
		}));
}

const withinDay = (timestamp: number, day: Day) =>
	timestamp >= day.startsAt && timestamp < day.endsAt;

const dayRange = (range: TimeRange, day: Day) => ({
	start: (range.startsAt - day.startsAt) / MINUTE_IN_SECONDS,
	end: (range.endsAt - day.startsAt) / MINUTE_IN_SECONDS,
});
