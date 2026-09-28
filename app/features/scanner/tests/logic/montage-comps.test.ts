import { describe, expect, test } from "vitest";
import { scannedTeamComps } from "../../components/montage-comps";
import type { MontageGame, MontageManifestVod } from "../../core/montage";

const vod: MontageManifestVod = {
	file: "1-streamer.mp4",
	matchId: 1,
	account: "streamer",
	team: { id: 10, name: "Own" },
	roundName: null,
	bracketName: null,
	teams: [
		{ id: 10, name: "Own", logo: null },
		{ id: 20, name: "Other", logo: null },
	],
	pov: null,
};

const lineup = (weaponIds: number[]) =>
	weaponIds.map((weaponId, i) => ({ name: `p${i}`, weaponId }));

function game(own: number[], opponent: number[] | null): MontageGame {
	return {
		kills: null,
		mode: null,
		stage: null,
		deaths: [],
		povWeaponId: own[0] ?? null,
		lineups: opponent ? { pov: lineup(own), opponent: lineup(opponent) } : null,
	} as MontageGame;
}

describe("scannedTeamComps", () => {
	test("the POV seat's side is the streamer's team, the other side their opponent", () => {
		const comps = scannedTeamComps(
			[vod],
			new Map([[vod.file, [game([40, 50, 2000, 3040], [10, 20, 30, 1000])]]]),
		);

		expect(comps.get(10)?.toSorted()).toEqual([2000, 3040, 40, 50].toSorted());
		expect(comps.get(20)?.toSorted()).toEqual([10, 1000, 20, 30].toSorted());
	});

	test("a team with fewer than four players seen has no comp", () => {
		const comps = scannedTeamComps(
			[vod],
			new Map([
				[vod.file, [game([40, 50], [10, 20, 30, 1000]), game([], null)]],
			]),
		);

		expect(comps.has(10)).toBe(false);
		expect(comps.has(20)).toBe(true);
	});
});
