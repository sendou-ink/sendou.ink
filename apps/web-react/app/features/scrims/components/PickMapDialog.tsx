import { SendouDialog } from "~/components/elements/Dialog";
import { SendouForm } from "~/form/SendouForm";
import { pickMapFormSchema } from "../scrims-schemas";

export function PickMapDialog({
	trigger,
	heading,
}: {
	trigger: React.ReactNode;
	heading: string;
}) {
	return (
		<SendouDialog heading={heading} trigger={trigger}>
			<SendouForm schema={pickMapFormSchema} defaultValues={{ mode: "SZ" }}>
				{({ FormField }) => (
					<>
						<FormField name="mode" />
						<FormField name="stageId" />
					</>
				)}
			</SendouForm>
		</SendouDialog>
	);
}
