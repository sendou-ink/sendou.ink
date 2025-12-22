import { Link } from "@remix-run/react";
import { Avatar } from "~/components/Avatar";
import { ArrowLeftIcon } from "~/components/icons/ArrowLeft";
import type { Tables } from "~/db/tables";
import styles from "./SubPageHeader.module.css";

// xxx: placeholder styles
export function SubPageHeader({
	user,
	backTo,
}: {
	user: Pick<Tables["User"], "username" | "discordId" | "discordAvatar">;
	backTo: string;
}) {
	return (
		<div className={styles.subPageHeader}>
			<Link
				to={backTo}
				className={styles.backButton}
				aria-label="Back to profile"
			>
				<ArrowLeftIcon className={styles.backIcon} />
			</Link>
			<Avatar user={user} size="xxs" className={styles.avatar} />
			<span className={styles.username}>{user.username}</span>
		</div>
	);
}
