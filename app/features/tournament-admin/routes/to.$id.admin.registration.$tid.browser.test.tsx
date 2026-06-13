import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { render } from "vitest-browser-react";

const { mockTournament } = vi.hoisted(() => ({
	mockTournament: {
		ctx: { id: 1, settings: { requireInGameNames: false } },
		teamById: vi.fn(),
	},
}));

vi.mock("react-router", async () => {
	const actual = await vi.importActual("react-router");
	return {
		...actual,
		useParams: () => ({ tid: "10" }),
		useFetcher: () => ({
			data: undefined,
			state: "idle",
			submit: vi.fn(),
			load: vi.fn(),
		}),
	};
});

vi.mock("~/features/tournament/routes/to.$id", () => ({
	useTournament: () => mockTournament,
}));

// Stub the server action re-exported by the route module so importing the route
// in a browser test doesn't pull in the database-backed action code.
vi.mock(
	"~/features/tournament-admin/actions/to.$id.admin.registration.server",
	() => ({ action: vi.fn() }),
);

import TournamentAdminRegistrationPage from "./to.$id.admin.registration.$tid";

function renderPage() {
	const router = createMemoryRouter(
		[{ path: "/", element: <TournamentAdminRegistrationPage /> }],
		{ initialEntries: ["/"] },
	);

	return render(<RouterProvider router={router} />);
}

const CAPTAIN_NOT_A_MEMBER_ERROR = "The captain must be one of the players";

describe("tournament admin registration - captain field", () => {
	test("removing the captain's roster row does not leave a stale captain that fails validation", async () => {
		// A linked/edited team whose captain (OWNER) is the first roster member.
		mockTournament.teamById.mockReturnValue({
			id: 10,
			name: "low ink buddies",
			team: undefined,
			pickupAvatarUrl: null,
			avatarImgId: null,
			members: [
				{ userId: 1, username: "sanu", inGameName: null, role: "OWNER" },
				{ userId: 2, username: "Jolt", inGameName: null, role: "MEMBER" },
			],
		});

		const screen = await renderPage();

		// Remove the captain's row (member #1). The Captain <select> is non-clearable
		// so it now visually shows the remaining member ("Jolt") as selected, but the
		// form's ownerId still points at the removed user (1) and nothing resyncs it.
		const removeButtons = screen.container.querySelectorAll(
			'button[aria-label="Remove item"]',
		);
		expect(removeButtons.length).toBe(2);
		await userEvent.click(removeButtons[0]);

		await screen.getByRole("button", { name: "Submit" }).click();

		// The captain shown in the dropdown IS a current player, so submitting should
		// not be blocked by "the captain must be one of the players".
		await expect
			.element(screen.getByText(CAPTAIN_NOT_A_MEMBER_ERROR))
			.not.toBeInTheDocument();
	});
});
