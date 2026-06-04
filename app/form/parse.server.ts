import { z } from "zod";
import { requireUser } from "~/features/auth/core/user.server";
import { imageFieldValueToImgId } from "~/features/img-upload/image-field.server";
import { formDataToObject } from "~/utils/remix.server";
import { formRegistry } from "./fields";
import type { ImageFieldValue } from "./image-field";

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

/** Image field values collapse to their stored id; everything else passes through. */
type ResolvedImages<T> = T extends unknown
	? { [K in keyof T]: T[K] extends ImageFieldValue ? number | null : T[K] }
	: never;

/**
 * Like {@link parseFormData}, but additionally resolves every `image()` field in the schema to the
 * image id to store on the consuming FK column (`number | null`) via {@link imageFieldValueToImgId}
 * — uploading newly picked images, keeping unchanged ones, and clearing removed ones. The schema
 * may be a single object or a union of objects (e.g. an `_action` discriminated form). The
 * consuming action receives a plain id per image field and only writes it to its own entity.
 */
export async function parseFormDataWithImages<T extends z.ZodTypeAny>({
	request,
	schema,
}: {
	request: Request;
	schema: T;
}): Promise<ParseResult<ResolvedImages<z.infer<T>>>> {
	const result = await parseFormData({ request, schema });
	if (!result.success) return result;

	const user = requireUser();
	const data = { ...(result.data as Record<string, unknown>) };

	for (const key of imageFieldKeys(schema)) {
		if (key in data) {
			data[key] = await imageFieldValueToImgId({
				value: data[key] as ImageFieldValue,
				user,
			});
		}
	}

	return { success: true, data: data as ResolvedImages<z.infer<T>> };
}

/** Collects the keys of every `image()` field across a schema object or union of objects. */
function imageFieldKeys(schema: z.ZodTypeAny): string[] {
	const objects =
		schema instanceof z.ZodUnion
			? (schema.options as z.ZodObject<z.ZodRawShape>[])
			: schema instanceof z.ZodObject
				? [schema]
				: [];

	const keys = new Set<string>();
	for (const object of objects) {
		for (const [key, fieldSchema] of Object.entries(object.shape)) {
			const meta = formRegistry.get(fieldSchema);
			if (meta?.type === "image") keys.add(key);
		}
	}

	return [...keys];
}
