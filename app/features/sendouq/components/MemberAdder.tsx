import { Check, Clipboard, Plus } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useFetcher } from "react-router";
import { useCopyToClipboard } from "react-use";
import { SendouButton } from "~/components/elements/Button";
import { SubmitButton } from "~/components/SubmitButton";
import { useFriendsForAdding } from "~/hooks/swr";
import {
	SENDOU_INK_BASE_URL,
	SENDOUQ_PREPARING_PAGE,
	sendouQInviteLink,
} from "~/utils/urls";
import type { SendouQPreparingAction } from "../actions/q.preparing.server";

export function MemberAdder({
	inviteCode,
	groupMemberIds,
}: {
	inviteCode: string;
	groupMemberIds: number[];
}) {
	const { t } = useTranslation(["q"]);
	const [friend, setFriend] = React.useState<number>();
	const fetcher = useFetcher<SendouQPreparingAction>();
	const inviteLink = `${SENDOU_INK_BASE_URL}${sendouQInviteLink(inviteCode)}`;
	const [state, copyToClipboard] = useCopyToClipboard();
	const [copySuccess, setCopySuccess] = React.useState(false);

	const showMemberAddError = fetcher.data?.error === "taken";

	const groupMembersJoined = groupMemberIds.join(",");
	// biome-ignore lint/correctness/useExhaustiveDependencies: biome migration
	React.useEffect(() => {
		setFriend(undefined);
	}, [groupMembersJoined]);

	React.useEffect(() => {
		if (!state.value) return;

		setCopySuccess(true);
		const timeout = setTimeout(() => setCopySuccess(false), 2000);

		return () => clearTimeout(timeout);
	}, [state]);

	return (
		<div className="stack md flex-wrap justify-center">
			<div>
				<label htmlFor="invite">{t("q:looking.groups.adder.inviteLink")}</label>
				<div className="stack horizontal sm items-center">
					<input type="text" value={inviteLink} readOnly id="invite" />
					<SendouButton
						shape="square"
						variant={copySuccess ? "outlined-success" : "outlined"}
						onPress={() => copyToClipboard(inviteLink)}
						icon={copySuccess ? <Check /> : <Clipboard />}
						aria-label="Copy to clipboard"
					/>
				</div>
			</div>
			<fetcher.Form method="post" action={SENDOUQ_PREPARING_PAGE}>
				<label htmlFor="players">{t("q:looking.groups.adder.quickAdd")}</label>
				<div className="stack horizontal sm items-center">
					<FriendDropdown
						setFriend={setFriend}
						groupMemberIds={groupMemberIds}
					/>
					<SubmitButton
						shape="square"
						variant="outlined"
						_action="ADD_FRIEND"
						isDisabled={!friend}
						icon={<Plus />}
					/>
				</div>
			</fetcher.Form>
			{showMemberAddError ? (
				<div className="text-xxs text-center font-bold text-error">
					{t("q:looking.groups.adder.error")}
				</div>
			) : null}
		</div>
	);
}

function FriendDropdown({
	setFriend,
	groupMemberIds,
}: {
	setFriend: (id: number | undefined) => void;
	groupMemberIds: number[];
}) {
	const { t } = useTranslation(["q"]);
	const { friends, teams } = useFriendsForAdding();

	if (!friends || friends.length === 0) {
		return <select name="id" id="players" disabled />;
	}

	const friendsNotInGroup = friends.filter(
		(friend) => !groupMemberIds.includes(friend.id),
	);

	const othersOptions = friendsNotInGroup
		.filter((player) => !player.teamId)
		.map((player) => {
			return (
				<option key={player.id} value={player.id}>
					{player.username}
				</option>
			);
		});

	return (
		<select
			name="id"
			id="players"
			onChange={(e) =>
				setFriend(e.target.value ? Number(e.target.value) : undefined)
			}
		>
			<option value="">{t("q:looking.groups.adder.select")}</option>
			{teams?.map((team) => {
				return (
					<optgroup label={team.name} key={team.id}>
						{friendsNotInGroup
							.filter((player) => player.teamId === team.id)
							.map((player) => {
								return (
									<option key={player.id} value={player.id}>
										{player.username}
									</option>
								);
							})}
					</optgroup>
				);
			})}
			{teams && teams.length > 0 && othersOptions.length > 0 ? (
				<optgroup label={t("q:looking.groups.adder.others")}>
					{othersOptions}
				</optgroup>
			) : (
				othersOptions
			)}
		</select>
	);
}
