import clsx from "clsx";
import {
	CalendarX,
	Check,
	Clock,
	Ellipsis,
	EyeOff,
	Flag,
	X,
} from "lucide-react";
import type * as React from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import { databaseTimestampToDate } from "~/utils/dates";
import type { SerializeFrom } from "~/utils/remix";
import type { TimeRange, WindowAvailabilityEntry } from "../availability-types";
import type { RegistrationAvailability } from "../core/RegistrationAvailability.server";
import styles from "./RegistrationAvailabilityPanel.module.css";

export interface AvailabilityPanelUser {
	id: number;
	username: string;
	discordId: string;
	discordAvatar: string | null;
	customAvatarUrl?: string | null;
}

export type AvailabilityPanelData = SerializeFrom<RegistrationAvailability>;
export type AvailabilityPanelEntry = WindowAvailabilityEntry;

export type AvailabilityRowStatus =
	| AvailabilityPanelEntry["availability"]["status"]
	/** On the roster, but their schedule is not visible to the viewer (neither a teammate nor a friend). */
	| "hidden";

const STATUS_ORDER: Array<AvailabilityRowStatus> = [
	"available",
	"partial",
	"unavailable",
	"busy",
	"unknown",
	"hidden",
];

/**
 * The tournament registration page's availability panel: how each member of
 * the roster relates to the event's estimated window, plus the friends who
 * could sub (the ones actually free during it).
 */
export function RegistrationAvailabilityPanel({
	availability,
	roster,
	subCandidates,
}: {
	availability: AvailabilityPanelData;
	roster: Array<AvailabilityPanelUser>;
	/** Friends not on the shown roster and not in the tournament, panel keeps the free ones. */
	subCandidates: Array<AvailabilityPanelUser>;
}) {
	const { t } = useTranslation(["schedule"]);
	const { formatter: dateFormatter } = useDateTimeFormat({
		month: "long",
		day: "numeric",
	});

	if (availability.beyondHorizon) {
		return (
			<section className={styles.panel}>
				<h4 className={styles.heading}>{t("schedule:registration.title")}</h4>
				<div className={styles.mutedText}>
					{t("schedule:registration.beyondHorizon", {
						date: dateFormatter.format(availability.beyondHorizon.opensAt),
					})}
				</div>
			</section>
		);
	}

	const entryByUserId = new Map(
		availability.entries.map((entry) => [entry.userId, entry]),
	);

	const freeSubs = subCandidates.filter((user) => {
		const status = entryByUserId.get(user.id)?.availability.status;
		return status === "available" || status === "partial";
	});

	if (roster.length === 0 && freeSubs.length === 0) return null;

	return (
		<section className={styles.panel}>
			<h4 className={styles.heading}>
				{t("schedule:registration.title")} ·{" "}
				<AvailabilityWindowText window={availability.window} />
			</h4>
			{roster.length > 0 ? (
				<>
					<ul className={styles.rows}>
						{roster.map((user) => (
							<AvailabilityMemberRow
								key={user.id}
								user={user}
								entry={entryByUserId.get(user.id)}
							/>
						))}
					</ul>
					<AvailabilitySummary
						statuses={roster.map((user) =>
							availabilityRowStatus(entryByUserId.get(user.id)),
						)}
					/>
				</>
			) : null}
			{freeSubs.length > 0 ? (
				roster.length > 0 ? (
					<div className={styles.subsSection}>
						<h5 className={styles.subsHeading}>
							{t("schedule:registration.friends")}
						</h5>
						<ul className={styles.rows}>
							{freeSubs.map((user) => (
								<AvailabilityMemberRow
									key={user.id}
									user={user}
									entry={entryByUserId.get(user.id)}
								/>
							))}
						</ul>
					</div>
				) : (
					<ul className={styles.rows}>
						{freeSubs.map((user) => (
							<AvailabilityMemberRow
								key={user.id}
								user={user}
								entry={entryByUserId.get(user.id)}
							/>
						))}
					</ul>
				)
			) : null}
		</section>
	);
}

/**
 * One user's availability as a list row: status icon, avatar, name and the
 * availability detail. The registration page composes it with roster extras
 * (an in-game name line, a remove button).
 */
export function AvailabilityMemberRow({
	user,
	entry,
	showAvailability = true,
	primaryName,
	secondaryName,
	trailing,
	nameTestId,
}: {
	user: AvailabilityPanelUser;
	entry?: AvailabilityPanelEntry;
	/** Set false when there is no availability data for the event (e.g. leagues), keeping just avatar + name. */
	showAvailability?: boolean;
	primaryName?: string;
	secondaryName?: string;
	trailing?: React.ReactNode;
	nameTestId?: string;
}) {
	const status = availabilityRowStatus(entry);

	return (
		<li
			className={styles.row}
			data-testid={`availability-row-${user.id}`}
			data-status={showAvailability ? status : undefined}
		>
			{showAvailability ? <StatusIcon status={status} /> : null}
			<Avatar user={user} size="xxs" />
			<span className={styles.nameBlock} data-testid={nameTestId}>
				<span className={styles.name}>{primaryName ?? user.username}</span>
				{secondaryName ? (
					<span className={styles.secondaryName}>{secondaryName}</span>
				) : null}
			</span>
			{showAvailability ? <AvailabilityRowDetail entry={entry} /> : null}
			{showAvailability
				? entry?.notes?.map((note) => (
						<span key={note} className={styles.note}>
							<Flag size={12} className={styles.noteFlag} /> {note}
						</span>
					))
				: null}
			{trailing ? <span className={styles.trailing}>{trailing}</span> : null}
		</li>
	);
}

/**
 * Resolves the shown status for a roster member; no entry at all means their
 * schedule is not visible to the viewer.
 */
export function availabilityRowStatus(
	entry?: AvailabilityPanelEntry,
): AvailabilityRowStatus {
	return entry?.availability.status ?? "hidden";
}

/** The availability detail text of one user: free ranges, a busy block or a muted explanation. */
export function AvailabilityRowDetail({
	entry,
}: {
	entry?: AvailabilityPanelEntry;
}) {
	const { t } = useTranslation(["schedule"]);

	// xxx: is this what we want?
	if (!entry) {
		return (
			<span className={styles.detailText}>
				{t("schedule:registration.notVisible")}
			</span>
		);
	}

	const availability = entry.availability;

	switch (availability.status) {
		case "available":
		case "partial":
			return <RangesText ranges={availability.ranges} />;
		case "unavailable":
			return (
				<span className={styles.detailText}>
					{t("schedule:team.notAvailable")}
				</span>
			);
		case "unknown":
			return (
				<span className={styles.detailText}>
					{t("schedule:team.noSchedule")}
				</span>
			);
		case "busy":
			return (
				<span className={styles.busy}>
					<span className={styles.busyName}>
						{availability.block.name ?? t("schedule:commitment.scrim")}
					</span>
				</span>
			);
	}
}

/** The event's estimated window as a localized time range, e.g. "Tue, Aug 25, 10:32 AM – 2:32 PM (estimated)". */
export function AvailabilityWindowText({
	window,
}: {
	window: NonNullable<AvailabilityPanelData["window"]>;
}) {
	const { t } = useTranslation(["schedule"]);
	const { formatter } = useDateTimeFormat({
		weekday: "short",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});

	return (
		<span className={styles.windowText}>
			{formatter.formatRange(window.startsAt, window.endsAt)} (
			{t("schedule:registration.estimated")})
		</span>
	);
}

/** Counts by status, e.g. "2 available · 1 partial · 1 out". */
export function AvailabilitySummary({
	statuses,
	className,
}: {
	statuses: Array<AvailabilityRowStatus>;
	className?: string;
}) {
	const { t } = useTranslation(["schedule"]);

	const counts = { available: 0, partial: 0, out: 0, unknown: 0 };
	for (const status of statuses) {
		if (status === "available") counts.available++;
		else if (status === "partial") counts.partial++;
		else if (status === "unavailable" || status === "busy") counts.out++;
		else counts.unknown++;
	}

	const parts = (["available", "partial", "out", "unknown"] as const).flatMap(
		(key) =>
			counts[key] > 0
				? [t(`schedule:registration.summary.${key}`, { amount: counts[key] })]
				: [],
	);

	return (
		<span className={clsx(styles.summary, className)}>{parts.join(" · ")}</span>
	);
}

/** A green dot per available member and a yellow dot per partially available one; other statuses show no dot. */
export function AvailabilityStatusDots({
	statuses,
}: {
	statuses: Array<AvailabilityRowStatus>;
}) {
	const shown = statuses
		.filter((status) => status === "available" || status === "partial")
		.sort((a, b) => STATUS_ORDER.indexOf(a) - STATUS_ORDER.indexOf(b));
	if (shown.length === 0) return null;

	return (
		<span className={styles.dots}>
			{shown.map((status, i) => (
				<span key={i} className={styles.dot} data-status={status} />
			))}
		</span>
	);
}

function RangesText({ ranges }: { ranges: Array<TimeRange> }) {
	const { formatter: timeFormatter } = useDateTimeFormat({
		hour: "numeric",
		minute: "2-digit",
	});

	// formatRange expands to full dates when the ends fall on different
	// calendar days, so a range crossing midnight formats its ends separately
	// to stay times-only
	const rangeText = (range: TimeRange) =>
		databaseTimestampToDate(range.startsAt).getDate() ===
		databaseTimestampToDate(range.endsAt).getDate()
			? timeFormatter.formatRange(range.startsAt, range.endsAt)
			: `${timeFormatter.format(range.startsAt)} – ${timeFormatter.format(range.endsAt)}`;

	return (
		<span className={styles.ranges}>{ranges.map(rangeText).join(" · ")}</span>
	);
}

function StatusIcon({ status }: { status: AvailabilityRowStatus }) {
	return (
		<span className={styles.statusCircle} data-status={status}>
			{statusGlyph(status)}
		</span>
	);
}

function statusGlyph(status: AvailabilityRowStatus) {
	switch (status) {
		case "available":
			return (
				<Check size={15} strokeWidth={3} className={styles.iconAvailable} />
			);
		case "partial":
			return <Clock size={13} strokeWidth={3} className={styles.iconPartial} />;
		case "unavailable":
			return <X size={15} strokeWidth={3} className={styles.iconUnavailable} />;
		case "busy":
			return (
				<CalendarX
					size={13}
					strokeWidth={3}
					className={styles.iconUnavailable}
				/>
			);
		case "unknown":
			return (
				<Ellipsis size={15} strokeWidth={3} className={styles.iconUnknown} />
			);
		case "hidden":
			return (
				<EyeOff size={13} strokeWidth={3} className={styles.iconUnknown} />
			);
	}
}
