import { beforeEach, describe, expect, test, vi } from "bun:test";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import * as ReactRouter from "react-router";
import { createMemoryRouter, RouterProvider } from "react-router";
import { SendouForm } from "~/form/SendouForm";
import type { TournamentOrganizationRole } from "../tournament-organization-constants";
import { organizationEditFormSchema } from "../tournament-organization-schemas";

const mockSubmit = vi.fn();

vi.mock("react-router", () => {
	return {
		...ReactRouter,
		useFetcher: () => ({
			data: undefined,
			state: "idle",
			submit: mockSubmit,
			load: vi.fn(),
		}),
	};
});

interface Member {
	userId: number;
	role: TournamentOrganizationRole;
	roleDisplayName: string;
}

function renderEditForm(members: Member[]) {
	const router = createMemoryRouter(
		[
			{
				path: "/",
				element: (
					<SendouForm
						schema={organizationEditFormSchema}
						defaultValues={{
							name: "Test Organization",
							logo: null,
							description: "",
							members,
							socials: [],
							series: [],
							badges: [],
						}}
					>
						{({ FormField }) => (
							<>
								<FormField name="name" />
								<FormField name="members" />
							</>
						)}
					</SendouForm>
				),
			},
		],
		{ initialEntries: ["/"] },
	);

	return render(<RouterProvider router={router} />);
}

describe("organization edit form members", () => {
	beforeEach(() => {
		mockSubmit.mockClear();
	});

	test("submits when every member is a different user", async () => {
		renderEditForm([
			{ userId: 1, role: "ADMIN", roleDisplayName: "" },
			{ userId: 2, role: "ORGANIZER", roleDisplayName: "" },
		]);

		await userEvent.click(screen.getByRole("button", { name: "Submit" }));

		expect(mockSubmit).toHaveBeenCalledTimes(1);
	});

	test("does not submit when the same user is listed twice", async () => {
		renderEditForm([
			{ userId: 1, role: "ADMIN", roleDisplayName: "" },
			{ userId: 2, role: "ORGANIZER", roleDisplayName: "" },
			{ userId: 1, role: "STREAMER", roleDisplayName: "" },
		]);

		await userEvent.click(screen.getByRole("button", { name: "Submit" }));

		expect(mockSubmit).not.toHaveBeenCalled();
	});

	test("shows the error on the duplicate member row only", async () => {
		const { container } = renderEditForm([
			{ userId: 1, role: "ADMIN", roleDisplayName: "" },
			{ userId: 2, role: "ORGANIZER", roleDisplayName: "" },
			{ userId: 1, role: "STREAMER", roleDisplayName: "" },
		]);

		await userEvent.click(screen.getByRole("button", { name: "Submit" }));

		expect(
			container.querySelector('[id="members[2].userId-error"]')?.textContent,
		).toBe("This user is already listed as a member");
		expect(
			container.querySelector('[id="members[0].userId-error"]')?.textContent,
		).toBeFalsy();
	});
});
