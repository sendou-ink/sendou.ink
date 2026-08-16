import { beforeEach, describe, expect, test, vi } from "vitest";
import { REGULAR_USER_TEST_ID } from "~/db/seed/constants";
import * as TournamentOrganizationFactory from "~/db/seed/factories/TournamentOrganizationFactory";
import * as TrophyFactory from "~/db/seed/factories/TrophyFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { ADMIN_ID } from "~/features/admin/admin-constants";
import { decompressFromBase64 } from "~/utils/compression";
import { wrappedAction, wrappedLoader } from "~/utils/Test";
import { action } from "../actions/trophies.new.server";
import {
	loader,
	type NewTrophyLoaderData,
} from "../loaders/trophies.new.server";
import * as TrophyRepository from "../TrophyRepository.server";
import type { trophyFormSchema } from "../trophies-schemas";

// remove file once feature is released

vi.mock("~/features/trophies/trophies-constants", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("~/features/trophies/trophies-constants")
	>()),
	TROPHIES_RELEASED: false,
}));

const newTrophyLoader = wrappedLoader<NewTrophyLoaderData>({ loader });
const submitAction = wrappedAction<typeof trophyFormSchema>({
	action,
	isJsonSubmission: true,
});

describe("trophy submissions before release", () => {
	beforeEach(async () => {
		await UserFactory.createAdmin();
		await UserFactory.createRegular();
	});

	test("a regular user can open the submission page", async () => {
		const data = await newTrophyLoader({ user: "regular" });

		expect(data.canReview).toBe(false);
		expect(data.currentUserId).toBe(REGULAR_USER_TEST_ID);
	});

	test("a regular user can submit a trophy", async () => {
		const organization = await TournamentOrganizationFactory.create({
			ownerId: ADMIN_ID,
		});

		const result = await submitAction(
			{
				_action: "CREATE",
				name: "Regular Trophy",
				model: decompressFromBase64(TrophyFactory.MODELS[0]) ?? "",
				organizationId: organization.id,
				description: null,
			},
			{ user: "regular" },
		);

		expect(result).toBe(null);

		const pending =
			await TrophyRepository.pendingBySubmitter(REGULAR_USER_TEST_ID);
		expect(pending.length).toBe(1);
		expect(pending[0].name).toBe("Regular Trophy");
	});
});
