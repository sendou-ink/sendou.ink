import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render } from "vitest-browser-react";
import { SendouForm } from "~/form/SendouForm";
import type { TournamentOrganizationRole } from "../tournament-organization-constants";
import { organizationEditFormSchema } from "../tournament-organization-schemas";

const mockSubmit = vi.fn();

vi.mock("react-router", async () => {
	const actual = await vi.importActual("react-router");
	return {
		...actual,
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
		const screen = await renderEditForm([
			{ userId: 1, role: "ADMIN", roleDisplayName: "" },
			{ userId: 2, role: "ORGANIZER", roleDisplayName: "" },
		]);

		await screen.getByRole("button", { name: "Submit" }).click();

		expect(mockSubmit).toHaveBeenCalledTimes(1);
	});

	test("does not submit when the same user is listed twice", async () => {
		const screen = await renderEditForm([
			{ userId: 1, role: "ADMIN", roleDisplayName: "" },
			{ userId: 2, role: "ORGANIZER", roleDisplayName: "" },
			{ userId: 1, role: "STREAMER", roleDisplayName: "" },
		]);

		await screen.getByRole("button", { name: "Submit" }).click();

		expect(mockSubmit).not.toHaveBeenCalled();
	});

	test("shows the error on the duplicate member row only", async () => {
		const screen = await renderEditForm([
			{ userId: 1, role: "ADMIN", roleDisplayName: "" },
			{ userId: 2, role: "ORGANIZER", roleDisplayName: "" },
			{ userId: 1, role: "STREAMER", roleDisplayName: "" },
		]);

		await screen.getByRole("button", { name: "Submit" }).click();

		expect(
			screen.container.querySelector('[id="members[2].userId-error"]')
				?.textContent,
		).toBe("This user is already listed as a member");
		expect(
			screen.container.querySelector('[id="members[0].userId-error"]')
				?.textContent,
		).toBeFalsy();
	});
});
