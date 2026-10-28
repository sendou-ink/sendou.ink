import clsx from "clsx";
import { addDays } from "date-fns";
import { useTranslation } from "react-i18next";
import * as R from "remeda";
import { LocaleTime } from "~/components/LocaleTime";
import { LocaleTimeRange } from "~/components/LocaleTimeRange";
import { databaseTimestampToDate } from "~/utils/dates";
import type { CircuitEvent } from "../circuit-types";
import { circuitEventAnchorId, circuitModesLabel } from "../circuit-utils";
import styles from "./CircuitTimeline.module.css";

export function CircuitTimeline({
	events,
	nextEventId,
}: {
	events: CircuitEvent[];
	nextEventId: number | null;
}) {
	const { t } = useTranslation(["circuit"]);

	const slots = R.uniqueBy(
		events.map((event) => event.regions),
		regionsKey,
	);
	const eventStatus = (event: CircuitEvent) =>
		event.id === nextEventId ? "next" : event.result ? "past" : "upcoming";

	return (
		<nav className={clsx(styles.container, "scrollbar")}>
			<div
				className={styles.grid}
				style={{ "--event-count": events.length } as React.CSSProperties}
			>
				<div />
				{events.map((event) => (
					<div
						key={event.id}
						className={styles.header}
						data-status={eventStatus(event)}
						data-major={event.isMajor || undefined}
					>
						<span className={styles.label}>
							{event.id === nextEventId
								? t("circuit:next")
								: event.isMajor
									? t("circuit:major")
									: null}
						</span>
						{event.dayCount > 1 ? (
							<LocaleTimeRange
								from={event.startsAt}
								to={addDays(
									databaseTimestampToDate(event.startsAt),
									event.dayCount - 1,
								)}
								options={{ month: "short", day: "numeric" }}
								className={styles.date}
							/>
						) : (
							<LocaleTime
								date={event.startsAt}
								options={{ month: "short", day: "numeric" }}
								className={styles.date}
							/>
						)}
					</div>
				))}
				{slots.map((slotRegions) => {
					const isInSlot = (event: CircuitEvent) =>
						regionsKey(event.regions) === regionsKey(slotRegions);
					const firstIndex = events.findIndex(isInSlot);
					const lastIndex = events.findLastIndex(isInSlot);
					const timeShownEvent =
						events.find((event) => isInSlot(event) && !event.result) ??
						events[lastIndex];

					return (
						<div key={regionsKey(slotRegions)} className={styles.slotRow}>
							<div className={styles.slotTime}>
								<LocaleTime
									date={timeShownEvent.startsAt}
									options={{
										weekday: "short",
										hour: "numeric",
										minute: "numeric",
									}}
								/>
							</div>
							{events.map((event, i) => (
								<div
									key={event.id}
									className={styles.track}
									data-status={eventStatus(event)}
									data-major={event.isMajor || undefined}
									data-rail={railPart({ i, firstIndex, lastIndex })}
								>
									<span className={styles.rail}>
										{isInSlot(event) ? (
											<a
												href={`#${circuitEventAnchorId(event.id)}`}
												className={styles.bead}
											>
												<span className={styles.beadLabel}>{event.name}</span>
											</a>
										) : null}
									</span>
									{isInSlot(event) ? (
										<span className={styles.prize}>
											{t("circuit:prize", { amount: event.prizeUsd })}
										</span>
									) : null}
								</div>
							))}
						</div>
					);
				})}
				<div />
				{modeGroups(events).map((group) => (
					<div
						key={group.firstEventId}
						className={styles.modeGroup}
						style={{ gridColumn: `span ${group.count}` }}
					>
						{group.offMode ? circuitModesLabel(group.offMode) : null}
					</div>
				))}
			</div>
		</nav>
	);
}

function railPart({
	i,
	firstIndex,
	lastIndex,
}: {
	i: number;
	firstIndex: number;
	lastIndex: number;
}) {
	if (i < firstIndex || i > lastIndex || firstIndex === lastIndex) {
		return "none";
	}
	if (i === firstIndex) return "start";
	if (i === lastIndex) return "end";

	return "full";
}

function regionsKey(regions: CircuitEvent["regions"]) {
	return regions.join("/");
}

function modeGroups(events: CircuitEvent[]) {
	const groups: Array<{
		firstEventId: number;
		offMode: CircuitEvent["offMode"];
		count: number;
	}> = [];

	for (const event of events) {
		const previous = groups.at(-1);
		if (previous && previous.offMode === event.offMode) {
			previous.count++;
		} else {
			groups.push({ firstEventId: event.id, offMode: event.offMode, count: 1 });
		}
	}

	return groups;
}
