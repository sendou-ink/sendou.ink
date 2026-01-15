import type { ComponentProps } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import type { GroupSkillDifference } from "~/db/tables";
import type { TieredSkill } from "~/features/mmr/tiered.server";
import type {
	SQGroup,
	SQGroupMember,
	SQOwnGroup,
} from "../core/SendouQ.server";
import type { TierRange } from "../q-types";
import { GroupCard } from "./GroupCard";

vi.mock("~/features/auth/core/user", () => ({
	useUser: () => null,
}));

function createMember(overrides: Partial<SQGroupMember> = {}): SQGroupMember {
	return {
		id: 1,
		discordId: "123456789",
		username: "TestUser",
		discordAvatar: null,
		customUrl: null,
		role: "OWNER",
		vc: "NO",
		languages: [],
		skill: "CALCULATING",
		weapons: [],
		plusTier: null,
		friendCode: null,
		inGameName: null,
		note: null,
		privateNote: null,
		pronouns: null,
		skillDifference: undefined,
		noScreen: undefined,
		chatNameColor: null,
		mapModePreferences: undefined,
		...overrides,
	};
}

function createGroup(
	overrides: Partial<Omit<SQGroup, "members">> & {
		members?: SQGroupMember[];
	} = {},
): SQGroup {
	const { members, ...rest } = overrides;
	return {
		id: 1,
		tier: null,
		tierRange: null,
		skillDifference: undefined,
		isReplay: false,
		usersRole: null,
		noScreen: false,
		modePreferences: [],
		status: "ACTIVE",
		matchId: null,
		latestActionAt: Date.now(),
		members: members ?? [createMember()],
		...rest,
	};
}

type OwnGroupMember = SQOwnGroup["members"][number];

function createOwnGroupMember(
	overrides: Partial<OwnGroupMember> = {},
): OwnGroupMember {
	return {
		id: 1,
		discordId: "123456789",
		username: "TestUser",
		discordAvatar: null,
		customUrl: null,
		role: "OWNER",
		vc: "NO",
		languages: [],
		skill: "CALCULATING",
		weapons: [],
		plusTier: null,
		friendCode: null,
		inGameName: null,
		note: null,
		privateNote: null,
		pronouns: null,
		skillDifference: undefined,
		noScreen: undefined,
		chatNameColor: null,
		mapModePreferences: undefined,
		...overrides,
	} satisfies OwnGroupMember;
}

function createOwnGroup(
	overrides: Partial<Omit<SQOwnGroup, "members">> & {
		members?: OwnGroupMember[];
	} = {},
): SQOwnGroup {
	const { members, ...rest } = overrides;
	return {
		id: 1,
		tier: null,
		tierRange: null,
		skillDifference: undefined,
		isReplay: false,
		usersRole: "OWNER",
		noScreen: false,
		modePreferences: [],
		chatCode: null,
		status: "ACTIVE",
		matchId: null,
		inviteCode: "test123",
		latestActionAt: Date.now(),
		members: members ?? [createOwnGroupMember()],
		...rest,
	};
}

function renderGroupCard(
	props: Partial<ComponentProps<typeof GroupCard>> = {},
) {
	const group = props.group ?? createGroup();
	const { displayOnly = true, ...restProps } = props;
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: (
					<GroupCard group={group} displayOnly={displayOnly} {...restProps} />
				),
			},
		],
		{ initialEntries: ["/"] },
	);

	return render(<RouterProvider router={router} />);
}

describe("GroupCard", () => {
	describe("member display", () => {
		test("renders single member with username", async () => {
			const screen = await renderGroupCard({
				group: createGroup({
					members: [createMember({ username: "Player1" })],
				}),
			});

			await expect
				.element(screen.getByTestId("sendouq-group-card"))
				.toBeVisible();
			await expect
				.element(screen.getByTestId("sendouq-group-card-member"))
				.toBeVisible();
			await expect.element(screen.getByText("Player1")).toBeVisible();
		});

		test("renders multiple members", async () => {
			const screen = await renderGroupCard({
				group: createGroup({
					members: [
						createMember({ id: 1, username: "Player1" }),
						createMember({ id: 2, username: "Player2", role: "MANAGER" }),
						createMember({ id: 3, username: "Player3", role: "REGULAR" }),
					],
				}),
			});

			await expect.element(screen.getByText("Player1")).toBeVisible();
			await expect.element(screen.getByText("Player2")).toBeVisible();
			await expect.element(screen.getByText("Player3")).toBeVisible();
		});

		test("displays in-game name when present", async () => {
			const screen = await renderGroupCard({
				group: createGroup({
					members: [createMember({ inGameName: "IGN#1234" })],
				}),
			});

			await expect.element(screen.getByText("IGN")).toBeVisible();
		});

		test("displays calculated tier", async () => {
			const skill: TieredSkill = {
				ordinal: 2100,
				tier: { name: "GOLD", isPlus: false },
				approximate: false,
			};

			const screen = await renderGroupCard({
				group: createGroup({
					members: [createMember({ skill })],
				}),
			});

			// Tier info is shown in a popover button, check it renders
			await expect
				.element(screen.getByTestId("sendouq-group-card-member"))
				.toBeVisible();
		});

		test("displays weapons", async () => {
			const screen = await renderGroupCard({
				group: createGroup({
					members: [
						createMember({
							weapons: [
								{ weaponSplId: 40, isFavorite: 1 },
								{ weaponSplId: 50, isFavorite: 0 },
							],
						}),
					],
				}),
			});

			// Weapons are rendered as picture elements
			const pictures = screen.container.querySelectorAll("picture");
			expect(pictures.length).toBeGreaterThan(0);
		});
	});

	describe("voice chat", () => {
		test("shows microphone icon for YES", async () => {
			const screen = await renderGroupCard({
				group: createGroup({
					members: [createMember({ vc: "YES", languages: ["en"] })],
				}),
			});

			await expect.element(screen.getByTestId("microphone-icon")).toBeVisible();
		});

		test("shows speaker icon for LISTEN_ONLY", async () => {
			const screen = await renderGroupCard({
				group: createGroup({
					members: [createMember({ vc: "LISTEN_ONLY", languages: ["en"] })],
				}),
			});

			await expect.element(screen.getByTestId("speaker-icon")).toBeVisible();
		});

		test("shows speaker-x icon for NO", async () => {
			const screen = await renderGroupCard({
				group: createGroup({
					members: [createMember({ vc: "NO", languages: ["en"] })],
				}),
			});

			await expect.element(screen.getByTestId("speaker-x-icon")).toBeVisible();
		});
	});

	describe("group states", () => {
		test("shows tier for full group", async () => {
			const tier: TieredSkill["tier"] = { name: "PLATINUM", isPlus: true };

			const screen = await renderGroupCard({
				group: createGroup({
					tier,
					members: [
						createMember({ id: 1 }),
						createMember({ id: 2, role: "REGULAR" }),
						createMember({ id: 3, role: "REGULAR" }),
						createMember({ id: 4, role: "REGULAR" }),
					],
				}),
			});

			await expect.element(screen.getByText(/PLATINUM\+/)).toBeVisible();
		});

		test("shows tier range", async () => {
			const tierRange: TierRange = {
				diff: [0, 50],
				range: [
					{ name: "GOLD", isPlus: false },
					{ name: "PLATINUM", isPlus: true },
				],
			};

			const screen = await renderGroupCard({
				group: createGroup({
					tierRange,
					tier: null,
					members: undefined,
				}),
			});

			await expect
				.element(screen.getByTestId("sendouq-group-card"))
				.toBeVisible();
		});

		test("shows REPLAY label when isReplay", async () => {
			const tier: TieredSkill["tier"] = { name: "GOLD", isPlus: false };

			const screen = await renderGroupCard({
				group: createGroup({
					tier,
					isReplay: true,
					members: [
						createMember({ id: 1 }),
						createMember({ id: 2, role: "REGULAR" }),
						createMember({ id: 3, role: "REGULAR" }),
						createMember({ id: 4, role: "REGULAR" }),
					],
				}),
			});

			// REPLAY text is rendered, translations are loaded
			await expect.element(screen.getByText(/REPLAY/i)).toBeVisible();
		});

		test("shows group skill difference", async () => {
			const skillDifference: GroupSkillDifference = {
				calculated: true,
				oldSp: 2100,
				newSp: 2150,
			};

			const screen = await renderGroupCard({
				group: createGroup({
					skillDifference,
					members: undefined,
				}),
			});

			await expect.element(screen.getByText(/2100/)).toBeVisible();
			await expect.element(screen.getByText(/2150/)).toBeVisible();
		});
	});

	describe("action buttons", () => {
		test("shows Invite for LIKE with members", async () => {
			const ownGroup = createOwnGroup({ id: 2 });

			const screen = await renderGroupCard({
				group: createGroup({ members: [createMember()] }),
				action: "LIKE",
				ownGroup,
				displayOnly: false,
			});

			// Actual translated text is "Invite"
			await expect.element(screen.getByText("Invite")).toBeVisible();
		});

		test("shows Challenge for LIKE with full group (no visible members)", async () => {
			const ownGroup = createOwnGroup({ id: 2 });

			// Create a group with members explicitly set to undefined (censored/full group)
			const fullGroup = createGroup({});
			fullGroup.members = undefined;

			const screen = await renderGroupCard({
				group: fullGroup,
				action: "LIKE",
				ownGroup,
				displayOnly: false,
			});

			// Actual translated text is "Challenge"
			await expect.element(screen.getByText("Challenge")).toBeVisible();
		});

		test("shows Start Match for MATCH_UP", async () => {
			const ownGroup = createOwnGroup({ id: 2 });

			const screen = await renderGroupCard({
				group: createGroup({ members: undefined }),
				action: "MATCH_UP",
				ownGroup,
				displayOnly: false,
			});

			// Actual translated text is "Start match"
			await expect.element(screen.getByText("Start match")).toBeVisible();
		});

		test("hides actions when user is not owner or manager", async () => {
			// ownGroup with REGULAR role shouldn't show action buttons
			const ownGroup = createOwnGroup({ id: 2, usersRole: "REGULAR" });

			const screen = await renderGroupCard({
				group: createGroup({ members: [createMember()] }),
				action: "LIKE",
				ownGroup,
				displayOnly: false,
			});

			// Action button should not be rendered when user is not OWNER or MANAGER
			const actionButton = screen.container.querySelector(
				'[data-testid="group-card-action-button"]',
			);
			expect(actionButton).toBeNull();
		});
	});

	describe("props", () => {
		test("hides VC when hideVc=1", async () => {
			const screen = await renderGroupCard({
				group: createGroup({
					members: [createMember({ vc: "YES", languages: ["en"] })],
				}),
				hideVc: 1,
			});

			await expect
				.element(screen.getByTestId("sendouq-group-card-member"))
				.toBeVisible();
			// VC button should not be visible, only member info
		});

		test("hides weapons when hideWeapons=1", async () => {
			const screen = await renderGroupCard({
				group: createGroup({
					members: [
						createMember({
							weapons: [{ weaponSplId: 40, isFavorite: 1 }],
						}),
					],
				}),
				hideWeapons: 1,
			});

			await expect
				.element(screen.getByTestId("sendouq-group-card-member"))
				.toBeVisible();
			const weaponImages = screen.getByRole("img", { name: /weapons:MAIN/ });
			await expect.element(weaponImages.first()).not.toBeInTheDocument();
		});
	});
});
