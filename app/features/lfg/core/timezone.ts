// timezone example is 'Asia/Tokyo'

export function hourDifferenceBetweenTimezones(
	timezone1: string,
	timezone2: string,
) {
	const offset1 = getTimezoneOffset(timezone1);
	const offset2 = getTimezoneOffset(timezone2);
	return (offset1 - offset2) / 60;
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
