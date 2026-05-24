import { FormField } from "~/form/FormField";
import { SendouForm, useFormFieldContext } from "~/form/SendouForm";
import { submitMapListFormSchema } from "../scrims-schemas";

export function ScrimMapListForm() {
	return (
		<div data-testid="scrim-map-list-form">
			<SendouForm
				schema={submitMapListFormSchema}
				submitButtonTestId="submit-map-list-button"
				fullWidth
			>
				{() => (
					<>
						<FormField name="source" />
						<SourceDependentFields />
					</>
				)}
			</SendouForm>
		</div>
	);
}

function SourceDependentFields() {
	const { values } = useFormFieldContext();
	const source = values.source as "POOL" | "TOURNAMENT";

	return source === "POOL" ? (
		<FormField name="serializedPool" />
	) : (
		<FormField name="tournamentId" />
	);
}
