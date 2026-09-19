import type { LoaderFunctionArgs } from "react-router";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";
import { TournamentProvider } from "~/features/tournament/tournament-context";
import type { Tournament } from "~/features/tournament-bracket/core/Tournament";
import TournamentAdminRegistrationPage from "./to.$id.admin.registration.$tid";

// stubbed so importing the route in a browser test doesn't pull in the database-backed action
vi.mock(
	"~/features/tournament-admin/actions/to.$id.admin.registration.server",
	() => ({ action: vi.fn() }),
);

vi.mock(
	"~/features/tournament-admin/loaders/to.$id.admin.registration.$tid.server",
	() => ({ loader: vi.fn() }),
);

const ROUTE_ID = "registration";

const tournament = {
	ctx: { id: 1, settings: { requireInGameNames: false } },
	canEditTournamentNames: (): boolean => false,
} as unknown as Tournament;

const SEARCHABLE_USERS = [
	{
		type: "user" as const,
		id: 1,
		name: "sanu",
		inGameName: null,
		avatarUrl: null,
		discordId: "1",
		discordAvatar: null,
		customUrl: null,
		plusTier: null,
	},
	{
		type: "user" as const,
		id: 2,
		name: "Jolt",
		inGameName: null,
		avatarUrl: null,
		discordId: "2",
		discordAvatar: null,
		customUrl: null,
		plusTier: null,
	},
];

let loaderData: { team: unknown };
let actionCallCount = 0;

function renderPage() {
	const router = createMemoryRouter(
		[
			{
				id: ROUTE_ID,
				path: "/",
				element: (
					<TournamentProvider tournament={tournament}>
						<TournamentAdminRegistrationPage />
					</TournamentProvider>
				),
				loader: () => loaderData,
				action: () => {
					actionCallCount += 1;
					return null;
				},
			},
			{
				path: "/search",
				loader: ({ request }: LoaderFunctionArgs) => {
					// biome-ignore lint/plugin: stub loader standing in for the real search route, reading the request the component built
					const query = new URL(request.url).searchParams.get("q") ?? "";
					return {
						query,
						type: "users",
						results: SEARCHABLE_USERS.filter(
							(user) => String(user.id) === query || user.name === query,
						),
					};
				},
			},
		],
		{
			initialEntries: ["/"],
			hydrationData: { loaderData: { [ROUTE_ID]: loaderData } },
		},
	);

	return render(<RouterProvider router={router} />);
}

const CAPTAIN_NOT_A_MEMBER_ERROR = "The captain must be one of the players";

beforeEach(() => {
	actionCallCount = 0;
});

describe("tournament admin registration - captain field", () => {
	test("removing the captain's roster row does not leave a stale captain that fails validation", async () => {
		// captain (OWNER) is the first roster member
		loaderData = {
			team: {
				id: 10,
				name: "low ink buddies",
				team: undefined,
				pickupAvatarUrl: null,
				avatarImgId: null,
				members: [
					{ userId: 1, username: "sanu", inGameName: null, role: "OWNER" },
					{ userId: 2, username: "Jolt", inGameName: null, role: "MEMBER" },
				],
			},
		};

		const screen = await renderPage();

		// the non-clearable Captain <select> now shows the remaining member ("Jolt") as selected, but
		// nothing resyncs the form's ownerId still pointing at the removed user (1)
		const removeButtons = () =>
			screen.container.querySelectorAll<HTMLButtonElement>(
				'button[aria-label="Remove item"]',
			);
		await expect.poll(() => removeButtons().length).toBe(2);
		await userEvent.click(removeButtons()[0]);

		await screen.getByRole("button", { name: "Submit" }).click();

		// the shown captain IS a current player, so "the captain must be one of the players" must not block the submit
		await expect.poll(() => actionCallCount).toBe(1);
		await expect
			.element(screen.getByText(CAPTAIN_NOT_A_MEMBER_ERROR))
			.not.toBeInTheDocument();
	});
});

describe("tournament admin registration - tournament name field", () => {
	beforeEach(() => {
		loaderData = {
			team: {
				id: 10,
				name: "low ink buddies",
				team: undefined,
				pickupAvatarUrl: null,
				avatarImgId: null,
				members: [
					{
						userId: 1,
						username: "sanu",
						inGameName: null,
						tournamentName: "Sanu",
						role: "OWNER",
					},
				],
			},
		};
	});

	test("is not shown to organizers who can't edit tournament names", async () => {
		tournament.canEditTournamentNames = () => false;

		const screen = await renderPage();

		await expect
			.element(screen.getByRole("button", { name: "Submit" }))
			.toBeInTheDocument();
		await expect
			.element(screen.getByLabelText("Tournament name"))
			.not.toBeInTheDocument();
	});

	test("shows the player's current tournament name", async () => {
		tournament.canEditTournamentNames = () => true;

		const screen = await renderPage();

		await expect
			.element(screen.getByLabelText("Tournament name"))
			.toHaveValue("Sanu");
	});
});
