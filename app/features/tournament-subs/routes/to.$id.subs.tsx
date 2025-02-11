import {
	type ActionFunction,
	type LoaderFunctionArgs,
	redirect,
} from "@remix-run/node";
import { Link, useLoaderData } from "@remix-run/react";
import React from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { Button, LinkButton } from "~/components/Button";
import { Flag } from "~/components/Flag";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { WeaponImage } from "~/components/Image";
import { Redirect } from "~/components/Redirect";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { MicrophoneIcon } from "~/components/icons/Microphone";
import { TrashIcon } from "~/components/icons/Trash";
import { useUser } from "~/features/auth/core/user";
import { getUser, requireUser } from "~/features/auth/core/user.server";
import { tournamentIdFromParams } from "~/features/tournament";
import {
	clearTournamentDataCache,
	tournamentFromDB,
} from "~/features/tournament-bracket/core/Tournament.server";
import { useTournament } from "~/features/tournament/routes/to.$id";
import { parseRequestPayload, validate } from "~/utils/remix.server";
import { assertUnreachable } from "~/utils/types";
import { tournamentRegisterPage, userPage } from "~/utils/urls";
import { deleteSub } from "../queries/deleteSub.server";
import {
	type SubByTournamentId,
	findSubsByTournamentId,
} from "../queries/findSubsByTournamentId.server";
import { deleteSubSchema } from "../tournament-subs-schemas.server";

import "../tournament-subs.css";

export const action: ActionFunction = async ({ request, params }) => {
	const user = await requireUser(request);
	const tournamentId = tournamentIdFromParams(params);
	const tournament = await tournamentFromDB({ tournamentId, user });
	const data = await parseRequestPayload({
		request,
		schema: deleteSubSchema,
	});

	validate(
		user.id === data.userId || tournament.isOrganizer(user),
		"You can only delete your own sub post",
		401,
	);

	deleteSub({
		tournamentId,
		userId: data.userId,
	});

	clearTournamentDataCache(tournamentId);

	return null;
};

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
	const user = await getUser(request);
	const tournamentId = tournamentIdFromParams(params);

	const tournament = await tournamentFromDB({ tournamentId, user });
	if (!tournament.subsFeatureEnabled) {
		throw redirect(tournamentRegisterPage(tournamentId));
	}

	const subs = findSubsByTournamentId({
		tournamentId,
		userId: user?.id,
	}).filter((sub) => {
		if (sub.visibility === "ALL") return true;

		const userPlusTier = user?.plusTier ?? 4;

		switch (sub.visibility) {
			case "+1": {
				return userPlusTier === 1;
			}
			case "+2": {
				return userPlusTier <= 2;
			}
			case "+3": {
				return userPlusTier <= 3;
			}
			default: {
				assertUnreachable(sub.visibility);
			}
		}
	});

	return {
		subs,
		hasOwnSubPost: subs.some((sub) => sub.userId === user?.id),
	};
};

export default function TournamentSubsPage() {
	const user = useUser();
	const data = useLoaderData<typeof loader>();
	const tournament = useTournament();

	if (tournament.everyBracketOver) {
		return <Redirect to={tournamentRegisterPage(tournament.ctx.id)} />;
	}

	return (
		<div className="stack lg">
			{!tournament.teamMemberOfByUser(user) && user ? (
				<div className="stack items-end">
					<AddOrEditSubButton />
				</div>
			) : null}
			{data.subs.map((sub) => {
				return <SubInfoSection key={sub.userId} sub={sub} />;
			})}
		</div>
	);
}

function AddOrEditSubButton() {
	const { t } = useTranslation(["tournament"]);
	const data = useLoaderData<typeof loader>();
	const tournament = useTournament();

	const buttonText = data.hasOwnSubPost
		? t("tournament:subs.editPost")
		: t("tournament:subs.addPost");

	if (!tournament.canAddNewSubPost) {
		return (
			<SendouPopover
				trigger={<SendouButton size="small">{buttonText}</SendouButton>}
			>
				{data.hasOwnSubPost
					? "Sub post can't be edited anymore since registration has closed"
					: "Sub post can't be added anymore since registration has closed"}
			</SendouPopover>
		);
	}

	return (
		<LinkButton to="new" size="tiny">
			{buttonText}
		</LinkButton>
	);
}

function SubInfoSection({ sub }: { sub: SubByTournamentId }) {
	const { t } = useTranslation(["common", "tournament"]);
	const user = useUser();
	const tournament = useTournament();

	const infos = [
		<div key="vc" className="sub__section__info__vc">
			<MicrophoneIcon
				className={
					sub.canVc === 1
						? "text-success"
						: sub.canVc === 2
							? "text-warning"
							: "text-error"
				}
			/>
			{sub.canVc === 1
				? t("tournament:subs.canVC")
				: sub.canVc === 2
					? t("tournament:subs.listenOnlyVC")
					: t("tournament:subs.noVC")}
		</div>,
	];
	if (sub.plusTier) {
		infos.push(<React.Fragment key="slash-1">/</React.Fragment>);
		infos.push(<div key="plus">+{sub.plusTier}</div>);
	}
	if (sub.country) {
		infos.push(<React.Fragment key="slash-2">/</React.Fragment>);
		infos.push(<Flag key="flag" countryCode={sub.country} tiny />);
	}

	return (
		<div>
			<section className="sub__section">
				<Avatar user={sub} size="sm" className="sub__section__avatar" />
				<Link to={userPage(sub)} className="sub__section__name">
					{sub.username}
				</Link>
				<div className="sub__section__spacer" />
				<div className="sub__section__info">{infos}</div>
				<div className="sub__section__weapon-top-text sub__section__weapon-text">
					{t("tournament:subs.prefersToPlay")}
				</div>
				<div className="sub__section__weapon-top-images sub__section__weapon-images">
					{sub.bestWeapons.map((wpn) => (
						<WeaponImage
							key={wpn}
							weaponSplId={wpn}
							size={32}
							variant="badge"
						/>
					))}
				</div>
				{sub.okWeapons ? (
					<>
						<div className="sub__section__weapon-bottom-text sub__section__weapon-text">
							{t("tournament:subs.canPlay")}
						</div>
						<div className="sub__section__weapon-bottom-images sub__section__weapon-images">
							{sub.okWeapons.map((wpn) => (
								<WeaponImage
									key={wpn}
									weaponSplId={wpn}
									size={32}
									variant="badge"
								/>
							))}
						</div>
					</>
				) : null}
				{sub.message ? (
					<div className="sub__section__message">{sub.message}</div>
				) : null}
			</section>
			{user?.id === sub.userId || tournament.isOrganizer(user) ? (
				<div className="stack mt-1 items-end">
					<FormWithConfirm
						dialogHeading={
							user?.id === sub.userId
								? "Delete your sub post?"
								: `Delete sub post by ${sub.username}?`
						}
						fields={[["userId", sub.userId]]}
					>
						<Button
							variant="minimal-destructive"
							size="tiny"
							type="submit"
							icon={<TrashIcon />}
						>
							{t("common:actions.delete")}
						</Button>
					</FormWithConfirm>
				</div>
			) : null}
		</div>
	);
}
