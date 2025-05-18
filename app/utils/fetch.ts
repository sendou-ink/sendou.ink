// https://stackoverflow.com/a/50101022
export async function fetchWithTimeout(
	input: RequestInfo | URL,
	init?: RequestInit | undefined,
	timeout = 5000,
) {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => {
		controller.abort();
		console.error("Fetch timed out");
	}, timeout);

	const response = await fetch(input, { signal: controller.signal, ...init });

	clearTimeout(timeoutId);

	return response;
}
