import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dbInsertUsers, dbReset, wrappedAction } from "~/utils/Test";
import { action as teamIndexPageAction } from "../actions/t.new.server";
import { action as _editTeamAction } from "../routes/t.$customUrl.edit";
import type { createTeamSchema, editTeamFormSchema } from "../team-schemas";

const createTeamAction = wrappedAction<typeof createTeamSchema>({
	action: teamIndexPageAction,
	isJsonSubmission: true,
});

const editTeamAction = wrappedAction<typeof editTeamFormSchema>({
	action: _editTeamAction,
	isJsonSubmission: true,
});

const DEFAULT_FIELDS = {
	tag: null,
	bsky: null,
	bio: null,
	logo: null,
	banner: null,
} as any;

describe("team creation", () => {
	beforeEach(async () => {
		await dbInsertUsers();
	});
	afterEach(() => {
		dbReset();
	});

	it("can't take another team's name via editing", async () => {
		await createTeamAction({ name: "Team 1" }, { user: "regular" });
		await createTeamAction({ name: "Team 2" }, { user: "regular" });

		const res = await editTeamAction(
			{
				_action: "EDIT",
				name: "Team 2",
				...DEFAULT_FIELDS,
			},
			{ user: "regular", params: { customUrl: "team-1" } },
		);

		expect(res.fieldErrors.name).toBe("forms:errors.duplicateName");
	});

	it("prevents editing team name to only special characters", async () => {
		await createTeamAction({ name: "Team 1" }, { user: "regular" });

		const res = await editTeamAction(
			{
				_action: "EDIT",
				name: "𝓢𝓲𝓵",
				...DEFAULT_FIELDS,
			},
			{ user: "regular", params: { customUrl: "team-1" } },
		);

		expect(res.fieldErrors.name).toBe("forms:errors.noOnlySpecialCharacters");
	});
});
