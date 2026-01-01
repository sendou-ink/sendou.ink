import * as React from "react";
import { FormMessage } from "~/components/FormMessage";
import { Label } from "~/components/Label";
import { MapPoolSelector } from "~/components/MapPoolSelector";
import { MapPool } from "~/features/map-list-generator/core/map-pool";
import type {
	MapPoolObject,
	ReadonlyMapPoolObject,
} from "~/features/map-list-generator/core/map-pool-serializer/types";
import type { ModeShort } from "~/modules/in-game-lists/types";
import type { FormFieldProps } from "../types";

type MapPoolFormFieldProps = Omit<
	FormFieldProps<"map-pool">,
	"modes" | "name"
> & {
	modes?: ModeShort[];
	value: MapPoolObject;
	onChange: (value: ReadonlyMapPoolObject) => void;
};

export function MapPoolFormField({
	label,
	bottomText,
	error,
	modes,
	value,
	onChange,
}: MapPoolFormFieldProps) {
	const id = React.useId();

	const mapPool = new MapPool(value as ReadonlyMapPoolObject);

	const handleMapPoolChange = (newMapPool: MapPool) => {
		onChange(newMapPool.parsed);
	};

	return (
		<div className="stack xs">
			{label ? <Label htmlFor={id}>{label}</Label> : null}
			<MapPoolSelector
				mapPool={mapPool}
				handleMapPoolChange={handleMapPoolChange}
				modesToInclude={modes}
			/>
			{error ? <FormMessage type="error">{error}</FormMessage> : null}
			{bottomText && !error ? (
				<FormMessage type="info">{bottomText}</FormMessage>
			) : null}
		</div>
	);
}
