import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	assertResponseErrored,
	dbInsertUsers,
	dbReset,
	wrappedAction,
} from "~/utils/Test";
import { action as teamIndexPageAction } from "../actions/t.server";
import type { createTeamSchema } from "../team-schemas.server";

const action = wrappedAction<typeof createTeamSchema>({
	action: teamIndexPageAction,
});

describe("team creation", () => {
	beforeEach(async () => {
		await dbInsertUsers();
	});
	afterEach(() => {
		dbReset();
	});

	it("prevents creating a team with a duplicate name", async () => {
		await action({ name: "Team 1" }, { user: "regular" });
		const res = await action({ name: "Team 1" }, { user: "regular" });

		expect(res.errors[0]).toBe("forms.errors.duplicateName");
	});

	it("prevents creating a team whose name is only special characters", async () => {
		const response = await action({ name: "𝓢𝓲𝓵" }, { user: "regular" });

		assertResponseErrored(response);
	});
});
