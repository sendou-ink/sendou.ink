import { SendouButton } from "../elements/Button";
import { TrashIcon } from "../icons/Trash";

export function RemoveFieldButton({ onClick }: { onClick: () => void }) {
	return (
		<SendouButton
			icon={<TrashIcon />}
			aria-label="Remove form field"
			size="small"
			variant="minimal-destructive"
			onPress={onClick}
		/>
	);
}
