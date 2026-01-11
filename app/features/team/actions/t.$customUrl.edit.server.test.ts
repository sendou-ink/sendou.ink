import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	assertResponseErrored,
	dbInsertUsers,
	dbReset,
	wrappedAction,
} from "~/utils/Test";
import { action as teamIndexPageAction } from "../actions/t.server";
import type { createTeamSchema, editTeamSchema } from "../team-schemas.server";
import { action as _editTeamProfileAction } from "./t.$customUrl.edit.server";

const createTeamAction = wrappedAction<typeof createTeamSchema>({
	action: teamIndexPageAction,
});

const editTeamProfileAction = wrappedAction<typeof editTeamSchema>({
	action: _editTeamProfileAction,
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

	it("adds valid custom css vars", async () => {
		const response = await editTeamProfileAction(
			{
				customTheme: {
					"--base-c": 210,
					"--base-h": 50,
					"--acc-c": 160,
					"--acc-h": 80,
				},
				...DEFAULT_FIELDS,
			},
			{ user: "regular", params: { customUrl: "team-1" } },
		);

		expect(response.status).toBe(302);
	});

	it("prevents adding custom css var of unknown property", async () => {
		const response = await editTeamProfileAction(
			{
				customTheme: Object.assign({
					"backdrop-filter": "#fff",
				}),
				...DEFAULT_FIELDS,
			},
			{ user: "regular", params: { customUrl: "team-1" } },
		);

		assertResponseErrored(response);
	});

	it("prevents adding custom css var of unknown value", async () => {
		const response = await editTeamProfileAction(
			{
				customTheme: Object.assign({
					"--base-c": "not-a-number",
				}),
				...DEFAULT_FIELDS,
			},
			{ user: "regular", params: { customUrl: "team-1" } },
		);

		assertResponseErrored(response);
	});
});
