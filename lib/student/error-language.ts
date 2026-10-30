const spanish: Record<string, string> = {
  "Please sign in.": "Inicia sesión para continuar.",
  "Please complete student onboarding first.": "Completa primero la bienvenida para estudiantes.",
  "Choose English or Spanish.": "Elige inglés o español.",
  "Send a message of 1–2,000 characters.": "Envía un mensaje de entre 1 y 2.000 caracteres.",
  "Your conversation could not be loaded.": "No pudimos cargar tu conversación. Inténtalo otra vez.",
  "Your account access could not be checked. Please try again.": "No pudimos verificar el acceso a tu cuenta. Inténtalo otra vez.",
};
export function studentErrorText(message: string, language: "en" | "es") {
  if (language === "en" || !message) return message;
  if (spanish[message]) return spanish[message];
  // Already-localized UI errors remain intact.
  if (/[áéíóúñ¿¡]/i.test(message) || /^(No pud|Tu |Tus |Elige |Revisa |Escribe |Selecciona )/.test(message)) return message;
  if (/your message was saved/i.test(message)) return "Tu mensaje se guardó, pero Clarity no pudo completar la respuesta. Revisa tu historial antes de volver a enviar.";
  if (/safety checks/i.test(message)) return "Las comprobaciones de seguridad no están disponibles. No se guardó el mensaje. Inténtalo más tarde o habla con tu consejero.";
  if (/limit reached|reached the pilot message limit/i.test(message)) return "Llegaste al límite de mensajes del piloto. Inténtalo más tarde o habla con tu consejero.";
  if (/already processing|still processing/i.test(message)) return "Ya hay un mensaje en proceso. Espera y revisa tu historial antes de volver a enviarlo.";
  if (/not enabled for this pilot/i.test(message)) return "Clarity todavía no está habilitado para este piloto. Puedes usar Hablar con tu consejero.";
  if (/approved students|pilot.*approved|enrollment|access changed/i.test(message)) return "Tu acceso al piloto necesita revisión. Inicia sesión otra vez o consulta con la coordinación de tu escuela.";
  if (/no message was saved|could not be saved/i.test(message)) return "No pudimos guardar este cambio. Revisa tu conexión e inténtalo otra vez.";
  return "No pudimos completar esta acción. Revisa la información guardada antes de volver a intentarlo.";
}
