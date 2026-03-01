import type { LoaderFunctionArgs } from "react-router";
import type { Pronouns } from "~/db/tables";
import { getUser } from "~/features/auth/core/user.server";
import { tournamentFromDBCached } from "~/features/tournament-bracket/core/Tournament.server";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/zod";
import type { LFGGroup, LFGGroupMember } from "../components/LFGGroupCard";
import * as TournamentLFGRepository from "../TournamentLFGRepository.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const user = getUser();
	const { id: tournamentId } = parseParams({ params, schema: idObject });

	const rawGroups =
		await TournamentLFGRepository.findLookingTeamsByTournamentId(tournamentId);

	const groups: LFGGroup[] = rawGroups.map((group) => {
		const members = transformMembers(group.members);

		return {
			id: group.id,
			isPlaceholder: Boolean(group.isPlaceholder),
			teamName: group.isPlaceholder ? null : (group.teamName ?? null),
			teamAvatarUrl: group.isPlaceholder ? null : (group.teamAvatarUrl ?? null),
			note: group.note ?? null,
			members,
			usersRole: members.find((m) => m.id === user?.id)?.role ?? null,
		};
	});

	const ownGroup =
		groups.find((g) => g.members.some((m) => m.id === user?.id)) ?? null;

	const otherGroups = groups.filter((g) => g.id !== ownGroup?.id);

	const likes = ownGroup
		? await TournamentLFGRepository.allLikesByTeamId(ownGroup.id)
		: { given: [], received: [] };

	const ownTeam = await resolveOwnTeam({
		user,
		tournamentId,
		ownGroup,
	});

	return {
		groups: otherGroups,
		ownGroup,
		ownTeam,
		likes,
		lastUpdated: Date.now(),
		tournamentId,
	};
};

async function resolveOwnTeam({
	user,
	tournamentId,
	ownGroup,
}: {
	user: ReturnType<typeof getUser>;
	tournamentId: number;
	ownGroup: LFGGroup | null;
}): Promise<LFGGroup | null> {
	if (!user) return null;
	if (ownGroup) return null;

	const tournament = await tournamentFromDBCached({
		tournamentId,
		user,
	});

	const team = tournament.teamMemberOfByUser(user);
	if (!team) return null;

	const members: LFGGroupMember[] = team.members.map((m) => ({
		id: m.userId,
		username: m.username,
		discordId: m.discordId,
		discordAvatar: m.discordAvatar,
		customUrl: m.customUrl,
		languages: [],
		vc: null,
		pronouns: null,
		role: m.isOwner ? "OWNER" : "REGULAR",
		isStayAsSub: false,
		weapons: null,
		chatNameColor: null,
		plusTier: m.plusTier,
	}));

	return {
		id: team.id,
		isPlaceholder: false,
		teamName: team.name,
		teamAvatarUrl: team.pickupAvatarUrl,
		note: null,
		members,
		usersRole: members.find((m) => m.id === user.id)?.role ?? null,
	};
}

function transformMembers(
	rawMembers: Awaited<
		ReturnType<typeof TournamentLFGRepository.findLookingTeamsByTournamentId>
	>[number]["members"],
): LFGGroupMember[] {
	return rawMembers.map((m) => {
		const languages =
			typeof m.languages === "string"
				? m.languages.split(",").filter(Boolean)
				: [];

		const weapons = parseWeapons(m.weapons);
		const pronouns = parsePronouns(m.pronouns);

		return {
			id: m.id,
			username: m.username,
			discordId: m.discordId,
			discordAvatar: m.discordAvatar,
			customUrl: m.customUrl,
			languages,
			vc: m.vc,
			pronouns,
			role: m.role,
			isStayAsSub: m.isStayAsSub === 1,
			weapons,
			chatNameColor: m.chatNameColor,
			plusTier: m.plusTier,
		};
	});
}

function parseWeapons(
	raw: unknown,
): Array<{ weaponSplId: MainWeaponId; isFavorite: boolean }> | null {
	if (!raw) return null;

	const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
	if (!Array.isArray(parsed) || parsed.length === 0) return null;

	return parsed.map(
		(w: { weaponSplId: MainWeaponId; isFavorite: number | boolean }) => ({
			weaponSplId: w.weaponSplId,
			isFavorite: Boolean(w.isFavorite),
		}),
	);
}

function parsePronouns(raw: unknown): Pronouns | null {
	if (!raw) return null;

	const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
	if (!parsed || typeof parsed !== "object") return null;

	return parsed as Pronouns;
}
