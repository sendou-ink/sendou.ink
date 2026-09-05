import { beforeEach, describe, expect, test } from "vitest";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { pinClockInsideSeason } from "~/features/sendouq/tests/season-clock";
import type { StoredWidget } from "~/features/user-page/core/widgets/types";
import * as PlusVotingRepository from "./PlusVotingRepository.server";

const PLUS_TIER = 1;

const users = UserFactory.pool();

const voterId = () => users.id(1);
const votedOnId = () => users.id(2);

describe("PlusVotingRepository.findAllUsersForVoting", () => {
	pinClockInsideSeason();

	beforeEach(async () => {
		await users.create(2, null, { plusTier: PLUS_TIER });
	});

	const bioOf = async (widgets: StoredWidget[]) => {
		await UserFactory.grant(votedOnId(), { widgets });

		const usersForVoting = await PlusVotingRepository.findAllUsersForVoting({
			id: voterId(),
			plusTier: PLUS_TIER,
		});

		return (
			usersForVoting.find(({ user }) => user.id === votedOnId())?.user.bio ??
			null
		);
	};

	test("returns the text of the bio widget", async () => {
		const bio = await bioOf([{ id: "bio", settings: { bio: "gg" } }]);

		expect(bio).toEqual({ text: "gg", markdown: false });
	});

	test("marks the text of the markdown bio widget as markdown", async () => {
		const bio = await bioOf([{ id: "bio-md", settings: { bio: "**gg**" } }]);

		expect(bio).toEqual({ text: "**gg**", markdown: true });
	});

	test("returns the bio widget higher up the profile when there are two", async () => {
		const bio = await bioOf([
			{ id: "bio-md", settings: { bio: "**gg**" } },
			{ id: "bio", settings: { bio: "gg" } },
		]);

		expect(bio).toEqual({ text: "**gg**", markdown: true });
	});

	test("returns no bio for a user without a bio widget", async () => {
		const bio = await bioOf([{ id: "weapon-pool" }]);

		expect(bio).toBeNull();
	});

	test("returns no bio for an empty bio widget", async () => {
		const bio = await bioOf([{ id: "bio", settings: { bio: "" } }]);

		expect(bio).toBeNull();
	});

	// the voting page renders the bio as a React child; an object there would error the page
	test("keeps a JSON-object-shaped bio a string", async () => {
		const bio = await bioOf([
			{ id: "bio", settings: { bio: '{"note":"gg"}' } },
		]);

		expect(bio).toEqual({ text: '{"note":"gg"}', markdown: false });
		expect(typeof bio?.text).toBe("string");
	});
});
