import type { z } from "zod";
import { formDataToObject } from "~/utils/remix.server";

export type ParseResult<T> =
	| { success: true; data: T }
	| { success: false; fieldErrors: Record<string, string> };

/**
 * Parses request body against a Zod schema.
 * Handles both JSON (SendouForm) and form data (FormWithConfirm) based on Content-Type.
 * Returns parsed data on success, or field-level errors on validation failure.
 */
export async function parseFormData<T extends z.ZodTypeAny>({
	request,
	schema,
}: {
	request: Request;
	schema: T;
}): Promise<ParseResult<z.infer<T>>> {
	const data =
		request.headers.get("Content-Type") === "application/json"
			? await request.json()
			: formDataToObject(await request.formData());

	const result = await schema.safeParseAsync(data);

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
