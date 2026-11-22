import { Check, Clipboard, Link as LinkIcon, RefreshCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, type MetaFunction, useLoaderData } from "react-router";
import { ActionButton } from "~/components/ActionButton";
import { EmptyState } from "~/components/EmptyState";
import { EventsList } from "~/components/EventsList";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { Main } from "~/components/Main";
import { SubNav, SubNavLink } from "~/components/SubNav";
import { action } from "~/features/availability/actions/events.server";
import { eventsActionSchema } from "~/features/availability/availability-schemas";
import { scheduleWeekSearchParams } from "~/features/availability/availability-search-params";
import { MySchedule } from "~/features/availability/components/MySchedule";
import { timezoneMiddleware } from "~/features/timezone/timezone-middleware.server";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { useSearchParam } from "~/modules/search-params/hooks";
import { metaTags, ogPageImage } from "~/utils/remix";
import type { SendouRouteHandle } from "~/utils/remix.server";
import { CALENDAR_PAGE, EVENTS_PAGE } from "~/utils/urls";
import {
	calendarEventsSearchParams,
	VIEW_FILTERS,
	type ViewFilter,
} from "../calendar-search-params";
import { eventsIcalFeed } from "../calendar-urls";
import type { EventsLoaderData } from "../loaders/events.server";
import { loader } from "../loaders/events.server";
import type { Route } from "./+types/events";
import styles from "./events.module.css";

export { action, loader };

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
				teams={data.myTeams}
			/>
			<div>
				<div className={styles.eventsListHeader}>
					<div className="stack horizontal sm items-center">
						<h2 className="text-lg mx-2">{t("calendar:events.title")}</h2>
						<CalendarFeedPopover token={data.calendarFeedToken} />
					</div>
					{hasNoEventsAtAll ? null : (
						<SubNav secondary className={styles.subNav}>
							{VIEW_FILTERS.map((value) => (
								<SubNavLink
									key={value}
									to={scheduleWeekSearchParams.href(
										calendarEventsSearchParams.href(EVENTS_PAGE, {
											view: value,
										}),
										{ week },
									)}
									secondary
									controlled
									active={filter === value}
									defaultShouldRevalidate={false}
									preventScrollReset
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

function CalendarFeedPopover({ token }: { token: string | null }) {
	const { t } = useTranslation(["calendar", "common"]);
	const { copyToClipboard, copySuccess } = useCopyToClipboard();

	const url = token ? eventsIcalFeed(token) : null;

	return (
		<SendouPopover
			trigger={
				<SendouButton icon={<LinkIcon />} size="small" variant="outlined">
					{t("calendar:icalFeed")}
				</SendouButton>
			}
			popoverClassName={styles.feedPopover}
		>
			<div className="stack sm">
				<p className="text-xs text-lighter">
					{t("calendar:events.feed.explanation")}
				</p>
				{url ? (
					<>
						<input
							key={url}
							defaultValue={url}
							readOnly
							aria-label={t("calendar:icalFeed")}
						/>
						<SendouButton
							size="miniscule"
							variant="minimal"
							onClick={() => copyToClipboard(url)}
							icon={copySuccess ? <Check /> : <Clipboard />}
						>
							{t("common:actions.copyToClipboard")}
						</SendouButton>
						<p className="text-xs text-lighter">
							{t("calendar:events.feed.resetExplanation")}
						</p>
						<ActionButton
							schema={eventsActionSchema}
							action="GENERATE_CALENDAR_FEED_TOKEN"
							size="miniscule"
							variant="minimal-destructive"
							icon={<RefreshCcw />}
						>
							{t("calendar:events.feed.reset")}
						</ActionButton>
					</>
				) : (
					<ActionButton
						schema={eventsActionSchema}
						action="GENERATE_CALENDAR_FEED_TOKEN"
						size="small"
					>
						{t("calendar:events.feed.create")}
					</ActionButton>
				)}
			</div>
		</SendouPopover>
	);
}
