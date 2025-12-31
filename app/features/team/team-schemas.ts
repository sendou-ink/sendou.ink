import { z } from "zod";
import { textFieldRequired } from "~/form/fields";
import { mySlugify } from "~/utils/urls";
import { TEAM } from "./team-constants";

export const createTeamSchema = z.object({
	name: textFieldRequired({
		label: "labels.name",
		minLength: TEAM.NAME_MIN_LENGTH,
		maxLength: TEAM.NAME_MAX_LENGTH,
		validate: {
			func: (teamName) =>
				mySlugify(teamName).length > 0 && mySlugify(teamName) !== "new",
			// xxx: i18n
			message: "forms:errors.noOnlySpecialCharacters",
		},
	}),
});
