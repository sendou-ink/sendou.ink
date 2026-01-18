import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dbInsertUsers, dbReset, wrappedAction } from "~/utils/Test";
import { action as teamIndexPageAction } from "../actions/t.server";
import type { createTeamSchema } from "../team-schemas";

const action = wrappedAction<typeof createTeamSchema>({
	action: teamIndexPageAction,
	isJsonSubmission: true,
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

		expect(res.fieldErrors.name).toBe("forms:errors.duplicateName");
	});

	it("prevents creating a team whose name is only special characters", async () => {
		const res = await action({ name: "𝓢𝓲𝓵" }, { user: "regular" });

		expect(res.fieldErrors.name).toBe("forms:errors.noOnlySpecialCharacters");
	});
});
