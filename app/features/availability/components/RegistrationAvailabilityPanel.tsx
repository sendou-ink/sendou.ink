import {
	CalendarX,
	Check,
	Clock,
	EyeOff,
	Flag,
	HelpCircle,
	X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import { databaseTimestampToDate } from "~/utils/dates";
import type { SerializeFrom } from "~/utils/remix";
import type { TimeRange } from "../availability-types";
import type { RegistrationAvailability } from "../core/RegistrationAvailability.server";
import styles from "./RegistrationAvailabilityPanel.module.css";

interface PanelUser {
	id: number;
	username: string;
	discordId: string;
	discordAvatar: string | null;
	customAvatarUrl?: string | null;
}

type PanelData = SerializeFrom<RegistrationAvailability>;
type PanelEntry = NonNullable<PanelData["entries"]>[number];

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
	availability: PanelData;
	roster: Array<PanelUser>;
	/** Friends not on the shown roster and not in the tournament, panel keeps the free ones. */
	subCandidates: Array<PanelUser>;
}) {
	const { t } = useTranslation(["schedule"]);
	const { formatter: windowFormatter } = useDateTimeFormat({
		weekday: "short",
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	});
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

	return (
		<section className={styles.panel}>
			<h4 className={styles.heading}>
				{t("schedule:registration.title")} ·{" "}
				<span className={styles.headingWindow}>
					{windowFormatter.formatRange(
						availability.window.startsAt,
						availability.window.endsAt,
					)}{" "}
					({t("schedule:registration.estimated")})
				</span>
			</h4>
			<ul className={styles.rows}>
				{roster.map((user) => (
					<MemberRow
						key={user.id}
						user={user}
						entry={entryByUserId.get(user.id)}
					/>
				))}
			</ul>
			<SummaryLine roster={roster} entryByUserId={entryByUserId} />
			{freeSubs.length > 0 ? (
				<div className={styles.subsSection}>
					<h5 className={styles.subsHeading}>
						{t("schedule:registration.friends")}
					</h5>
					<ul className={styles.rows}>
						{freeSubs.map((user) => (
							<MemberRow
								key={user.id}
								user={user}
								entry={entryByUserId.get(user.id)}
							/>
						))}
					</ul>
				</div>
			) : null}
		</section>
	);
}

function MemberRow({ user, entry }: { user: PanelUser; entry?: PanelEntry }) {
	return (
		<li
			className={styles.row}
			data-testid={`availability-row-${user.id}`}
			data-status={rowStatus(entry)}
		>
			<StatusIcon status={rowStatus(entry)} />
			<Avatar user={user} size="xxs" />
			<span className={styles.name}>{user.username}</span>
			<RowDetail entry={entry} />
			{entry?.notes.map((note) => (
				<span key={note} className={styles.note}>
					<Flag size={12} className={styles.noteFlag} /> {note}
				</span>
			))}
		</li>
	);
}

type RowStatus =
	| PanelEntry["availability"]["status"]
	/** On the roster, but their schedule is not visible to the viewer (neither a teammate nor a friend). */
	| "hidden";

function rowStatus(entry?: PanelEntry): RowStatus {
	return entry?.availability.status ?? "hidden";
}

function RowDetail({ entry }: { entry?: PanelEntry }) {
	const { t } = useTranslation(["schedule"]);

	// xxx: is this what we want?
	if (!entry) {
		return (
			<span className={styles.mutedText}>
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
				<span className={styles.mutedText}>
					{t("schedule:team.notAvailable")}
				</span>
			);
		case "unknown":
			return (
				<span className={styles.mutedText}>
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

function StatusIcon({ status }: { status: RowStatus }) {
	switch (status) {
		case "available":
			return <Check size={16} className={styles.iconAvailable} />;
		case "partial":
			return <Clock size={14} className={styles.iconPartial} />;
		case "unavailable":
			return <X size={16} className={styles.iconUnavailable} />;
		case "busy":
			return <CalendarX size={14} className={styles.iconUnavailable} />;
		case "unknown":
			return <HelpCircle size={14} className={styles.iconUnknown} />;
		case "hidden":
			return <EyeOff size={14} className={styles.iconUnknown} />;
	}
}

function SummaryLine({
	roster,
	entryByUserId,
}: {
	roster: Array<PanelUser>;
	entryByUserId: Map<number, PanelEntry>;
}) {
	const { t } = useTranslation(["schedule"]);

	const counts = { available: 0, partial: 0, out: 0, unknown: 0 };
	for (const user of roster) {
		const status = rowStatus(entryByUserId.get(user.id));
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

	return <div className={styles.summary}>{parts.join(" · ")}</div>;
}
