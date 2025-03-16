import { sql } from "~/db/sql";

const resetSeeds = sql.prepare(/*sql*/ `
  update "TournamentTeam"
    set "seed" = null
    where "tournamentId" = @tournamentId
`);

const updateSeedStm = sql.prepare(/*sql*/ `
  update "TournamentTeam"
    set "seed" = @seed
    where "id" = @teamId
`);

export const updateTeamSeeds = sql.transaction(
	({ tournamentId, teamIds }: { tournamentId: number; teamIds: number[] }) => {
		resetSeeds.run({ tournamentId });

		for (const [i, teamId] of teamIds.entries()) {
			updateSeedStm.run({
				teamId,
				seed: i + 1,
			});
		}
	},
);
