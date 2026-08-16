import { beforeEach, describe, expect, test } from "vitest";
import { REGULAR_USER_TEST_ID } from "~/db/seed/constants";
import * as TeamFactory from "~/db/seed/factories/TeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as ImageRepository from "~/features/img-upload/ImageRepository.server";
import * as TeamRepository from "~/features/team/TeamRepository.server";
import invariant from "~/utils/invariant";
import { clampThemeToGamut } from "~/utils/oklch-gamut";
import { wrappedAction } from "~/utils/Test";
import type { editTeamActionSchema } from "../team-schemas";
import { action as _editTeamProfileAction } from "./t.$customUrl.edit.server";

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
	let customUrl: string;

	const createTeam = async (
		options?: Parameters<typeof TeamFactory.create>[1],
	) => {
		const team = await TeamFactory.create(
			{ name: "Team 1", memberUserIds: [REGULAR_USER_TEST_ID] },
			options,
		);
		customUrl = team.customUrl;
	};

	const teamRow = async () => {
		const team = await TeamRepository.findByCustomUrl(customUrl);
		invariant(team, `No team with the custom url ${customUrl}`);

		return team;
	};

	beforeEach(async () => {
		// a patron because setting a custom theme is a patron only feature
		await UserFactory.createRegular(null, { patronTier: 2 });
	});

	describe("custom theme", () => {
		beforeEach(() => createTeam());

		test("sets a custom theme via UPDATE_CUSTOM_THEME", async () => {
			const response = await editTeamProfileAction(
				{
					_action: "UPDATE_CUSTOM_THEME",
					newValue: VALID_CUSTOM_THEME,
				},
				{ user: "regular", params: { customUrl } },
			);

			expect(response).toEqual({ ok: true });
			expect((await teamRow()).customTheme).toEqual(expectedStoredTheme());
		});

		test("clears a custom theme via UPDATE_CUSTOM_THEME with null", async () => {
			await editTeamProfileAction(
				{
					_action: "UPDATE_CUSTOM_THEME",
					newValue: VALID_CUSTOM_THEME,
				},
				{ user: "regular", params: { customUrl } },
			);

			const response = await editTeamProfileAction(
				{
					_action: "UPDATE_CUSTOM_THEME",
					newValue: null,
				},
				{ user: "regular", params: { customUrl } },
			);

			expect(response).toEqual({ ok: true });
			expect((await teamRow()).customTheme).toBeNull();
		});

		test("prevents setting an invalid custom theme", async () => {
			const response = await editTeamProfileAction(
				{
					_action: "UPDATE_CUSTOM_THEME",
					newValue: {
						...VALID_CUSTOM_THEME,
						baseHue: 500, // Invalid: max is 360
					},
				},
				{ user: "regular", params: { customUrl } },
			);

			expect(response.fieldErrors["newValue.baseHue"]).toBeTruthy();
		});

		test("preserves an existing custom theme when editing the team profile", async () => {
			await editTeamProfileAction(
				{
					_action: "UPDATE_CUSTOM_THEME",
					newValue: VALID_CUSTOM_THEME,
				},
				{ user: "regular", params: { customUrl } },
			);

			const response = await editTeamProfileAction(
				{ ...DEFAULT_EDIT_FIELDS, bio: "Updated bio" },
				{ user: "regular", params: { customUrl } },
			);

			expect(response.status).toBe(302);

			const team = await teamRow();
			expect(team.customTheme).toEqual(expectedStoredTheme());
			expect(team.bio).toBe("Updated bio");
		});
	});

	describe("logo", () => {
		let imageId: number;

		const imageExists = async (id: number) =>
			Boolean(await ImageRepository.findById(id));

		beforeEach(async () => {
			await createTeam({ hasAvatar: true });

			const avatarImgId = (await teamRow()).avatarImgId;
			invariant(avatarImgId, "The team was created without a logo");
			imageId = avatarImgId;
		});

		test("deletes the submitted image row when an image is removed while editing", async () => {
			await editTeamProfileAction(
				{ ...DEFAULT_EDIT_FIELDS },
				{ user: "regular", params: { customUrl } },
			);

			expect((await teamRow()).avatarImgId).toBeNull();
			expect(await imageExists(imageId)).toBe(false);
		});

		test("keeps the submitted image row when an existing image is unchanged", async () => {
			await editTeamProfileAction(
				{
					...DEFAULT_EDIT_FIELDS,
					logo: {
						type: "EXISTING",
						imgId: imageId,
						url: "https://example.com/test-avatar.jpg",
					},
				},
				{ user: "regular", params: { customUrl } },
			);

			expect((await teamRow()).avatarImgId).toBe(imageId);
			expect(await imageExists(imageId)).toBe(true);
		});
	});
});
