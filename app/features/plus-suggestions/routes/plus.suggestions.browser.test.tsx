import { createBrowserRouter, RouterProvider } from "react-router";
import { describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import type * as PlusSuggestionRepository from "~/features/plus-suggestions/PlusSuggestionRepository.server";
import { PlusSuggestionComments } from "./plus.suggestions";

vi.mock("../actions/plus.suggestions.server", () => ({ action: vi.fn() }));
vi.mock("../loaders/plus.suggestions.server", () => ({ loader: vi.fn() }));

const AUTHOR = {
	id: 5,
	username: "Suggester",
};

const AUTHOR_AS_LOGGED_IN_USER = { id: AUTHOR.id, discordId: "1005" };

const suggestedUser = (id: number, username: string) => ({
	id,
	username,
	discordId: String(1000 + id),
	discordAvatar: null,
	customUrl: null,
	customAvatarUrl: null,
});

const NOW_TIMESTAMP = Math.floor(Date.now() / 1000);

const suggestionOf = (
	suggested: ReturnType<typeof suggestedUser>,
	entryId: number,
): PlusSuggestionRepository.FindAllByMonthItem => ({
	tier: 2,
	suggested,
	entries: [
		{
			id: entryId,
			text: "Great player, deserves a spot",
			createdAtRelative: "3 days ago",
			createdAt: NOW_TIMESTAMP,
			updatedAt: null,
			updatedAtRelative: null,
			author: AUTHOR,
			permissions: {
				EDIT: [AUTHOR.id],
				DELETE: [AUTHOR.id],
			},
		},
	],
});

describe("PlusSuggestionComments", () => {
	test("deleting the suggestion itself warns about the suggestion, not a comment", async () => {
		const suggestions = [
			suggestionOf(suggestedUser(10, "Suggested One"), 100),
			suggestionOf(suggestedUser(11, "Suggested Two"), 101),
		];

		const router = createBrowserRouter([
			{
				path: "*",
				loader: () => ({ user: AUTHOR_AS_LOGGED_IN_USER }),
				element: (
					<PlusSuggestionComments
						suggestion={suggestions[0]}
						deleteButtonArgs={{
							suggested: suggestions[0].suggested,
							tier: "2",
						}}
						defaultOpen
					/>
				),
			},
		]);

		const screen = await render(<RouterProvider router={router} />);

		await screen.getByLabelText("Delete comment").click();

		await expect
			.element(
				screen.getByText("Delete your suggestion of Suggested One to +2?"),
			)
			.toBeVisible();
	});
});
