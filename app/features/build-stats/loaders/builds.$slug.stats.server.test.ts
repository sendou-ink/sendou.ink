import { beforeEach, describe, expect, test, vi } from "vitest";
import * as BuildFactory from "~/db/seed/factories/BuildFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import type {
	BuildAbilitiesTuple,
	MainWeaponId,
} from "~/modules/in-game-lists/types";
import type { SerializeFrom } from "~/utils/remix";
import { wrappedLoader } from "~/utils/Test";
import { loader } from "./builds.$slug.stats.server";

vi.mock("~/modules/i18n/i18next.server", () => ({
	getServerTFunction: () => (key: string) => key,
}));

const SPLATTERSHOT: MainWeaponId = 40;
const SPLATTERSHOT_JR: MainWeaponId = 10;

const ABILITY_DOUBLER_ABILITIES: BuildAbilitiesTuple = [
	["ISM", "ISM", "ISM", "ISM"],
	["AD", "SSU", "SSU", "SSU"],
	["SJ", "ISM", "ISM", "ISM"],
];

const buildStatsLoader = wrappedLoader<SerializeFrom<typeof loader>>({
	loader,
});

const users = UserFactory.pool();

describe("build stats loader", () => {
	beforeEach(async () => {
		await users.create(2);
	});

	test("counts an Ability Doubler build as one build", async () => {
		await BuildFactory.create({
			ownerId: users.id(1),
			weaponSplIds: [SPLATTERSHOT],
			abilities: ABILITY_DOUBLER_ABILITIES,
		});
		await BuildFactory.create({
			ownerId: users.id(2),
			weaponSplIds: [SPLATTERSHOT_JR],
		});

		const data = await buildStatsLoader({
			params: { slug: "splattershot" },
		});

		expect(data.stats.weaponBuildsCount).toBe(1);
	});
});
