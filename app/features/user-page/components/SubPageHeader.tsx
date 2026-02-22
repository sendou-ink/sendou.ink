import { ArrowLeft } from "lucide-react";
import { Link } from "react-router";
import { Avatar } from "~/components/Avatar";
import type { Tables } from "~/db/tables";
import styles from "./SubPageHeader.module.css";

export function SubPageHeader({
	user,
	backTo,
	children,
}: {
	user: Pick<Tables["User"], "username" | "discordId" | "discordAvatar">;
	backTo: string;
	children?: React.ReactNode;
}) {
	return (
		<div className={styles.subPageHeader}>
			<div className={styles.leftSection}>
				<Link
					to={backTo}
					className={styles.backButton}
					aria-label="Back to profile"
				>
					<ArrowLeft className={styles.backIcon} />
				</Link>
				<Link to={backTo} className={styles.userInfo}>
					<Avatar user={user} size="xs" className={styles.avatar} />
					<span className={styles.username}>{user.username}</span>
				</Link>
			</div>
			{children ? <div className={styles.actions}>{children}</div> : null}
		</div>
	);
}
