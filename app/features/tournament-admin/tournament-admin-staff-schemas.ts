import * as v from "valibot";
import * as StreamAccountInput from "~/features/live-streams/core/StreamAccountInput";
import {
	TOURNAMENT_STAFF_ROLES,
	type TournamentStaffRole,
} from "~/features/tournament/tournament-constants";
import { array, fieldset, select, textField, userSearch } from "~/form/fields";
import { superRefine } from "~/utils/schema";

export const adminStreamFormSchema = v.object({
	castAccounts: array({
		label: "labels.castAccounts",
		bottomText: "bottomTexts.castAccounts",
		max: 5,
		field: textField({
			maxLength: 200,
			placeholder: "placeholders.castAccounts",
			validate: {
				func: (value) => StreamAccountInput.parse(value) !== null,
				message: "forms:errors.invalidStreamAccount",
			},
		}),
	}),
});

const LAN_ONLY_STAFF_ROLES: ReadonlyArray<TournamentStaffRole> = [
	"POOL_CAPTAIN",
];

const onlineStaffFormSchema = staffFormSchema({
	roles: TOURNAMENT_STAFF_ROLES.filter(
		(role) => !LAN_ONLY_STAFF_ROLES.includes(role),
	),
	bottomText: "bottomTexts.staffRolesInfo",
});

const lanStaffFormSchema = staffFormSchema({
	roles: TOURNAMENT_STAFF_ROLES,
	bottomText: "bottomTexts.staffRolesInfoLan",
});

/** The staff form of the tournament, LAN only roles (pool captain) offered for LANs only. */
export function adminStaffFormSchema({ isLan }: { isLan: boolean }) {
	return isLan ? lanStaffFormSchema : onlineStaffFormSchema;
}

function staffFormSchema({
	roles,
	bottomText,
}: {
	roles: ReadonlyArray<TournamentStaffRole>;
	bottomText: "bottomTexts.staffRolesInfo" | "bottomTexts.staffRolesInfoLan";
}) {
	return v.pipe(
		v.object({
			staff: array({
				bottomText,
				max: 50,
				field: fieldset({
					fields: v.object({
						userId: userSearch({ label: "labels.user" }),
						role: select({
							label: "labels.staffRole",
							items: roles.map((role) => ({
								value: role,
								label: `options.staffRole.${role}` as const,
							})),
						}),
					}),
				}),
			}),
		}),
		superRefine((data, ctx) => {
			// XXX: check whether a user should be allowed to be both Streamer and Pool captain (one role per user for now)
			const userIds = data.staff.map((staffer) => staffer.userId);
			if (userIds.length !== new Set(userIds).size) {
				ctx.addIssue({
					message: "forms:errors.usersMustBeUnique",
					path: ["staff"],
				});
			}
		}),
	);
}
