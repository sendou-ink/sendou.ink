import * as React from "react";
import { calendarEventSorter } from "~/features/calendar/calendar-utils";
import type { CalendarLoaderData } from "~/features/calendar/loaders/calendar.server";

interface CollapsedEvents {
	eventsShown: CalendarLoaderData["eventTimes"][number]["events"]["shown"];
	date: {
		from: Date;
		to?: Date;
	};
	hiddenShown: boolean;
	hiddenCount: number;
	onToggleHidden: () => void;
}

/**
 * Custom hook to manage hiding/showing calendar events. Handles collapsing adjacent times given both of them have only hidden events.
 * E.g. 10pm with all hidden and 11pm with all hidden should be shown in one section as 10pm - 11pm to the user.
 *
 * @param eventTimes - Array of event times as returned by the calendar data loader.
 */
export function useCollapsableEvents(
	eventTimes: CalendarLoaderData["eventTimes"],
) {
	const [collapsingDisabled, setCollapsingDisabled] = React.useState(false);
	const [shownEventTimes, setShownEventTimes] = React.useState(
		new Set<number>(),
	);

	const eventsResult: Array<CollapsedEvents> = [];
	const hiddenTimes: Set<number> = new Set();

	for (const [i, eventTime] of eventTimes.entries()) {
		if (hiddenTimes.has(eventTime.at)) {
			continue;
		}

		const { containedTimes, date } = !collapsingDisabled
			? resolveCollapsedDateRange(eventTimes, i)
			: {
					containedTimes: new Set<number>().add(eventTime.at),
					date: {
						from: new Date(eventTime.at),
						to: undefined,
					},
				};

		for (const time of containedTimes) {
			hiddenTimes.add(time);
		}

		const hiddenShown = shownEventTimes.has(eventTime.at);

		eventsResult.push({
			eventsShown: hiddenShown
				? [...eventTime.events.shown, ...eventTime.events.hidden].sort(
						calendarEventSorter,
					)
				: eventTime.events.shown,
			date,
			hiddenShown,
			onToggleHidden: () => {
				// if we clicked a range section, uncollapse it
				if (containedTimes.size > 1) {
					setCollapsingDisabled(true);
				}
				setShownEventTimes((prev) => {
					const newSet = new Set(prev);
					if (newSet.has(eventTime.at)) {
						for (const time of containedTimes) {
							newSet.delete(time);
						}
					} else {
						for (const time of containedTimes) {
							newSet.add(time);
						}
					}
					return newSet;
				});
			},
			hiddenCount: !date.to
				? eventTime.events.hidden.length
				: eventTimes.reduce((acc, cur) => {
						if (cur.at < eventTime.at || cur.at > date.to.getTime()) {
							return acc;
						}
						return acc + cur.events.hidden.length;
					}, 0),
		});
	}

	return eventsResult;
}

function resolveCollapsedDateRange(
	eventTimes: CalendarLoaderData["eventTimes"],
	forIndex: number,
) {
	if (eventTimes[forIndex].events.shown.length > 0) {
		return {
			containedTimes: new Set<number>().add(eventTimes[forIndex].at),
			date: {
				from: new Date(eventTimes[forIndex].at),
				to: undefined,
			},
		};
	}

	const containedTimes: Set<number> = new Set();
	let to: Date | undefined;

	for (let j = forIndex + 1; j < eventTimes.length; j++) {
		const eventTime = eventTimes[j];

		if (eventTime.events.shown.length > 0) {
			break;
		}

		to = new Date(eventTime.at);
		containedTimes.add(eventTime.at);
	}

	containedTimes.add(eventTimes[forIndex].at);

	if (!to) {
		return {
			containedTimes,
			date: {
				from: new Date(eventTimes[forIndex].at),
				to: undefined,
			},
		};
	}

	return {
		containedTimes,
		date: {
			from: new Date(eventTimes[forIndex].at),
			to,
		},
	};
}
