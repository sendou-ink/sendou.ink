import { useTranslation } from "react-i18next";
import { Link, useLoaderData, useSearchParams } from "react-router";
import { EventsList } from "~/components/EventsList";
import { Main } from "~/components/Main";
import { SubNav, SubNavLink } from "~/components/SubNav";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { CALENDAR_PAGE } from "~/utils/urls";
import type { EventsLoaderData } from "../loaders/events.server";
import styles from "./events.module.css";

export { loader } from "../loaders/events.server";

export const handle: SendouRouteHandle = {
	i18n: ["calendar"],
};

const VIEW_FILTERS = ["registered", "hosting", "scrims", "saved"] as const;
type ViewFilter = (typeof VIEW_FILTERS)[number];

export default function EventsPage() {
	const { t } = useTranslation(["calendar"]);
	const data = useLoaderData<EventsLoaderData>();
	const [searchParams] = useSearchParams();

	const viewParam = searchParams.get("view") as ViewFilter | null;
	const defaultFilter =
		VIEW_FILTERS.find((key) => data[key].length > 0) ?? "registered";
	const filter =
		viewParam && VIEW_FILTERS.includes(viewParam) ? viewParam : defaultFilter;

	const viewLabels: Record<ViewFilter, string> = {
		registered: `${t("calendar:events.view.registered")} (${data.registered.length})`,
		hosting: `${t("calendar:events.view.hosting")} (${data.hosting.length})`,
		scrims: `${t("calendar:events.view.scrims")} (${data.scrims.length})`,
		saved: `${t("calendar:events.view.saved")} (${data.saved.length})`,
	};

	const shownEvents =
		filter === "registered"
			? data.registered
			: filter === "hosting"
				? data.hosting
				: filter === "saved"
					? data.saved
					: data.scrims;

	const hasNoEventsAtAll =
		data.registered.length === 0 &&
		data.hosting.length === 0 &&
		data.scrims.length === 0 &&
		data.saved.length === 0;

	return (
		<Main halfWidth>
			<div className={styles.eventsListHeader}>
				<h2 className="text-lg mx-2">{t("calendar:events.title")}</h2>
				{hasNoEventsAtAll ? null : (
					<SubNav secondary>
						{VIEW_FILTERS.map((value) => (
							<SubNavLink
								key={value}
								to={`?view=${value}`}
								secondary
								controlled
								active={filter === value}
								unstable_defaultShouldRevalidate={false}
							>
								{viewLabels[value]}
							</SubNavLink>
						))}
					</SubNav>
				)}
			</div>
			{hasNoEventsAtAll ? (
				<p className="text-lighter text-sm">
					{t("calendar:events.emptyAll")}{" "}
					<Link to={CALENDAR_PAGE}>{t("calendar:events.findOnCalendar")}</Link>
				</p>
			) : shownEvents.length === 0 ? (
				<p className="text-lighter text-sm">{t("calendar:events.empty")}</p>
			) : (
				<EventsList events={shownEvents} />
			)}
		</Main>
	);
}
