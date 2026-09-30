import type * as React from "react";
import { type FetcherWithComponents, useFetcher } from "react-router";
import {
	type ActionsOf,
	type FieldsOf,
	serializeFieldValue,
} from "~/utils/action-schemas";
import type { AnySchema } from "~/utils/schema";
import { SendouButton, type SendouButtonProps } from "./elements/Button";
import { FormWithConfirm } from "./FormWithConfirm";
import { SubmitButton } from "./SubmitButton";

interface ActionButtonBaseProps<
	TSchema extends AnySchema,
	TAction extends ActionsOf<TSchema>,
> extends Omit<SendouButtonProps, "type" | "name" | "value" | "form"> {
	/** Route's action schema, only used for typing `action` and `fields`. */
	schema: TSchema;
	action: TAction;
	/** Defaults to the current route. */
	formAction?: string;
	formClassName?: string;
	/** e.g. to share submitting state between buttons */
	fetcher?: FetcherWithComponents<unknown>;
	/** submits only after the user confirms via a dialog */
	confirm?: {
		dialogHeading: string;
		description?: React.ReactNode;
		submitButtonText?: string;
		submitButtonVariant?: SendouButtonProps["variant"];
	};
}

type ActionButtonProps<
	TSchema extends AnySchema,
	TAction extends ActionsOf<TSchema>,
> = ActionButtonBaseProps<TSchema, TAction> &
	// biome-ignore lint/complexity/noBannedTypes: {} models "branch with no extra fields"
	({} extends FieldsOf<TSchema, TAction>
		? { fields?: FieldsOf<TSchema, TAction> }
		: { fields: FieldsOf<TSchema, TAction> });

/**
 * Button that submits a mutation to a route action as `_action` + hidden fields,
 * type checked against the route's action schema.
 *
 * @example
 * <ActionButton
 *   schema={lookingSchema}
 *   action="LIKE"
 *   fields={{ targetGroupId: group.id }}
 * >
 *   {t("q:looking.groups.actions.invite")}
 * </ActionButton>
 */
export function ActionButton<
	TSchema extends AnySchema,
	const TAction extends ActionsOf<TSchema>,
>({
	schema,
	action,
	fields,
	formAction,
	formClassName,
	fetcher: fetcherFromProps,
	confirm,
	children,
	...buttonProps
}: ActionButtonProps<TSchema, TAction>) {
	const ownFetcher = useFetcher();
	const fetcher = fetcherFromProps ?? ownFetcher;

	const fieldEntries = Object.entries(
		(fields ?? {}) as Record<string, unknown>,
	).flatMap(([name, value]) =>
		value === undefined || value === null
			? []
			: ([[name, serializeFieldValue(value)]] as const),
	);

	if (confirm) {
		return (
			<FormWithConfirm
				dialogHeading={confirm.dialogHeading}
				description={confirm.description}
				submitButtonText={confirm.submitButtonText}
				submitButtonVariant={confirm.submitButtonVariant}
				action={formAction}
				fetcher={fetcherFromProps}
				fields={[["_action", action], ...fieldEntries]}
			>
				<SendouButton {...buttonProps}>{children}</SendouButton>
			</FormWithConfirm>
		);
	}

	return (
		<fetcher.Form method="post" action={formAction} className={formClassName}>
			{fieldEntries.map(([name, value]) => (
				<input type="hidden" key={name} name={name} value={value} />
			))}
			<SubmitButton
				schema={schema}
				_action={action}
				state={fetcher.state}
				{...buttonProps}
			>
				{children}
			</SubmitButton>
		</fetcher.Form>
	);
}
