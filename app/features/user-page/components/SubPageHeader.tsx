import { Avatar } from "~/components/Avatar";
import { BackLink } from "~/components/BackLink";
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
		<header className={styles.subPageHeader}>
			<div className={styles.grid}>
				<div className={styles.titles}>
					<h1 className={styles.title}>{title}</h1>
					{subtitle ? <div className={styles.subtitle}>{subtitle}</div> : null}
				</div>
				<BackLink
					to={userPage(user)}
					className={styles.backLink}
					aria-label="Back to profile"
				>
					<Avatar user={user} size="xxs" className={styles.avatar} />
					<span className={styles.username}>{user.username}</span>
				</BackLink>
				{children ? <div className={styles.actions}>{children}</div> : null}
			</div>
		</header>
	);
}
