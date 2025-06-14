import { useLoaderData } from "@remix-run/react";
import type { z } from "zod/v4";
import { Divider } from "~/components/Divider";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { Main } from "~/components/Main";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { SendouForm } from "~/components/form/SendouForm";
import { TextAreaFormField } from "~/components/form/TextAreaFormField";
import { PlusIcon } from "~/components/icons/Plus";
import { useUser } from "~/features/auth/core/user";
import { USER } from "~/features/user-page/user-page-constants";
import { addModNoteSchema } from "~/features/user-page/user-page-schemas";
import { databaseTimestampToDate } from "~/utils/dates";
import styles from "./u.$identifier.admin.module.css";

import { action } from "../actions/u.$identifier.admin.server";
import { loader } from "../loaders/u.$identifier.admin.server";
export { loader, action };

export default function UserAdminPage() {
	return (
		<Main className="stack xl">
			<AccountInfos />
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
		</Main>
	);
}

function AccountInfos() {
	const data = useLoaderData<typeof loader>();

	return (
		<dl className={styles.dl}>
			<dt>User account created at</dt>
			<dd>
				{data.createdAt
					? databaseTimestampToDate(data.createdAt).toLocaleString("en-US", {
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
				{new Date(data.discordAccountCreatedAt).toLocaleString("en-US", {
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
						{databaseTimestampToDate(note.createdAt).toLocaleString("en-US", {
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

type FormFields = z.infer<typeof addModNoteSchema>;

function NewModNoteDialog() {
	return (
		<SendouDialog
			heading="Adding a new mod note"
			showCloseButton
			trigger={
				<SendouButton icon={<PlusIcon />} className="ml-auto mt-6">
					New note
				</SendouButton>
			}
		>
			<SendouForm
				schema={addModNoteSchema}
				defaultValues={{
					value: "",
					_action: "ADD_MOD_NOTE",
				}}
			>
				<TextAreaFormField<FormFields>
					name="value"
					label="Text"
					maxLength={USER.MOD_NOTE_MAX_LENGTH}
					bottomText="This note will be only visible to staff members."
				/>
			</SendouForm>
		</SendouDialog>
	);
}

function BanLog() {
	const data = useLoaderData<typeof loader>();

	if (!data.banLogs || data.banLogs.length === 0) {
		return <p className="text-center text-lighter italic">No bans</p>;
	}

	return (
		<div className="stack lg">
			{data.banLogs.map((ban) => (
				<div key={ban.createdAt}>
					<p className="font-bold">
						{databaseTimestampToDate(ban.createdAt).toLocaleString("en-US", {
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
								? databaseTimestampToDate(ban.banned).toLocaleString("en-US", {
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
