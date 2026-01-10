import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SendouButton } from "../elements/Button";

export function AddFieldButton({ onClick }: { onClick: () => void }) {
	const { t } = useTranslation(["common"]);

	return (
		<SendouButton
			icon={<Plus />}
			aria-label="Add form field"
			size="small"
			variant="minimal"
			onPress={onClick}
			className="self-start"
			data-testid="add-field-button"
		>
			{t("common:actions.add")}
		</SendouButton>
	);
}
