import type { LoaderFunctionArgs } from "react-router";
import type { Pronouns } from "~/db/tables";
import { getUser } from "~/features/auth/core/user.server";
import { tournamentFromDBCached } from "~/features/tournament-bracket/core/Tournament.server";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import type { SerializeFrom } from "~/utils/remix";
import { parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/zod";
import type { LFGGroup, LFGGroupMember } from "../components/LFGGroupCard";
import * as TournamentLFGRepository from "../TournamentLFGRepository.server";

export type SubEntry = Extract<
	LookingLoaderData,
	{ mode: "subs" }
>["subs"][number];

export type LookingLoaderData = SerializeFrom<typeof loader>;

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const user = getUser();
	const { id: tournamentId } = parseParams({ params, schema: idObject });

	const tournament = await tournamentFromDBCached({
		tournamentId,
		user,
	});

	if (!tournament.lfgEnabled) {
		throw new Response(null, { status: 404 });
	}

	if (tournament.isLeagueSignup && !tournament.registrationOpen) {
		throw new Response(null, { status: 404 });
	}

	if (tournament.registrationOpen) {
		return lookingMode({ tournamentId, user });
	}

	return subsMode({ tournamentId, user });
};

async function lookingMode({
	tournamentId,
	user,
}: {
	tournamentId: number;
	user: ReturnType<typeof getUser>;
}) {
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
		mode: "looking" as const,
		groups: otherGroups,
		ownGroup,
		ownTeam,
		likes,
		tournamentId,
	};
}

async function subsMode({
	tournamentId,
	user,
}: {
	tournamentId: number;
	user: ReturnType<typeof getUser>;
}) {
	const rawSubGroups =
		await TournamentLFGRepository.findSubGroups(tournamentId);

	const subs = rawSubGroups.map((group) => {
		const member = group.members[0];
		const weapons = parseWeapons(member.weapons);

		const languages =
			typeof member.languages === "string"
				? member.languages.split(",").filter(Boolean)
				: [];

		return {
			teamId: group.id,
			userId: member.id,
			username: member.username,
			discordId: member.discordId,
			discordAvatar: member.discordAvatar,
			customUrl: member.customUrl,
			vc: member.vc,
			languages,
			plusTier: member.plusTier,
			weapons,
			message: group.message ?? null,
		};
	});

	return {
		mode: "subs" as const,
		subs,
		hasOwnSubPost: subs.some((sub) => sub.userId === user?.id),
		tournamentId,
	};
}

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
		role: m.role,
		isStayAsSub: false,
		weapons: null,
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
