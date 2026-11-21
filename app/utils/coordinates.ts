const DECIMAL = String.raw`[-+]?\d{1,3}(?:\.\d+)?`;
const COORDINATES_REGEX = new RegExp(
	String.raw`^\s*(${DECIMAL})\s*[,;\s]\s*(${DECIMAL})\s*$`,
);

/**
 * Parses decimal "latitude, longitude" text as map apps copy it, e.g. "30.2636, -97.7397".
 * Returns `null` when it isn't such a pair or is out of range.
 */
export function parseCoordinates(
	text: string,
): { latitude: number; longitude: number } | null {
	const match = COORDINATES_REGEX.exec(text);
	if (!match) return null;

	const latitude = Number(match[1]);
	const longitude = Number(match[2]);
	if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;

	return { latitude, longitude };
}
