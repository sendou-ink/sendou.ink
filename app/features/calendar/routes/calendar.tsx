import type { MetaFunction, SerializeFrom } from "@remix-run/node";
import {
	Link,
	createSearchParams,
	useLoaderData,
	useSearchParams,
} from "@remix-run/react";
import clsx from "clsx";
import React from "react";
import { Flipped, Flipper } from "react-flip-toolkit";
import { useTranslation } from "react-i18next";
import { useCopyToClipboard } from "react-use";
import { Alert } from "~/components/Alert";
import { Avatar } from "~/components/Avatar";
import { LinkButton } from "~/components/Button";
import { Divider } from "~/components/Divider";
import { Main } from "~/components/Main";
import { SendouButton } from "~/components/elements/Button";
import { SendouSwitch } from "~/components/elements/Switch";
import { CheckmarkIcon } from "~/components/icons/Checkmark";
import { ClipboardIcon } from "~/components/icons/Clipboard";
import { UsersIcon } from "~/components/icons/Users";
import type { CalendarEventTag } from "~/db/tables";
import * as Seasons from "~/features/mmr/core/Seasons";
import { HACKY_resolvePicture } from "~/features/tournament/tournament-utils";
import { useIsMounted } from "~/hooks/useIsMounted";
import { joinListToNaturalString } from "~/utils/arrays";
import {
	databaseTimestampToDate,
	dateToWeekNumber,
	dayToWeekStartsAtMondayDay,
	getWeekStartsAtMondayDay,
	weekNumberToDate,
} from "~/utils/dates";
import type { SendouRouteHandle } from "~/utils/remix.server";
import type { Unpacked } from "~/utils/types";
import {
	CALENDAR_PAGE,
	calendarReportWinnersPage,
	navIconUrl,
	resolveBaseUrl,
	tournamentOrganizationPage,
	tournamentPage,
	userSubmittedImage,
} from "~/utils/urls";
import { Label } from "../../../components/Label";
import { metaTags } from "../../../utils/remix";
import { CALENDAR_EVENT } from "../calendar-constants";
import { Tags } from "../components/Tags";

import { loader } from "../loaders/calendar.server";
export { loader };

import "~/styles/calendar.css";

export const meta: MetaFunction = (args) => {
	const data = args.data as SerializeFrom<typeof loader> | null;

	if (!data) return [];

	const events = data.events.slice().sort((a, b) => {
		const aParticipants = a.participantCounts?.teams ?? 0;
		const bParticipants = b.participantCounts?.teams ?? 0;

		if (aParticipants > bParticipants) return -1;
		if (aParticipants < bParticipants) return 1;

		return 0;
	});

	return metaTags({
		title: "Calendar",
		ogTitle: "Splatoon competitive event calendar",
		location: args.location,
		description: `${data.events.length} events on sendou.ink happening during week ${
			data.displayedWeek
		} including ${joinListToNaturalString(
			events.slice(0, 3).map((e) => e.name),
		)}`,
	});
};

export const handle: SendouRouteHandle = {
	i18n: "calendar",
	breadcrumb: () => ({
		imgPath: navIconUrl("calendar"),
		href: CALENDAR_PAGE,
		type: "IMAGE",
	}),
};

export default function CalendarPage() {
	const { t } = useTranslation("calendar");
	const data = useLoaderData<typeof loader>();
	const isMounted = useIsMounted();

	// we don't know which events are starting in user's time zone on server
	// so that's why this calculation is not in the loader
	const thisWeeksEvents = isMounted
		? data.events.filter(
				(event) =>
					dateToWeekNumber(
						dateToSixHoursAgo(databaseTimestampToDate(event.startTime)),
					) === data.displayedWeek,
			)
		: data.events;

	return (
		<Main classNameOverwrite="stack lg main layout__main">
			<WeekLinks />
			<EventsToReport />
			<div>
				<div className="stack horizontal justify-between">
					<div className="stack sm">
						<TagsFilter />
						<ICalLink />
					</div>
					<OnSendouInkToggle />
				</div>
				{isMounted ? (
					<>
						{thisWeeksEvents.length > 0 ? (
							<>
								<EventsList events={thisWeeksEvents} />
								<div className="calendar__time-zone-info">
									{t("inYourTimeZone")}{" "}
									{Intl.DateTimeFormat().resolvedOptions().timeZone}
								</div>
							</>
						) : (
							<h2 className="calendar__no-events">{t("noEvents")}</h2>
						)}
					</>
				) : (
					<div className="calendar__placeholder" />
				)}
			</div>
		</Main>
	);
}

function WeekLinks() {
	const data = useLoaderData<typeof loader>();
	const isMounted = useIsMounted();
	const [searchParams] = useSearchParams();

	const eventCounts = isMounted
		? getEventsCountPerWeek(data.nearbyStartTimes)
		: null;

	const linkTo = (args: { week: number; year: number }) => {
		const params = new URLSearchParams(searchParams);
		params.set("week", String(args.week));
		params.set("year", String(args.year));

		return `?${params.toString()}`;
	};

	return (
		<Flipper flipKey={data.weeks.map(({ number }) => number).join("")}>
			<div className="flex justify-center">
				<div className="calendar__weeks">
					{data.weeks.map((week, i) => {
						const hidden = [
							0,
							1,
							data.weeks.length - 2,
							data.weeks.length - 1,
						].includes(i);

						const isCurrentWeek = i === 4;

						return (
							<Flipped key={week.number} flipId={week.number}>
								<Link
									to={linkTo({ week: week.number, year: week.year })}
									className={clsx("calendar__week", { invisible: hidden })}
									aria-hidden={hidden}
									tabIndex={hidden || isCurrentWeek ? -1 : 0}
									onClick={(e) => isCurrentWeek && e.preventDefault()}
								>
									<>
										<WeekLinkTitle week={week} />
										<div
											className={clsx("calendar__event-count", {
												invisible: !eventCounts,
											})}
										>
											×{eventCounts?.get(week.number) ?? 0}
										</div>
									</>
								</Link>
							</Flipped>
						);
					})}
				</div>
			</div>
		</Flipper>
	);
}

function WeekLinkTitle({
	week,
}: {
	week: Unpacked<SerializeFrom<typeof loader>["weeks"]>;
}) {
	const { t } = useTranslation("calendar");
	const data = useLoaderData<typeof loader>();
	const { i18n } = useTranslation();

	const isSameYear = week.year === new Date().getFullYear();
	const relativeWeekIdentifier =
		week.number === data.currentWeek && isSameYear
			? t("week.this")
			: week.number - data.currentWeek === 1 && isSameYear
				? t("week.next")
				: week.number - data.currentWeek === -1 && isSameYear
					? t("week.last")
					: null;

	if (relativeWeekIdentifier) {
		return (
			<div className="calendar__week__relative">
				<div>{relativeWeekIdentifier}</div>
			</div>
		);
	}

	return (
		<div>
			<div>
				{weekNumberToDate({
					week: week.number,
					year: week.year,
				}).toLocaleDateString(i18n.language, {
					day: "numeric",
					month: "short",
				})}
			</div>
			<div className="calendar__week__dash">-</div>
			<div>
				{weekNumberToDate({
					week: week.number,
					year: week.year,
					position: "end",
				}).toLocaleDateString(i18n.language, {
					day: "numeric",
					month: "short",
				})}
			</div>
		</div>
	);
}

function getEventsCountPerWeek(
	startTimes: SerializeFrom<typeof loader>["nearbyStartTimes"],
) {
	const result = new Map<number, number>();

	for (const startTime of startTimes) {
		const week = dateToWeekNumber(databaseTimestampToDate(startTime));
		const previousCount = result.get(week) ?? 0;
		result.set(week, previousCount + 1);
	}

	return result;
}

function EventsToReport() {
	const { t } = useTranslation("calendar");
	const data = useLoaderData<typeof loader>();

	if (data.eventsToReport.length === 0) return null;

	return (
		<Alert textClassName="calendar__events-to-report">
			{t("reportResults")}{" "}
			{data.eventsToReport.map((event, i) => (
				<React.Fragment key={event.id}>
					<Link to={calendarReportWinnersPage(event.id)}>{event.name}</Link>
					{i === data.eventsToReport.length - 1 ? "" : ", "}
				</React.Fragment>
			))}
		</Alert>
	);
}

function TagsFilter() {
	const { t } = useTranslation(["calendar", "common"]);
	const id = React.useId();
	const [searchParams, setSearchParams] = useSearchParams();

	const tagsToFilterBy = (searchParams
		.get("tags")
		?.split(",")
		.filter((tag) => CALENDAR_EVENT.TAGS.includes(tag as CalendarEventTag)) ??
		[]) as CalendarEventTag[];
	const setTagsToFilterBy = (tags: CalendarEventTag[]) => {
		setSearchParams((params) => {
			if (tags.length === 0) {
				params.delete("tags");
				return params;
			}

			params.set("tags", tags.join(","));
			return params;
		});
	};

	const tagsForSelect = CALENDAR_EVENT.PERSISTED_TAGS.filter(
		(tag) => !tagsToFilterBy.includes(tag),
	);

	return (
		<div className="stack sm">
			<div>
				<label htmlFor={id}>{t("calendar:tag.filter.label")}</label>
				<select
					id={id}
					className="w-max"
					onChange={(e) =>
						setTagsToFilterBy([
							...tagsToFilterBy,
							e.target.value as CalendarEventTag,
						])
					}
				>
					<option value="">—</option>
					{tagsForSelect.map((tag) => (
						<option key={tag} value={tag}>
							{t(`common:tag.name.${tag}`)}
						</option>
					))}
				</select>
			</div>
			<Tags
				tags={tagsToFilterBy}
				onDelete={(tagToDelete) =>
					setTagsToFilterBy(tagsToFilterBy.filter((tag) => tag !== tagToDelete))
				}
			/>
		</div>
	);
}

function ICalLink() {
	const [searchParams, _] = useSearchParams();
	const [state, copyToClipboard] = useCopyToClipboard();
	const [copySuccess, setCopySuccess] = React.useState(false);

	React.useEffect(() => {
		if (!state.value) return;

		setCopySuccess(true);
		const timeout = setTimeout(() => setCopySuccess(false), 2000);

		return () => clearTimeout(timeout);
	}, [state]);

	const filteredTags = (
		searchParams
			.get("tags")
			?.split(",")
			.filter((tag) => CALENDAR_EVENT.TAGS.includes(tag as CalendarEventTag)) ??
		[]
	).join();

	const onlyTournaments = searchParams.get("tournaments") === "true";

	const params = createSearchParams();

	if (filteredTags.length > 0) params.append("tags", filteredTags);
	if (onlyTournaments) params.append("tournaments", "true");

	const icalURL = `https://sendou.ink/calendar.ics${params.size > 0 ? `?${params.toString()}` : ""}`;

	return (
		<div>
			<label htmlFor="icalAddress">iCalendar</label>
			<div className="stack horizontal sm items-center">
				<input type="text" readOnly value={icalURL} id="icalAddress" />
				<SendouButton
					variant={copySuccess ? "outlined-success" : "outlined"}
					onPress={() => copyToClipboard(icalURL)}
					icon={copySuccess ? <CheckmarkIcon /> : <ClipboardIcon />}
					aria-label="Copy to clipboard"
				/>
			</div>
		</div>
	);
}

function OnSendouInkToggle() {
	const { t } = useTranslation(["calendar"]);
	const [searchParams, setSearchParams] = useSearchParams();

	const onlyTournaments = searchParams.get("tournaments") === "true";

	const setOnlyTournaments = (value: boolean) => {
		setSearchParams((params) => {
			if (value) {
				params.set("tournaments", "true");
			} else {
				params.delete("tournaments");
			}

			return params;
		});
	};

	return (
		<div className="stack horizontal justify-end">
			<div className="stack items-end">
				<Label htmlFor="onlyTournaments">
					{t("calendar:tournament.filter.label")}
				</Label>
				<SendouSwitch
					id="onlyTournaments"
					isSelected={onlyTournaments}
					onChange={setOnlyTournaments}
				/>
			</div>
		</div>
	);
}

function EventsList({
	events,
}: {
	events: SerializeFrom<typeof loader>["events"];
}) {
	const data = useLoaderData<typeof loader>();
	const { t, i18n } = useTranslation("calendar");

	const sortPastEventsLast = data.currentWeek === data.displayedWeek;

	const eventsGrouped = eventsGroupedByDay(events);
	if (sortPastEventsLast) {
		eventsGrouped.sort(
			pastEventsLast(dayToWeekStartsAtMondayDay(data.currentDay)),
		);
	}

	let dividerRendered = false;
	return (
		<div className="calendar__events-container">
			{eventsGrouped.map(([daysDate, events]) => {
				const renderDivider =
					sortPastEventsLast &&
					!dividerRendered &&
					getWeekStartsAtMondayDay(daysDate) <
						dayToWeekStartsAtMondayDay(data.currentDay);
				if (renderDivider) {
					dividerRendered = true;
				}

				const sectionWeekday = daysDate.toLocaleString(i18n.language, {
					weekday: "short",
				});

				return (
					<React.Fragment key={daysDate.getTime()}>
						<div className="calendar__event__date-container">
							{renderDivider ? (
								<Divider className="calendar__event__divider">
									{t("pastEvents.dividerText")}
								</Divider>
							) : null}
							<div className="calendar__event__date">
								{daysDate.toLocaleDateString(i18n.language, {
									weekday: "long",
									day: "numeric",
									month: "long",
								})}
							</div>
						</div>
						<div className="stack md">
							{events.map((calendarEvent) => {
								const eventWeekday = databaseTimestampToDate(
									calendarEvent.startTime,
								).toLocaleString(i18n.language, {
									weekday: "short",
								});

								const isOneVsOne =
									calendarEvent.tournamentSettings?.minMembersPerTeam === 1;

								const startTimeDate = databaseTimestampToDate(
									calendarEvent.startTime,
								);
								const tournamentRankedStatus = () => {
									if (!calendarEvent.tournamentSettings) return undefined;
									if (!Seasons.current(startTimeDate)) return undefined;

									return calendarEvent.tournamentSettings.isRanked &&
										(!calendarEvent.tournamentSettings.minMembersPerTeam ||
											calendarEvent.tournamentSettings.minMembersPerTeam === 4)
										? "RANKED"
										: "UNRANKED";
								};

								return (
									<section
										key={calendarEvent.eventDateId}
										className="calendar__event stack md"
									>
										<div className="stack sm">
											<div className="calendar__event__top-info-container">
												<time
													dateTime={databaseTimestampToDate(
														calendarEvent.startTime,
													).toISOString()}
													className="calendar__event__time"
												>
													{startTimeDate.toLocaleTimeString(i18n.language, {
														hour: "numeric",
														minute: "numeric",
													})}
												</time>
												{calendarEvent.organization ? (
													<Link
														to={tournamentOrganizationPage({
															organizationSlug: calendarEvent.organization.slug,
														})}
														className="stack horizontal xs items-center text-xs text-main-forced"
													>
														<Avatar
															url={
																calendarEvent.organization.avatarUrl
																	? userSubmittedImage(
																			calendarEvent.organization.avatarUrl,
																		)
																	: undefined
															}
															size="xxs"
														/>
														{calendarEvent.organization.name}
													</Link>
												) : (
													<div className="calendar__event__author">
														{t("from", {
															author: calendarEvent.username,
														})}
													</div>
												)}
												{sectionWeekday !== eventWeekday ? (
													<div className="text-xxs font-bold text-theme-secondary ml-auto">
														{eventWeekday}
													</div>
												) : null}
											</div>
											<div className="stack xs">
												<div className="stack horizontal sm-plus items-center">
													{calendarEvent.tournamentId ? (
														<img
															src={
																calendarEvent.logoUrl
																	? userSubmittedImage(calendarEvent.logoUrl)
																	: HACKY_resolvePicture({
																			name: calendarEvent.name,
																		})
															}
															alt=""
															width={40}
															height={40}
															className="calendar__event-logo"
														/>
													) : null}
													<div>
														<Link
															to={
																calendarEvent.tournamentId
																	? tournamentPage(calendarEvent.tournamentId)
																	: String(calendarEvent.eventId)
															}
														>
															<h2 className="calendar__event__title">
																{calendarEvent.name}{" "}
																{calendarEvent.nthAppearance > 1 ? (
																	<span className="calendar__event__day">
																		{t("day", {
																			number: calendarEvent.nthAppearance,
																		})}
																	</span>
																) : null}
															</h2>
														</Link>
														{calendarEvent.participantCounts &&
														calendarEvent.participantCounts.teams > 0 ? (
															<div className="calendar__event__participant-counts">
																<UsersIcon />{" "}
																{!isOneVsOne ? (
																	<>
																		{t("count.teams", {
																			count:
																				calendarEvent.participantCounts.teams,
																		})}{" "}
																		/{" "}
																	</>
																) : null}
																{t("count.players", {
																	count:
																		calendarEvent.participantCounts.players,
																})}
															</div>
														) : null}
													</div>
												</div>
												<Tags
													tags={calendarEvent.tags}
													badges={calendarEvent.badgePrizes}
													tournamentRankedStatus={tournamentRankedStatus()}
												/>
											</div>
										</div>
										<div className="calendar__event__bottom-info-container">
											{calendarEvent.discordUrl ? (
												<LinkButton
													to={calendarEvent.discordUrl}
													variant="outlined"
													size="tiny"
													isExternal
												>
													Discord
												</LinkButton>
											) : null}
											{!calendarEvent.tournamentId ? (
												<LinkButton
													to={calendarEvent.bracketUrl}
													variant="outlined"
													size="tiny"
													isExternal
												>
													{resolveBaseUrl(calendarEvent.bracketUrl)}
												</LinkButton>
											) : null}
										</div>
									</section>
								);
							})}
						</div>
					</React.Fragment>
				);
			})}
		</div>
	);
}

// Goal with this is to make events that start during the night for EU (NA events)
// grouped up with the previous day. Otherwise you have a past event showing at the
// top of the page for the whole following day for EU.
function dateToSixHoursAgo(date: Date) {
	const sixHoursAgo = new Date(date);
	sixHoursAgo.setHours(sixHoursAgo.getHours() - 6);
	return sixHoursAgo;
}

type EventsGrouped = [Date, SerializeFrom<typeof loader>["events"]];
function eventsGroupedByDay(events: SerializeFrom<typeof loader>["events"]) {
	const result: EventsGrouped[] = [];

	for (const calendarEvent of events) {
		const previousIterationEvents = result[result.length - 1] ?? null;

		const eventsDate = dateToSixHoursAgo(
			databaseTimestampToDate(calendarEvent.startTime),
		);

		if (
			!previousIterationEvents ||
			previousIterationEvents[0].getDay() !== eventsDate.getDay()
		) {
			result.push([eventsDate, [calendarEvent]]);
		} else {
			previousIterationEvents[1].push(calendarEvent);
		}
	}

	return result;
}

function pastEventsLast(currentDay: number) {
	return (a: EventsGrouped, b: EventsGrouped) => {
		const aDay = getWeekStartsAtMondayDay(a[0]);
		const bDay = getWeekStartsAtMondayDay(b[0]);

		if (aDay < currentDay && bDay >= currentDay) {
			return 1;
		}

		if (aDay >= currentDay && bDay < currentDay) {
			return -1;
		}

		return 0;
	};
}
