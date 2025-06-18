import { z } from "zod/v4";
import { TOURNAMENT_ORGANIZATION_ROLES } from "~/db/tables";
import { TOURNAMENT_ORGANIZATION } from "~/features/tournament-organization/tournament-organization-constants";
import { mySlugify } from "~/utils/urls";
import {
	_action,
	falsyToNull,
	id,
	safeNullableStringSchema,
} from "~/utils/zod";

export const organizationEditSchema = z.object({
	name: z
		.string()
		.trim()
		.min(2)
		.max(64)
		.refine((val) => mySlugify(val).length >= 2, {
			message: "Not enough non-special characters",
		}),
	description: z.preprocess(
		falsyToNull,
		z
			.string()
			.trim()
			.max(TOURNAMENT_ORGANIZATION.DESCRIPTION_MAX_LENGTH)
			.nullable(),
	),
	members: z
		.array(
			z.object({
				userId: z.number().int().positive(),
				role: z.enum(TOURNAMENT_ORGANIZATION_ROLES),
				roleDisplayName: z.preprocess(
					falsyToNull,
					z.string().trim().max(32).nullable(),
				),
			}),
		)
		.max(32)
		.refine(
			(arr) =>
				arr.map((x) => x.userId).length ===
				new Set(arr.map((x) => x.userId)).size,
			{
				message: "Same member listed twice",
			},
		),
	socials: z
		.array(
			z.object({
				value: z.string().trim().url().max(100).optional().or(z.literal("")),
			}),
		)
		.max(10)
		.refine(
			(arr) =>
				arr.map((x) => x.value).length ===
				new Set(arr.map((x) => x.value)).size,
			{
				message: "Duplicate social links",
			},
		),
	series: z
		.array(
			z.object({
				name: z.string().trim().min(1).max(32),
				description: z.preprocess(
					falsyToNull,
					z
						.string()
						.trim()
						.max(TOURNAMENT_ORGANIZATION.DESCRIPTION_MAX_LENGTH)
						.nullable(),
				),
				showLeaderboard: z.boolean(),
			}),
		)
		.max(10)
		.refine(
			(arr) =>
				arr.map((x) => x.name).length === new Set(arr.map((x) => x.name)).size,
			{
				message: "Duplicate series",
			},
		),
	badges: z.array(id).max(50),
});

export const banUserActionSchema = z.object({
	_action: _action("BAN_USER"),
	userId: id,
	privateNote: safeNullableStringSchema({
		max: TOURNAMENT_ORGANIZATION.BAN_REASON_MAX_LENGTH,
	}),
});

export const unbanUserActionSchema = z.object({
	_action: _action("UNBAN_USER"),
	userId: id,
});

export const orgPageActionSchema = z.union([
	banUserActionSchema,
	unbanUserActionSchema,
]);
