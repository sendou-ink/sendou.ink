import type {
	LoaderFunctionArgs,
	MetaFunction,
	SerializeFrom,
} from "@remix-run/node";
import { Link, useLoaderData, useSearchParams } from "@remix-run/react";
import clsx from "clsx";
import { addMonths, subMonths } from "date-fns";
import React from "react";
import { Flipped, Flipper } from "react-flip-toolkit";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { Alert } from "~/components/Alert";
import { Avatar } from "~/components/Avatar";
import { LinkButton } from "~/components/Button";
import { Divider } from "~/components/Divider";
import { Main } from "~/components/Main";
import { UsersIcon } from "~/components/icons/Users";
import { getUserId } from "~/features/auth/core/user.server";
import { currentSeason } from "~/features/mmr/season";
import { HACKY_resolvePicture } from "~/features/tournament/tournament-utils";
import { useIsMounted } from "~/hooks/useIsMounted";
import { joinListToNaturalString } from "~/utils/arrays";
import {
	databaseTimestampToDate,
	dateToThisWeeksMonday,
	dateToThisWeeksSunday,
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
import { actualNumber, safeSplit } from "~/utils/zod";
import { Label } from "../../../components/Label";
import type {
	CalendarEventTag,
	PersistedCalendarEventTag,
} from "../../../db/types";
import { metaTags } from "../../../utils/remix";
import * as CalendarRepository from "../CalendarRepository.server";
import { calendarEventTagSchema } from "../actions/calendar.new.server";
import { CALENDAR_EVENT } from "../calendar-constants";
import { closeByWeeks } from "../calendar-utils";
import { Tags } from "../components/Tags";
import "~/styles/calendar.css";
import { SendouSwitch } from "~/components/elements/Switch";

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

const loaderWeekSearchParamsSchema = z.object({
	week: z.preprocess(actualNumber, z.number().int().min(1).max(53)),
	year: z.preprocess(actualNumber, z.number().int()),
});

const loaderFilterSearchParamsSchema = z.object({
	tags: z.preprocess(safeSplit(), z.array(calendarEventTagSchema)),
});

const loaderTournamentsOnlySearchParamsSchema = z.object({
	tournaments: z.literal("true").nullish(),
});

export const loader = async ({ request }: LoaderFunctionArgs) => {
	const user = await getUserId(request);
	const url = new URL(request.url);

	// separate from tags parse so they can fail independently
	const parsedWeekParams = loaderWeekSearchParamsSchema.safeParse({
		year: url.searchParams.get("year"),
		week: url.searchParams.get("week"),
	});
	const parsedFilterParams = loaderFilterSearchParamsSchema.safeParse({
		tags: url.searchParams.get("tags"),
	});
	const parsedTournamentsOnlyParams =
		loaderTournamentsOnlySearchParamsSchema.safeParse({
			tournaments: url.searchParams.get("tournaments"),
		});

	const mondayDate = dateToThisWeeksMonday(new Date());
	const sundayDate = dateToThisWeeksSunday(new Date());
	const currentWeek = dateToWeekNumber(mondayDate);

	const displayedWeek = parsedWeekParams.success
		? parsedWeekParams.data.week
		: currentWeek;
	const displayedYear = parsedWeekParams.success
		? parsedWeekParams.data.year
		: currentWeek === 1 // handle first week of the year special case
			? sundayDate.getFullYear()
			: mondayDate.getFullYear();
	const tagsToFilterBy = parsedFilterParams.success
		? (parsedFilterParams.data.tags as PersistedCalendarEventTag[])
		: [];
	const onlyTournaments = parsedTournamentsOnlyParams.success
		? Boolean(parsedTournamentsOnlyParams.data.tournaments)
		: false;

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
			onlyTournaments,
		}),
		weeks: closeByWeeks({ week: displayedWeek, year: displayedYear }),
		events: await fetchEventsOfWeek({
			week: displayedWeek,
			year: displayedYear,
			tagsToFilterBy,
			onlyTournaments,
		}),
		eventsToReport: user
			? await CalendarRepository.eventsToReport(user.id)
			: [],
	};
};

function fetchEventsOfWeek(args: {
	week: number;
	year: number;
	tagsToFilterBy: PersistedCalendarEventTag[];
	onlyTournaments: boolean;
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
		onlyTournaments: args.onlyTournaments,
	});
}

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
					<TagsFilter />
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
