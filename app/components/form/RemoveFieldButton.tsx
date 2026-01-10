import { Trash } from "lucide-react";
import { SendouButton } from "../elements/Button";

export function RemoveFieldButton({ onClick }: { onClick: () => void }) {
	return (
		<SendouButton
			icon={<Trash />}
			aria-label="Remove form field"
			size="small"
			variant="minimal-destructive"
			onPress={onClick}
		/>
	);
}
