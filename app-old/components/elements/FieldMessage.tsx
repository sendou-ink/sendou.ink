import { Text } from "react-aria-components";

export function SendouFieldMessage({
	children,
}: { children: React.ReactNode }) {
	return (
		<Text slot="description" className="info-message">
			{children}
		</Text>
	);
}
