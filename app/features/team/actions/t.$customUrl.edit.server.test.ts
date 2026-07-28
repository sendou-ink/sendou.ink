import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { REGULAR_USER_TEST_ID } from "~/db/seed/constants";
import * as ImageFactory from "~/db/seed/factories/ImageFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as ImageRepository from "~/features/img-upload/ImageRepository.server";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import invariant from "~/utils/invariant";
import { clampThemeToGamut } from "~/utils/oklch-gamut";
import { dbReset, wrappedAction } from "~/utils/Test";
import { action as teamIndexPageAction } from "../actions/t.new.server";
import type { createTeamSchema } from "../team-schemas";
import type { editTeamActionSchema } from "../team-schemas.server";
import { action as _editTeamProfileAction } from "./t.$customUrl.edit.server";

const createTeamAction = wrappedAction<typeof createTeamSchema>({
	action: teamIndexPageAction,
	isJsonSubmission: true,
});

const editTeamProfileAction = wrappedAction<typeof editTeamActionSchema>({
	action: _editTeamProfileAction,
	isJsonSubmission: true,
});

const DEFAULT_EDIT_FIELDS = {
	_action: "EDIT",
	name: "Team 1",
	bio: "",
	bsky: "",
	tag: "",
	logo: null,
	banner: null,
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

describe("team page editing", () => {
	beforeEach(async () => {
		// a patron because setting a custom theme is a patron only feature
		await UserFactory.createRegular(null, { patronTier: 2 });
		await createTeamAction({ name: "Team 1" }, { user: "regular" });
	});
	afterEach(async () => {
		await dbReset();
	});

	it("sets a custom theme via UPDATE_CUSTOM_THEME", async () => {
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

		expect(response.fieldErrors["newValue.baseHue"]).toBeTruthy();
	});

	it("preserves an existing custom theme when editing the team profile", async () => {
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

	const addTeamAvatar = async () => {
		const team = await TeamRepository.findByCustomUrl("team-1");
		invariant(team, "No team with the custom url team-1");

		const image = await ImageFactory.create({
			submitterUserId: REGULAR_USER_TEST_ID,
		});

		await TeamRepository.update({
			id: team.id,
			name: team.name,
			bio: team.bio,
			bsky: team.bsky,
			tag: team.tag,
			avatarImgId: image.id,
			bannerImgId: team.bannerImgId,
		});

		return image.id;
	};

	const imageExists = async (id: number) =>
		Boolean(await ImageRepository.findById(id));

	it("deletes the submitted image row when an image is removed while editing", async () => {
		const imageId = await addTeamAvatar();

		await editTeamProfileAction(
			{ ...DEFAULT_EDIT_FIELDS },
			{ user: "regular", params: { customUrl: "team-1" } },
		);

		const team = await TeamRepository.findByCustomUrl("team-1");
		expect(team?.avatarImgId).toBeNull();
		expect(await imageExists(imageId)).toBe(false);
	});

	it("keeps the submitted image row when an existing image is unchanged", async () => {
		const imageId = await addTeamAvatar();

		await editTeamProfileAction(
			{
				...DEFAULT_EDIT_FIELDS,
				logo: {
					type: "EXISTING",
					imgId: imageId,
					url: "https://example.com/test-avatar.jpg",
				},
			},
			{ user: "regular", params: { customUrl: "team-1" } },
		);

		const team = await TeamRepository.findByCustomUrl("team-1");
		expect(team?.avatarImgId).toBe(imageId);
		expect(await imageExists(imageId)).toBe(true);
	});
});
