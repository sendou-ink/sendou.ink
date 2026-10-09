import type { ActionFunctionArgs, Params } from "react-router";
import * as v from "valibot";
import { logger } from "~/utils/logger";
import {
	badRequest,
	errorToastRedirect,
	parseParams,
} from "~/utils/remix.server";
import type { AnySchema, AnySyncSchema } from "~/utils/schema";
import {
	DEFAULT_MAX_BODY_BYTES,
	fieldErrorsFromIssues,
	type ResolvedImages,
	requestBodyToObject,
	resolveImageFields,
} from "./parse.server";

type FieldErrors = Record<string, string>;

type ResolveImagesOptions = {
	isCurrentImgId?: (imgId: number) => boolean | Promise<boolean>;
};

type BodySchemaFactory<TParams extends AnySyncSchema | undefined> = (
	args: DefinedActionArgs<TParams, undefined>,
) => AnySchema | Promise<AnySchema>;

type BodySchemaOf<TBody> = TBody extends (...args: any[]) => infer TSchema
	? Awaited<TSchema>
	: TBody;

type ActionInputs<TParams extends AnySyncSchema | undefined, TBody> = {
	params?: TParams;
	body?: TBody;
	/** Overrides the default body size limit for forms that legitimately submit a bigger body. */
	maxBodyBytes?: number;
	/** `"badRequest"` for endpoints called outside of route navigation (`fetch`, external API clients), which can't show a toast. Defaults to `"errorToast"`. */
	onInvalidBody?: "errorToast" | "badRequest";
};

type DefinedAction<TBody, TResult> = (
	args: ActionFunctionArgs,
) => Promise<
	undefined extends TBody ? TResult : TResult | { fieldErrors: FieldErrors }
>;

type DefinedActionArgs<TParams extends AnySyncSchema | undefined, TBody> = Omit<
	ActionFunctionArgs,
	"params"
> & {
	params: TParams extends AnySyncSchema
		? v.InferOutput<TParams>
		: Params<string>;
} & (BodySchemaOf<TBody> extends AnySchema
		? {
				body: v.InferOutput<BodySchemaOf<TBody>>;
				/** Uploads/resolves the body's `image()` fields to stored ids, call after authorization. See `resolveImageFields`. */
				resolveImages: (
					opts?: ResolveImagesOptions,
				) => Promise<ResolvedImages<v.InferOutput<BodySchemaOf<TBody>>>>;
			}
		: // biome-ignore lint/complexity/noBannedTypes: {} models "no body"
			{});

/**
 * Route action with its inputs parsed before `handler` runs. Params failing their schema throw a 404.
 * A body failing its schema returns `{ fieldErrors }` when the submitter renders them (SendouForm, see
 * `RENDERS_FIELD_ERRORS_KEY`), otherwise throws per `onInvalidBody`. A body schema that depends on the request
 * (e.g. the tournament) is given as a function of the parsed params.
 *
 * Without inputs to parse, the handler is the only argument.
 *
 * @example
 * export const action = defineAction(
 * 	{ params: idObject, body: scrimIdActionSchema },
 * 	async ({ params, body }) => { ... },
 * );
 */
export function defineAction<
	TResult,
	// no default (omitted body = the whole constraint): a default would be fixed before a body factory is contextually typed
	TBody extends AnySchema | BodySchemaFactory<TParams> | undefined,
	TParams extends AnySyncSchema | undefined = undefined,
>(
	inputs: ActionInputs<TParams, TBody>,
	handler: (args: DefinedActionArgs<TParams, TBody>) => Promise<TResult>,
): DefinedAction<TBody, TResult>;
export function defineAction<TResult>(
	handler: (args: DefinedActionArgs<undefined, undefined>) => Promise<TResult>,
): DefinedAction<undefined, TResult>;
export function defineAction(
	inputsOrHandler: ActionInputs<any, any> | ((args: never) => Promise<unknown>),
	handlerIfInputs?: (args: never) => Promise<unknown>,
) {
	const inputs: ActionInputs<any, any> =
		typeof inputsOrHandler === "function" ? {} : inputsOrHandler;
	const run = (
		typeof inputsOrHandler === "function" ? inputsOrHandler : handlerIfInputs
	) as (args: object) => Promise<unknown>;

	const action = async (args: ActionFunctionArgs) => {
		const params = inputs.params
			? parseParams({ params: args.params, schema: inputs.params })
			: args.params;

		if (!inputs.body) {
			return run({ ...args, params });
		}

		const bodySchema: AnySchema =
			typeof inputs.body === "function"
				? await inputs.body({ ...args, params } as never)
				: inputs.body;

		const { data, rendersFieldErrors } = await requestBodyToObject(
			args.request,
			inputs.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
		);
		const parsed = await v.safeParseAsync(bodySchema, data);

		if (!parsed.success) {
			if (rendersFieldErrors) {
				return { fieldErrors: fieldErrorsFromIssues([...parsed.issues]) };
			}

			logger.error("Invalid action body", v.flatten(parsed.issues));
			if (inputs.onInvalidBody === "badRequest") badRequest();

			throw errorToastRedirect("Validation failed");
		}

		const body = parsed.output;

		return run({
			...args,
			params,
			body,
			resolveImages: (opts?: ResolveImagesOptions) =>
				resolveImageFields({
					schema: bodySchema,
					data: body,
					isCurrentImgId: opts?.isCurrentImgId,
				}),
		});
	};

	return action;
}
