import type { z } from "zod";
import { formDataToObject } from "~/utils/remix.server";

export type ParseResult<T> =
	| { success: true; data: T }
	| { success: false; fieldErrors: Record<string, string> };

// xxx: replacing existing..? or not
export async function parseFormData<T extends z.ZodTypeAny>({
	request,
	schema,
}: {
	request: Request;
	schema: T;
}): Promise<ParseResult<z.infer<T>>> {
	const formDataObj =
		request.headers.get("Content-Type") === "application/json"
			? await request.json()
			: formDataToObject(await request.formData());

	const result = await schema.safeParseAsync(formDataObj);

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
