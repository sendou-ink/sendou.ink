import { sql } from "~/db/sql";
import type { Tables, UserWithPlusTier } from "~/db/tables";
import type { MainWeaponId } from "~/modules/in-game-lists";

const stm = sql.prepare(/* sql */ `
  select
  "TournamentSub"."canVc",
  "TournamentSub"."bestWeapons",
  "TournamentSub"."okWeapons",
  "TournamentSub"."message",
  "TournamentSub"."visibility",
  "TournamentSub"."createdAt",
  "TournamentSub"."userId",
  "User"."username",
  "User"."discordAvatar",
  "User"."country",
  "User"."discordId",
  "User"."customUrl",
  "PlusTier"."tier" as "plusTier"
  from "TournamentSub"
  left join "User" on "User"."id" = "TournamentSub"."userId"
  left join "PlusTier" on "PlusTier"."userId" = "User"."id"
  where "TournamentSub"."tournamentId" = @tournamentId
  order by 
    "TournamentSub"."userId" = @userId desc,
    case
      when "plusTier" is null then 4
      else "plusTier"
    end asc, 
    "TournamentSub"."createdAt" desc
`);

export interface SubByTournamentId {
	canVc: Tables["TournamentSub"]["canVc"];
	bestWeapons: MainWeaponId[];
	okWeapons: MainWeaponId[] | null;
	message: Tables["TournamentSub"]["message"];
	visibility: Tables["TournamentSub"]["visibility"];
	createdAt: Tables["TournamentSub"]["createdAt"];
	userId: Tables["TournamentSub"]["userId"];
	username: UserWithPlusTier["username"];
	discordAvatar: UserWithPlusTier["discordAvatar"];
	discordId: UserWithPlusTier["discordId"];
	customUrl: UserWithPlusTier["customUrl"];
	country: UserWithPlusTier["country"];
	plusTier: UserWithPlusTier["plusTier"];
}

const parseWeaponsArray = (value: string | null) => {
	if (!value) return null;

	return value.split(",").map(Number);
};
export function findSubsByTournamentId({
	tournamentId,
	userId,
}: {
	tournamentId: number;
	userId?: number;
}): SubByTournamentId[] {
	const rows = stm.all({ tournamentId, userId: userId ?? null }) as any[];

	return rows.map((row) => ({
		...row,
		bestWeapons: parseWeaponsArray(row.bestWeapons),
		okWeapons: parseWeaponsArray(row.okWeapons),
	}));
}
