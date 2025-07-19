import { Link } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { SendouButton } from "~/components/elements/Button";
import { SendouPopover } from "~/components/elements/Popover";
import { UsersIcon } from "~/components/icons/Users";
import { Placement } from "~/components/Placement";
import { Table } from "~/components/Table";
import type { TeamResultsLoaderData } from "~/features/team/loaders/t.$customUrl.results.server";
import { HACKY_resolvePicture } from "~/features/tournament/tournament-utils";
import { databaseTimestampToDate } from "~/utils/dates";
import {
	tournamentLogoUrl,
	tournamentTeamPage,
	userPage,
	userSubmittedImage,
} from "~/utils/urls";

import styles from "./TeamResultsTable.module.css";

interface TeamResultsTableProps {
	results: TeamResultsLoaderData["results"];
}

export function TeamResultsTable({ results }: TeamResultsTableProps) {
	const { t, i18n } = useTranslation("user");

	return (
		<Table>
			<thead>
				<tr>
					<th>{t("results.placing")}</th>
					<th>{t("results.date")}</th>
					<th>{t("results.tournament")}</th>
					<th>{t("results.subs")}</th>
				</tr>
			</thead>
			<tbody>
				{results.map((result) => {
					const logoUrl = result.logoUrl
						? userSubmittedImage(result.logoUrl)
						: HACKY_resolvePicture({ name: result.tournamentName });

					return (
						<tr key={result.tournamentId}>
							<td className="pl-4 whitespace-nowrap">
								<div className="stack horizontal xs items-end">
									<Placement placement={result.placement} />{" "}
									<div className="text-lighter">
										/ {result.participantCount}
									</div>
								</div>
							</td>
							<td className="whitespace-nowrap">
								{databaseTimestampToDate(result.startTime).toLocaleDateString(
									i18n.language,
									{
										day: "numeric",
										month: "short",
										year: "numeric",
									},
								)}
							</td>
							<td>
								<div className="stack horizontal xs items-center">
									{logoUrl !== tournamentLogoUrl("default") ? (
										<img
											src={logoUrl}
											alt=""
											width={18}
											height={18}
											className="rounded-full"
										/>
									) : null}
									<Link
										to={tournamentTeamPage({
											tournamentTeamId: result.tournamentTeamId,
											tournamentId: result.tournamentId,
										})}
									>
										{result.tournamentName}
									</Link>
								</div>
							</td>
							<td>
								{result.subs.length > 0 ? (
									<div className="stack horizontal md items-center">
										<SendouPopover
											trigger={
												<SendouButton
													icon={<UsersIcon />}
													size="small"
													variant="minimal"
												>
													{result.subs.length}
												</SendouButton>
											}
										>
											<ul className={styles.players}>
												{result.subs.map((player) => (
													<li key={player.id} className="flex items-center">
														<Link
															to={userPage(player)}
															className="stack horizontal xs items-center"
														>
															<Avatar user={player} size="xxs" />
															{player.username}
														</Link>
													</li>
												))}
											</ul>
										</SendouPopover>
									</div>
								) : null}
							</td>
						</tr>
					);
				})}
			</tbody>
		</Table>
	);
}
