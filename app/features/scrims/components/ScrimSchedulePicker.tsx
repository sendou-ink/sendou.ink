import clsx from "clsx";
import * as React from "react";
import { useTranslation } from "react-i18next";
import * as R from "remeda";
import {
	SendouChipRadio,
	SendouChipRadioGroup,
} from "~/components/elements/ChipRadio";
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
import * as Availability from "~/features/availability/core/Availability";
import type { RosterScheduleData } from "~/features/availability/core/RosterSchedule.server";
import { getMemberRoleType } from "~/features/team/team-utils";
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
 * The roster's merged free time as a week of day tracks, one click on which
 * fills in the post's start and start-time flexibility. Which roster is merged
 * follows the "With" field, so this only appears once a team or a full pick-up
 * has been picked.
 *
 * Only ever a prefill: the start inputs stay authoritative, and a start the
 * schedules do not cover is warned about, never blocked.
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
	const freeNames = (userIds: Array<number>) =>
		userIds
			.flatMap((userId) => {
				const username = nameById.get(userId);

				return username ? [username] : [];
			})
			.join(", ");
	const unknownUserIds = roster.filter(
		(userId) =>
			!memberById.get(userId)?.reportedWeekStarts.includes(week.startsAt),
	);
	const unknownNamed = unknownUserIds.flatMap((userId) => {
		const username = nameById.get(userId);

		return username ? [username] : [];
	});
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
							members={freeNames(slot.userIds)}
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
				<SendouChipRadioGroup>
					<SendouChipRadio
						name="scrim-schedule-week"
						value="current"
						checked={weekIndex === 0}
						onChange={() => setWeekIndex(0)}
					>
						{t("schedule:team.currentWeek")}
					</SendouChipRadio>
					<SendouChipRadio
						name="scrim-schedule-week"
						value="next"
						checked={weekIndex === 1}
						onChange={() => setWeekIndex(1)}
					>
						{t("schedule:team.nextWeek")}
					</SendouChipRadio>
				</SendouChipRadioGroup>
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
							<div key={day.startsAt} className={styles.listDay}>
								<div className={styles.listDayHeader}>
									{dayFormatter.format(day.noonAt)}
								</div>
								{daySlots.length === 0 ? (
									<span className="text-lighter text-xs">—</span>
								) : (
									<div className={styles.listDayBody}>
										{daySlots.map((slot) => (
											<button
												key={slot.startsAt}
												type="button"
												className={clsx(styles.slotChip, {
													[styles.oneShort]: slot.tier === "ONE_SHORT",
													[styles.picked]: slot.pick.startsAt === pickedAt,
												})}
												title={freeNames(slot.userIds)}
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
	const visibleStart = Math.max(slot.range.start, clockWindow.trackStart);
	const visibleEnd = Math.min(slot.range.end, clockWindow.trackEnd);
	if (visibleEnd <= visibleStart) return null;

	const withinBar = (minutes: number) =>
		((Math.min(Math.max(minutes, visibleStart), visibleEnd) - visibleStart) /
			(visibleEnd - visibleStart)) *
		100;
	return (
		<button
			type="button"
			className={clsx(styles.slotBar, {
				[styles.oneShort]: slot.tier === "ONE_SHORT",
				[styles.picked]: isPicked,
			})}
			style={clockWindow.barStyle({ start: visibleStart, end: visibleEnd })}
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

	const players = team.members.filter(
		(member) => getMemberRoleType(member) !== "OTHER",
	);
	const members =
		players.length >= SCRIM.MIN_MEMBERS_PER_TEAM ? players : team.members;

	return R.unique([viewerId, ...members.map((member) => member.id)]);
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
