import clsx from "clsx";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useUser } from "~/features/auth/core/user";
import { userPage } from "~/utils/urls";
import { Avatar } from "../Avatar";
import { LogInIcon } from "../icons/LogIn";
import { LogInButtonContainer } from "./LogInButtonContainer";
import styles from "./UserItem.module.css";

export function UserItem({ className }: { className?: string }) {
	const { t } = useTranslation();
	const user = useUser();

	if (user) {
		return (
			<Link
				to={userPage(user)}
				prefetch="intent"
				className={clsx(styles.userItem, className)}
			>
				<Avatar
					user={user}
					alt={t("header.loggedInAs", {
						userName: `${user.username}`,
					})}
					className={styles.avatar}
					size="sm"
				/>
			</Link>
		);
	}

	return (
		<LogInButtonContainer>
			<button type="submit" className={styles.logInButton}>
				<LogInIcon /> {t("header.login.discord")}
			</button>
		</LogInButtonContainer>
	);
}
