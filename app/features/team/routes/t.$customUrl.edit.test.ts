import { beforeEach, describe, expect, test } from "vitest";
import * as UserFactory from "~/db/seed/factories/UserFactory";
import { wrappedAction } from "~/utils/Test";
import { action as _editTeamAction } from "../routes/t.$customUrl.edit";
import type { editTeamFormSchema } from "../team-schemas";
import { createTeamOwnedByRegular } from "../tests/fixtures";

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

describe("team name editing", () => {
	beforeEach(async () => {
		await UserFactory.createRegular();
	});

	test("can't take another team's name via editing", async () => {
		const team = await createTeamOwnedByRegular("Team 1");
		await createTeamOwnedByRegular("Team 2", false);

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

	test("prevents editing team name to only special characters", async () => {
		const team = await createTeamOwnedByRegular("Team 1");

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
