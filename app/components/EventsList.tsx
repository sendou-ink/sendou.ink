import { useTranslation } from "react-i18next";
import type { SidebarEvent } from "~/features/sidebar/core/sidebar.server";
import { useDateTimeFormat } from "~/hooks/intl/useDateTimeFormat";
import { useRelativeDayFormat } from "~/hooks/intl/useRelativeDayFormat";
import { useHydrated } from "~/hooks/useHydrated";
import styles from "./EventsList.module.css";
import { ListLink } from "./ListItem";

export function EventsList({ events }: { events: SidebarEvent[] }) {
	const { t } = useTranslation(["front"]);
	const { relativeDayLabel } = useRelativeDayFormat();
	const { formatter: dateFormatter } = useDateTimeFormat({
		weekday: "long",
		month: "numeric",
		day: "numeric",
	});
	const { formatter: timeFormatter } = useDateTimeFormat({
		hour: "numeric",
		minute: "2-digit",
	});
	const isHydrated = useHydrated();

	if (events.length === 0) {
		return (
			<div className={styles.emptyState}>{t("front:sideNav.noEvents")}</div>
		);
	}

	const eventLink = (event: SidebarEvent) => (
		<ListLink
			key={`${event.type}-${event.id}`}
			to={event.url}
			imageUrl={event.logoUrl ?? undefined}
			user={event.user ?? undefined}
			subtitle={timeFormatter.format(event.startsAt)}
		>
			{event.scrimStatus === "booked"
				? t("front:sideNav.scrimVs", { opponent: event.name })
				: event.scrimStatus === "looking"
					? t("front:sideNav.lookingForScrim")
					: event.scrimStatus === "requestPending"
						? t("front:sideNav.scrimRequestPending")
						: event.name}
		</ListLink>
	);

	// which day an event falls on depends on the viewer's timezone, so until
	// hydration the list is flat rather than absent
	if (!isHydrated) {
		return events.map(eventLink);
	}

	const getDayKey = (timestamp: number) => {
		const date = new Date(timestamp * 1000);
		return date.toDateString();
	};

	const formatDayHeader = (date: Date) =>
		relativeDayLabel(date) ?? dateFormatter.format(date);

	const groupedEvents = events.reduce<Record<string, typeof events>>(
		(acc, event) => {
			const key = getDayKey(event.startsAt);
			if (!acc[key]) {
				acc[key] = [];
			}
			acc[key].push(event);
			return acc;
		},
		{},
	);

	const dayKeys = Object.keys(groupedEvents);

	return (
		<>
			{dayKeys.map((dayKey) => {
				const dayEvents = groupedEvents[dayKey];
				const firstDate = new Date(dayEvents[0].startsAt * 1000);

				return (
					<div key={dayKey}>
						<div className={styles.dayHeader}>{formatDayHeader(firstDate)}</div>
						{dayEvents.map(eventLink)}
					</div>
				);
			})}
		</>
	);
}
