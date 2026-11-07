import { useMapPoolQuickFill } from "~/components/MapPoolPicker";
import { FormField } from "~/form/FormField";
import { useFormFieldContext } from "~/form/SendouForm";

/** The maps select, with the tournament search or the map pool picker when the maps come from one. */
export function LobbyMapsFormFields() {
	return (
		<>
			<FormField name="maps" />
			<MapsSourceFormField />
		</>
	);
}

function MapsSourceFormField() {
	const { values } = useFormFieldContext();
	const quickFill = useMapPoolQuickFill();

	if (values.maps === "TOURNAMENT") {
		return <FormField name="mapsTournamentId" />;
	}
	if (values.maps === "CUSTOM") {
		return <FormField name="mapPool" options={{ quickFill }} />;
	}

	return null;
}
