import { Link } from "@remix-run/react";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Avatar } from "~/components/Avatar";
import { FormWithConfirm } from "~/components/FormWithConfirm";
import { Table } from "~/components/Table";
import { SendouButton } from "~/components/elements/Button";
import { BanUserModal } from "~/features/tournament-organization/components/BanUserModal";
import type { OrganizationPageLoaderData } from "~/features/tournament-organization/loaders/org.$slug.server";
import { databaseTimestampToDate } from "~/utils/dates";
import { userPage } from "~/utils/urls";
import styles from "../components/BannedPlayersList.module.css";

export function BannedUsersList({
	bannedUsers,
}: { bannedUsers: NonNullable<OrganizationPageLoaderData["bannedUsers"]> }) {
	const { t, i18n } = useTranslation(["org"]);

	const bannedUsersKey = (bannedUsers ?? [])
		.map((u) => [u.id, u.privateNote].join("-"))
		.join(",");

	if (bannedUsers.length === 0) {
		return (
			<div className="stack lg">
				<div className="text-sm">{t("org:banned.empty")}</div>
				<div className={styles.banPlayerButton}>
					<BanUserModal key={bannedUsersKey} />
				</div>
			</div>
		);
	}

	return (
		<div className="stack lg">
			<div className="text-sm">{t("org:banned.description")}</div>
			<div className={styles.bannedUsersContainer}>
				<Table>
					<thead>
						<tr>
							<th>{t("org:banned.player")}</th>
							<th>{t("org:banned.note")}</th>
							<th>{t("org:banned.date")}</th>
							<th>{t("org:banned.actions")}</th>
						</tr>
					</thead>
					<tbody>
						{bannedUsers.map((bannedUser) => (
							<tr key={bannedUser.id}>
								<td>
									<Link
										to={userPage(bannedUser)}
										className="stack horizontal xs items-center w-max"
									>
										<Avatar user={bannedUser} size="xs" />
										{bannedUser.username}
									</Link>
								</td>
								<td
									className={clsx("text-sm text-lighter", styles.reasonCell)}
									title={bannedUser.privateNote ?? undefined}
								>
									{bannedUser.privateNote ?? "-"}
								</td>
								<td className="text-sm text-lighter whitespace-nowrap">
									{databaseTimestampToDate(
										bannedUser.updatedAt,
									).toLocaleDateString(i18n.language, {
										day: "numeric",
										month: "short",
										year: "numeric",
									})}
								</td>
								<td className={styles.actionsCell}>
									<FormWithConfirm
										fields={[
											["_action", "UNBAN_USER"],
											["userId", bannedUser.id],
										]}
										dialogHeading={t("org:banned.unbanConfirm", {
											username: bannedUser.username,
										})}
										submitButtonText={t("org:banned.unban")}
									>
										<SendouButton variant="minimal-destructive" size="small">
											{t("org:banned.unban")}
										</SendouButton>
									</FormWithConfirm>
								</td>
							</tr>
						))}
					</tbody>
				</Table>
			</div>
			<div className={styles.banPlayerButton}>
				<BanUserModal key={bannedUsersKey} />
			</div>
		</div>
	);
}
