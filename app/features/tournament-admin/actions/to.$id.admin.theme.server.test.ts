import { beforeEach, describe, expect, it } from "vitest";
import { REGULAR_USER_TEST_ID } from "~/db/seed/constants";
import * as TournamentFactory from "~/db/seed/factories/TournamentFactory";
import * as TournamentOrganizationFactory from "~/db/seed/factories/TournamentOrganizationFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import * as TournamentRepository from "~/features/tournament/TournamentRepository.server";
import invariant from "~/utils/invariant";
import { clampThemeToGamut } from "~/utils/oklch-gamut";
import { wrappedAction } from "~/utils/Test";
import type { adminThemeActionSchema } from "../tournament-admin-schemas.server";
import { action as _adminThemeAction } from "./to.$id.admin.theme.server";

const adminThemeAction = wrappedAction<typeof adminThemeActionSchema>({
	action: _adminThemeAction,
	isJsonSubmission: true,
});

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

describe("tournament admin custom theme", () => {
	let tournamentId: number;

	const createOrgTournament = async ({ isEstablished = true } = {}) => {
		const organization = await TournamentOrganizationFactory.create(
			{ ownerId: REGULAR_USER_TEST_ID },
			{ isEstablished },
		);
		const tournament = await TournamentFactory.create({
			authorId: REGULAR_USER_TEST_ID,
			organizationId: organization.id,
		});
		tournamentId = tournament.id;
	};

	const tournamentRow = async () => {
		const tournament = await TournamentRepository.findById(tournamentId);
		invariant(tournament, `No tournament with the id ${tournamentId}`);

		return tournament;
	};

	beforeEach(async () => {
		await UserFactory.createRegular();
	});

	it("sets a custom theme via UPDATE_CUSTOM_THEME", async () => {
		await createOrgTournament();

		const response = await adminThemeAction(
			{
				_action: "UPDATE_CUSTOM_THEME",
				newValue: VALID_CUSTOM_THEME,
			},
			{ user: "regular", params: { id: String(tournamentId) } },
		);

		expect(response).toEqual({ ok: true });
		expect((await tournamentRow()).customTheme).toEqual(expectedStoredTheme());
	});

	it("clears a custom theme via UPDATE_CUSTOM_THEME with null", async () => {
		await createOrgTournament();

		await adminThemeAction(
			{
				_action: "UPDATE_CUSTOM_THEME",
				newValue: VALID_CUSTOM_THEME,
			},
			{ user: "regular", params: { id: String(tournamentId) } },
		);

		const response = await adminThemeAction(
			{
				_action: "UPDATE_CUSTOM_THEME",
				newValue: null,
			},
			{ user: "regular", params: { id: String(tournamentId) } },
		);

		expect(response).toEqual({ ok: true });
		expect((await tournamentRow()).customTheme).toBeNull();
	});

	it("prevents setting an invalid custom theme", async () => {
		await createOrgTournament();

		const response = await adminThemeAction(
			{
				_action: "UPDATE_CUSTOM_THEME",
				newValue: {
					...VALID_CUSTOM_THEME,
					baseHue: 500, // Invalid: max is 360
				},
			},
			{ user: "regular", params: { id: String(tournamentId) } },
		);

		expect(response.fieldErrors["newValue.baseHue"]).toBeTruthy();
	});

	it("prevents setting a custom theme when the organization is not established", async () => {
		await createOrgTournament({ isEstablished: false });

		const response = await adminThemeAction(
			{
				_action: "UPDATE_CUSTOM_THEME",
				newValue: VALID_CUSTOM_THEME,
			},
			{ user: "regular", params: { id: String(tournamentId) } },
		);

		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toContain("__error");
		expect((await tournamentRow()).customTheme).toBeNull();
	});

	it("prevents setting a custom theme when the tournament has no organization", async () => {
		const tournament = await TournamentFactory.create({
			authorId: REGULAR_USER_TEST_ID,
			organizationId: null,
		});
		tournamentId = tournament.id;

		const response = await adminThemeAction(
			{
				_action: "UPDATE_CUSTOM_THEME",
				newValue: VALID_CUSTOM_THEME,
			},
			{ user: "regular", params: { id: String(tournamentId) } },
		);

		expect(response.status).toBe(302);
		expect(response.headers.get("Location")).toContain("__error");
		expect((await tournamentRow()).customTheme).toBeNull();
	});
});
