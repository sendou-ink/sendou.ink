import { describe, expect, test } from "vitest";
import { backdate } from "~/db/seed/core/backdate";
import {
	ALPHA_NAMES,
	BRAVO_NAMES,
	createUser,
	daysAgo,
	fetchIngestedMatches,
	ingest,
	scannedGame,
	sendouqWorld,
} from "~/features/scanner-ingest/tests/harness";
import { DeleteOldUnlinkedScannerMatchesRoutine } from "./deleteOldUnlinkedScannerMatches";

const GAME = {
	mode: "SZ",
	stage: 1,
	order: 0,
	winnerNames: ALPHA_NAMES,
	loserNames: BRAVO_NAMES,
} as const;

describe("DeleteOldUnlinkedScannerMatchesRoutine", () => {
	test("deletes old unlinked private and unread-lobby reads, keeping X battles, linked reads and recent ones", async () => {
		const w = await sendouqWorld();
		await w.conclude();
		await ingest(w.povUser, [w.scanned(w.maps[0]!, { replayCode: "LINKED" })]);
		const user = await createUser();
		await ingest(user, [
			scannedGame(GAME, { replayCode: "OLDPRIVATE", lobby: "PRIVATE" }),
			scannedGame(GAME, { replayCode: "OLDUNREAD", lobby: null }),
			scannedGame(GAME, { replayCode: "OLDXBATTLE", lobby: "X" }),
			scannedGame(GAME, { replayCode: "RECENTPRIV", lobby: "PRIVATE" }),
		]);
		for (const row of await fetchIngestedMatches()) {
			if (row.data.replayCode === "RECENTPRIV") continue;
			await backdate("IngestedMatch", row.id, { createdAt: daysAgo(31) });
		}

		await DeleteOldUnlinkedScannerMatchesRoutine.run();

		const remaining = (await fetchIngestedMatches()).map(
			(row) => row.data.replayCode,
		);
		expect(remaining).toEqual(["LINKED", "OLDXBATTLE", "RECENTPRIV"]);
	});
});
