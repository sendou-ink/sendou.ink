// usage: pnpm exec tsx ./scripts/unlock-league-matches.ts <parentTournamentId>
import "dotenv/config";
import { sql } from "~/db/sql";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";

const parentTournamentId = Number(process.argv[2]?.trim());
invariant(
	parentTournamentId && !Number.isNaN(parentTournamentId),
	"parent tournament id is required (argument 1)",
);

const divisions = sql
	.prepare(
		'SELECT id FROM "Tournament" WHERE parentTournamentId = @parentTournamentId',
	)
	.all({ parentTournamentId }) as { id: number }[];

invariant(
	divisions.length > 0,
	`No divisions found for tournament ${parentTournamentId}`,
);
logger.info(`Found ${divisions.length} divisions`);

const updateMatch = sql.prepare(
	'UPDATE "TournamentMatch" SET status = 2 WHERE id = @id',
);

const unlockAll = sql.transaction(() => {
	let totalUnlocked = 0;

	for (const division of divisions) {
		const stages = sql
			.prepare(
				'SELECT id FROM "TournamentStage" WHERE tournamentId = @tournamentId',
			)
			.all({ tournamentId: division.id }) as { id: number }[];

		if (stages.length === 0) continue;
		const stageIds = stages.map((s) => s.id);

		const lockedMatches = sql
			.prepare(
				`SELECT id, opponentOne, opponentTwo FROM "TournamentMatch"
         WHERE stageId IN (${stageIds.map(() => "?").join(",")})
         AND status = 0`,
			)
			.all(...stageIds) as {
			id: number;
			opponentOne: string;
			opponentTwo: string;
		}[];

		let divUnlocked = 0;
		for (const match of lockedMatches) {
			const o1 = JSON.parse(match.opponentOne);
			const o2 = JSON.parse(match.opponentTwo);
			if (o1?.id == null || o2?.id == null) continue;
			updateMatch.run({ id: match.id });
			divUnlocked++;
		}

		logger.info(`Division ${division.id}: unlocked ${divUnlocked} match(es)`);
		totalUnlocked += divUnlocked;
	}

	logger.info(`Total unlocked: ${totalUnlocked} match(es)`);
});

unlockAll();
