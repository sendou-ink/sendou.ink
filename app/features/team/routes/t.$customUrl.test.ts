import type { SerializeFrom } from "@remix-run/node";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { REGULAR_USER_TEST_ID } from "~/db/seed/constants";
import { db } from "~/db/sql";
import {
	assertResponseErrored,
	dbInsertUsers,
	dbReset,
	wrappedAction,
	wrappedLoader,
} from "~/utils/Test";
import { loader as userProfileLoader } from "../../user-page/loaders/u.$identifier.index.server";
import * as TeamRepository from "../TeamRepository.server";
import { action as _teamPageAction } from "../actions/t.$customUrl.server";
import { action as teamIndexPageAction } from "../actions/t.server";
import { action as _editTeamAction } from "../routes/t.$customUrl.edit";
import type {
	createTeamSchema,
	editTeamSchema,
	teamProfilePageActionSchema,
} from "../team-schemas.server";

const loadUserTeamLoader = wrappedLoader<
	SerializeFrom<typeof userProfileLoader>
>({
	loader: userProfileLoader,
});

const createTeamAction = wrappedAction<typeof createTeamSchema>({
	action: teamIndexPageAction,
});
const teamPageAction = wrappedAction<typeof teamProfilePageActionSchema>({
	action: _teamPageAction,
});
const editTeamAction = wrappedAction<typeof editTeamSchema>({
	action: _editTeamAction,
});

async function loadTeams() {
	const data = await loadUserTeamLoader({
		user: "regular",
		params: {
			identifier: String(REGULAR_USER_TEST_ID),
		},
	});

	return { team: data.user.team, secondaryTeams: data.user.secondaryTeams };
}

describe("Secondary teams", () => {
	beforeEach(async () => {
		await dbInsertUsers();
	});
	afterEach(() => {
		dbReset();
	});

	it("first team created becomes main team", async () => {
		await createTeamAction({ name: "Team 1" }, { user: "regular" });

		const { team, secondaryTeams } = await loadTeams();

		expect(team!.name).toBe("Team 1");
		expect(secondaryTeams).toHaveLength(0);
	});

	it("second team created becomes secondary", async () => {
		await createTeamAction({ name: "Team 1" }, { user: "regular" });
		await createTeamAction({ name: "Team 2" }, { user: "regular" });

		const { team, secondaryTeams } = await loadTeams();

		expect(team!.name).toBe("Team 1");
		expect(secondaryTeams[0].name).toBe("Team 2");
	});

	it("makes secondary team main team", async () => {
		await createTeamAction({ name: "Team 1" }, { user: "regular" });
		await createTeamAction({ name: "Team 2" }, { user: "regular" });

		const { team, secondaryTeams } = await loadTeams();

		expect(team!.name).toBe("Team 1");
		expect(secondaryTeams[0].name).toBe("Team 2");
	});

	it("sets main team (2 team)", async () => {
		await createTeamAction({ name: "Team 1" }, { user: "regular" });
		await createTeamAction({ name: "Team 2" }, { user: "regular" });

		await teamPageAction(
			{ _action: "MAKE_MAIN_TEAM" },
			{ user: "regular", params: { customUrl: "team-2" } },
		);

		const { team } = await loadTeams();

		expect(team!.name).toBe("Team 2");
	});

	it("when deleting the main team, the secondary team becomes main", async () => {
		await createTeamAction({ name: "Team 1" }, { user: "regular" });
		await createTeamAction({ name: "Team 2" }, { user: "regular" });

		await editTeamAction(
			{
				_action: "DELETE_TEAM",
			},
			{
				user: "regular",
				params: { customUrl: "team-1" },
			},
		);

		const { team, secondaryTeams } = await loadTeams();

		expect(team!.name).toBe("Team 2");
		expect(secondaryTeams).toHaveLength(0);
	});

	it("when leaving the main team, the secondary team becomes main", async () => {
		// has to be made by "admin" because can't leave team you own
		await createTeamAction({ name: "Team 1" }, { user: "admin" });
		await createTeamAction({ name: "Team 2" }, { user: "admin" });

		await TeamRepository.addNewTeamMember({
			userId: REGULAR_USER_TEST_ID,
			teamId: 1,
			maxTeamsAllowed: 2,
		});
		await TeamRepository.addNewTeamMember({
			userId: REGULAR_USER_TEST_ID,
			teamId: 2,
			maxTeamsAllowed: 2,
		});

		const { team, secondaryTeams } = await loadTeams();

		expect(team!.name).toBe("Team 1");
		expect(secondaryTeams[0].name).toBe("Team 2");

		await teamPageAction(
			{
				_action: "LEAVE_TEAM",
			},
			{
				user: "regular",
				params: { customUrl: "team-1" },
			},
		);

		const { team: newTeam, secondaryTeams: newSecondaryTeams } =
			await loadTeams();

		expect(newTeam!.name).toBe("Team 2");
		expect(newSecondaryTeams).toHaveLength(0);
	});

	it("creates max 2 teams as non-patron", async () => {
		await createTeamAction({ name: "Team 1" }, { user: "regular" });
		await createTeamAction({ name: "Team 2" }, { user: "regular" });

		const response = await createTeamAction(
			{ name: "Team 3" },
			{ user: "regular" },
		);

		assertResponseErrored(response);
	});

	const makeUserPatron = () =>
		db
			.updateTable("User")
			.set({ patronTier: 2 })
			.where("id", "=", REGULAR_USER_TEST_ID)
			.execute();

	it("creates more than 2 teams as patron", async () => {
		await makeUserPatron();

		await createTeamAction({ name: "Team 1" }, { user: "regular" });
		await createTeamAction({ name: "Team 2" }, { user: "regular" });
		await createTeamAction({ name: "Team 3" }, { user: "regular" });

		const { secondaryTeams } = await loadTeams();
		expect(secondaryTeams).toHaveLength(2);
	});

	const createTeamWithImage = async (imageType: "avatar" | "banner") => {
		await createTeamAction({ name: "Team 1" }, { user: "regular" });

		const imageId = await db
			.insertInto("UnvalidatedUserSubmittedImage")
			.values({
				url: `https://example.com/test-${imageType}.jpg`,
				submitterUserId: REGULAR_USER_TEST_ID,
			})
			.returning("id")
			.executeTakeFirstOrThrow();

		const imageField = imageType === "avatar" ? "avatarImgId" : "bannerImgId";
		await db
			.updateTable("AllTeam")
			.set({ [imageField]: imageId.id })
			.where("customUrl", "=", "team-1")
			.execute();

		return imageId.id;
	};

	it("deletes team avatar", async () => {
		const imageId = await createTeamWithImage("avatar");

		await editTeamAction(
			{ _action: "DELETE_AVATAR" },
			{ user: "regular", params: { customUrl: "team-1" } },
		);

		const team = await db
			.selectFrom("Team")
			.select("avatarImgId")
			.where("customUrl", "=", "team-1")
			.executeTakeFirst();

		expect(team?.avatarImgId).toBeNull();

		const image = await db
			.selectFrom("UnvalidatedUserSubmittedImage")
			.select("id")
			.where("id", "=", imageId)
			.executeTakeFirst();

		expect(image).toBeUndefined();
	});

	it("deletes team banner", async () => {
		const imageId = await createTeamWithImage("banner");

		await editTeamAction(
			{ _action: "DELETE_BANNER" },
			{ user: "regular", params: { customUrl: "team-1" } },
		);

		const team = await db
			.selectFrom("Team")
			.select("bannerImgId")
			.where("customUrl", "=", "team-1")
			.executeTakeFirst();

		expect(team?.bannerImgId).toBeNull();

		const image = await db
			.selectFrom("UnvalidatedUserSubmittedImage")
			.select("id")
			.where("id", "=", imageId)
			.executeTakeFirst();

		expect(image).toBeUndefined();
	});

	it("only team owner can delete images", async () => {
		await createTeamWithImage("avatar");

		await db
			.insertInto("User")
			.values({
				discordName: "otheruser",
				discordId: "999",
			})
			.execute();

		const response = await editTeamAction(
			{ _action: "DELETE_AVATAR" },
			{ user: "regular", params: { customUrl: "team-1" } },
		);

		expect(response.status).toBe(302);
	});
});
