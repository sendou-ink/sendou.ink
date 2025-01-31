import { useTranslation } from "react-i18next";
import { Button } from "../Button";
import { PlusIcon } from "../icons/Plus";

export function AddFieldButton({
	onClick,
}: {
	onClick: () => void;
}) {
	const { t } = useTranslation(["common"]);

	return (
		<Button
			icon={<PlusIcon />}
			aria-label="Add form field"
			size="tiny"
			variant="minimal"
			onClick={onClick}
			className="self-start"
			testId="add-field-button"
		>
			{t("common:actions.add")}
		</Button>
	);
}
