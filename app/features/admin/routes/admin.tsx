import { Search } from "lucide-react";
import * as React from "react";
import type { MetaFunction } from "react-router";
import {
	Form,
	Link,
	useFetcher,
	useLoaderData,
	useNavigation,
	useSearchParams,
} from "react-router";
import { Avatar } from "~/components/Avatar";
import { Catcher } from "~/components/Catcher";
import { SendouButton } from "~/components/elements/Button";
import { SendouSelect, SendouSelectItem } from "~/components/elements/Select";
import {
	SendouTab,
	SendouTabList,
	SendouTabPanel,
	SendouTabs,
} from "~/components/elements/Tabs";
import { UserSearch } from "~/components/elements/UserSearch";
import { FormMessage } from "~/components/FormMessage";
import { Input } from "~/components/Input";
import { Main } from "~/components/Main";
import { SubmitButton } from "~/components/SubmitButton";
import { SEED_VARIATIONS } from "~/features/api-private/constants";
import { FRIEND_CODE_REGEXP_PATTERN } from "~/features/sendouq/q-constants";
import { useHasRole } from "~/modules/permissions/hooks";
import { metaTags } from "~/utils/remix";
import {
	impersonateUrl,
	SEED_URL,
	STOP_IMPERSONATING_URL,
	userPage,
} from "~/utils/urls";
import { action } from "../actions/admin.server";
import { DANGEROUS_CAN_ACCESS_DEV_CONTROLS } from "../core/dev-controls";
import { loader } from "../loaders/admin.server";
export { loader, action };

export const meta: MetaFunction = (args) => {
	return metaTags({
		title: "Admin Panel",
		location: args.location,
	});
};

export default function AdminPage() {
	return (
		<Main>
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
	const [searchParams, setSearchParams] = useSearchParams();
	const [friendCode, setFriendCode] = React.useState(
		searchParams.get("friendCode") ?? "",
	);
	const fetcher = useFetcher();

	return (
		<div>
			<div className="stack md horizontal justify-center">
				<Input
					placeholder="1234-5678-9101"
					name="friendCode"
					value={friendCode}
					onChange={(e) => setFriendCode(e.target.value)}
				/>
				<SubmitButton
					state={fetcher.state}
					icon={<Search />}
					onPress={() => setSearchParams({ friendCode })}
				>
					Search
				</SubmitButton>
			</div>
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

	return (
		<div className="stack lg">
			{DANGEROUS_CAN_ACCESS_DEV_CONTROLS ? <Seed /> : null}
			{DANGEROUS_CAN_ACCESS_DEV_CONTROLS ? <TestAdminNotification /> : null}
			{DANGEROUS_CAN_ACCESS_DEV_CONTROLS || isAdmin ? <Impersonate /> : null}

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
			{isAdmin ? <CleanUp /> : null}
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
	const [oldUserId, setOldUserId] = React.useState<number>();
	const [newUserId, setNewUserId] = React.useState<number>();
	const navigation = useNavigation();
	const fetcher = useFetcher();

	return (
		<fetcher.Form className="stack md" method="post">
			<h2>Migrate user data</h2>
			<div className="stack horizontal md">
				<UserSearch
					label="Old user"
					name="old-user"
					onChange={(newUser) => setOldUserId(newUser?.id)}
				/>
				<UserSearch
					label="New user"
					name="new-user"
					onChange={(newUser) => setNewUserId(newUser?.id)}
				/>
			</div>
			<div className="stack horizontal md">
				<SubmitButton
					type="submit"
					isDisabled={!oldUserId || !newUserId || navigation.state !== "idle"}
					_action="MIGRATE"
					state={fetcher.state}
				>
					Migrate
				</SubmitButton>
			</div>
			<FormMessage type="info">
				Note: data on "New user" will be deleted (e.g. builds)
			</FormMessage>
		</fetcher.Form>
	);
}

function LinkPlayer() {
	const fetcher = useFetcher();

	return (
		<fetcher.Form className="stack md" method="post">
			<h2>Link player</h2>
			<div className="stack horizontal md">
				<UserSearch label="User" name="user" />
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
				<UserSearch label="User" name="user" />
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
				<UserSearch label="User" name="user" />
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
			<UserSearch label="User" name="user" />
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

function GiveApiAccess() {
	const fetcher = useFetcher();

	return (
		<fetcher.Form className="stack md" method="post">
			<h2>Give API access</h2>
			<UserSearch label="User" name="user" />
			<div className="stack horizontal md">
				<SubmitButton type="submit" _action="API_ACCESS" state={fetcher.state}>
					Grant API access
				</SubmitButton>
			</div>
		</fetcher.Form>
	);
}

function UpdateFriendCode() {
	const fetcher = useFetcher();
	const id = React.useId();

	return (
		<fetcher.Form className="stack md" method="post">
			<h2>Update friend code</h2>
			<div className="stack horizontal md">
				<UserSearch label="User" name="user" />
				<div>
					<label htmlFor={id}>Friend code</label>
					<Input
						leftAddon="SW-"
						id={id}
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
				<UserSearch label="User" name="user" />

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
				<UserSearch label="User" name="user" />

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
			<UserSearch label="User" name="user" />
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
			<div className="stack horizontal md items-end">
				<SubmitButton state={fetcher.state}>Seed</SubmitButton>
				<SendouSelect
					label="Variation"
					name="variation"
					defaultSelectedKey="DEFAULT"
				>
					{SEED_VARIATIONS.map((variation) => (
						<SendouSelectItem key={variation} id={variation}>
							{variation}
						</SendouSelectItem>
					))}
				</SendouSelect>
			</div>
		</fetcher.Form>
	);
}

function TestAdminNotification() {
	const fetcher = useFetcher();

	return (
		<fetcher.Form method="post">
			<h2>Test Admin Notification</h2>
			<SubmitButton
				type="submit"
				_action="TEST_ADMIN_NOTIFICATION"
				state={fetcher.state}
			>
				Send Test
			</SubmitButton>
		</fetcher.Form>
	);
}

export const ErrorBoundary = Catcher;
