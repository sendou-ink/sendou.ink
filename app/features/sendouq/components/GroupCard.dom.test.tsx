import { describe, expect, test, vi } from "bun:test";
import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
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
		username: "TestUser",
		avatar: null,
		customUrl: null,
		vc: "NO",
		languages: [],
		skill: "CALCULATING",
		weapons: [],
		friendCode: null,
		inGameName: null,
		note: null,
		skillDifference: undefined,
		noScreen: undefined,

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
		noScreen: false,
		modePreferences: [],
		teamMapModePreferences: undefined,
		status: "ACTIVE",
		matchId: null,
		latestActionAt: Date.now(),
		members: members ?? [createMember()],
		...rest,
	};
}

/** A group whose members are censored, as full groups are in the looking page. */
function createFullGroup(
	overrides: Partial<Omit<SQGroup, "members">> = {},
): SQGroup {
	const group = createGroup(overrides);
	group.members = undefined;

	return group;
}

type OwnGroupMember = SQOwnGroup["members"][number];

function createOwnGroupMember(
	overrides: Partial<OwnGroupMember> = {},
): OwnGroupMember {
	return {
		id: 1,
		username: "TestUser",
		avatar: null,
		customUrl: null,
		vc: "NO",
		languages: [],
		skill: "CALCULATING",
		weapons: [],
		friendCode: null,
		inGameName: null,
		note: null,
		skillDifference: undefined,
		noScreen: undefined,

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
		noScreen: false,
		modePreferences: [],
		teamMapModePreferences: undefined,
		chatRoomId: null,
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
			renderGroupCard({
				group: createGroup({
					members: [createMember({ username: "Player1" })],
				}),
			});

			expect(screen.getByTestId("sendouq-group-card")).toBeVisible();
			expect(screen.getByTestId("sendouq-group-card-member")).toBeVisible();
			expect(screen.getByText("Player1")).toBeVisible();
		});

		test("renders multiple members", async () => {
			renderGroupCard({
				group: createGroup({
					members: [
						createMember({ id: 1, username: "Player1" }),
						createMember({ id: 2, username: "Player2" }),
						createMember({ id: 3, username: "Player3" }),
					],
				}),
			});

			expect(screen.getByText("Player1")).toBeVisible();
			expect(screen.getByText("Player2")).toBeVisible();
			expect(screen.getByText("Player3")).toBeVisible();
		});

		test("displays in-game name when present", async () => {
			renderGroupCard({
				group: createGroup({
					members: [createMember({ inGameName: "IGN#1234" })],
				}),
			});

			expect(screen.getByText("IGN")).toBeVisible();
		});

		test("displays calculated tier", async () => {
			const skill: TieredSkill = {
				ordinal: 2100,
				tier: { name: "GOLD", isPlus: false },
				approximate: false,
			};

			renderGroupCard({
				group: createGroup({
					members: [createMember({ skill })],
				}),
			});

			expect(screen.getByTestId("sendouq-group-card-member")).toBeVisible();
		});

		test("displays weapons", async () => {
			const { container } = renderGroupCard({
				group: createGroup({
					members: [
						createMember({
							weapons: [
								{ weaponSplId: 40, isFavorite: 1, isTenStar: 0 },
								{ weaponSplId: 50, isFavorite: 0, isTenStar: 0 },
							],
						}),
					],
				}),
			});

			const images = container.querySelectorAll("img");
			expect(images.length).toBeGreaterThan(0);
		});
	});

	describe("voice chat", () => {
		test("shows microphone icon for YES", async () => {
			renderGroupCard({
				group: createGroup({
					members: [createMember({ vc: "YES", languages: ["en"] })],
				}),
			});

			expect(screen.getByTestId("microphone-icon")).toBeVisible();
		});

		test("shows speaker icon for LISTEN_ONLY", async () => {
			renderGroupCard({
				group: createGroup({
					members: [createMember({ vc: "LISTEN_ONLY", languages: ["en"] })],
				}),
			});

			expect(screen.getByTestId("speaker-icon")).toBeVisible();
		});

		test("shows speaker-x icon for NO", async () => {
			renderGroupCard({
				group: createGroup({
					members: [createMember({ vc: "NO", languages: ["en"] })],
				}),
			});

			expect(screen.getByTestId("speaker-x-icon")).toBeVisible();
		});
	});

	describe("group states", () => {
		test("shows tier for full group", async () => {
			const tier: TieredSkill["tier"] = { name: "PLATINUM", isPlus: true };

			renderGroupCard({
				group: createGroup({
					tier,
					members: [
						createMember({ id: 1 }),
						createMember({ id: 2 }),
						createMember({ id: 3 }),
						createMember({ id: 4 }),
					],
				}),
			});

			expect(screen.getByText(/PLATINUM\+/)).toBeVisible();
		});

		test("shows tier range", async () => {
			const tierRange: TierRange = {
				diff: [0, 50],
				range: [
					{ name: "GOLD", isPlus: false },
					{ name: "PLATINUM", isPlus: true },
				],
			};

			renderGroupCard({
				group: createFullGroup({
					tierRange,
					tier: null,
				}),
			});

			expect(screen.getByTestId("sendouq-group-card")).toBeVisible();
		});

		test("shows REPLAY label when isReplay", async () => {
			const tier: TieredSkill["tier"] = { name: "GOLD", isPlus: false };

			renderGroupCard({
				group: createGroup({
					tier,
					isReplay: true,
					members: [
						createMember({ id: 1 }),
						createMember({ id: 2 }),
						createMember({ id: 3 }),
						createMember({ id: 4 }),
					],
				}),
			});

			expect(screen.getByText(/REPLAY/i)).toBeVisible();
		});
	});

	describe("action buttons", () => {
		test("shows Invite for LIKE with members", async () => {
			const ownGroup = createOwnGroup({ id: 2 });

			renderGroupCard({
				group: createGroup({ members: [createMember()] }),
				action: "LIKE",
				ownGroup,
				displayOnly: false,
			});

			expect(screen.getByText("Invite")).toBeVisible();
		});

		test("shows Challenge for LIKE with full group (no visible members)", async () => {
			const ownGroup = createOwnGroup({ id: 2 });

			renderGroupCard({
				group: createFullGroup(),
				action: "LIKE",
				ownGroup,
				displayOnly: false,
			});

			expect(screen.getByText("Challenge")).toBeVisible();
		});

		test("shows Start Match for MATCH_UP", async () => {
			const ownGroup = createOwnGroup({ id: 2 });

			renderGroupCard({
				group: createFullGroup(),
				action: "MATCH_UP",
				ownGroup,
				displayOnly: false,
			});

			expect(screen.getByText("Start match")).toBeVisible();
		});
	});

	describe("trail", () => {
		test("shows suggested trail for a partial group", async () => {
			renderGroupCard({
				group: createGroup({ members: [createMember()] }),
				trail: { type: "SUGGESTED", username: "Suggester" },
			});

			const trail = screen.getByTestId("group-card-trail");
			expect(trail).toHaveTextContent("Suggested by Suggester");
		});

		test("shows suggested trail for a full group", async () => {
			renderGroupCard({
				group: createFullGroup(),
				trail: { type: "SUGGESTED", username: "Suggester" },
			});

			const trail = screen.getByTestId("group-card-trail");
			expect(trail).toHaveTextContent("Suggested by Suggester");
		});

		test("shows invited trail for a partial group", async () => {
			renderGroupCard({
				group: createGroup({ members: [createMember()] }),
				trail: { type: "INVITED", username: "Inviter" },
			});

			const trail = screen.getByTestId("group-card-trail");
			expect(trail).toHaveTextContent("Invited by Inviter");
		});

		test("shows challenged trail for a full group", async () => {
			renderGroupCard({
				group: createFullGroup(),
				trail: { type: "INVITED", username: "Challenger" },
			});

			const trail = screen.getByTestId("group-card-trail");
			expect(trail).toHaveTextContent("Challenged by Challenger");
		});

		test("renders no trail when not given", async () => {
			renderGroupCard({
				group: createGroup({ members: [createMember()] }),
			});

			expect(screen.queryByTestId("group-card-trail")).not.toBeInTheDocument();
		});
	});

	describe("props", () => {
		test("hides VC when hideVc=1", async () => {
			renderGroupCard({
				group: createGroup({
					members: [createMember({ vc: "YES", languages: ["en"] })],
				}),
				hideVc: 1,
			});

			expect(screen.getByTestId("sendouq-group-card-member")).toBeVisible();
		});

		test("hides weapons when hideWeapons=1", async () => {
			renderGroupCard({
				group: createGroup({
					members: [
						createMember({
							weapons: [{ weaponSplId: 40, isFavorite: 1, isTenStar: 0 }],
						}),
					],
				}),
				hideWeapons: 1,
			});

			expect(screen.getByTestId("sendouq-group-card-member")).toBeVisible();
			expect(
				screen.queryAllByRole("img", { name: /weapons:MAIN/ }),
			).toHaveLength(0);
		});
	});
});
