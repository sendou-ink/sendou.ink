import { SquarePen } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { Divider } from "~/components/Divider";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { type Tables, TOURNAMENT_ORGANIZATION_ROLES } from "~/db/tables";
import { useTournament } from "~/features/tournament/routes/to.$id";
import { SendouForm } from "~/form/SendouForm";
import { tournamentOrganizationEditPage } from "~/utils/urls";
import { adminStaffFormSchema } from "../tournament-admin-staff-schemas";

export { action } from "../actions/to.$id.admin.staff.server";

export default function TournamentAdminStaffPage() {
	const [isEditing, setIsEditing] = React.useState(false);
	const tournament = useTournament();

	const staff = tournament.ctx.staff.filter(
		(staffer) => staffer.id !== tournament.ctx.author.id,
	);

	return (
		<div className="stack lg">
			<ImplicitStaffRows />
			{isEditing ? (
				<AddedForEventForm
					staff={staff}
					onSuccess={() => setIsEditing(false)}
					onCancel={() => setIsEditing(false)}
				/>
			) : (
				<AddedForEventRows staff={staff} onEdit={() => setIsEditing(true)} />
			)}
		</div>
	);
}

type EventStaff = Array<
	Pick<Tables["User"], "id" | "username" | "discordId" | "discordAvatar"> & {
		role: Tables["TournamentStaff"]["role"];
	}
>;

function AddedForEventForm({
	staff,
	onSuccess,
	onCancel,
}: {
	staff: EventStaff;
	onSuccess: () => void;
	onCancel: () => void;
}) {
	const { t } = useTranslation(["common"]);

	return (
		<SendouForm
			schema={adminStaffFormSchema}
			fullWidth
			submitButtonText={t("common:actions.save")}
			onSuccess={onSuccess}
			secondarySubmit={
				<SendouButton variant="destructive" onPress={onCancel}>
					{t("common:actions.cancel")}
				</SendouButton>
			}
			defaultValues={{
				staff: staff.map((staffer) => ({
					userId: staffer.id,
					role: staffer.role,
				})),
			}}
		>
			{({ FormField }) => (
				<AddedForEventSection>
					<FormField name="staff" />
				</AddedForEventSection>
			)}
		</SendouForm>
	);
}

function AddedForEventRows({
	staff,
	onEdit,
}: {
	staff: EventStaff;
	onEdit: () => void;
}) {
	const { t } = useTranslation(["common", "tournament"]);

	return (
		<AddedForEventSection>
			{staff.length > 0 ? (
				<div className="stack sm">
					{staff.map((staffer) => (
						<StaffInfoRow
							key={staffer.id}
							user={staffer}
							testId={`staff-row-${staffer.username}`}
							roleText={t(`tournament:staff.role.${staffer.role}`)}
						/>
					))}
				</div>
			) : null}
			<SendouButton
				icon={<SquarePen />}
				variant="outlined"
				size="small"
				onPress={onEdit}
				className="m-0-auto"
				data-testid="edit-staff-button"
			>
				{t("common:actions.edit")}
			</SendouButton>
		</AddedForEventSection>
	);
}

function AddedForEventSection({ children }: { children: React.ReactNode }) {
	const { t } = useTranslation(["tournament"]);

	return (
		<div className="stack md">
			<Divider smallText>{t("tournament:staff.divider.addedForEvent")}</Divider>
			{children}
		</div>
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
	const organization = tournament.ctx.organization;

	const organizationStaff = (organization?.members ?? []).filter(
		(member) =>
			member.userId !== author.id &&
			ORGANIZATION_STAFF_ROLES.includes(member.role),
	);

	return (
		<div className="stack md">
			<Divider smallText>
				{t("tournament:staff.divider.fromOrganization")}
			</Divider>
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
			{organization ? (
				<LinkButton
					to={tournamentOrganizationEditPage(organization.slug)}
					icon={<SquarePen />}
					variant="outlined"
					size="small"
					className="m-0-auto"
					testId="edit-org-button"
				>
					{t("tournament:staff.editOrganization")}
				</LinkButton>
			) : null}
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
