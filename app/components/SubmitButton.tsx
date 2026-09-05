import { type FetcherWithComponents, useNavigation } from "react-router";
import type { ActionsOf } from "~/utils/action-schemas";
import type { AnySchema } from "~/utils/schema";
import { SendouButton, type SendouButtonProps } from "./elements/Button";

type SubmitButtonProps<TSchema extends AnySchema> = SendouButtonProps & {
	/** fetcher.state, to tell apart submitting state between multiple forms */
	state?: FetcherWithComponents<any>["state"];
	testId?: string;
} & (
		| {
				/** Route's action schema, only used for typing `_action`. */
				schema: TSchema;
				_action: ActionsOf<TSchema>;
		  }
		| { schema?: never; _action?: never }
	);

export function SubmitButton<TSchema extends AnySchema>({
	children,
	state,
	schema: _schema,
	_action,
	testId,
	...rest
}: SubmitButtonProps<TSchema>) {
	const navigation = useNavigation();

	const isSubmitting = state ? state !== "idle" : navigation.state !== "idle";

	const name = () => {
		if (rest.name) return rest.name;
		if (_action) return "_action";

		return undefined;
	};

	const value = () => {
		if (rest.value) return rest.value;
		if (_action) return _action;

		return undefined;
	};

	return (
		<SendouButton
			{...rest}
			isDisabled={rest.isDisabled || isSubmitting}
			type="submit"
			name={name()}
			value={value()}
			data-testid={testId ?? "submit-button"}
		>
			{children}
		</SendouButton>
	);
}
