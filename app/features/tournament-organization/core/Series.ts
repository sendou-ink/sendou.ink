/** The series whose substring appears in the event's name. */
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
