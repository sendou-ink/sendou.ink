import type { z } from "zod/v4";
import * as BadgeRepository from "~/features/badges/BadgeRepository.server";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import * as TournamentOrganizationRepository from "~/features/tournament-organization/TournamentOrganizationRepository.server";
import * as UserRepository from "~/features/user-page/UserRepository.server";
import type { Widget } from "./types";

export const ALL_WIDGETS = [
	// xxx: schema for bio
	{
		id: "bio",
		category: "misc",
		slot: "main",
		load: async (userId: number) => {
			return (await UserRepository.findProfileByIdentifier(String(userId)))
				?.bio;
		},
	},
	{
		id: "badges-owned",
		category: "badges",
		slot: "main",
		load: async (userId: number) => {
			return BadgeRepository.findByOwnerUserId(userId);
		},
	},
	{
		id: "teams",
		category: "teams",
		slot: "side",
		load: async (userId: number) => {
			return TeamRepository.findAllMemberOfByUserId(userId);
		},
	},
	{
		id: "organizations",
		category: "misc",
		slot: "side",
		load: async (userId: number) => {
			return TournamentOrganizationRepository.findByUserId(userId);
		},
	},
] as const satisfies Array<Widget<unknown, z.ZodTypeAny>>;
