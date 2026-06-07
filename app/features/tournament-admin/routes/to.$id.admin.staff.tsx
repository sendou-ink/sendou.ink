import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { type Tables, TOURNAMENT_ORGANIZATION_ROLES } from "~/db/tables";
import { useTournament } from "~/features/tournament/routes/to.$id";
import { SendouForm } from "~/form/SendouForm";
import { adminStaffFormSchema } from "../tournament-admin-staff-schemas";

export { action } from "../actions/to.$id.admin.staff.server";

// xxx: Author/From Org <-> Added looks a bit confusing now
export default function TournamentAdminStaffPage() {
	const tournament = useTournament();

	const staff = tournament.ctx.staff.filter(
		(staffer) => staffer.id !== tournament.ctx.author.id,
	);

	return (
		<SendouForm
			schema={adminStaffFormSchema}
			fullWidth
			defaultValues={{
				staff: staff.map((staffer) => ({
					userId: staffer.id,
					role: staffer.role,
				})),
			}}
		>
			{({ FormField }) => (
				<>
					<ImplicitStaffRows />
					<FormField name="staff" />
				</>
			)}
		</SendouForm>
	);
}

const ORGANIZATION_STAFF_ROLES: ReadonlyArray<
	Tables["TournamentOrganizationMember"]["role"]
> = TOURNAMENT_ORGANIZATION_ROLES.filter((role) => role !== "MEMBER");

/**
 * Users who already have staff permissions implicitly (the tournament author
 * and organization staff) shown for info only - they can't be edited or removed.
 */
function ImplicitStaffRows() {
	const { t } = useTranslation(["tournament"]);
	const tournament = useTournament();
	const author = tournament.ctx.author;

	const organizationStaff = (tournament.ctx.organization?.members ?? []).filter(
		(member) =>
			member.userId !== author.id &&
			ORGANIZATION_STAFF_ROLES.includes(member.role),
	);

	return (
		<div className="stack sm">
			<StaffInfoRow
				user={author}
				testId="staff-author"
				roleText={`${t("tournament:staff.role.ORGANIZER")} (${t(
					"tournament:staff.author",
				)})`}
			/>
			{organizationStaff.map((member) => {
				const roleKey = member.role === "STREAMER" ? "STREAMER" : "ORGANIZER";

				return (
					<StaffInfoRow
						key={member.userId}
						user={member}
						roleText={`${t(`tournament:staff.role.${roleKey}`)} (${t(
							"tournament:staff.organization",
						)})`}
					/>
				);
			})}
		</div>
	);
}

function StaffInfoRow({
	user,
	roleText,
	testId,
}: {
	user: Pick<Tables["User"], "id" | "username" | "discordId" | "discordAvatar">;
	roleText: string;
	testId?: string;
}) {
	return (
		<div
			className="stack horizontal sm items-center text-lighter"
			data-testid={testId}
		>
			<Avatar size="xs" user={user} />
			<div>
				<div>{user.username}</div>
				<div className="text-xs text-capitalize">{roleText}</div>
			</div>
		</div>
	);
}
