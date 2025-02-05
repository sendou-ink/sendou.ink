import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dbInsertUsers, dbReset, wrappedAction } from "~/utils/Test";
import { action as teamIndexPageAction } from "../actions/t.server";
import type { editTeamSchema } from "../team-schemas.server";
import type { createTeamSchema } from "../team-schemas.server";
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
				css: JSON.stringify({ bg: "#fff" }),
				...DEFAULT_FIELDS,
			},
			{ user: "regular", params: { customUrl: "team-1" } },
		);

		expect(response.status).toBe(302);
	});

	it("prevents adding custom css var of unknown property", async () => {
		await expect(
			editTeamProfileAction(
				{
					css: JSON.stringify({
						"backdrop-filter": "#fff",
					}),
					...DEFAULT_FIELDS,
				},
				{ user: "regular", params: { customUrl: "team-1" } },
			),
		).rejects.toThrow("status code: 400");
	});

	it("prevents adding custom css var of unknown value", async () => {
		await expect(
			editTeamProfileAction(
				{
					css: JSON.stringify({
						bg: "url(https://sendou.ink/u?q=1&_data=features%2Fuser-search%2Froutes%2Fu)",
					}),
					...DEFAULT_FIELDS,
				},
				{ user: "regular", params: { customUrl: "team-1" } },
			),
		).rejects.toThrow("status code: 400");
	});
});
