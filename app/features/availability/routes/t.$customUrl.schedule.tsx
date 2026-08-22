import clsx from "clsx";
import { Flag } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLoaderData, useMatches } from "react-router";
import * as R from "remeda";
import { Alert } from "~/components/Alert";
import {
	SendouChipRadio,
	SendouChipRadioGroup,
} from "~/components/elements/ChipRadio";
import { UserLink } from "~/components/UserLink";
import { TeamGoBackButton } from "~/features/team/components/TeamGoBackButton";
import type { TeamLoaderData } from "~/features/team/loaders/t.$customUrl.server";
import { getMemberRoleType } from "~/features/team/team-utils";
import { timezoneMiddleware } from "~/features/timezone/timezone-middleware.server";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import { useSearchParamsTyped } from "~/modules/search-params/hooks";
import invariant from "~/utils/invariant";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { teamScheduleSearchParams } from "../availability-search-params";
import type { TeamScheduleLoaderData } from "../loaders/t.$customUrl.schedule.server";
import { loader } from "../loaders/t.$customUrl.schedule.server";

export { loader };

import type { Route } from "./+types/t.$customUrl.schedule";
import styles from "./t.$customUrl.schedule.module.css";

export const middleware: Route.MiddlewareFunction[] = [timezoneMiddleware];

export const handle: SendouRouteHandle = {
	i18n: ["schedule"],
};

type WeekData = NonNullable<TeamScheduleLoaderData["weeks"]>[number];
type MemberWeekRow = WeekData["members"][number];
type TeamMember = TeamLoaderData["team"]["members"][number];

export default function TeamSchedulePage() {
	const { t } = useTranslation(["schedule"]);
	const data = useLoaderData<typeof loader>();

	return (
		<div className="stack md">
			<TeamGoBackButton />
			{data.weeks ? (
				<ScheduleWeeks weeks={data.weeks} />
			) : (
				<div data-testid="schedule-hidden">
					<Alert variation="INFO">{t("schedule:team.hidden")}</Alert>
				</div>
			)}
		</div>
	);
}

function ScheduleWeeks({ weeks }: { weeks: Array<WeekData> }) {
	const { t } = useTranslation(["schedule"]);
	const [{ week }, setParams] = useSearchParamsTyped(teamScheduleSearchParams);
	const { formatter: headingFormatter } = useDateTimeFormat({
		month: "short",
		day: "numeric",
	});

	const shownWeek = week === "next" ? weeks[1] : weeks[0];

	return (
		<div className="stack md">
			<div className={styles.header}>
				<h2 className={styles.heading}>
					{t("schedule:team.weekHeading", { week: shownWeek.weekNumber })} ·{" "}
					{headingFormatter.formatRange(
						shownWeek.days[0].noonAt,
						shownWeek.days[6].noonAt,
					)}
				</h2>
				<SendouChipRadioGroup>
					<SendouChipRadio
						name="schedule-week"
						value="current"
						checked={week === "current"}
						onChange={() => setParams({ week: "current" })}
					>
						{t("schedule:team.currentWeek")}
					</SendouChipRadio>
					<SendouChipRadio
						name="schedule-week"
						value="next"
						checked={week === "next"}
						onChange={() => setParams({ week: "next" })}
					>
						{t("schedule:team.nextWeek")}
					</SendouChipRadio>
				</SendouChipRadioGroup>
			</div>
			<ScheduleGrid week={shownWeek} />
			<PlayableWindowsSummary week={shownWeek} />
			<WeekNotes week={shownWeek} />
			<p className={styles.footer}>
				{t("schedule:editor.timesInYourTimezone")} ·{" "}
				{t("schedule:team.visibility")}
			</p>
		</div>
	);
}

function ScheduleGrid({ week }: { week: WeekData }) {
	const { t } = useTranslation(["team"]);
	const members = useTeamMembers();
	const { formatter: dayFormatter } = useDateTimeFormat({
		weekday: "short",
		day: "numeric",
	});

	const rows = week.members.flatMap((row) => {
		const member = members.find((member) => member.id === row.userId);

		return member ? [{ ...row, member }] : [];
	});
	const playerRows = rows.filter(
		({ member }) => getMemberRoleType(member) !== "OTHER",
	);
	const otherRows = rows.filter(
		({ member }) => getMemberRoleType(member) === "OTHER",
	);

	const renderRow = (row: MemberWeekRow & { member: TeamMember }) => (
		<tr key={row.userId} data-testid={`schedule-row-${row.userId}`}>
			<th scope="row" className={styles.memberCell}>
				<UserLink user={row.member} className={styles.memberLink} />
			</th>
			{row.days.map((ranges, dayIndex) => (
				<ScheduleCell
					key={week.days[dayIndex].date}
					row={row}
					ranges={ranges}
					dayIndex={dayIndex}
				/>
			))}
		</tr>
	);

	return (
		<div className={styles.gridScroll}>
			<table className={styles.grid} data-testid="schedule-grid">
				<thead>
					<tr>
						<td />
						{week.days.map((day, dayIndex) => (
							<th key={day.date} scope="col" className={styles.dayHeader}>
								{day.windowTier ? (
									<span
										className={clsx(styles.tierDot, styles.dayDot, {
											[styles.tierDotFull]: day.windowTier === "FULL",
										})}
										data-testid={`schedule-day-dot-${dayIndex}`}
									/>
								) : null}
								{dayFormatter.format(day.noonAt)}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{playerRows.map(renderRow)}
					{otherRows.length > 0 ? (
						<tr>
							<th
								scope="colgroup"
								colSpan={8}
								className={styles.sectionDivider}
							>
								{t("team:roster.sections.other")}
							</th>
						</tr>
					) : null}
					{otherRows.map(renderRow)}
				</tbody>
			</table>
		</div>
	);
}

function ScheduleCell({
	row,
	ranges,
	dayIndex,
}: {
	row: MemberWeekRow;
	ranges: MemberWeekRow["days"][number];
	dayIndex: number;
}) {
	const { t } = useTranslation(["schedule"]);
	const { formatter: timeFormatter } = useDateTimeFormat({
		hour: "numeric",
		minute: "2-digit",
	});

	const note = row.notes.find((note) => note.dayIndex === dayIndex);

	return (
		<td
			className={styles.cell}
			data-testid={`schedule-cell-${row.userId}-${dayIndex}`}
		>
			<div className={styles.cellContent}>
				{!row.reported ? (
					<span
						className={styles.unknown}
						title={t("schedule:team.noSchedule")}
					>
						?
					</span>
				) : ranges.length === 0 ? (
					<span
						className={styles.unavailable}
						title={t("schedule:team.notAvailable")}
					>
						—
					</span>
				) : (
					ranges.map((range) => (
						<div
							key={range.startsAt}
							className={styles.range}
							data-testid="schedule-range"
						>
							{timeFormatter.formatRange(range.startsAt, range.endsAt)}
						</div>
					))
				)}
				{note ? (
					<span title={note.text}>
						<Flag className={styles.noteFlag} size={12} aria-hidden />
					</span>
				) : null}
			</div>
		</td>
	);
}

function PlayableWindowsSummary({ week }: { week: WeekData }) {
	const { t } = useTranslation(["schedule"]);

	const fullWindows = week.windows.filter((window) => window.tier === "FULL");
	const oneShortWindows = week.windows.filter(
		(window) => window.tier === "ONE_SHORT",
	);

	return (
		<div className={styles.summary} data-testid="schedule-summary">
			<div className={styles.summaryRow}>
				<span className={clsx(styles.tierDot, styles.tierDotFull)} />
				<span className={styles.summaryLabel}>
					{t("schedule:team.canPlay", { players: week.minPlayers })}
				</span>
				<WindowList windows={fullWindows} />
			</div>
			{week.minPlayers > 1 && oneShortWindows.length > 0 ? (
				<div className={styles.summaryRow}>
					<span className={styles.tierDot} />
					<span className={styles.summaryLabel}>
						{t("schedule:team.withSub", { players: week.minPlayers - 1 })}
					</span>
					<WindowList windows={oneShortWindows} />
				</div>
			) : null}
		</div>
	);
}

function WindowList({ windows }: { windows: WeekData["windows"] }) {
	const { t } = useTranslation(["schedule"]);
	const { formatter: windowFormatter } = useDateTimeFormat({
		weekday: "short",
		hour: "numeric",
		minute: "2-digit",
	});

	if (windows.length === 0) {
		return <span className="text-lighter">{t("schedule:team.noWindows")}</span>;
	}

	return (
		<span className={styles.windowList}>
			{windows.map((window) => (
				<span
					key={window.startsAt}
					className={styles.window}
					data-testid="schedule-window"
				>
					{windowFormatter.formatRange(window.startsAt, window.endsAt)}
				</span>
			))}
		</span>
	);
}

function WeekNotes({ week }: { week: WeekData }) {
	const members = useTeamMembers();
	const { formatter: dayFormatter } = useDateTimeFormat({ weekday: "short" });

	const notes = R.sortBy(
		week.members.flatMap((row) =>
			row.notes.map((note) => ({ ...note, userId: row.userId })),
		),
		(note) => note.dayIndex,
	);

	if (notes.length === 0) return null;

	return (
		<ul className={styles.notes}>
			{notes.map((note) => (
				<li
					key={`${note.userId}-${note.dayIndex}`}
					className={styles.note}
					data-testid="schedule-note"
				>
					<Flag size={12} aria-hidden className={styles.noteFlag} />
					<span className={styles.noteDay}>
						{dayFormatter.format(week.days[note.dayIndex].noonAt)}
					</span>
					<span className={styles.noteAuthor}>
						{members.find((member) => member.id === note.userId)?.username}
					</span>
					{note.text}
				</li>
			))}
		</ul>
	);
}

function useTeamMembers() {
	const [, parentRoute] = useMatches();
	invariant(parentRoute);
	const layoutData = parentRoute.loaderData as TeamLoaderData;

	return layoutData.team.members;
}
