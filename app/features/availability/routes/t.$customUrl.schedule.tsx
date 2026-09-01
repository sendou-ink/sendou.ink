import clsx from "clsx";
import { isSameDay } from "date-fns";
import { Flag, Pencil, Plus, Trash } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useLoaderData, useMatches } from "react-router";
import * as R from "remeda";
import type * as v from "valibot";
import { ActionButton } from "~/components/ActionButton";
import { Alert } from "~/components/Alert";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { FormMessage } from "~/components/FormMessage";
import { UserLink } from "~/components/UserLink";
import { TeamGoBackButton } from "~/features/team/components/TeamGoBackButton";
import type { TeamLoaderData } from "~/features/team/loaders/t.$customUrl.server";
import { getMemberRoleType } from "~/features/team/team-utils";
import { timezoneMiddleware } from "~/features/timezone/timezone-middleware.server";
import { FormField } from "~/form/FormField";
import { SendouForm, useFormFieldContext } from "~/form/SendouForm";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import { useHasPermission } from "~/modules/permissions/hooks";
import { useSearchParamsTyped } from "~/modules/search-params/hooks";
import { databaseTimestampToDate } from "~/utils/dates";
import invariant from "~/utils/invariant";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { action } from "../actions/t.$customUrl.schedule.server";
import {
	addTeamEventSchema,
	editTeamEventSchema,
	teamScheduleActionSchema,
} from "../availability-schemas";
import { scheduleWeekSearchParams } from "../availability-search-params";
import { ScheduleDayCell } from "../components/ScheduleDayCell";
import { WeekToggle } from "../components/WeekToggle";
import type { TeamScheduleLoaderData } from "../loaders/t.$customUrl.schedule.server";
import { loader } from "../loaders/t.$customUrl.schedule.server";

export { action, loader };

import type { Route } from "./+types/t.$customUrl.schedule";
import styles from "./t.$customUrl.schedule.module.css";

export const middleware: Route.MiddlewareFunction[] = [timezoneMiddleware];

export const handle: SendouRouteHandle = {
	i18n: ["schedule"],
};

type WeekData = NonNullable<TeamScheduleLoaderData["weeks"]>[number];
type TeamEventData = WeekData["teamEvents"][number];
type TeamEventDuration = v.InferOutput<typeof editTeamEventSchema>["duration"];
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
	const [{ week }, setParams] = useSearchParamsTyped(scheduleWeekSearchParams);
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
				<WeekToggle
					name="schedule-week"
					value={week}
					onChange={(value) => setParams({ week: value })}
				/>
			</div>
			<TeamEvents week={shownWeek} />
			<ScheduleGrid week={shownWeek} />
			<PlayableWindowsSummary week={shownWeek} />
			<WeekNotes week={shownWeek} />
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
			{row.days.map((day, dayIndex) => (
				<ScheduleCell
					key={week.days[dayIndex].date}
					row={row}
					day={day}
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
							<th scope="colgroup" colSpan={8}>
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
	day,
	dayIndex,
}: {
	row: MemberWeekRow;
	day: MemberWeekRow["days"][number];
	dayIndex: number;
}) {
	const note = row.notes.find((note) => note.dayIndex === dayIndex);

	return (
		<td data-testid={`schedule-cell-${row.userId}-${dayIndex}`}>
			<ScheduleDayCell
				reported={row.reported}
				ranges={day.ranges}
				busy={day.busy}
				note={note?.text}
			/>
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

function TeamEvents({ week }: { week: WeekData }) {
	const { t } = useTranslation(["schedule"]);
	const team = useTeam();
	const members = useTeamMembers();
	const canEdit = useHasPermission(team, "EDIT");
	const [addDialogOpen, setAddDialogOpen] = React.useState(false);
	const [editedEvent, setEditedEvent] = React.useState<TeamEventData | null>(
		null,
	);
	const { formatter: dayFormatter } = useDateTimeFormat({
		weekday: "short",
		day: "numeric",
	});
	const { formatter: timeFormatter } = useDateTimeFormat({
		hour: "numeric",
		minute: "2-digit",
	});

	const participantNames = (event: TeamEventData) =>
		event.participants
			.map(
				(participant) =>
					members.find((member) => member.id === participant.userId)?.username,
			)
			.filter(R.isDefined)
			.join(", ");

	// an event that already started can no longer pass the form's start time validation
	const canEditEvent = (event: TeamEventData) =>
		canEdit && databaseTimestampToDate(event.startsAt) > new Date();

	if (week.teamEvents.length === 0 && !canEdit) return null;

	return (
		<div className={styles.events} data-testid="schedule-events">
			<div className={styles.eventsHeader}>
				<h3 className={styles.eventsHeading}>{t("schedule:events.title")}</h3>
				{canEdit ? (
					<SendouButton
						size="small"
						variant="outlined"
						icon={<Plus />}
						onPress={() => setAddDialogOpen(true)}
						data-testid="add-team-event-button"
					>
						{t("schedule:events.add")}
					</SendouButton>
				) : null}
			</div>
			{week.teamEvents.length === 0 ? (
				<div className="text-lighter text-xs">{t("schedule:events.none")}</div>
			) : (
				<ul className={styles.eventsList}>
					{week.teamEvents.map((event) => (
						<li
							key={event.id}
							className={styles.event}
							data-testid="schedule-team-event"
						>
							<span className={styles.eventDay}>
								{dayFormatter.format(databaseTimestampToDate(event.startsAt))}
							</span>
							<span className={styles.eventTime}>
								{isSameDay(
									databaseTimestampToDate(event.startsAt),
									databaseTimestampToDate(event.endsAt),
								)
									? timeFormatter.formatRange(
											databaseTimestampToDate(event.startsAt),
											databaseTimestampToDate(event.endsAt),
										)
									: `${timeFormatter.format(databaseTimestampToDate(event.startsAt))} – ${timeFormatter.format(databaseTimestampToDate(event.endsAt))}`}
							</span>
							<span className={styles.eventName}>{event.name}</span>
							{event.participants.length > 0 ? (
								<span
									className={clsx(
										styles.eventParticipants,
										"text-lighter text-xs",
									)}
								>
									{participantNames(event)}
								</span>
							) : null}
							{canEditEvent(event) ? (
								<SendouButton
									variant="minimal"
									size="miniscule"
									icon={<Pencil />}
									onPress={() => setEditedEvent(event)}
									aria-label={t("schedule:events.edit")}
									data-testid={`edit-team-event-${event.id}`}
								/>
							) : null}
							{canEdit ? (
								<ActionButton
									schema={teamScheduleActionSchema}
									action="DELETE_EVENT"
									fields={{ eventId: event.id }}
									variant="minimal-destructive"
									size="miniscule"
									icon={<Trash />}
									aria-label={t("schedule:events.delete")}
									testId={`delete-team-event-${event.id}`}
									confirm={{
										dialogHeading: t("schedule:events.deleteConfirm", {
											name: event.name,
										}),
									}}
								/>
							) : null}
						</li>
					))}
				</ul>
			)}
			{addDialogOpen ? (
				<AddTeamEventDialog close={() => setAddDialogOpen(false)} />
			) : null}
			{editedEvent ? (
				<EditTeamEventDialog
					event={editedEvent}
					close={() => setEditedEvent(null)}
				/>
			) : null}
		</div>
	);
}

function AddTeamEventDialog({ close }: { close: () => void }) {
	const { t } = useTranslation(["schedule"]);

	return (
		<SendouDialog heading={t("schedule:events.addDialogTitle")} onClose={close}>
			<SendouForm schema={addTeamEventSchema} onSuccess={close}>
				<TeamEventFormFields />
			</SendouForm>
		</SendouDialog>
	);
}

function EditTeamEventDialog({
	event,
	close,
}: {
	event: TeamEventData;
	close: () => void;
}) {
	const { t } = useTranslation(["schedule"]);

	return (
		<SendouDialog
			heading={t("schedule:events.editDialogTitle")}
			onClose={close}
		>
			<SendouForm
				schema={editTeamEventSchema}
				onSuccess={close}
				defaultValues={{
					eventId: event.id,
					name: event.name,
					startsAt: databaseTimestampToDate(event.startsAt),
					duration: String(
						(event.endsAt - event.startsAt) / 60,
					) as TeamEventDuration,
					participants: event.participants.length > 0 ? "SELECTED" : "ALL",
					participantUserIds: event.participants.map((participant) =>
						String(participant.userId),
					),
				}}
			>
				<TeamEventFormFields />
			</SendouForm>
		</SendouDialog>
	);
}

function TeamEventFormFields() {
	const { t } = useTranslation(["schedule"]);

	return (
		<>
			<FormField name="name" />
			<FormField name="startsAt" />
			<FormField name="duration" />
			<FormField name="participants" />
			<ParticipantUserIdsFormField />
			<FormMessage type="info">
				{t("schedule:events.membersWillSee")}
			</FormMessage>
		</>
	);
}

function ParticipantUserIdsFormField() {
	const { values } = useFormFieldContext();
	const members = useTeamMembers();

	if (values.participants !== "SELECTED") return null;

	return (
		<FormField
			name="participantUserIds"
			options={members
				.filter((member) => member.role !== "CHEERLEADER")
				.map((member) => ({
					value: String(member.id),
					label: () => member.username,
				}))}
		/>
	);
}

function useTeam() {
	const [, parentRoute] = useMatches();
	invariant(parentRoute);
	const layoutData = parentRoute.loaderData as TeamLoaderData;

	return layoutData.team;
}

function useTeamMembers() {
	return useTeam().members;
}
