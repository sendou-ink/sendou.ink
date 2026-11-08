/** The series whose substring appears in the event's name. */
export function findByEventName<T extends { substringMatches: string[] }>({
	series,
	eventName,
}: {
	series: T[];
	eventName: string;
}) {
	return series.find((oneSeries) =>
		matchesEventName({ series: oneSeries, eventName }),
	);
}

/** Whether one of the series' substrings appears in the event's name. */
export function matchesEventName({
	series,
	eventName,
}: {
	series: { substringMatches: string[] };
	eventName: string;
}) {
	const eventNameLower = eventName.toLowerCase();

	return series.substringMatches.some((substringMatch) =>
		eventNameLower.includes(substringMatch.toLowerCase()),
	);
}
