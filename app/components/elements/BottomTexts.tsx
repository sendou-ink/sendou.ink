import { SendouFieldError, SendouFieldMessage } from "~/components/FormMessage";

// TODO: deprecate in favor of FormMessage
export function SendouBottomTexts({
	bottomText,
	errorText,
	errorId,
}: {
	bottomText?: string;
	errorText?: string;
	errorId?: string;
}) {
	return (
		<>
			{errorText ? (
				<SendouFieldError id={errorId}>{errorText}</SendouFieldError>
			) : (
				<SendouFieldError />
			)}
			{bottomText ? (
				<SendouFieldMessage>{bottomText}</SendouFieldMessage>
			) : null}
		</>
	);
}
