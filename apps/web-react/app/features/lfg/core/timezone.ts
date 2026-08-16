// timezone example is 'Asia/Tokyo'

/** Hours between the local clock times of two timezones, wrapped to [-12, 12]. */
export function hourDifferenceBetweenTimezones(
	timezone1: string,
	timezone2: string,
) {
	return createTimezoneHourDifference()(timezone1, timezone2);
}

/**
 * Same as {@link hourDifferenceBetweenTimezones}, but resolving each timezone's
 * offset only once. Resolving an offset is expensive, so comparing many
 * timezones (filtering a list of posts, say) should share one instance.
 */
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

	// Abuse the Intl API to get a local ISO 8601 string for a given time zone.
	let iso = date
		.toLocaleString("en-CA", { timeZone, hour12: false })
		.replace(", ", "T");

	// Include the milliseconds from the original timestamp
	iso += `.${date.getMilliseconds().toString().padStart(3, "0")}`;

	// Lie to the Date object constructor that it's a UTC time.
	const lie = new Date(`${iso}Z`);

	// Return the difference in timestamps, as minutes
	// Positive values are West of GMT, opposite of ISO 8601
	// this matches the output of `Date.getTimeZoneOffset`
	return -(lie.getTime() - date.getTime()) / 60 / 1000;
}
