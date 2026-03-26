// adapted from https://github.com/alexreardon/tiny-invariant, changed to show errors in production as well

export default function invariant(
	condition: any,
	message?: string,
): asserts condition {
	if (condition) return;

	const addition = message ? `: ${message}` : "";

	throw new Error(`Invariant failed${addition}`);
}
