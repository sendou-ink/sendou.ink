/**
 * Runs an action for API use, converting its redirect-based responses to JSON: `successToast`
 * returns `redirect("?__success=message")`, `errorToastIfFalsy/errorToastIfErr` throw
 * `redirect("?__error=message")`, and validation failures return `{ fieldErrors }` (when the internal request
 * sets `RENDERS_FIELD_ERRORS_KEY`).
 */
export async function wrapActionForApi(
	runAction: () => Promise<unknown>,
): Promise<Response> {
	try {
		const response = await runAction();

		if (response instanceof Response && response.status === 302) {
			return new Response(null, { status: 200 });
		}

		if (response && typeof response === "object" && "fieldErrors" in response) {
			return Response.json(
				{
					error: "Validation failed",
					fieldErrors: response.fieldErrors,
				},
				{ status: 400 },
			);
		}

		return response as Response;
	} catch (e) {
		if (e instanceof Response && e.status === 302) {
			const location = e.headers.get("Location") ?? "";
			const search = location.slice(location.indexOf("?") + 1);
			const errorMsg = new URLSearchParams(search).get("__error");
			if (errorMsg !== null) {
				return Response.json({ error: errorMsg }, { status: 400 });
			}
		}

		throw e;
	}
}
