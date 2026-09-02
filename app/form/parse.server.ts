import * as v from "valibot";
import { requireUser } from "~/features/auth/core/user.server";
import { imageFieldValueToImgId } from "~/features/img-upload/image-field.server";
import { formDataToObject } from "~/utils/remix.server";
import type { AnySchema } from "~/utils/schema";
import { formRegistry } from "./fields";
import type { ImageFieldValue } from "./image-field";
import { buildFieldPath, issuePathKeys } from "./utils";

export type ParseResult<T> =
	| { success: true; data: T }
	| { success: false; fieldErrors: Record<string, string> };

/** Fits a couple of `image()` fields (~3M base64 chars each) plus the rest; forms needing more (e.g. art) pass `maxBodyBytes`. */
const DEFAULT_MAX_BODY_BYTES = 8 * 1024 * 1024;

/** Errors keyed by field name (e.g. `members[0].userId`), first error per field. */
function fieldErrorsFromIssues(
	issues: v.BaseIssue<unknown>[],
): Record<string, string> {
	const fieldErrors: Record<string, string> = {};
	for (const issue of issues) {
		const path = buildFieldPath(issuePathKeys(issue));
		if (path && !fieldErrors[path]) {
			fieldErrors[path] = issue.message;
		}
	}

	return fieldErrors;
}

/** Parses a JSON (SendouForm) or form data (FormWithConfirm) body by Content-Type into data or field errors. */
export async function parseFormData<T extends AnySchema>({
	request,
	schema,
	maxBodyBytes = DEFAULT_MAX_BODY_BYTES,
}: {
	request: Request;
	schema: T;
	/** Overrides {@link DEFAULT_MAX_BODY_BYTES} for forms that legitimately submit a bigger body. */
	maxBodyBytes?: number;
}): Promise<ParseResult<v.InferOutput<T>>> {
	const data = await requestBodyToObject(request, maxBodyBytes);

	const result = await v.safeParseAsync(schema, data);

	if (result.success) {
		return { success: true, data: result.output };
	}

	return {
		success: false,
		fieldErrors: fieldErrorsFromIssues([...result.issues]),
	};
}

/** Image field values collapse to their stored id; everything else passes through. */
type ResolvedImages<T> = T extends unknown
	? { [K in keyof T]: T[K] extends ImageFieldValue ? number | null : T[K] }
	: never;

/**
 * {@link parseFormData} plus every `image()` field resolved to the image id for the FK column via
 * {@link imageFieldValueToImgId} (uploading new, keeping unchanged, clearing removed). The schema may be an
 * object or a union of objects (e.g. `_action` discriminated).
 */
export async function parseFormDataWithImages<T extends AnySchema>({
	request,
	schema,
}: {
	request: Request;
	schema: T;
}): Promise<ParseResult<ResolvedImages<v.InferOutput<T>>>> {
	const result = await parseFormData({ request, schema });
	if (!result.success) return result;

	const user = requireUser();
	const data = { ...(result.data as Record<string, unknown>) };

	for (const { key, autoValidate } of imageFields(schema)) {
		if (key in data) {
			data[key] = await imageFieldValueToImgId({
				value: data[key] as ImageFieldValue,
				user,
				autoValidate,
			});
		}
	}

	return { success: true, data: data as ResolvedImages<v.InferOutput<T>> };
}

/** Every `image()` field across an object or union/variant of objects, with its `autoValidate` flag. */
function imageFields(
	schema: AnySchema,
): Array<{ key: string; autoValidate: boolean }> {
	const objects =
		schema.type === "union" || schema.type === "variant"
			? ((schema as unknown as { options: AnySchema[] }).options.filter(
					(option) => option.type === "object",
				) as unknown as Array<{ entries: Record<string, AnySchema> }>)
			: schema.type === "object"
				? [schema as unknown as { entries: Record<string, AnySchema> }]
				: [];

	const fields = new Map<string, boolean>();
	for (const object of objects) {
		for (const [key, fieldSchema] of Object.entries(object.entries)) {
			const meta = formRegistry.get(fieldSchema);
			if (meta?.type === "image") {
				fields.set(key, meta.autoValidate ?? false);
			}
		}
	}

	return [...fields].map(([key, autoValidate]) => ({ key, autoValidate }));
}

/** Body → plain object, refusing over `maxBytes`. `Content-Length` is checked up front to reject before reading. */
async function requestBodyToObject(request: Request, maxBytes: number) {
	if (Number(request.headers.get("Content-Length")) > maxBytes) {
		throw payloadTooLarge();
	}

	if (request.headers.get("Content-Type") === "application/json") {
		return JSON.parse(await readBodyText(request, maxBytes));
	}

	return formDataToObject(await request.formData());
}

/** Aborts the stream past `maxBytes`, enforcing the running total so a chunked body understating `Content-Length` can't be buffered. */
async function readBodyText(request: Request, maxBytes: number) {
	const reader = request.body?.getReader();
	if (!reader) return "";

	const decoder = new TextDecoder();
	let bytesRead = 0;
	let text = "";

	let chunk = await reader.read();
	while (!chunk.done) {
		bytesRead += chunk.value.byteLength;
		if (bytesRead > maxBytes) {
			await reader.cancel();
			throw payloadTooLarge();
		}

		text += decoder.decode(chunk.value, { stream: true });
		chunk = await reader.read();
	}

	return text + decoder.decode();
}

function payloadTooLarge() {
	return new Response(null, { status: 413 });
}
