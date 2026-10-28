/** Posts JSON to a dev tools action. Failures resolve to the message the server gave (`{ error }`) or a generic one. */
export async function postDev<T>(
	url: string,
	body: unknown = {},
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
	const response = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		const message = await response
			.json()
			.then((json: { error?: unknown }) =>
				typeof json?.error === "string" ? json.error : null,
			)
			.catch(() => null);

		return {
			ok: false,
			error: message ?? `Failed with ${response.status}, see the server log`,
		};
	}

	return { ok: true, data: (await response.json()) as T };
}
