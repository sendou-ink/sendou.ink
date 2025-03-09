import type { MetaFunction } from "@remix-run/node";
import {
	Form,
	useFetcher,
	useLoaderData,
	useNavigation,
} from "@remix-run/react";
import * as React from "react";
import { Button } from "~/components/Button";
import { Catcher } from "~/components/Catcher";
import { Input } from "~/components/Input";
import { Main } from "~/components/Main";
import { SubmitButton } from "~/components/SubmitButton";
import { UserSearch } from "~/components/UserSearch";
import { useUser } from "~/features/auth/core/user";
import { FRIEND_CODE_REGEXP_PATTERN } from "~/features/sendouq/q-constants";
import { isAdmin, isMod } from "~/permissions";
import { SEED_URL, STOP_IMPERSONATING_URL, impersonateUrl } from "~/utils/urls";

import { metaTags } from "~/utils/remix";
import { action } from "../actions/admin.server";
import { loader } from "../loaders/admin.server";
export { action, loader };

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Admin Panel",
		location: args.location,
	});
};

export default function AdminPage() {
	const user = useUser();

	return (
		<Main className="stack lg">
			{process.env.NODE_ENV !== "production" && <Seed />}

			{isMod(user) ? <LinkPlayer /> : null}
			{isMod(user) ? <GiveArtist /> : null}
			{isMod(user) ? <GiveVideoAdder /> : null}
			{isMod(user) ? <GiveTournamentOrganizer /> : null}
			{isMod(user) ? <UpdateFriendCode /> : null}

			{process.env.NODE_ENV !== "production" || isAdmin(user) ? (
				<Impersonate />
			) : null}
			{isMod(user) ? <MigrateUser /> : null}
			{isAdmin(user) ? <ForcePatron /> : null}
			{isMod(user) ? <BanUser /> : null}
			{isMod(user) ? <UnbanUser /> : null}
			{isAdmin(user) ? <RefreshPlusTiers /> : null}
			{isAdmin(user) ? <CleanUp /> : null}
		</Main>
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
			<div>
				<label>User to log in as</label>
				<UserSearch
					inputName="user"
					onChange={(newUser) => setUserId(newUser.id)}
				/>
			</div>
			<div className="stack horizontal md">
				<Button type="submit" disabled={!userId}>
					Go
				</Button>
				{isImpersonating ? (
					<Button type="submit" formAction={STOP_IMPERSONATING_URL}>
						Stop impersonating
					</Button>
				) : null}
			</div>
		</Form>
	);
}

function MigrateUser() {
	const [oldUserId, setOldUserId] = React.useState<number>();
	const [newUserId, setNewUserId] = React.useState<number>();
	const navigation = useNavigation();
	const fetcher = useFetcher();

	const submitButtonText =
		navigation.state === "submitting"
			? "Migrating..."
			: navigation.state === "loading"
				? "Migrated!"
				: "Migrate";

	return (
		<fetcher.Form className="stack md" method="post">
			<h2>Migrate user data</h2>
			<div className="stack horizontal md">
				<div>
					<label>Old user</label>
					<UserSearch
						inputName="old-user"
						onChange={(newUser) => setOldUserId(newUser.id)}
					/>
				</div>
				<div>
					<label>New user</label>
					<UserSearch
						inputName="new-user"
						onChange={(newUser) => setNewUserId(newUser.id)}
					/>
				</div>
			</div>
			<div className="stack horizontal md">
				<SubmitButton
					type="submit"
					disabled={!oldUserId || !newUserId || navigation.state !== "idle"}
					_action="MIGRATE"
					state={fetcher.state}
				>
					{submitButtonText}
				</SubmitButton>
			</div>
		</fetcher.Form>
	);
}

function LinkPlayer() {
	const fetcher = useFetcher();

	return (
		<fetcher.Form className="stack md" method="post">
			<h2>Link player</h2>
			<div className="stack horizontal md">
				<div>
					<label>User</label>
					<UserSearch inputName="user" />
				</div>
				<div>
					<label>Player ID</label>
					<input type="number" name="playerId" />
				</div>
			</div>
			<div className="stack horizontal md">
				<SubmitButton type="submit" _action="LINK_PLAYER" state={fetcher.state}>
					Link player
				</SubmitButton>
			</div>
		</fetcher.Form>
	);
}

function GiveArtist() {
	const fetcher = useFetcher();

	return (
		<fetcher.Form className="stack md" method="post">
			<h2>Add as artist</h2>
			<div className="stack horizontal md">
				<div>
					<label>User</label>
					<UserSearch inputName="user" />
				</div>
			</div>
			<div className="stack horizontal md">
				<SubmitButton type="submit" _action="ARTIST" state={fetcher.state}>
					Add as artist
				</SubmitButton>
			</div>
		</fetcher.Form>
	);
}

function GiveVideoAdder() {
	const fetcher = useFetcher();

	return (
		<fetcher.Form className="stack md" method="post">
			<h2>Give video adder</h2>
			<div className="stack horizontal md">
				<div>
					<label>User</label>
					<UserSearch inputName="user" />
				</div>
			</div>
			<div className="stack horizontal md">
				<SubmitButton type="submit" _action="VIDEO_ADDER" state={fetcher.state}>
					Add as video adder
				</SubmitButton>
			</div>
		</fetcher.Form>
	);
}

function GiveTournamentOrganizer() {
	const fetcher = useFetcher();

	return (
		<fetcher.Form className="stack md" method="post">
			<h2>Give tournament organizer</h2>
			<div className="stack horizontal md">
				<div>
					<label>User</label>
					<UserSearch inputName="user" />
				</div>
			</div>
			<div className="stack horizontal md">
				<SubmitButton
					type="submit"
					_action="TOURNAMENT_ORGANIZER"
					state={fetcher.state}
				>
					Add as tournament organizer
				</SubmitButton>
			</div>
		</fetcher.Form>
	);
}

function UpdateFriendCode() {
	const fetcher = useFetcher();

	return (
		<fetcher.Form className="stack md" method="post">
			<h2>Update friend code</h2>
			<div className="stack horizontal md">
				<div>
					<label>User</label>
					<UserSearch inputName="user" />
				</div>
				<div>
					<label>Friend code</label>
					<Input
						leftAddon="SW-"
						id="friendCode"
						name="friendCode"
						pattern={FRIEND_CODE_REGEXP_PATTERN}
						placeholder="1234-5678-9012"
					/>
				</div>
			</div>
			<div className="stack horizontal md">
				<SubmitButton
					type="submit"
					_action="UPDATE_FRIEND_CODE"
					state={fetcher.state}
				>
					Submit
				</SubmitButton>
			</div>
		</fetcher.Form>
	);
}

function ForcePatron() {
	const fetcher = useFetcher();

	return (
		<fetcher.Form className="stack md" method="post">
			<h2>Force patron</h2>
			<div className="stack horizontal md">
				<div>
					<label>User</label>
					<UserSearch inputName="user" />
				</div>

				<div>
					<label>Tier</label>
					<select name="patronTier">
						<option value="1">Support</option>
						<option value="2">Supporter</option>
						<option value="3">Supporter+</option>
					</select>
				</div>

				<div>
					<label>Patron till</label>
					<input name="patronTill" type="date" />
				</div>
			</div>
			<div className="stack horizontal md">
				<SubmitButton
					type="submit"
					_action="FORCE_PATRON"
					state={fetcher.state}
				>
					Save
				</SubmitButton>
			</div>
		</fetcher.Form>
	);
}

function BanUser() {
	const fetcher = useFetcher();

	return (
		<fetcher.Form className="stack md" method="post">
			<h2 className="text-warning">Ban user</h2>
			<div className="stack horizontal md">
				<div>
					<label>User</label>
					<UserSearch inputName="user" />
				</div>

				<div>
					<label>Banned till</label>
					<input name="duration" type="datetime-local" />
				</div>

				<div>
					<label>Reason</label>
					<input name="reason" type="text" />
				</div>
			</div>
			<div className="stack horizontal md">
				<SubmitButton type="submit" _action="BAN_USER" state={fetcher.state}>
					Save
				</SubmitButton>
			</div>
		</fetcher.Form>
	);
}

function UnbanUser() {
	const fetcher = useFetcher();

	return (
		<fetcher.Form className="stack md" method="post">
			<h2 className="text-warning">Unban user</h2>
			<div>
				<label>User</label>
				<UserSearch inputName="user" />
			</div>
			<div className="stack horizontal md">
				<SubmitButton type="submit" _action="UNBAN_USER" state={fetcher.state}>
					Save
				</SubmitButton>
			</div>
		</fetcher.Form>
	);
}

function RefreshPlusTiers() {
	const fetcher = useFetcher();

	return (
		<fetcher.Form method="post">
			<h2>Refresh Plus Tiers</h2>
			<SubmitButton type="submit" _action="REFRESH" state={fetcher.state}>
				Refresh
			</SubmitButton>
		</fetcher.Form>
	);
}

function CleanUp() {
	const fetcher = useFetcher();

	return (
		<fetcher.Form method="post">
			<h2>DB Clean up</h2>
			<SubmitButton type="submit" _action="CLEAN_UP" state={fetcher.state}>
				Clean up
			</SubmitButton>
		</fetcher.Form>
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
			<h2>Seed</h2>
			<SubmitButton state={fetcher.state}>Seed</SubmitButton>
		</fetcher.Form>
	);
}

export const ErrorBoundary = Catcher;
