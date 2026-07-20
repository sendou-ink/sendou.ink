import { Plus } from "lucide-react";
import { Link, useLoaderData, useMatches } from "react-router";
import { Divider } from "~/components/Divider";
import { SendouButton } from "~/components/elements/Button";
import { SendouDialog } from "~/components/elements/Dialog";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { LocaleTime } from "~/components/LocaleTime";
import { useUser } from "~/features/auth/core/user";
import { addModNoteSchema } from "~/features/user-page/user-page-schemas";
import { ReportsBarChart } from "~/features/user-report/components/ReportsBarChart";
import { USER_REPORT_CATEGORY_LABELS } from "~/features/user-report/user-report-constants";
import { SendouForm } from "~/form";
import { useFormatDistanceToNow } from "~/hooks/intl/useFormatDistanceToNow";
import invariant from "~/utils/invariant";
import { sendouQMatchPage, userPage } from "~/utils/urls";
import { action } from "../actions/u.$identifier.admin.server";
import { SubPageHeader } from "../components/SubPageHeader";
import { loader } from "../loaders/u.$identifier.admin.server";
import type { UserPageLoaderData } from "../loaders/u.$identifier.server";

export { action, loader };

export default function UserAdminPage() {
	const [, parentRoute] = useMatches();
	invariant(parentRoute);
	const layoutData = parentRoute.loaderData as UserPageLoaderData;

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
					Reports
				</Divider>
				<Reports />
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

	return (
		<dl>
			<dt>User account created at</dt>
			<dd>
				{data.createdAt ? (
					<LocaleTime
						date={data.createdAt}
						options={{
							year: "numeric",
							month: "numeric",
							day: "numeric",
							hour: "2-digit",
							minute: "2-digit",
						}}
					/>
				) : (
					"―"
				)}
			</dd>

			<dt>Discord account created at</dt>
			<dd>
				<LocaleTime
					date={new Date(data.discordAccountCreatedAt)}
					options={{
						year: "numeric",
						month: "numeric",
						day: "numeric",
						hour: "2-digit",
						minute: "2-digit",
					}}
				/>
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
					<LocaleTime
						date={note.createdAt}
						options={{
							year: "numeric",
							month: "numeric",
							day: "numeric",
							hour: "numeric",
							minute: "numeric",
						}}
						className="font-bold"
					/>
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

function Reports() {
	const data = useLoaderData<typeof loader>();
	const formatDistanceToNow = useFormatDistanceToNow();

	if (data.reports.length === 0) {
		return <p className="text-center text-lighter italic">No reports</p>;
	}

	return (
		<div className="stack md">
			<p className="font-bold">{data.reports.length} total</p>
			<ReportsBarChart monthlyCounts={data.reportsMonthlyCounts} />
			<div className="stack sm" data-testid="user-reports-list">
				{data.reports.map((report) => (
					<details key={report.id}>
						<summary>
							<span className="font-bold">
								{USER_REPORT_CATEGORY_LABELS[report.category]}
							</span>{" "}
							- By:{" "}
							<Link
								to={userPage({
									discordId: report.reporterDiscordId,
									customUrl: report.reporterCustomUrl,
								})}
							>
								{report.reporterUsername}
							</Link>{" "}
							- {formatDistanceToNow(report.createdAt)}
						</summary>
						<p className="ml-2 whitespace-pre-wrap">{report.description}</p>
						{report.matchId !== null ? (
							<Link
								className="ml-2 text-xs"
								to={sendouQMatchPage(report.matchId)}
							>
								SendouQ match #{report.matchId}
							</Link>
						) : null}
					</details>
				))}
			</div>
		</div>
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
					<LocaleTime
						date={ban.createdAt}
						options={{
							year: "numeric",
							month: "numeric",
							day: "numeric",
							hour: "numeric",
							minute: "numeric",
						}}
						className="font-bold"
					/>
					{ban.banned === 0 ? (
						<p className="text-success ml-2">Unbanned</p>
					) : (
						<p className="text-warning ml-2">Banned</p>
					)}
					<p className="ml-2">By: {ban.username}</p>
					{typeof ban.banned === "number" && ban.banned !== 0 ? (
						<p className="ml-2">
							Banned till:{" "}
							{ban.banned !== 1 ? (
								<LocaleTime
									date={ban.banned}
									options={{
										year: "numeric",
										month: "numeric",
										day: "numeric",
										hour: "numeric",
										minute: "numeric",
									}}
									inline
								/>
							) : (
								"No end date set"
							)}
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
						<LocaleTime
							date={fc.createdAt}
							options={{
								year: "numeric",
								month: "numeric",
								day: "numeric",
								hour: "numeric",
								minute: "numeric",
							}}
							inline
						/>
					</p>
					<p className="ml-2">Submitted by: {fc.submitterUsername}</p>
				</div>
			))}
		</div>
	);
}
