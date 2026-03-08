import { Plus } from "lucide-react";
import { useLoaderData, useMatches } from "react-router";
import { Divider } from "~/components/Divider";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { useUser } from "~/features/auth/core/user";
import { addModNoteSchema } from "~/features/user-page/user-page-schemas";
import { SendouForm } from "~/form";
import { useTimeFormat } from "~/hooks/useTimeFormat";
import { databaseTimestampToDate } from "~/utils/dates";
import invariant from "~/utils/invariant";
import { userPage } from "~/utils/urls";
import { action } from "../actions/u.$identifier.admin.server";
import { SubPageHeader } from "../components/SubPageHeader";
import { loader } from "../loaders/u.$identifier.admin.server";
import type { UserPageLoaderData } from "../loaders/u.$identifier.server";
export { loader, action };

export default function UserAdminPage() {
	const [, parentRoute] = useMatches();
	invariant(parentRoute);
	const layoutData = parentRoute.data as UserPageLoaderData;

	return (
		<div className="stack xl">
			<SubPageHeader
				user={layoutData.user}
				backTo={userPage(layoutData.user)}
			/>
			<AccountInfos />

			<div className="stack sm">
				<Divider smallText className="font-bold">
					Friend codes
				</Divider>
				<FriendCodes />
			</div>

			<div className="stack sm">
				<Divider smallText className="font-bold">
					Mod notes
				</Divider>
				<ModNotes />
			</div>

			<div className="stack sm">
				<Divider smallText className="font-bold">
					Ban log
				</Divider>
				<BanLog />
			</div>
		</div>
	);
}

function AccountInfos() {
	const data = useLoaderData<typeof loader>();
	const { formatDateTime } = useTimeFormat();

	return (
		<dl>
			<dt>User account created at</dt>
			<dd>
				{data.createdAt
					? formatDateTime(databaseTimestampToDate(data.createdAt), {
							year: "numeric",
							month: "long",
							day: "numeric",
							hour: "2-digit",
							minute: "2-digit",
						})
					: "―"}
			</dd>

			<dt>Discord account created at</dt>
			<dd>
				{formatDateTime(new Date(data.discordAccountCreatedAt), {
					year: "numeric",
					month: "long",
					day: "numeric",
					hour: "2-digit",
					minute: "2-digit",
				})}
			</dd>

			<dt>Discord ID</dt>
			<dd>{data.discordId}</dd>

			<dt>Discord name</dt>
			<dd>{data.discordUniqueName}</dd>

			<dt>Artist role</dt>
			<dd>{data.isArtist ? "Yes" : "No"}</dd>

			<dt>Video adder role</dt>
			<dd>{data.isVideoAdder ? "Yes" : "No"}</dd>

			<dt>Tournament adder role</dt>
			<dd>{data.isTournamentOrganizer ? "Yes" : "No"}</dd>

			<dt>SQ leaderboard Plus Server admission skipped</dt>
			<dd>
				{data.plusSkippedForSeasonNth
					? `For season ${data.plusSkippedForSeasonNth}`
					: "No"}
			</dd>
		</dl>
	);
}

function ModNotes() {
	const user = useUser();
	const data = useLoaderData<typeof loader>();
	const { formatDateTime } = useTimeFormat();

	if (!data.modNotes || data.modNotes.length === 0) {
		return (
			<div>
				<p className="text-center text-lighter italic">No mod notes</p>
				<NewModNoteDialog />
			</div>
		);
	}

	return (
		<div className="stack lg">
			{data.modNotes.map((note) => (
				<div key={note.noteId}>
					<p className="font-bold">
						{formatDateTime(databaseTimestampToDate(note.createdAt), {
							year: "numeric",
							month: "long",
							day: "numeric",
							hour: "2-digit",
							minute: "2-digit",
						})}
					</p>
					<p className="ml-2">By: {note.username}</p>
					<p className="ml-2 whitespace-pre-wrap">Note: {note.text}</p>
					{note.discordId === user?.discordId ? (
						<FormWithConfirm
							dialogHeading="Delete mod note?"
							fields={[
								["_action", "DELETE_MOD_NOTE"],
								["noteId", note.noteId],
							]}
						>
							<SendouButton
								variant="minimal-destructive"
								type="submit"
								size="small"
								className="ml-2"
							>
								Delete
							</SendouButton>
						</FormWithConfirm>
					) : null}
				</div>
			))}
			<NewModNoteDialog key={data.modNotes.length} />
		</div>
	);
}

function NewModNoteDialog() {
	return (
		<SendouDialog
			heading="Adding a new mod note"
			showCloseButton
			trigger={
				<SendouButton icon={<Plus />} className="ml-auto mt-6">
					New note
				</SendouButton>
			}
		>
			<SendouForm schema={addModNoteSchema}>
				{({ FormField }) => <FormField name="value" />}
			</SendouForm>
		</SendouDialog>
	);
}

function BanLog() {
	const data = useLoaderData<typeof loader>();
	const { formatDateTime } = useTimeFormat();

	if (!data.banLogs || data.banLogs.length === 0) {
		return <p className="text-center text-lighter italic">No bans</p>;
	}

	return (
		<div className="stack lg">
			{data.banLogs.map((ban) => (
				<div key={ban.createdAt}>
					<p className="font-bold">
						{formatDateTime(databaseTimestampToDate(ban.createdAt), {
							year: "numeric",
							month: "long",
							day: "numeric",
							hour: "2-digit",
							minute: "2-digit",
						})}
					</p>
					{ban.banned === 0 ? (
						<p className="text-success ml-2">Unbanned</p>
					) : (
						<p className="text-warning ml-2">Banned</p>
					)}
					<p className="ml-2">By: {ban.username}</p>
					{typeof ban.banned === "number" && ban.banned !== 0 ? (
						<p className="ml-2">
							Banned till:{" "}
							{ban.banned !== 1
								? formatDateTime(databaseTimestampToDate(ban.banned), {
										year: "numeric",
										month: "long",
										day: "numeric",
										hour: "2-digit",
										minute: "2-digit",
									})
								: "No end date set"}
						</p>
					) : null}
					{ban.banned !== 0 ? (
						<p className="ml-2">
							Reason:{" "}
							{ban.bannedReason || (
								<span className="italic">No reason set</span>
							)}
						</p>
					) : null}
				</div>
			))}
		</div>
	);
}

function FriendCodes() {
	const data = useLoaderData<typeof loader>();
	const { formatDateTime } = useTimeFormat();

	if (!data.friendCodes || data.friendCodes.length === 0) {
		return <p className="text-center text-lighter italic">No friend codes</p>;
	}

	return (
		<div className="stack lg">
			{data.friendCodes.map((fc, index) => (
				<div key={fc.createdAt}>
					<p className="font-bold">{fc.friendCode}</p>
					<p className="ml-2">
						{index === 0 ? "Current" : "Past"} - Added on{" "}
						{formatDateTime(databaseTimestampToDate(fc.createdAt), {
							year: "numeric",
							month: "long",
							day: "numeric",
							hour: "2-digit",
							minute: "2-digit",
						})}
					</p>
					<p className="ml-2">Submitted by: {fc.submitterUsername}</p>
				</div>
			))}
		</div>
	);
}
