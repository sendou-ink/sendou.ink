import clsx from "clsx";
import { useTranslation } from "react-i18next";
import {
	SendouSelect,
	SendouSelectItem,
	type SendouSelectProps,
} from "~/components/elements/Select";
import styles from "./TagSelect.module.css";

interface TagSelectProps<T extends object>
	extends Omit<SendouSelectProps<T>, "items" | "children"> {
	tags: Array<{ id: number; name: string }>;
}

export function TagSelect<T extends object>({
	tags,
	popoverClassName,
	...rest
}: TagSelectProps<T>) {
	const { t } = useTranslation(["art"]);

	return (
		<SendouSelect
			items={tags}
			placeholder={t("art:forms.tags.placeholder")}
			search={{ placeholder: t("art:forms.tags.search.placeholder") }}
			aria-label={t("art:forms.tags.placeholder")}
			popoverClassName={clsx(styles.popover, popoverClassName)}
			{...rest}
		>
			{({ id, name, ...item }) => (
				<SendouSelectItem key={id} id={name} {...item}>
					{name}
				</SendouSelectItem>
			)}
		</SendouSelect>
	);
}
