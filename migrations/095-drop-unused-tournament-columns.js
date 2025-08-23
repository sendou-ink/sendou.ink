export function up(db) {
	db.transaction(() => {
		const roundsWithNullMaps = db
			.prepare(
				/* sql */ `select "id" from "TournamentRound" where "maps" is null`,
			)
			.all()
			.map((row) => row.id);

		for (const roundId of roundsWithNullMaps) {
			const count = db
				.prepare(
					/* sql */ `select "bestOf" from "TournamentMatch" where "roundId" = @roundId`,
				)
				.get({ roundId }).bestOf;

			db.prepare(
				/* sql */ `update "TournamentRound" set "maps" = @maps where "id" = @id`,
			).run({
				id: roundId,
				maps: JSON.stringify({
					type: "BEST_OF",
					count,
				}),
			});
		}

		db.prepare(
			/* sql */ `alter table "TournamentMatch" drop column "bestOf"`,
		).run();
		db.prepare(
			/* sql */ `alter table "CalendarEvent" drop column "avatarMetadata"`,
		).run();
	})();
}
