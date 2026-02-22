import type { LoaderFunctionArgs } from "react-router";
import type { Pronouns } from "~/db/tables";
import { getUser } from "~/features/auth/core/user.server";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { parseParams } from "~/utils/remix.server";
import { idObject } from "~/utils/zod";
import type { LFGGroup, LFGGroupMember } from "../components/LFGGroupCard";
import * as TournamentLFGRepository from "../TournamentLFGRepository.server";

export const loader = async ({ params }: LoaderFunctionArgs) => {
	const user = getUser();
	const { id: tournamentId } = parseParams({ params, schema: idObject });

	const rawGroups =
		await TournamentLFGRepository.findGroupsByTournamentId(tournamentId);

	const groups: LFGGroup[] = rawGroups.map((group) => {
		const members = transformMembers(group.members);

		return {
			id: group.id,
			tournamentTeamId: group.tournamentTeamId,
			teamName: group.teamName ?? null,
			teamAvatarUrl: group.teamAvatarUrl ?? null,
			members,
			usersRole: members.find((m) => m.id === user?.id)?.role ?? null,
		};
	});

	const ownGroup =
		groups.find((g) => g.members.some((m) => m.id === user?.id)) ?? null;

	const otherGroups = groups.filter((g) => g.id !== ownGroup?.id);

	const likes = ownGroup
		? await TournamentLFGRepository.allLikesByGroupId(ownGroup.id)
		: { given: [], received: [] };

	return {
		groups: otherGroups,
		ownGroup,
		likes,
		lastUpdated: Date.now(),
		tournamentId,
	};
};

function transformMembers(
	rawMembers: Awaited<
		ReturnType<typeof TournamentLFGRepository.findGroupsByTournamentId>
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
			note: m.note,
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
