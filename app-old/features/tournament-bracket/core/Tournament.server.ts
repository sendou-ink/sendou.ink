import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import { HACKY_resolvePicture } from "~/features/tournament/tournament-utils";
import type { TournamentManagerDataSet } from "~/modules/brackets-manager/types";
import { isAdmin } from "~/permissions";
import { notFoundIfFalsy } from "~/utils/remix.server";
import type { Unwrapped } from "~/utils/types";
import { Tournament } from "./Tournament";
import { getServerTournamentManager } from "./brackets-manager/manager.server";

const manager = getServerTournamentManager();

export const tournamentManagerData = (tournamentId: number) =>
	manager.get.tournamentData(tournamentId);

const combinedTournamentData = async (tournamentId: number) => {
	const ctx = await TournamentRepository.findById(tournamentId);
	if (!ctx) return null;

	return {
		data: tournamentManagerData(tournamentId),
		ctx,
	};
};

export type TournamentData = NonNullable<Unwrapped<typeof tournamentData>>;
export type TournamentDataTeam = TournamentData["ctx"]["teams"][number];
export async function tournamentData({
	user,
	tournamentId,
}: {
	user?: { id: number };
	tournamentId: number;
}) {
	const data = await combinedTournamentData(tournamentId);
	if (!data) return null;

	return dataMapped({ user, ...data });
}

function dataMapped({
	data,
	ctx,
	user,
}: {
	data: TournamentManagerDataSet;
	ctx: TournamentRepository.FindById;
	user?: { id: number };
}) {
	const tournamentHasStarted = data.stage.length > 0;
	const isOrganizer =
		ctx.author.id === user?.id ||
		ctx.staff.some(
			(staff) => staff.id === user?.id && staff.role === "ORGANIZER",
		) ||
		isAdmin(user);
	const logoIsFromStaticAssets = ctx.logoSrc.includes("static-assets");
	const revealInfo = tournamentHasStarted || isOrganizer;

	const defaultLogo = HACKY_resolvePicture({ name: "default" });

	return {
		data,
		ctx: {
			...ctx,
			logoSrc:
				isOrganizer || ctx.logoValidatedAt || logoIsFromStaticAssets
					? ctx.logoSrc
					: defaultLogo,
			teams: ctx.teams.map((team) => {
				const isOwnTeam = team.members.some(
					(member) => member.userId === user?.id,
				);

				return {
					...team,
					mapPool: revealInfo || isOwnTeam ? team.mapPool : null,
					pickupAvatarUrl:
						revealInfo || isOwnTeam ? team.pickupAvatarUrl : null,
					inviteCode: isOwnTeam ? team.inviteCode : null,
				};
			}),
		},
	};
}

export async function tournamentFromDB(args: {
	user: { id: number } | undefined;
	tournamentId: number;
}) {
	const data = notFoundIfFalsy(await tournamentData(args));

	return new Tournament({ ...data, simulateBrackets: false });
}

export async function tournamentFromDBCached(args: {
	user: { id: number } | undefined;
	tournamentId: number;
}) {
	const data = notFoundIfFalsy(await tournamentDataCached(args));

	return new Tournament({ ...data, simulateBrackets: false });
}

// caching promise ensures that if many requests are made for the same tournament
// at the same time they reuse the same resolving promise
const tournamentDataCache = new Map<
	number,
	ReturnType<typeof combinedTournamentData>
>();
export async function tournamentDataCached({
	user,
	tournamentId,
}: {
	user?: { id: number };
	tournamentId: number;
}) {
	if (!tournamentDataCache.has(tournamentId)) {
		tournamentDataCache.set(tournamentId, combinedTournamentData(tournamentId));
	}

	const data = notFoundIfFalsy(await tournamentDataCache.get(tournamentId));

	return dataMapped({ user, ...data });
}

export function clearTournamentDataCache(tournamentId: number) {
	tournamentDataCache.delete(tournamentId);
}

export function clearAllTournamentDataCache() {
	tournamentDataCache.clear();
}
