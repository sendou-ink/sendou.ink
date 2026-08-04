import { useTranslation } from "react-i18next";
import { Link, useLoaderData } from "react-router";
import { EventsList } from "~/components/EventsList";
import { Main } from "~/components/Main";
import { SubNav, SubNavLink } from "~/components/SubNav";
import { useSearchParam } from "~/modules/search-params/hooks";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { CALENDAR_PAGE } from "~/utils/urls";
import {
	calendarEventsSearchParams,
	VIEW_FILTERS,
	type ViewFilter,
} from "../calendar-search-params";
import type { EventsLoaderData } from "../loaders/events.server";
import styles from "./events.module.css";

export { loader } from "../loaders/events.server";

export const handle: SendouRouteHandle = {
	i18n: ["calendar"],
};

export default function EventsPage() {
	const { t } = useTranslation(["calendar"]);
	const data = useLoaderData<EventsLoaderData>();
	const [viewParam] = useSearchParam(calendarEventsSearchParams, "view");

	const defaultFilter =
		VIEW_FILTERS.find((key) => data[key].length > 0) ?? "registered";
	const filter = viewParam ?? defaultFilter;

	const viewLabels: Record<ViewFilter, string> = {
		registered: `${t("calendar:events.view.registered")} (${data.registered.length})`,
		hosting: `${t("calendar:events.view.hosting")} (${data.hosting.length})`,
		scrims: `${t("calendar:events.view.scrims")} (${data.scrims.length})`,
		saved: `${t("calendar:events.view.saved")} (${data.saved.length})`,
		organization: `${t("calendar:events.view.organization")} (${data.organization.length})`,
	};

	const shownEvents = data[filter];

	const hasNoEventsAtAll = VIEW_FILTERS.every((key) => data[key].length === 0);

	return (
		<Main halfWidth>
			<div className={styles.eventsListHeader}>
				<h2 className="text-lg mx-2">{t("calendar:events.title")}</h2>
				{hasNoEventsAtAll ? null : (
					<SubNav secondary className={styles.subNav}>
						{VIEW_FILTERS.map((value) => (
							<SubNavLink
								key={value}
								to={calendarEventsSearchParams.href("", { view: value })}
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
				<p className="no-results mt-4">
					{t("calendar:events.emptyAll")}{" "}
					<Link to={CALENDAR_PAGE}>{t("calendar:events.findOnCalendar")}</Link>
				</p>
			) : shownEvents.length === 0 ? (
				<p className="no-results mt-4">{t("calendar:events.empty")}</p>
			) : (
				<EventsList events={shownEvents} />
			)}
		</Main>
	);
}
