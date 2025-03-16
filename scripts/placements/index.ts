import "dotenv/config";

import { sql } from "~/db/sql";
import type { XRankPlacement } from "~/db/types";
import { syncXPBadges } from "~/features/badges/queries/syncXPBadges.server";
import { type MainWeaponId, mainWeaponIds } from "~/modules/in-game-lists";
import invariant from "~/utils/invariant";
import { logger } from "~/utils/logger";
import { xRankSchema } from "./schemas";

const rawJsonNumber = process.argv[2]?.trim();
invariant(rawJsonNumber, "jsonNumber is required (argument 1)");
const jsonNumber = Number(rawJsonNumber);
invariant(Number.isInteger(jsonNumber), "jsonNumber must be an integer (argument 1)");

type Placements = Array<Omit<XRankPlacement, "playerId" | "id"> & { playerSplId: string }>;

const modes = ["splatzones", "towercontrol", "rainmaker", "clamblitz"] as const;
const modeToShort = {
	splatzones: "SZ",
	towercontrol: "TC",
	rainmaker: "RM",
	clamblitz: "CB",
} as const;
const regions = ["a", "p"] as const;

void main();

async function main() {
	const placements: Placements = [];

	wipeMonthYearPlacements(resolveMonthYear(jsonNumber));
	for (const mode of modes) {
		for (const region of regions) {
			for (const includeWeapon of [false]) {
				placements.push(
					...(await processJson({
						includeWeapon,
						mode,
						region,
						number: jsonNumber,
					})),
				);
			}
		}
	}

	addPlacements(placements);
	syncXPBadges();
	logger.info(`done reading in ${placements.length} placements`);
}

async function processJson(args: {
	mode: (typeof modes)[number];
	region: (typeof regions)[number];
	includeWeapon: boolean;
	number: number;
}) {
	const result: Placements = [];

	const url = `https://splatoon3.ink/data/xrank/xrank.detail.${args.region}-${
		args.number
	}.${args.mode}${args.includeWeapon ? ".weapons" : ""}.json`;

	logger.info(`reading in ${url}...`);

	const json = await fetch(url).then((res) => res.json());
	const validated = xRankSchema.parse(json);

	const array =
		validated.data.node.xRankingAr ??
		validated.data.node.xRankingCl ??
		validated.data.node.xRankingLf ??
		validated.data.node.xRankingGl;
	invariant(array, "array is null");

	for (const { node: placement } of array.edges) {
		const weaponId = Number(atob(placement.weapon.id).replace("Weapon-", ""));
		if (!mainWeaponIds.includes(weaponId as MainWeaponId)) {
			throw new Error(`Invalid weapon ID: ${weaponId}`);
		}

		const { month, year } = resolveMonthYear(args.number);

		result.push({
			name: placement.name,
			badges: placement.nameplate.badges
				.map((badge) => (badge ? atob(badge.id).replace("Badge-", "") : "null"))
				.join(","),
			bannerSplId: Number(
				atob(placement.nameplate.background.id).replace("NameplateBackground-", ""),
			),
			nameDiscriminator: placement.nameId,
			power: placement.xPower,
			rank: placement.rank,
			region: args.region === "p" ? "JPN" : "WEST",
			title: placement.byname,
			weaponSplId: weaponId as MainWeaponId,
			month,
			year,
			mode: modeToShort[args.mode],
			playerSplId: parsePlayerId(placement.id),
		});
	}

	return result;
}

function parsePlayerId(encoded: string) {
	const parts = atob(encoded).split("-");
	const last = parts[parts.length - 1];
	invariant(last, "last is null");

	return last;
}

function resolveMonthYear(number: number) {
	const start = new Date("2023-03-15");
	// 2 is the first X Rank month
	// 3 is the length of x rank season
	const monthsToAdd = (number - 2) * 3;

	start.setMonth(start.getMonth() + monthsToAdd);

	return {
		month: start.getMonth() + 1,
		year: start.getFullYear(),
	};
}

const addPlayerStm = sql.prepare(/* sql */ `
  insert into "SplatoonPlayer" ("splId")
  values (@splId)
  on conflict ("splId") do nothing
`);

const addPlacementStm = sql.prepare(/* sql */ `
  insert into "XRankPlacement" (
    "weaponSplId",
    "name",
    "nameDiscriminator",
    "power",
    "rank",
    "title",
    "badges",
    "bannerSplId",
    "playerId",
    "month",
    "year",
    "region",
    "mode"
  )
  values (
    @weaponSplId,
    @name,
    @nameDiscriminator,
    @power,
    @rank,
    @title,
    @badges,
    @bannerSplId,
    (select "id" from "SplatoonPlayer" where "splId" = @playerSplId),
    @month,
    @year,
    @region,
    @mode
  )
`);

function addPlacements(placements: Placements) {
	sql.transaction(() => {
		for (const placement of placements) {
			addPlayerStm.run({ splId: placement.playerSplId });
			addPlacementStm.run(placement);
		}
	})();
}

function wipeMonthYearPlacements({ month, year }: { month: number; year: number }) {
	const wipeMonthYearPlacementsStm = sql.prepare(/* sql */ `
  delete from "XRankPlacement"
    where "month" = @month
    and "year" = @year
`);

	wipeMonthYearPlacementsStm.run({ month, year });
}
