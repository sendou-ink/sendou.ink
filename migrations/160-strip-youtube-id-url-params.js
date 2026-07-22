export function up(db) {
	db.transaction(() => {
		for (const delimiter of ["?", "&", "#"]) {
			db.prepare(
				/* sql */ `
					update "UnvalidatedVideo"
						set "youtubeId" = substr("youtubeId", 1, instr("youtubeId", ?) - 1)
						where instr("youtubeId", ?) > 0
				`,
			).run(delimiter, delimiter);
		}
	})();
}
