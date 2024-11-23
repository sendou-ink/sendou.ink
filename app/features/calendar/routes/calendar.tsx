import type {
	LoaderFunctionArgs,
	MetaFunction,
	SerializeFrom,
} from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import clsx from "clsx";
import { addDays, addMonths, subDays, subMonths } from "date-fns";
import React from "react";
import { Flipped, Flipper } from "react-flip-toolkit";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { Alert } from "~/components/Alert";
import { Avatar } from "~/components/Avatar";
import { LinkButton } from "~/components/Button";
import { Divider } from "~/components/Divider";
import { Label } from "~/components/Label";
import { Main } from "~/components/Main";
import { Toggle } from "~/components/Toggle";
import { UsersIcon } from "~/components/icons/Users";
import { getUserId } from "~/features/auth/core/user.server";
import { currentSeason } from "~/features/mmr/season";
import { HACKY_resolvePicture } from "~/features/tournament/tournament-utils";
import { useIsMounted } from "~/hooks/useIsMounted";
import { useSearchParamState } from "~/hooks/useSearchParamState";
import { i18next } from "~/modules/i18n/i18next.server";
import { joinListToNaturalString } from "~/utils/arrays";
import {
	databaseTimestampToDate,
	dateToThisWeeksMonday,
	dateToWeekNumber,
	dayToWeekStartsAtMondayDay,
	getWeekStartsAtMondayDay,
	weekNumberToDate,
} from "~/utils/dates";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { makeTitle } from "~/utils/strings";
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
import { actualNumber, safeSplit } from "~/utils/zod";
import type { CalendarEventTag } from "../../../db/types";
import * as CalendarRepository from "../CalendarRepository.server";
import { calendarEventTagSchema } from "../actions/calendar.new.server";
import { Tags } from "../components/Tags";

import "~/styles/calendar.css";

export const meta: MetaFunction = (args) => {
	const data = args.data as SerializeFrom<typeof loader> | null;

	if (!data) return [];

	return [
		{ title: data.title },
		{
			name: "description",
			content: `${data.events.length} events happening during week ${
				data.displayedWeek
			} including ${joinListToNaturalString(
				data.events.slice(0, 3).map((e) => e.name),
			)}`,
		},
	];
};

export const handle: SendouRouteHandle = {
	i18n: "calendar",
	breadcrumb: () => ({
		imgPath: navIconUrl("calendar"),
		href: CALENDAR_PAGE,
		type: "IMAGE",
	}),
};

const loaderWeekSearchParamsSchema = z.object({
	week: z.preprocess(actualNumber, z.number().int().min(1).max(53)),
	year: z.preprocess(actualNumber, z.number().int()),
});

const loaderTagsSearchParamsSchema = z.object({
	tags: z.preprocess(safeSplit(), z.array(calendarEventTagSchema)),
});

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await getUserId(request);
	const t = await i18next.getFixedT(request);
	const url = new URL(request.url);

	// separate from tags parse so they can fail independently
	const parsedWeekParams = loaderWeekSearchParamsSchema.safeParse({
		year: url.searchParams.get("year"),
		week: url.searchParams.get("week"),
	});
	const parsedTagParams = loaderTagsSearchParamsSchema.safeParse({
		tags: url.searchParams.get("tags"),
	});

	const mondayDate = dateToThisWeeksMonday(new Date());
	const currentWeek = dateToWeekNumber(mondayDate);

	const displayedWeek = parsedWeekParams.success
		? parsedWeekParams.data.week
		: currentWeek;
	const displayedYear = parsedWeekParams.success
		? parsedWeekParams.data.year
		: mondayDate.getFullYear();
	const tagsToFilterBy = parsedTagParams.success
		? (parsedTagParams.data.tags as CalendarEventTag[])
		: [];

	return {
		currentWeek,
		displayedWeek,
		currentDay: new Date().getDay(),
		nearbyStartTimes: await CalendarRepository.startTimesOfRange({
			startTime: subMonths(
				weekNumberToDate({ week: displayedWeek, year: displayedYear }),
				1,
			),
			endTime: addMonths(
				weekNumberToDate({ week: displayedWeek, year: displayedYear }),
				1,
			),
			tagsToFilterBy,
		}),
		weeks: closeByWeeks({ week: displayedWeek, year: displayedYear }),
		events: await fetchEventsOfWeek({
			week: displayedWeek,
			year: displayedYear,
			tagsToFilterBy,
		}),
		eventsToReport: user
			? await CalendarRepository.eventsToReport(user.id)
			: [],
		title: makeTitle([`Week ${displayedWeek}`, t("pages.calendar")]),
	};
};

function closeByWeeks(args: { week: number; year: number }) {
	const dateFromWeekNumber = weekNumberToDate(args);

	return [-4, -3, -2, -1, 0, 1, 2, 3, 4].map((week) => {
		const date =
			week < 0
				? subDays(dateFromWeekNumber, Math.abs(week) * 7)
				: addDays(dateFromWeekNumber, week * 7);

		return {
			number: dateToWeekNumber(date),
			year: date.getFullYear(),
		};
	});
}

function fetchEventsOfWeek(args: {
	week: number;
	year: number;
	tagsToFilterBy: CalendarEventTag[];
}) {
	const startTime = weekNumberToDate(args);

	const endTime = new Date(startTime);
	endTime.setDate(endTime.getDate() + 7);

	// handle timezone mismatch between server and client
	startTime.setHours(startTime.getHours() - 12);
	endTime.setHours(endTime.getHours() + 12);

	return CalendarRepository.findAllBetweenTwoTimestamps({
		startTime,
		endTime,
		tagsToFilterBy: args.tagsToFilterBy,
	});
}

export default function CalendarPage() {
	const { t } = useTranslation("calendar");
	const data = useLoaderData<typeof loader>();
	const isMounted = useIsMounted();
	const [onlySendouInkEvents, setOnlySendouInkEvents] = useSearchParamState({
		defaultValue: false,
		name: "tournaments",
		revive: (val) => val === "true",
	});

	const filteredEvents = onlySendouInkEvents
		? data.events.filter((event) => event.tournamentId)
		: data.events;

	// we don't know which events are starting in user's time zone on server
	// so that's why this calculation is not in the loader
	const thisWeeksEvents = isMounted
		? filteredEvents.filter(
				(event) =>
					dateToWeekNumber(
						dateToSixHoursAgo(databaseTimestampToDate(event.startTime)),
					) === data.displayedWeek,
			)
		: filteredEvents;

	return (
		<Main classNameOverwrite="stack lg main layout__main">
			<WeekLinks />
			<EventsToReport />
			<div>
				<div className="stack horizontal justify-end">
					<div className="stack horizontal sm items-center">
						<Toggle
							id="onlySendouInk"
							tiny
							checked={onlySendouInkEvents}
							setChecked={setOnlySendouInkEvents}
						/>
						<Label spaced={false} htmlFor="onlySendouInk">
							Only sendou.ink events
						</Label>
					</div>
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

	const eventCounts = isMounted
		? getEventsCountPerWeek(data.nearbyStartTimes)
		: null;

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
									to={`?week=${week.number}&year=${week.year}`}
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
									if (!currentSeason(startTimeDate)) return undefined;

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
