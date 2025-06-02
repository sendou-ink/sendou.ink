import { LinkButton, type LinkButtonProps } from "~/components/Button";
import { Image } from "~/components/Image";
import { PlusIcon } from "~/components/icons/Plus";
import { navIconUrl } from "~/utils/urls";

import styles from "./AddNewButton.module.css";

interface AddNewButtonProps {
	to: LinkButtonProps["to"];
	navIcon: string;
}

// xxx: if no user, show popover to log in
export function AddNewButton({ to, navIcon }: AddNewButtonProps) {
	return (
		<LinkButton to={to} size="tiny" className={styles.addNewButton}>
			<span className={styles.iconsContainer}>
				<PlusIcon />
				<Image path={navIconUrl(navIcon)} size={18} alt="" />
			</span>
			<span className={styles.textContainer}>New</span>
		</LinkButton>
	);
}
