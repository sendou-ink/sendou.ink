import { useTranslation } from "react-i18next";
import { Link, type MetaFunction, useLoaderData } from "react-router";
import { EmptyState } from "~/components/EmptyState";
import { EventsList } from "~/components/EventsList";
import { Main } from "~/components/Main";
import { SubNav, SubNavLink } from "~/components/SubNav";
import { action } from "~/features/availability/actions/events.server";
import { scheduleWeekSearchParams } from "~/features/availability/availability-search-params";
import { MySchedule } from "~/features/availability/components/MySchedule";
import { timezoneMiddleware } from "~/features/timezone/timezone-middleware.server";
import { useSearchParam } from "~/modules/search-params/hooks";
import { metaTags, ogPageImage } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { CALENDAR_PAGE } from "~/utils/urls";
import {
	calendarEventsSearchParams,
	VIEW_FILTERS,
	type ViewFilter,
} from "../calendar-search-params";
import type { EventsLoaderData } from "../loaders/events.server";
import { loader } from "../loaders/events.server";

export { action, loader };

import type { Route } from "./+types/events";
import styles from "./events.module.css";

export const middleware: Route.MiddlewareFunction[] = [timezoneMiddleware];

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Events",
		image: ogPageImage("calendar"),
		location: args.location,
	});
};

export const handle: SendouRouteHandle = {
	i18n: ["calendar", "schedule"],
};

export default function EventsPage() {
	const { t } = useTranslation(["calendar"]);
	const data = useLoaderData<EventsLoaderData>();
	const [viewParam] = useSearchParam(calendarEventsSearchParams, "view");
	const [week] = useSearchParam(scheduleWeekSearchParams, "week");

	const defaultFilter =
		VIEW_FILTERS.find((key) => data[key].length > 0) ?? "registered";
	const filter = viewParam ?? defaultFilter;

	const viewLabels: Record<ViewFilter, string> = {
		registered: `${t("calendar:events.view.registered")} (${data.registered.length})`,
		hosting: `${t("calendar:events.view.hosting")} (${data.hosting.length})`,
		scrims: `${t("calendar:events.view.scrims")} (${data.scrims.length})`,
		team: `${t("calendar:events.view.team")} (${data.team.length})`,
		saved: `${t("calendar:events.view.saved")} (${data.saved.length})`,
		organization: `${t("calendar:events.view.organization")} (${data.organization.length})`,
	};

	const shownEvents = data[filter];

	const hasNoEventsAtAll = VIEW_FILTERS.every((key) => data[key].length === 0);

	return (
		<Main className="stack lg">
			{/* keyed on the week so a revalidation across Monday midnight resets
			    the editor instead of leaving it holding the rolled-over week */}
			<MySchedule
				key={data.mySchedule.weeks[0].weekStartsAt}
				data={data.mySchedule}
			/>
			<div>
				<div className={styles.eventsListHeader}>
					<h2 className="text-lg mx-2">{t("calendar:events.title")}</h2>
					{hasNoEventsAtAll ? null : (
						<SubNav secondary className={styles.subNav}>
							{VIEW_FILTERS.map((value) => (
								<SubNavLink
									key={value}
									to={scheduleWeekSearchParams.href(
										calendarEventsSearchParams.href("", { view: value }),
										{ week },
									)}
									secondary
									controlled
									active={filter === value}
									defaultShouldRevalidate={false}
								>
									{viewLabels[value]}
								</SubNavLink>
							))}
						</SubNav>
					)}
				</div>
				{hasNoEventsAtAll ? (
					<EmptyState navItem="calendar">
						{t("calendar:events.emptyAll")}{" "}
						<Link to={CALENDAR_PAGE}>
							{t("calendar:events.findOnCalendar")}
						</Link>
					</EmptyState>
				) : shownEvents.length === 0 ? (
					<EmptyState navItem="calendar">
						{t("calendar:events.empty")}
					</EmptyState>
				) : (
					<EventsList events={shownEvents} />
				)}
			</div>
		</Main>
	);
}
