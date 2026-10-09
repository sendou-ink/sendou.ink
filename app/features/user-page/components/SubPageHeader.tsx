import clsx from "clsx";
import { Avatar } from "~/components/Avatar";
import { BackLink } from "~/components/BackLink";
import { PageHeader } from "~/components/PageHeader";
import type { Tables } from "~/db/tables";
import { userPage } from "~/utils/urls";
import styles from "./SubPageHeader.module.css";

export function SubPageHeader({
	user,
	title,
	subtitle,
	children,
}: {
	user: Pick<
		Tables["User"],
		"username" | "discordId" | "discordAvatar" | "customUrl"
	>;
	title: React.ReactNode;
	subtitle?: React.ReactNode;
	children?: React.ReactNode;
}) {
	return (
		<PageHeader
			title={title}
			subtitle={subtitle}
			back={
				<BackLink to={userPage(user)} aria-label="Back to profile">
					<Avatar user={user} size="xxs" className={styles.avatar} />
					<span className={clsx(styles.username, "truncate")}>
						{user.username}
					</span>
				</BackLink>
			}
		>
			{children}
		</PageHeader>
	);
}
