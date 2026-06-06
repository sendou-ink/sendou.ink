import { Trash } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { Avatar } from "~/components/Avatar";
import { SendouButton } from "~/components/elements/Button";
import { UserSearch } from "~/components/elements/UserSearch";
import { FormMessage } from "~/components/FormMessage";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { Label } from "~/components/Label";
import { SubmitButton } from "~/components/SubmitButton";
import { useTournament } from "~/features/tournament/routes/to.$id";
import type { TournamentData } from "~/features/tournament-bracket/core/Tournament.server";

export { action } from "../actions/to.$id.admin.staff.server";

export default function TournamentAdminStaffPage() {
	const tournament = useTournament();

	return (
		<div className="stack lg">
			{/* Key so inputs are cleared after staff is added */}
			<StaffAdder key={tournament.ctx.staff.length} />
			<StaffList />
		</div>
	);
}

function StaffAdder() {
	const fetcher = useFetcher();

	return (
		<fetcher.Form method="post" className="stack sm">
			<div className="stack horizontal sm flex-wrap items-start">
				<div className="flex-same-size">
					<UserSearch name="userId" label="New staffer" isRequired />
				</div>
				<div className="stack horizontal sm items-end flex-same-size">
					<div className="w-full">
						<Label htmlFor="staff-role">Role</Label>
						<select name="role" id="staff-role" className="w-full">
							<option value="ORGANIZER">Organizer</option>
							<option value="STREAMER">Streamer</option>
						</select>
					</div>
					<SubmitButton
						state={fetcher.state}
						_action="ADD_STAFF"
						testId="add-staff-button"
					>
						Add
					</SubmitButton>
				</div>
			</div>
			<FormMessage type="info">
				Organizer has same permissions as you expect adding/removing staff,
				editing calendar event info and deleting the tournament. Streamer can
				only talk in chats and see room password/pool.
			</FormMessage>
		</fetcher.Form>
	);
}

function StaffList() {
	const { t } = useTranslation(["tournament"]);
	const tournament = useTournament();

	return (
		<div className="stack md">
			{tournament.ctx.staff.map((staff) => (
				<div
					key={staff.id}
					className="stack horizontal sm items-center"
					data-testid={`staff-id-${staff.id}`}
				>
					<Avatar size="xs" user={staff} />{" "}
					<div className="mr-4">
						<div>{staff.username}</div>
						<div className="text-lighter text-xs text-capitalize">
							{t(`tournament:staff.role.${staff.role}`)}
						</div>
					</div>
					<RemoveStaffButton staff={staff} />
				</div>
			))}
		</div>
	);
}

function RemoveStaffButton({
	staff,
}: {
	staff: TournamentData["ctx"]["staff"][number];
}) {
	const { t } = useTranslation(["tournament"]);

	return (
		<FormWithConfirm
			dialogHeading={`Remove ${staff.username} as ${t(
				`tournament:staff.role.${staff.role}`,
			)}?`}
			fields={[
				["userId", staff.id],
				["_action", "REMOVE_STAFF"],
			]}
			submitButtonText="Remove"
		>
			<SendouButton
				variant="minimal-destructive"
				size="small"
				data-testid="remove-staff-button"
			>
				<Trash className="small-icon" />
			</SendouButton>
		</FormWithConfirm>
	);
}
