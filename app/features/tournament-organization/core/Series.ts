/**
 * Finds the series that the event belongs to, matched by any of the series'
 * substrings appearing in the event's name.
 */
export function findByEventName<T extends { substringMatches: string[] }>({
	series,
	eventName,
}: {
	series: T[];
	eventName: string;
}) {
	const eventNameLower = eventName.toLowerCase();

	return series.find((oneSeries) =>
		oneSeries.substringMatches.some((substringMatch) =>
			eventNameLower.includes(substringMatch.toLowerCase()),
		),
	);
}
