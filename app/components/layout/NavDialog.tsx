import { Link } from "@remix-run/react";
import { useTranslation } from "react-i18next";
import { SendouDialog } from "~/components/elements/Dialog";
import { navItems } from "~/components/layout/nav-items";
import { useUser } from "~/features/auth/core/user";
import { LOG_OUT_URL, navIconUrl, userPage } from "~/utils/urls";
import { Avatar } from "../Avatar";
import { SendouButton } from "../elements/Button";
import { Image } from "../Image";
import { CrossIcon } from "../icons/Cross";
import { LogOutIcon } from "../icons/LogOut";
import { LogInButtonContainer } from "./LogInButtonContainer";
import styles from "./NavDialog.module.css";

export function NavDialog({
	isOpen,
	close,
}: {
	isOpen: boolean;
	close: () => void;
}) {
	const user = useUser();
	const { t } = useTranslation(["common"]);

	if (!isOpen) {
		return null;
	}

	return (
		<SendouDialog
			className={styles.dialog}
			showHeading={false}
			aria-label="Site navigation"
			isFullScreen
		>
			<SendouButton
				icon={<CrossIcon />}
				variant="minimal-destructive"
				className={styles.closeButton}
				onPress={close}
				aria-label="Close navigation dialog"
			/>
			<div className={styles.itemsContainer}>
				<LogInButton close={close} />
				{navItems.map((item) => (
					<Link
						to={`/${item.url}`}
						className={styles.navItem}
						key={item.name}
						prefetch={item.prefetch ? "render" : undefined}
						onClick={close}
					>
						<div className={styles.imageContainer}>
							<Image
								path={navIconUrl(item.name)}
								height={48}
								width={48}
								alt=""
							/>
						</div>
						<div>{t(`common:pages.${item.name}` as any)}</div>
					</Link>
				))}
			</div>
			{user ? (
				<div className="mt-6 stack items-center">
					<form method="post" action={LOG_OUT_URL}>
						<SendouButton
							size="small"
							variant="outlined"
							icon={<LogOutIcon />}
							type="submit"
						>
							{t("common:header.logout")}
						</SendouButton>
					</form>
				</div>
			) : null}
		</SendouDialog>
	);
}

function LogInButton({ close }: { close: () => void }) {
	const { t } = useTranslation(["common"]);
	const user = useUser();

	if (user) {
		return (
			<Link to={userPage(user)} className={styles.navItem} onClick={close}>
				<div className={styles.imageContainer}>
					<Avatar
						user={user}
						alt={t("common:header.loggedInAs", {
							userName: `${user.username}`,
						})}
						className={styles.avatar}
						size="sm"
					/>
				</div>
				{t("common:pages.myPage")}
			</Link>
		);
	}

	return (
		<div className={styles.navItem}>
			<LogInButtonContainer>
				<button
					className={`${styles.logInButton} ${styles.imageContainer}`}
					type="submit"
				>
					<Image path={navIconUrl("log_in")} height={48} width={48} alt="" />
				</button>
			</LogInButtonContainer>
			{t("common:header.login")}
		</div>
	);
}
