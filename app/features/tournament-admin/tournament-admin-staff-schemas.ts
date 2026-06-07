import { z } from "zod";
import { TOURNAMENT_STAFF_ROLES } from "~/db/tables";
import {
	array,
	fieldset,
	select,
	textFieldRequired,
	userSearch,
} from "~/form/fields";

export const adminStreamFormSchema = z.object({
	castTwitchAccounts: array({
		label: "labels.castTwitchAccounts",
		bottomText: "bottomTexts.castTwitchAccounts",
		max: 5,
		field: textFieldRequired({
			maxLength: 100,
			placeholder: "placeholders.castTwitchAccounts",
		}),
	}),
});

export const adminStaffFormSchema = z
	.object({
		staff: array({
			label: "labels.staff",
			bottomText: "bottomTexts.staffRolesInfo",
			max: 50,
			field: fieldset({
				fields: z.object({
					userId: userSearch({ label: "labels.user" }),
					role: select({
						label: "labels.staffRole",
						items: TOURNAMENT_STAFF_ROLES.map((role) => ({
							value: role,
							label: `options.staffRole.${role}` as const,
						})),
					}),
				}),
			}),
		}),
	})
	.superRefine((data, ctx) => {
		const userIds = data.staff.map((staffer) => staffer.userId);
		if (userIds.length !== new Set(userIds).size) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "forms:errors.usersMustBeUnique",
				path: ["staff"],
			});
		}
	});
