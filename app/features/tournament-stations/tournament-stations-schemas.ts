import * as v from "valibot";
import {
	array,
	fieldset,
	idConstantOptional,
	selectDynamicOptional,
	textField,
	textFieldOptional,
	toggle,
} from "~/form/fields";
import { superRefine } from "~/utils/schema";
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
					castAccount: selectDynamicOptional({
						label: "labels.stationCastAccount",
						bottomText: "bottomTexts.stationCastAccount",
					}),
				}),
			}),
		}),
	}),
	superRefine((data, ctx) => {
		const seenNames = new Set<string>();
		const seenCastAccounts = new Set<string>();

		for (const [index, station] of data.stations.entries()) {
			const name = station.name.toLowerCase();
			if (seenNames.has(name)) {
				ctx.addIssue({
					message: "forms:errors.stationNameNotUnique",
					path: ["stations", index, "name"],
				});
			}
			seenNames.add(name);

			if (!station.castAccount) continue;
			if (seenCastAccounts.has(station.castAccount)) {
				ctx.addIssue({
					message: "forms:errors.stationCastAccountNotUnique",
					path: ["stations", index, "castAccount"],
				});
			}
			seenCastAccounts.add(station.castAccount);
		}
	}),
);
