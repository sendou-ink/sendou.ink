import * as v from "valibot";
import {
	array,
	fieldset,
	idConstantOptional,
	textField,
	textFieldOptional,
	toggle,
} from "~/form/fields";
import { _action, coerceNumber, id, superRefine } from "~/utils/schema";
import { TOURNAMENT_STATIONS } from "./tournament-stations-constants";

export const stationsFormSchema = v.pipe(
	v.object({
		autoAssign: toggle({
			label: "labels.autoAssignStations",
			initialValue: true,
		}),
		stations: array({
			label: "labels.stations",
			bottomText: "bottomTexts.stations",
			max: TOURNAMENT_STATIONS.MAX_COUNT,
			sortable: true,
			field: fieldset({
				fields: v.object({
					stationId: idConstantOptional(),
					name: textField({
						label: "labels.stationName",
						placeholder: "placeholders.stationName",
						maxLength: TOURNAMENT_STATIONS.NAME_MAX_LENGTH,
					}),
					locationNote: textFieldOptional({
						label: "labels.stationLocationNote",
						placeholder: "placeholders.stationLocationNote",
						maxLength: TOURNAMENT_STATIONS.LOCATION_NOTE_MAX_LENGTH,
					}),
				}),
			}),
		}),
	}),
	superRefine((data, ctx) => {
		const seenNames = new Set<string>();

		for (const [index, station] of data.stations.entries()) {
			const name = station.name.toLowerCase();
			if (seenNames.has(name)) {
				ctx.addIssue({
					message: "forms:errors.stationNameNotUnique",
					path: ["stations", index, "name"],
				});
			}
			seenNames.add(name);
		}
	}),
);

export const stationsBoardActionSchema = v.object({
	_action: _action("MOVE_MATCH"),
	matchId: id,
	/** Omitted = back to the Waiting lane. */
	stationId: v.optional(id),
	/** Position in the station's queue of unfinished matches, 0 first. */
	index: v.pipe(coerceNumber(), v.integer(), v.minValue(0)),
});
