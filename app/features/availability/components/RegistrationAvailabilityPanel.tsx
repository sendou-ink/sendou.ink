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
import type { SerializeFrom } from "~/utils/remix";
import type { TimeRange, WindowAvailabilityEntry } from "../availability-types";
import type { RegistrationAvailability } from "../core/RegistrationAvailability.server";
import styles from "./RegistrationAvailabilityPanel.module.css";
import { useRangeText } from "./ScheduleDayCell";

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

/** How each roster member relates to the event's estimated window, plus the friends free to sub. */
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

	const freeSubRows = (
		<ul className={styles.rows}>
			{freeSubs.map((user) => (
				<AvailabilityMemberRow
					key={user.id}
					user={user}
					entry={entryByUserId.get(user.id)}
				/>
			))}
		</ul>
	);

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
						{freeSubRows}
					</div>
				) : (
					freeSubRows
				)
			) : null}
		</section>
	);
}

/** One user's availability row; the registration page composes it with roster extras (IGN line, remove button). */
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
				? entry?.notes?.map((note, index) => (
						<span key={index} className={styles.note}>
							<Flag size={12} className={styles.noteFlag} /> {note}
						</span>
					))
				: null}
			{trailing ? <span className={styles.trailing}>{trailing}</span> : null}
		</li>
	);
}

/** Shown status of a roster member; no entry means their schedule is not visible to the viewer. */
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

	if (!entry) {
		return null;
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
	const shown = [
		...statuses.filter((status) => status === "available"),
		...statuses.filter((status) => status === "partial"),
	];
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
	const rangeText = useRangeText();

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
