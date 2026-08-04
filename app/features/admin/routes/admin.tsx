import * as React from "react";
import type { MetaFunction } from "react-router";
import { Form, Link, useFetcher, useLoaderData } from "react-router";
import { Avatar } from "~/components/Avatar";
import { Catcher } from "~/components/Catcher";
import { SendouButton } from "~/components/elements/Button";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import { UserSearch } from "~/components/elements/UserSearch";
import { Main } from "~/components/Main";
import { SubmitButton } from "~/components/SubmitButton";
import { SendouForm } from "~/form/SendouForm";
import { useHasRole } from "~/modules/permissions/hooks";
import { useSearchParam } from "~/modules/search-params/hooks";
import { metaTags } from "~/utils/remix";
import {
	impersonateUrl,
	SEED_URL,
	STOP_IMPERSONATING_URL,
	userPage,
} from "~/utils/urls";
import { action } from "../actions/admin.server";
import {
	banUserSchema,
	forcePatronSchema,
	friendCodeSearchSchema,
	giveApiAccessSchema,
	giveArtistSchema,
	giveTournamentOrganizerSchema,
	giveVideoAdderSchema,
	linkPlayerSchema,
	migrateUserSchema,
	refreshPlusTiersSchema,
	unbanUserSchema,
	updateFriendCodeSchema,
} from "../admin-schemas";
import { adminSearchParams } from "../admin-search-params";
import { DANGEROUS_CAN_ACCESS_DEV_CONTROLS } from "../core/dev-controls";
import { loader } from "../loaders/admin.server";

export { action, loader };

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Admin Panel",
		location: args.location,
	});
};

export default function AdminPage() {
	const isStaff = useHasRole("STAFF");

	// is dev user or is someone impersonating another user (allow them to stop)
	if (!isStaff && !DANGEROUS_CAN_ACCESS_DEV_CONTROLS) {
		return (
			<Main>
				<Impersonate />
			</Main>
		);
	}

	return (
		<Main halfWidth>
			<SendouTabs>
				<SendouTabList>
					<SendouTab id="actions">Actions</SendouTab>
					<SendouTab id="friend-code-look-up">Friend code look-up</SendouTab>
				</SendouTabList>
				<SendouTabPanel id="actions">
					<AdminActions />
				</SendouTabPanel>
				<SendouTabPanel id="friend-code-look-up">
					<FriendCodeLookUp />
				</SendouTabPanel>
			</SendouTabs>
		</Main>
	);
}

function FriendCodeLookUp() {
	const data = useLoaderData<typeof loader>();
	const [friendCode, setFriendCode] = useSearchParam(
		adminSearchParams,
		"friendCode",
	);

	return (
		<div className="stack lg">
			<SendouForm
				schema={friendCodeSearchSchema}
				defaultValues={{ friendCode: friendCode ?? "" }}
				submitButtonText="Search"
				onApply={({ friendCode }) => setFriendCode(friendCode)}
			>
				{({ FormField }) => <FormField name="friendCode" />}
			</SendouForm>
			<div className="stack lg">
				{data.friendCodeSearchUsers?.map((user) => (
					<Link
						key={user.id}
						to={userPage(user)}
						className="stack horizontal sm text-main-forced items-center"
					>
						<Avatar user={user} size="sm" />
						{user.username}
					</Link>
				))}
			</div>
		</div>
	);
}

function AdminActions() {
	const isStaff = useHasRole("STAFF");
	const isAdmin = useHasRole("ADMIN");
	const isDev = useHasRole("DEV");

	return (
		<div className="stack lg">
			{DANGEROUS_CAN_ACCESS_DEV_CONTROLS ? <Seed /> : null}
			{DANGEROUS_CAN_ACCESS_DEV_CONTROLS || isAdmin || isDev ? (
				<Impersonate />
			) : null}

			{isStaff ? <LinkPlayer /> : null}
			{isStaff ? <GiveArtist /> : null}
			{isStaff ? <GiveVideoAdder /> : null}
			{isAdmin ? <GiveTournamentOrganizer /> : null}
			{isAdmin ? <GiveApiAccess /> : null}
			{isStaff ? <UpdateFriendCode /> : null}
			{isStaff ? <MigrateUser /> : null}
			{isAdmin ? <ForcePatron /> : null}
			{isStaff ? <BanUser /> : null}
			{isStaff ? <UnbanUser /> : null}
			{isAdmin ? <RefreshPlusTiers /> : null}
		</div>
	);
}

function Impersonate() {
	const [userId, setUserId] = React.useState<number>();
	const { isImpersonating } = useLoaderData<typeof loader>();

	return (
		<Form
			method="post"
			action={impersonateUrl(userId ?? 0)}
			className="stack md"
			reloadDocument
		>
			<h2>Impersonate user</h2>
			<UserSearch
				label="User to log in as"
				onChange={(newUser) => setUserId(newUser?.id)}
			/>
			<div className="stack horizontal md">
				<SendouButton type="submit" isDisabled={!userId}>
					Go
				</SendouButton>
				{isImpersonating ? (
					<SendouButton type="submit" formAction={STOP_IMPERSONATING_URL}>
						Stop impersonating
					</SendouButton>
				) : null}
			</div>
		</Form>
	);
}

function MigrateUser() {
	return (
		<SendouForm
			schema={migrateUserSchema}
			title="Migrate user data"
			submitButtonText="Migrate"
		>
			{({ FormField }) => (
				<>
					<FormField name="oldUser" />
					<FormField name="newUser" />
				</>
			)}
		</SendouForm>
	);
}

function LinkPlayer() {
	return (
		<SendouForm
			schema={linkPlayerSchema}
			title="Link player"
			submitButtonText="Link player"
		>
			{({ FormField }) => (
				<>
					<FormField name="user" />
					<FormField name="playerId" />
				</>
			)}
		</SendouForm>
	);
}

function GiveArtist() {
	return (
		<SendouForm
			schema={giveArtistSchema}
			title="Add as artist"
			submitButtonText="Add as artist"
		>
			{({ FormField }) => <FormField name="user" />}
		</SendouForm>
	);
}

function GiveVideoAdder() {
	return (
		<SendouForm
			schema={giveVideoAdderSchema}
			title="Give video adder"
			submitButtonText="Add as video adder"
		>
			{({ FormField }) => <FormField name="user" />}
		</SendouForm>
	);
}

function GiveTournamentOrganizer() {
	return (
		<SendouForm
			schema={giveTournamentOrganizerSchema}
			title="Give tournament organizer"
			submitButtonText="Add as tournament organizer"
		>
			{({ FormField }) => <FormField name="user" />}
		</SendouForm>
	);
}

function GiveApiAccess() {
	return (
		<SendouForm
			schema={giveApiAccessSchema}
			title="Give API access"
			submitButtonText="Grant API access"
		>
			{({ FormField }) => <FormField name="user" />}
		</SendouForm>
	);
}

function UpdateFriendCode() {
	return (
		<SendouForm schema={updateFriendCodeSchema} title="Update friend code">
			{({ FormField }) => (
				<>
					<FormField name="user" />
					<FormField name="friendCode" />
				</>
			)}
		</SendouForm>
	);
}

function ForcePatron() {
	return (
		<SendouForm
			schema={forcePatronSchema}
			title="Force patron"
			submitButtonText="Save"
		>
			{({ FormField }) => (
				<>
					<FormField name="user" />
					<FormField name="patronTier" />
					<FormField name="patronExpiresAt" />
				</>
			)}
		</SendouForm>
	);
}

function BanUser() {
	return (
		<SendouForm
			schema={banUserSchema}
			title={<span className="text-warning">Ban user</span>}
			submitButtonText="Save"
		>
			{({ FormField }) => (
				<>
					<FormField name="user" />
					<FormField name="expiresAt" />
					<FormField name="reason" />
				</>
			)}
		</SendouForm>
	);
}

function UnbanUser() {
	return (
		<SendouForm
			schema={unbanUserSchema}
			title={<span className="text-warning">Unban user</span>}
			submitButtonText="Save"
		>
			{({ FormField }) => <FormField name="user" />}
		</SendouForm>
	);
}

function RefreshPlusTiers() {
	return (
		<SendouForm
			schema={refreshPlusTiersSchema}
			title="Refresh Plus Tiers"
			submitButtonText="Refresh"
		>
			{null}
		</SendouForm>
	);
}

function Seed() {
	const fetcher = useFetcher();

	return (
		<fetcher.Form
			className="stack md items-start"
			method="post"
			action={SEED_URL}
		>
			<SubmitButton state={fetcher.state}>Seed</SubmitButton>
		</fetcher.Form>
	);
}

export const ErrorBoundary = Catcher;
