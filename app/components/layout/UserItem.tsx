import { Link } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { useUser } from "~/features/auth/core/user";
import { userPage } from "~/utils/urls";
import { Avatar } from "../Avatar";
import { LogInIcon } from "../icons/LogIn";
import { LogInButtonContainer } from "./LogInButtonContainer";

export function UserItem() {
	const { t } = useTranslation();
	const user = useUser();

	if (user) {
		return (
			<Link to={userPage(user)} prefetch="intent" className="layout__user-item">
				<Avatar
					user={user}
					alt={t("header.loggedInAs", {
						userName: `${user.username}`,
					})}
					className="layout__avatar"
					size="sm"
				/>
			</Link>
		);
	}

	return (
		<LogInButtonContainer>
			<button type="submit" className="layout__log-in-button">
				<LogInIcon /> {t("header.login")}
			</button>
		</LogInButtonContainer>
	);
}
