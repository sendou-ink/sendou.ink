import { useFetcher } from "@remix-run/react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useCopyToClipboard } from "react-use";
import { Button } from "~/components/Button";
import { SubmitButton } from "~/components/SubmitButton";
import { CheckmarkIcon } from "~/components/icons/Checkmark";
import { ClipboardIcon } from "~/components/icons/Clipboard";
import { PlusIcon } from "~/components/icons/Plus";
import { useTrusted } from "~/hooks/swr";
import {
	SENDOUQ_PREPARING_PAGE,
	SENDOU_INK_BASE_URL,
	sendouQInviteLink,
} from "~/utils/urls";
import type { SendouQPreparingAction } from "../routes/q.preparing";

export function MemberAdder({
	inviteCode,
	groupMemberIds,
}: {
	inviteCode: string;
	groupMemberIds: number[];
}) {
	const { t } = useTranslation(["q"]);
	const [truster, setTruster] = React.useState<number>();
	const fetcher = useFetcher<SendouQPreparingAction>();
	const inviteLink = `${SENDOU_INK_BASE_URL}${sendouQInviteLink(inviteCode)}`;
	const [state, copyToClipboard] = useCopyToClipboard();
	const [copySuccess, setCopySuccess] = React.useState(false);

	const showMemberAddError = fetcher.data?.error === "taken";

	const groupMembersJoined = groupMemberIds.join(",");
	// biome-ignore lint/correctness/useExhaustiveDependencies: biome migration
	React.useEffect(() => {
		setTruster(undefined);
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
					<input
						type="text"
						value={inviteLink}
						readOnly
						id="invite"
						className="q__member-adder__input"
					/>
					<Button
						variant={copySuccess ? "outlined-success" : "outlined"}
						onClick={() => copyToClipboard(inviteLink)}
						icon={copySuccess ? <CheckmarkIcon /> : <ClipboardIcon />}
						aria-label="Copy to clipboard"
					/>
				</div>
			</div>
			<fetcher.Form method="post" action={SENDOUQ_PREPARING_PAGE}>
				<label htmlFor="players">{t("q:looking.groups.adder.quickAdd")}</label>
				<div className="stack horizontal sm items-center">
					<TrusterDropdown
						setTruster={setTruster}
						groupMemberIds={groupMemberIds}
					/>
					<SubmitButton
						variant="outlined"
						_action="ADD_TRUSTED"
						disabled={!truster}
						icon={<PlusIcon />}
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

function TrusterDropdown({
	setTruster,
	groupMemberIds,
}: {
	setTruster: (id: number | undefined) => void;
	groupMemberIds: number[];
}) {
	const { t } = useTranslation(["q"]);
	const { trusters, teams } = useTrusted();

	if (!trusters || trusters.length === 0) {
		return (
			<select
				name="id"
				id="players"
				disabled
				className="q__member-adder__input"
			/>
		);
	}

	const trustersNotInGroup = trusters.filter(
		(truster) => !groupMemberIds.includes(truster.id),
	);

	const othersOptions = trustersNotInGroup
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
				setTruster(e.target.value ? Number(e.target.value) : undefined)
			}
			className="q__member-adder__input"
		>
			<option value="">{t("q:looking.groups.adder.select")}</option>
			{teams?.map((team) => {
				return (
					<optgroup label={team.name} key={team.id}>
						{trustersNotInGroup
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
