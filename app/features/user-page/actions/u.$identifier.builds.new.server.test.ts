import type * as v from "valibot";
import { beforeEach, describe, expect, test } from "vitest";
import { REGULAR_USER_TEST_ID } from "~/db/seed/constants";
import * as BuildFactory from "~/db/seed/factories/BuildFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as BuildRepository from "~/features/builds/BuildRepository.server";
import { BUILD } from "~/features/builds/builds-constants";
import type { MainWeaponId } from "~/modules/in-game-lists/types";
import { wrappedAction } from "~/utils/Test";
import type { newBuildSchemaServer } from "../user-page-schemas.server";
import { action } from "./u.$identifier.builds.new.server";

const newBuildAction = wrappedAction<typeof newBuildSchemaServer>({
	action,
	isJsonSubmission: true,
});

const buildFields: v.InferOutput<typeof newBuildSchemaServer> = {
	weapons: [{ id: 0 as MainWeaponId, isFavorite: false }],
	head: null,
	clothes: null,
	shoes: null,
	abilities: [
		["ISM", "ISM", "ISM", "ISM"],
		["ISM", "ISM", "ISM", "ISM"],
		["ISM", "ISM", "ISM", "ISM"],
	],
	title: "My build",
	description: null,
	modes: [],
	isPrivate: false,
};

describe("new build action", () => {
	beforeEach(async () => {
		await UserFactory.createRegular();
	});

	test("saves a build", async () => {
		const response = await newBuildAction(buildFields, { user: "regular" });

		expect(response.status).toBe(302);
		expect(await buildCount()).toBe(1);
	});

	test("returns an error instead of saving a build past the limit", async () => {
		await BuildFactory.createMany(BUILD.MAX_COUNT, {
			ownerId: REGULAR_USER_TEST_ID,
		});

		const response = await newBuildAction(buildFields, { user: "regular" });

		expect(response).toEqual({
			fieldErrors: { title: "builds:reachBuildMaxCount" },
		});
		expect(await buildCount()).toBe(BUILD.MAX_COUNT);
	});
});

async function buildCount() {
	const { total } = await BuildRepository.countsByUserId(REGULAR_USER_TEST_ID, {
		showPrivate: true,
	});

	return total;
}
