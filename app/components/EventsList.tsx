import { isToday, isTomorrow } from "date-fns";
import { useTranslation } from "react-i18next";
import type { SidebarEvent } from "~/features/sidebar/core/sidebar.server";
import { useHydrated } from "~/hooks/useHydrated";
import styles from "./EventsList.module.css";
import { Placeholder } from "./Placeholder";
import { ListLink } from "./SideNav";

export function EventsList({
	events,
	onClick,
}: {
	events: SidebarEvent[];
	onClick?: () => void;
}) {
	const { t, i18n } = useTranslation(["front"]);
	const isHydrated = useHydrated();

	if (events.length === 0) {
		return (
			<div className="text-lighter text-sm p-2">
				{t("front:sideNav.noEvents")}
			</div>
		);
	}

	if (!isHydrated) {
		return <Placeholder />;
	}

	const getDayKey = (timestamp: number) => {
		const date = new Date(timestamp * 1000);
		return date.toDateString();
	};

	const formatDayHeader = (date: Date) => {
		if (isToday(date)) {
			const rtf = new Intl.RelativeTimeFormat(i18n.language, {
				numeric: "auto",
			});
			const str = rtf.format(0, "day");
			return str.charAt(0).toUpperCase() + str.slice(1);
		}
		if (isTomorrow(date)) {
			const rtf = new Intl.RelativeTimeFormat(i18n.language, {
				numeric: "auto",
			});
			const str = rtf.format(1, "day");
			return str.charAt(0).toUpperCase() + str.slice(1);
		}
		return date.toLocaleDateString(i18n.language, {
			weekday: "long",
			month: "short",
			day: "numeric",
		});
	};

	const formatTime = (date: Date) => {
		return date.toLocaleTimeString(i18n.language, {
			hour: "numeric",
			minute: "2-digit",
		});
	};

	const groupedEvents = events.reduce<Record<string, typeof events>>(
		(acc, event) => {
			const key = getDayKey(event.startTime);
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
				const firstDate = new Date(dayEvents[0].startTime * 1000);

				return (
					<div key={dayKey}>
						<div className={styles.dayHeader}>{formatDayHeader(firstDate)}</div>
						{dayEvents.map((event) => (
							<ListLink
								key={`${event.type}-${event.id}`}
								to={event.url}
								imageUrl={event.logoUrl ?? undefined}
								subtitle={formatTime(new Date(event.startTime * 1000))}
								onClick={onClick}
							>
								{event.scrimStatus === "booked"
									? t("front:sideNav.scrimVs", { opponent: event.name })
									: event.scrimStatus === "looking"
										? t("front:sideNav.lookingForScrim")
										: event.scrimStatus === "requestPending"
											? t("front:sideNav.scrimRequestPending")
											: event.name}
							</ListLink>
						))}
					</div>
				);
			})}
		</>
	);
}
