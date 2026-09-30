/** Hours between the local clock times of two timezones, wrapped to [-12, 12]. */
export function hourDifferenceBetweenTimezones(
	timezone1: string,
	timezone2: string,
) {
	return createTimezoneHourDifference()(timezone1, timezone2);
}

/** {@link hourDifferenceBetweenTimezones} resolving each timezone's offset only once; resolving is expensive, so comparing many (filtering posts) should share one instance. */
export function createTimezoneHourDifference() {
	const offsets = new Map<string, number>();

	const offsetOf = (timezone: string) => {
		const cached = offsets.get(timezone);
		if (typeof cached === "number") return cached;

		const offset = getTimezoneOffset(timezone);
		offsets.set(timezone, offset);

		return offset;
	};

	return (timezone1: string, timezone2: string) => {
		const rawDifference = (offsetOf(timezone1) - offsetOf(timezone2)) / 60;

		// wrap to [-12, 12] so timezones across the date line compare by local clock time
		return ((((rawDifference + 12) % 24) + 24) % 24) - 12;
	};
}

// https://stackoverflow.com/a/29268535
function getTimezoneOffset(timeZone: string) {
	const date = new Date();

	// Intl gives a local ISO 8601 string for the time zone
	let iso = date
		.toLocaleString("en-CA", { timeZone, hour12: false })
		.replace(", ", "T");

	iso += `.${date.getMilliseconds().toString().padStart(3, "0")}`;

	// parsed as if UTC
	const lie = new Date(`${iso}Z`);

	// minutes, positive West of GMT (opposite of ISO 8601) like `Date.getTimezoneOffset`
	return -(lie.getTime() - date.getTime()) / 60 / 1000;
}
