import { beforeEach, describe, expect, it } from "vitest";
import { REGULAR_USER_TEST_ID } from "~/db/seed/constants";
import * as TeamFactory from "~/db/seed/factories/TeamFactory";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { wrappedAction } from "~/utils/Test";
import { action as _editTeamAction } from "../routes/t.$customUrl.edit";
import type { editTeamFormSchema } from "../team-schemas";

const editTeamAction = wrappedAction<typeof editTeamFormSchema>({
	action: _editTeamAction,
	isJsonSubmission: true,
});

const createTeam = (name: string, isMainTeam = true) =>
	TeamFactory.create({
		name,
		isMainTeam,
		memberUserIds: [REGULAR_USER_TEST_ID],
	});

const DEFAULT_FIELDS = {
	tag: null,
	bsky: null,
	bio: null,
	logo: null,
	banner: null,
} as any;

describe("team name editing", () => {
	beforeEach(async () => {
		await UserFactory.createRegular();
	});

	it("can't take another team's name via editing", async () => {
		const team = await createTeam("Team 1");
		await createTeam("Team 2", false);

		const res = await editTeamAction(
			{
				_action: "EDIT",
				name: "Team 2",
				...DEFAULT_FIELDS,
			},
			{ user: "regular", params: { customUrl: team.customUrl } },
		);

		expect(res.fieldErrors.name).toBe("forms:errors.duplicateName");
	});

	it("prevents editing team name to only special characters", async () => {
		const team = await createTeam("Team 1");

		const res = await editTeamAction(
			{
				_action: "EDIT",
				name: "𝓢𝓲𝓵",
				...DEFAULT_FIELDS,
			},
			{ user: "regular", params: { customUrl: team.customUrl } },
		);

		expect(res.fieldErrors.name).toBe("forms:errors.noOnlySpecialCharacters");
	});
});
