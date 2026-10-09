import type * as v from "valibot";
import { requireUser } from "~/features/auth/core/user.server";
import { imageFieldValueToImgId } from "~/features/img-upload/image-field.server";
import { badRequest, formDataToObject } from "~/utils/remix.server";
import type { AnySchema } from "~/utils/schema";
import { formRegistry } from "./fields";
import type { ImageFieldValue } from "./image-field";
import {
	buildFieldPath,
	issuePathKeys,
	RENDERS_FIELD_ERRORS_KEY,
} from "./utils";

/** Fits a couple of `image()` fields (~3M base64 chars each) plus the rest; forms needing more (e.g. art) pass `maxBodyBytes`. */
export const DEFAULT_MAX_BODY_BYTES = 8 * 1024 * 1024;

/** Errors keyed by field name (e.g. `members[0].userId`), first error per field. */
export function fieldErrorsFromIssues(
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

/** Image field values collapse to their stored id; everything else passes through. */
export type ResolvedImages<T> = T extends unknown
	? { [K in keyof T]: T[K] extends ImageFieldValue ? number | null : T[K] }
	: never;

/**
 * Every `image()` field of the parsed `data` resolved to the image id for the FK column via
 * {@link imageFieldValueToImgId} (uploading new, keeping unchanged, clearing removed). The schema may be an
 * object or a union of objects (e.g. `_action` discriminated).
 *
 * A kept (`EXISTING`) image must be the user's own upload unless `isCurrentImgId` says the edited
 * entity already holds it; forms that only ever keep the user's own images can leave it out.
 */
export async function resolveImageFields<T extends AnySchema>({
	schema,
	data,
	isCurrentImgId,
}: {
	schema: T;
	data: v.InferOutput<T>;
	isCurrentImgId?: (imgId: number) => boolean | Promise<boolean>;
}): Promise<ResolvedImages<v.InferOutput<T>>> {
	const user = requireUser();
	const resolved = { ...(data as Record<string, unknown>) };

	for (const { key, autoValidate } of imageFields(schema)) {
		if (key in resolved) {
			resolved[key] = await imageFieldValueToImgId({
				value: resolved[key] as ImageFieldValue,
				user,
				autoValidate,
				isCurrentImgId,
			});
		}
	}

	return resolved as ResolvedImages<v.InferOutput<T>>;
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

/**
 * Body → plain object, refusing over `maxBytes`. `Content-Length` is checked up front to reject before reading.
 * Form data by `Content-Type`, anything else is read as JSON (`fetch` sends a string body as `text/plain`) and
 * an empty body as an empty object. The {@link RENDERS_FIELD_ERRORS_KEY} marker is split off from the data.
 */
export async function requestBodyToObject(
	request: Request,
	maxBytes: number,
): Promise<{ data: unknown; rendersFieldErrors: boolean }> {
	if (Number(request.headers.get("Content-Length")) > maxBytes) {
		throw payloadTooLarge();
	}

	const body = await readBody(request, maxBytes);

	if (!body || typeof body !== "object" || Array.isArray(body)) {
		return { data: body, rendersFieldErrors: false };
	}

	const { [RENDERS_FIELD_ERRORS_KEY]: marker, ...data } = body as Record<
		string,
		unknown
	>;

	return { data, rendersFieldErrors: marker === true || marker === "true" };
}

async function readBody(request: Request, maxBytes: number): Promise<unknown> {
	if (request.headers.get("Content-Type")?.includes("form")) {
		return formDataToObject(await request.formData());
	}

	const text = await readBodyText(request, maxBytes);
	if (!text) return {};

	try {
		return JSON.parse(text);
	} catch {
		badRequest();
	}
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
