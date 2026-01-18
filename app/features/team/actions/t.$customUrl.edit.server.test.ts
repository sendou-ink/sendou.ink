import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	assertResponseErrored,
	dbInsertUsers,
	dbReset,
	wrappedAction,
} from "~/utils/Test";
import { action as teamIndexPageAction } from "../actions/t.server";
import type { createTeamSchema } from "../team-schemas";
import type { editTeamSchema } from "../team-schemas.server";
import { action as _editTeamProfileAction } from "./t.$customUrl.edit.server";

const createTeamAction = wrappedAction<typeof createTeamSchema>({
	action: teamIndexPageAction,
	isJsonSubmission: true,
});

const editTeamProfileAction = wrappedAction<typeof editTeamSchema>({
	action: _editTeamProfileAction,
	isJsonSubmission: true,
});

const DEFAULT_FIELDS = {
	_action: "EDIT",
	name: "Team 1",
	bio: "",
	bsky: "",
	tag: "",
} as const;

describe("team page editing", () => {
	beforeEach(async () => {
		await dbInsertUsers();
		await createTeamAction({ name: "Team 1" }, { user: "regular" });
	});
	afterEach(() => {
		dbReset();
	});

	it("adds valid custom theme", async () => {
		const response = await editTeamProfileAction(
			{
				customTheme: {
					baseHue: 180,
					baseChroma: 0.05,
					accentHue: 200,
					accentChroma: 0.1,
				},
				...DEFAULT_FIELDS,
			},
			{ user: "regular", params: { customUrl: "team-1" } },
		);

		expect(response.status).toBe(302);
	});

	it("allows null custom theme", async () => {
		const response = await editTeamProfileAction(
			{
				customTheme: null,
				...DEFAULT_FIELDS,
			},
			{ user: "regular", params: { customUrl: "team-1" } },
		);

		expect(response.status).toBe(302);
	});

	it("prevents adding custom theme with invalid values", async () => {
		const response = await editTeamProfileAction(
			{
				customTheme: {
					baseHue: 500, // Invalid: max is 360
					baseChroma: 0.05,
					accentHue: 200,
					accentChroma: 0.1,
				},
				...DEFAULT_FIELDS,
			},
			{ user: "regular", params: { customUrl: "team-1" } },
		);

		assertResponseErrored(response);
	});
});
