export type StudentModerationResult = {
  flagged: boolean;
  categories: { [key: string]: boolean | null | undefined };
};

// A classifier result, not a keyword list or the coach prompt, controls this path.
export function studentSafetyReply(
  result: StudentModerationResult,
  language: "en" | "es" = "en",
): string | null {
  if (
    result.categories["self-harm"] ||
    result.categories["self-harm/intent"] ||
    result.categories["self-harm/instructions"]
  ) {
    if (language === "es")
      return "Gracias por contármelo. No tienes que pasar por esto sin apoyo. Habla ahora con una persona adulta de confianza o con tu consejero escolar. Si estás en peligro inmediato, llama al 911. En EE. UU., llama o envía un texto al 988 para apoyo en una crisis. Nadie observa este chat en vivo. Enviar un mensaje no avisa a tu consejero; el botón para pedir contacto es una acción aparte.";
    return "I’m glad you told me. You don’t have to handle this alone. Please tell a trusted adult or your school counselor now. If you are in immediate danger, call 911. In the U.S., call or text 988 for crisis support. Nobody is watching this chat live. Sending a chat message does not notify your counselor; the counselor-request button is a separate action.";
  }
  if (
    result.flagged ||
    result.categories.sexual ||
    result.categories["sexual/minors"]
  ) {
    if (language === "es")
      return "Gracias por pedir apoyo. Este tema necesita el apoyo de una persona de confianza; no tienes que resolverlo sin ayuda. Usa Habla con tu consejero o busca a una persona adulta de confianza. Si alguien está en peligro inmediato, llama al 911. Arize no avisa a nadie cuando envías un mensaje aquí.";
    return "I’m glad you reached out. This topic needs support from a trusted person, and you don’t have to work through it alone. Please use Talk to your counselor or reach out to a trusted adult. If someone is in immediate danger, call 911. Arize does not notify anyone when you send a message here.";
  }
  return null;
}
