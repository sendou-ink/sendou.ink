import type { ActionFunction, ActionFunctionArgs } from "react-router";

/**
 * Wraps an existing action function for API use.
 * Converts redirect-based success/error responses to JSON responses.
 *
 * The existing actions use:
 * - `successToast(message)` which returns `redirect("?__success=message")`
 * - `errorToastIfFalsy/errorToastIfErr` which throw `redirect("?__error=message")`
 */
export async function wrapActionForApi(
	actionFn: ActionFunction,
	args: ActionFunctionArgs,
): Promise<Response> {
	try {
		const response = await actionFn(args);

		if (response instanceof Response && response.status === 302) {
			return new Response(null, { status: 200 });
		}

		return response as Response;
	} catch (e) {
		if (e instanceof Response && e.status === 302) {
			const location = e.headers.get("Location") ?? "";
			if (location.includes("__error=")) {
				const errorMsg = new URLSearchParams(location.replace("?", "")).get(
					"__error",
				);
				return new Response(JSON.stringify({ error: errorMsg }), {
					status: 400,
					headers: { "Content-Type": "application/json" },
				});
			}
		}

		throw e;
	}
}
