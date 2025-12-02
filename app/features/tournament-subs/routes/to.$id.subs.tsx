import { Link, useLoaderData } from "@remix-run/react";
import clsx from "clsx";
import React from "react";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { LinkButton, SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { Flag } from "~/components/Flag";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { WeaponImage } from "~/components/Image";
import { MicrophoneIcon } from "~/components/icons/Microphone";
import { TrashIcon } from "~/components/icons/Trash";
import { Redirect } from "~/components/Redirect";
import { useUser } from "~/features/auth/core/user";
import { useTournament } from "~/features/tournament/routes/to.$id";
import type { SerializeFrom } from "~/utils/remix";
import { tournamentRegisterPage, userPage } from "~/utils/urls";
import { action } from "../actions/to.$id.subs.server";
import { loader } from "../loaders/to.$id.subs.server";
export { action, loader };

import styles from "./to.$id.subs.module.css";

export default function TournamentSubsPage() {
	const user = useUser();
	const data = useLoaderData<typeof loader>();
	const tournament = useTournament();

	if (tournament.everyBracketOver) {
		return <Redirect to={tournamentRegisterPage(tournament.ctx.id)} />;
	}

	return (
		<div className={styles.listPageContainer}>
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
		<LinkButton to="new" size="small">
			{buttonText}
		</LinkButton>
	);
}

function SubInfoSection({
	sub,
}: {
	sub: SerializeFrom<typeof loader>["subs"][number];
}) {
	const { t } = useTranslation(["common", "tournament"]);
	const user = useUser();
	const tournament = useTournament();

	const infos = [
		<div key="vc" className={styles.sectionInfoVc}>
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
			<section className={styles.section}>
				<Avatar user={sub} size="sm" className={styles.sectionAvatar} />
				<Link to={userPage(sub)} className={styles.sectionName}>
					{sub.username}
				</Link>
				<div className={styles.sectionSpacer} />
				<div className={styles.sectionInfo}>{infos}</div>
				<div
					className={clsx(
						styles.sectionWeaponTopText,
						styles.sectionWeaponText,
					)}
				>
					{t("tournament:subs.prefersToPlay")}
				</div>
				<div
					className={clsx(
						styles.sectionWeaponTopImages,
						styles.sectionWeaponImages,
					)}
				>
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
						<div
							className={clsx(
								styles.sectionWeaponBottomText,
								styles.sectionWeaponText,
							)}
						>
							{t("tournament:subs.canPlay")}
						</div>
						<div
							className={clsx(
								styles.sectionWeaponBottomImages,
								styles.sectionWeaponImages,
							)}
						>
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
					<div className={styles.sectionMessage}>{sub.message}</div>
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
						<SendouButton
							variant="minimal-destructive"
							size="small"
							type="submit"
							icon={<TrashIcon />}
						>
							{t("common:actions.delete")}
						</SendouButton>
					</FormWithConfirm>
				</div>
			) : null}
		</div>
	);
}
