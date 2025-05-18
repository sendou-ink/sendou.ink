import { Form, useLoaderData } from "@remix-run/react";
import React from "react";
import { useTranslation } from "react-i18next";
import { Alert } from "~/components/Alert";
import { LinkButton } from "~/components/Button";
import { FriendCodeInput } from "~/components/FriendCodeInput";
import { SubmitButton } from "~/components/SubmitButton";
import { useUser } from "~/features/auth/core/user";
import invariant from "~/utils/invariant";
import { assertUnreachable } from "~/utils/types";
import { userEditProfilePage } from "~/utils/urls";
import { validateCanJoinTeam } from "../tournament-utils";
import { useTournament } from "./to.$id";

import { action } from "../actions/to.$id.join.server";
import { loader } from "../loaders/to.$id.join.server";
export { action, loader };

export default function JoinTeamPage() {
	const { t } = useTranslation(["tournament", "common"]);
	const id = React.useId();
	const user = useUser();
	const tournament = useTournament();
	const data = useLoaderData<typeof loader>();

	const teamToJoin = data.teamId ? tournament.teamById(data.teamId) : undefined;
	const captain = teamToJoin?.members.find((member) => member.isOwner);
	const validationStatus = validateCanJoinTeam({
		inviteCode: data.inviteCode,
		teamToJoin,
		userId: user?.id,
		maxTeamSize: tournament.maxTeamMemberCount,
	});

	const textPrompt = () => {
		switch (validationStatus) {
			case "MISSING_CODE":
			case "SHORT_CODE":
			case "NO_TEAM_MATCHING_CODE":
			case "TEAM_FULL":
			case "ALREADY_JOINED":
			case "NOT_LOGGED_IN":
				return t(`tournament:join.error.${validationStatus}`);
			case "VALID": {
				invariant(teamToJoin);

				return t("tournament:join.VALID", {
					teamName: teamToJoin.name,
					eventName: tournament.ctx.name,
				});
			}
			default: {
				assertUnreachable(validationStatus);
			}
		}
	};

	if (tournament.ctx.settings.requireInGameNames && user && !user.inGameName) {
		return (
			<Alert variation="WARNING" alertClassName="w-max">
				<div className="stack horizontal sm items-center flex-wrap justify-center text-center">
					This tournament requires you to have an in-game name set{" "}
					<LinkButton to={userEditProfilePage(user)} size="tiny">
						Edit profile
					</LinkButton>
				</div>
			</Alert>
		);
	}

	return (
		<div className="stack lg items-center">
			<div className="text-center text-lg font-semi-bold">{textPrompt()}</div>
			<div className="stack sm items-center">
				{validationStatus === "VALID" ? (
					<FriendCodeInput friendCode={user?.friendCode} />
				) : null}
				{user?.inGameName ? (
					<div className="font-bold">
						<span className="text-lighter">IGN</span> {user.inGameName}
					</div>
				) : null}
			</div>
			<Form method="post" className="tournament__invite-container">
				{validationStatus === "VALID" ? (
					<div className="stack md items-center">
						<SubmitButton size="big" disabled={!user?.friendCode}>
							{t("common:actions.join")}
						</SubmitButton>
						{!user?.friendCode ? (
							<div className="text-warning">
								Save friend code before joining the team
							</div>
						) : (
							<div className="text-lighter text-sm stack horizontal sm items-center">
								<input id={id} type="checkbox" name="trust" />{" "}
								<label htmlFor={id} className="mb-0">
									{t("tournament:join.giveTrust", {
										name: captain ? captain.username : "",
									})}
								</label>
							</div>
						)}
					</div>
				) : null}
			</Form>
		</div>
	);
}
