import type { z } from "zod";

export type ParseResult<T> =
	| { success: true; data: T }
	| { success: false; fieldErrors: Record<string, string> };

/**
 * Parses JSON request body against a Zod schema.
 * Returns parsed data on success, or field-level errors on validation failure.
 * Intended for use with SendouForm which always submits JSON.
 */
export async function parseFormData<T extends z.ZodTypeAny>({
	request,
	schema,
}: {
	request: Request;
	schema: T;
}): Promise<ParseResult<z.infer<T>>> {
	const json = await request.json();

	const result = await schema.safeParseAsync(json);

	if (result.success) {
		return { success: true, data: result.data };
	}

	const fieldErrors: Record<string, string> = {};
	for (const issue of result.error.issues) {
		const path = issue.path.join(".");
		if (path && !fieldErrors[path]) {
			fieldErrors[path] = issue.message;
		}
	}

	return { success: false, fieldErrors };
}
