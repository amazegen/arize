export type StudentModerationResult = {
  flagged: boolean;
  categories: { [key: string]: boolean | null | undefined };
};

// A classifier result, not a keyword list or the coach prompt, controls this path.
export function studentSafetyReply(
  result: StudentModerationResult,
): string | null {
  if (
    result.categories["self-harm"] ||
    result.categories["self-harm/intent"] ||
    result.categories["self-harm/instructions"]
  ) {
    return "I’m glad you reached out. This is a moment for real human support, not AI coaching. Please tell a trusted adult or your school counselor now. If you are in immediate danger, call 911. In the U.S., call or text 988 for crisis support. Nobody is watching this chat live. Sending a chat message does not notify your counselor; the counselor-request button is a separate action.";
  }
  if (
    result.flagged ||
    result.categories.sexual ||
    result.categories["sexual/minors"]
  ) {
    return "I can’t guide you through this topic in the student pilot. You deserve support from a real person. Please use Talk to your counselor or reach out to a trusted adult. If someone is in immediate danger, call 911. Arize does not notify anyone when you send a message here.";
  }
  return null;
}
