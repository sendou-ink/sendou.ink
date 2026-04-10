import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { REGULAR_USER_TEST_ID } from "~/db/seed/constants";
import { db } from "~/db/sql";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import { clampThemeToGamut } from "~/utils/oklch-gamut";
import {
	assertResponseErrored,
	dbInsertUsers,
	dbReset,
	wrappedAction,
} from "~/utils/Test";
import { action as teamIndexPageAction } from "../actions/t.new.server";
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

const DEFAULT_EDIT_FIELDS = {
	_action: "EDIT",
	name: "Team 1",
	bio: "",
	bsky: "",
	tag: "",
} as const;

const VALID_CUSTOM_THEME = {
	baseHue: 180,
	baseChroma: 0.05,
	accentHue: 200,
	accentChroma: 0.1,
	chatHue: null,
	radiusBox: 3,
	radiusField: 2,
	radiusSelector: 2,
	borderWidth: 2,
	sizeField: 1,
	sizeSelector: 1,
	sizeSpacing: 1,
} as const;

const expectedStoredTheme = () =>
	JSON.parse(JSON.stringify(clampThemeToGamut(VALID_CUSTOM_THEME)));

const makeUserPatron = () =>
	db
		.updateTable("User")
		.set({ patronTier: 2 })
		.where("id", "=", REGULAR_USER_TEST_ID)
		.execute();

describe("team page editing", () => {
	beforeEach(async () => {
		await dbInsertUsers();
		await createTeamAction({ name: "Team 1" }, { user: "regular" });
	});
	afterEach(() => {
		dbReset();
	});

	it("sets a custom theme via UPDATE_CUSTOM_THEME", async () => {
		await makeUserPatron();

		const response = await editTeamProfileAction(
			{
				_action: "UPDATE_CUSTOM_THEME",
				newValue: VALID_CUSTOM_THEME,
			},
			{ user: "regular", params: { customUrl: "team-1" } },
		);

		expect(response).toEqual({ ok: true });

		const team = await TeamRepository.findByCustomUrl("team-1");
		expect(team?.customTheme).toEqual(expectedStoredTheme());
	});

	it("clears a custom theme via UPDATE_CUSTOM_THEME with null", async () => {
		await makeUserPatron();

		await editTeamProfileAction(
			{
				_action: "UPDATE_CUSTOM_THEME",
				newValue: VALID_CUSTOM_THEME,
			},
			{ user: "regular", params: { customUrl: "team-1" } },
		);

		const response = await editTeamProfileAction(
			{
				_action: "UPDATE_CUSTOM_THEME",
				newValue: null,
			},
			{ user: "regular", params: { customUrl: "team-1" } },
		);

		expect(response).toEqual({ ok: true });

		const team = await TeamRepository.findByCustomUrl("team-1");
		expect(team?.customTheme).toBeNull();
	});

	it("prevents setting an invalid custom theme", async () => {
		await makeUserPatron();

		const response = await editTeamProfileAction(
			{
				_action: "UPDATE_CUSTOM_THEME",
				newValue: {
					...VALID_CUSTOM_THEME,
					baseHue: 500, // Invalid: max is 360
				},
			},
			{ user: "regular", params: { customUrl: "team-1" } },
		);

		assertResponseErrored(response);
	});

	it("preserves an existing custom theme when editing the team profile", async () => {
		await makeUserPatron();

		await editTeamProfileAction(
			{
				_action: "UPDATE_CUSTOM_THEME",
				newValue: VALID_CUSTOM_THEME,
			},
			{ user: "regular", params: { customUrl: "team-1" } },
		);

		const response = await editTeamProfileAction(
			{ ...DEFAULT_EDIT_FIELDS, bio: "Updated bio" },
			{ user: "regular", params: { customUrl: "team-1" } },
		);

		expect(response.status).toBe(302);

		const team = await TeamRepository.findByCustomUrl("team-1");
		expect(team?.customTheme).toEqual(expectedStoredTheme());
		expect(team?.bio).toBe("Updated bio");
	});
});
