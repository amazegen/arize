// Mechanical, AST-scoped migration of reviewed static UI copy. Never translates
// user content, database values, URLs, identifiers, school names, or chat history.
import ts from "typescript";
import fs from "node:fs";
const translations = new Map([
  ["What should we call you?", "¿Cómo quieres que te llamemos?"],
  ["First name or nickname", "Nombre o apodo"],
  ["Username (optional)", "Nombre de usuario (opcional)"],
  [
    "3–30 letters, numbers, or underscores. Use a nickname, not personal contact information. There is no public student directory.",
    "De 3 a 30 letras, números o guiones bajos. Usa un apodo, no información de contacto personal. No hay un directorio público de estudiantes.",
  ],
  ["Your grade", "Tu grado"],
  ["Choose your grade", "Elige tu grado"],
  ["Grade", "Grado"],
  [
    "Review your student privacy notice",
    "Revisa tu aviso de privacidad estudiantil",
  ],
  ["Before you start: your student privacy", "Antes de empezar: tu privacidad"],
  ["Your student privacy", "Tu privacidad estudiantil"],
  [
    "Clarity is an AI coach, not a counselor or emergency service. Your check-ins, goals, and chats are saved to your account. Chat messages are sent to our AI provider to generate a reply. Do not include sensitive details about yourself or other people.",
    "Clarity es una guía de IA, no un consejero ni un servicio de emergencias. Tus registros de ánimo, metas y chats se guardan en tu cuenta. Los mensajes se envían a nuestro proveedor de IA para generar una respuesta. No incluyas detalles sensibles sobre ti ni sobre otras personas.",
  ],
  [
    "This pilot does not give teachers a live view of your activity. Nobody monitors this chat for emergencies. School or guardian permission is handled separately by your pilot coordinator.",
    "Este piloto no permite que tus docentes vean tu actividad en vivo. Nadie vigila este chat para responder a emergencias. Quien coordina el piloto gestiona por separado el permiso de la escuela o de tu tutor.",
  ],
  [
    "If you choose Talk to your counselor, your preferred name and a request to connect are sent to Shelby. Your chats, goals, and check-in scores are not attached.",
    "Si eliges Habla con tu consejero, se envían a Shelby tu nombre preferido y una solicitud de contacto. No se adjuntan chats, metas ni registros de ánimo.",
  ],
  ["Read the privacy policy", "Leer la política de privacidad"],
  ["Read the terms of use", "Leer los términos de uso"],
  [
    "I have read the student pilot notice and agree to the terms of use and privacy policy.",
    "Leí el aviso del piloto estudiantil y acepto los términos de uso y la política de privacidad.",
  ],
  ["Saving…", "Guardando…"],
  ["Save profile", "Guardar perfil"],
  ["Let’s get started", "Empecemos"],
  ["Welcome to your student pilot", "Bienvenido a tu piloto estudiantil"],
  ["Make a little room for you.", "Haz un poco de espacio para ti."],
  [
    "A few details to make Arize feel like your space.",
    "Unos detalles para que Arize sea tu espacio.",
  ],
  ["Welcome", "Bienvenido"],
  ["Hey", "Hola"],
  [
    "Private support for you, built by people like you.",
    "Un espacio personal de apoyo, creado por personas como tú.",
  ],
  ["Ready when you are.", "Cuando tú quieras."],
  ["One small step today.", "Un paso pequeño hoy."],
  ["Check in", "Registra tu ánimo"],
  [
    "No check-ins yet. Try your first.",
    "Aún no tienes registros de ánimo. Prueba el primero.",
  ],
  [
    "Notice how you feel. One minute.",
    "Observa cómo te sientes. Solo un minuto.",
  ],
  ["Today:", "Hoy:"],
  ["Update check-in", "Actualizar mi registro"],
  ["Start my first check-in", "Hacer mi primer registro"],
  ["Start check-in", "Registrar mi ánimo"],
  ["Loading check-in", "Cargando tu registro de ánimo"],
  ["AI coach", "Guía de IA"],
  ["Goals", "Metas"],
  ["Your steps", "Tus pasos"],
  ["Your space. Your pace.", "Tu espacio. Tu ritmo."],
  [
    "Talk through a school day, set a small goal, or take a breath. You choose where to start.",
    "Habla sobre tu día escolar, elige una meta pequeña o haz una pausa. Tú decides por dónde empezar.",
  ],
  ["Student pilot ·", "Piloto estudiantil ·"],
  ["How are you feeling?", "¿Cómo te sientes?"],
  [
    "No right answer. Just notice where you are today.",
    "No hay una respuesta correcta. Solo observa cómo estás hoy.",
  ],
  ["Your feeling score, from 1 to 10", "Tu ánimo, del 1 al 10"],
  [
    "1 means having a very hard time. 10 means feeling great. This is a personal check-in, not a diagnosis.",
    "1 significa que estás pasando un momento muy difícil. 10 significa que te sientes muy bien. Es una reflexión personal, no un diagnóstico.",
  ],
  ["Save check-in", "Guardar mi registro"],
  [
    "Help me plan a meaningful, manageable school week. What is one small goal I could start with?",
    "Ayúdame a planear una semana escolar útil y posible. ¿Con qué meta pequeña podría empezar?",
  ],
  ["Talk to your counselor", "Habla con tu consejero"],
  [
    "You do not have to figure everything out alone.",
    "No tienes que resolver todo por tu cuenta.",
  ],
  ["Connect with Shelby", "Pide hablar con Shelby"],
  [
    "Send your preferred name and a request to connect. Your chats, goals, and check-in scores stay out of this notification.",
    "Envía tu nombre preferido y una solicitud de contacto. Esta notificación no incluye chats, metas ni registros de ánimo.",
  ],
  ["Your request has been sent to Shelby.", "Tu solicitud se envió a Shelby."],
  [
    "The email service accepted your notification. This does not mean Shelby has read it. Your school’s response times apply.",
    "El servicio de correo aceptó tu notificación. Esto no significa que Shelby la haya leído. Se aplican los tiempos de respuesta de tu escuela.",
  ],
  ["Sending your request…", "Enviando tu solicitud…"],
  ["Confirmation pending", "Confirmación pendiente"],
  ["Notify Shelby", "Avisar a Shelby"],
  [
    "Preview only — no email has been sent.",
    "Solo vista previa: no se envió ningún correo.",
  ],
  [
    "In the connected app, this action sends your request to Shelby and shows a sent confirmation only after the email service accepts it.",
    "En la aplicación conectada, esta acción envía tu solicitud a Shelby. Solo confirma el envío cuando el servicio de correo la acepta.",
  ],
  ["Open school counselor contact", "Abrir el contacto de orientación escolar"],
  ["Ask at your school", "Pregunta en tu escuela"],
  [
    "Your school has not added an online contact link yet. A teacher or the school office can help you reach your counselor.",
    "Tu escuela aún no ha añadido un enlace de contacto. Un docente o la oficina escolar puede ayudarte a contactar con tu consejero.",
  ],
  [
    "Viewing this page or sending a Clarity message does not notify anyone. Notifications are sent only when you choose Talk to your counselor or Notify Shelby. This is not monitored for emergencies.",
    "Ver esta página o enviar un mensaje a Clarity no avisa a nadie. Solo se envían avisos cuando eliges Habla con tu consejero o Avisar a Shelby. No se vigila para responder a emergencias.",
  ],
  ["Work it out with Clarity.", "Piénsalo con Clarity."],
  [
    "School, friendships, or whatever is on your mind.",
    "La escuela, tus amistades o lo que tengas en mente.",
  ],
  ["History", "Historial"],
  ["New chat", "Nuevo chat"],
  [
    "Clarity is an AI coach, not a real counselor. Chats are saved for your history and processed by our AI provider. Avoid sharing sensitive details. Nobody watches this chat live.",
    "Clarity es una guía de IA, no un consejero real. Los chats se guardan en tu historial y nuestro proveedor de IA los procesa. Evita compartir detalles sensibles. Nadie observa este chat en vivo.",
  ],
  ["Clarity conversation", "Conversación con Clarity"],
  [
    "I’m Clarity, your AI coach. We can think through a tough school day or find one small next step. What’s on your mind?",
    "Soy Clarity, tu guía de IA. Podemos pensar en un día escolar difícil o buscar un próximo paso pequeño. ¿Qué tienes en mente?",
  ],
  ["You", "Tú"],
  ["Clarity · AI coach", "Clarity · guía de IA"],
  ["One moment…", "Un momento…"],
  [
    "Load more messages before continuing",
    "Carga más mensajes antes de continuar",
  ],
  ["Profile & settings", "Perfil y ajustes"],
  [
    "Use a first name or nickname that feels like you.",
    "Usa un nombre o apodo con el que te identifiques.",
  ],
  ["Support & privacy", "Apoyo y privacidad"],
  ["Share feedback", "Comparte tus ideas"],
  ["Privacy Policy", "Política de privacidad"],
  ["Terms of Use", "Términos de uso"],
  [
    "Student pilot access is managed by your school. No purchases or adult membership controls are included.",
    "Tu escuela gestiona el acceso al piloto estudiantil. No incluye compras ni controles de membresías para adultos.",
  ],
  ["Sign out", "Cerrar sesión"],
  ["Your voice matters.", "Tu voz importa."],
  [
    "Help us make Arize more useful for students.",
    "Ayúdanos a mejorar Arize para estudiantes.",
  ],
  [
    "Do not include private details about yourself or another student. Feedback is not monitored for emergencies.",
    "No incluyas detalles privados sobre ti ni sobre otro estudiante. Los comentarios no se vigilan para responder a emergencias.",
  ],
  ["Open the student feedback survey", "Abrir la encuesta de comentarios"],
  [
    "The student feedback survey is not connected yet. Your pilot coordinator can help you share app feedback.",
    "La encuesta de comentarios aún no está conectada. Quien coordina tu piloto puede ayudarte a compartir tus ideas.",
  ],
  ["Back to Profile & Settings", "Volver a Perfil y ajustes"],
  ["Goals & accountability", "Metas y seguimiento"],
  ["Your goals. Your pace.", "Tus metas. Tu ritmo."],
  [
    "Plan a week that leaves room for you.",
    "Planea una semana que deje espacio para ti.",
  ],
  ["View previous week", "Ver la semana anterior"],
  ["View next week", "Ver la semana siguiente"],
  ["Week of", "Semana del"],
  ["of", "de"],
  ["complete", "completadas"],
  ["Choose a day", "Elige un día"],
  ["Plan a goal", "Planear una meta"],
  ["Pattern Map", "Mapa de ánimo"],
  ["Think it through with Clarity", "Piénsalo con Clarity"],
  ["Reload goals", "Volver a cargar las metas"],
  ["Undo removal", "Deshacer eliminación"],
  ["Edit your goal", "Editar tu meta"],
  ["Plan this week", "Planea esta semana"],
  [
    "Choose a date, or leave it open for the whole week.",
    "Elige una fecha o deja la meta abierta para toda la semana.",
  ],
  ["Your goal", "Tu meta"],
  ["One small, meaningful step", "Un paso pequeño y útil"],
  ["Category", "Categoría"],
  ["Deadline (optional)", "Fecha límite (opcional)"],
  ["Notes (optional)", "Notas (opcional)"],
  ["What would make this easier?", "¿Qué haría esto más fácil?"],
  ["Save goal", "Guardar meta"],
  ["Cancel", "Cancelar"],
  [
    "Goals for this day, plus your week-long commitments.",
    "Las metas de este día y tus compromisos de la semana.",
  ],
  ["Loading your goals…", "Cargando tus metas…"],
  ["Reopen", "Reabrir"],
  ["Complete", "Completar"],
  ["Week-long goal", "Meta de la semana"],
  ["Edit", "Editar"],
  ["Remove", "Quitar"],
  ["Completed", "Completada"],
  ["In progress", "En progreso"],
  ["A little room to start.", "Un espacio para empezar."],
  [
    "No goals scheduled for this day. Add a small step or browse another day.",
    "No hay metas para este día. Añade un paso pequeño o revisa otro día.",
  ],
  ["← Back to Goals", "← Volver a Metas"],
  ["Your Pattern Map", "Tu mapa de ánimo"],
  ["Notice your rhythm.", "Observa tu ritmo."],
  [
    "Your own check-ins, at your own pace. Not a diagnosis or a scorecard.",
    "Tus registros de ánimo, a tu ritmo. No es un diagnóstico ni una calificación.",
  ],
  ["Pattern history range", "Período del historial de ánimo"],
  ["All time", "Todo el historial"],
  ["Retry Pattern Map", "Reintentar mapa de ánimo"],
  ["Your check-in landscape", "Tu recorrido de ánimo"],
  ["Loading check-ins…", "Cargando registros de ánimo…"],
  ["check-ins · Average", "registros · Promedio"],
  [
    "Feeling scores over time. Exact values are listed below.",
    "Puntuaciones de ánimo a lo largo del tiempo. Los valores exactos aparecen abajo.",
  ],
  [
    "Higher and lower days both belong here. This chart does not explain why you felt a certain way.",
    "Aquí caben los días altos y bajos. Este gráfico no explica por qué te sentiste de cierta manera.",
  ],
  ["Read exact check-in values", "Leer los valores exactos de ánimo"],
  [
    "No check-ins in this range yet. Your map will grow as you check in.",
    "Aún no hay registros en este período. Tu mapa crecerá con tus registros.",
  ],
  ["Load older check-ins", "Cargar registros anteriores"],
  ["Your conversation history", "Tu historial de conversaciones"],
  ["Your conversations", "Tus conversaciones"],
  [
    "Reopen a saved chat to review it or continue. Only your student conversations appear here.",
    "Abre un chat guardado para revisarlo o continuar. Aquí solo aparecen tus conversaciones de la edición estudiantil.",
  ],
  ["Find a loaded conversation", "Busca en las conversaciones cargadas"],
  ["Search conversation titles", "Buscar títulos de conversaciones"],
  ["Retry history", "Reintentar historial"],
  ["Loading conversations…", "Cargando conversaciones…"],
  [
    "No matches among loaded conversations.",
    "No hay coincidencias en las conversaciones cargadas.",
  ],
  [
    "No saved conversations yet. Your chats will appear here after you use Clarity.",
    "Aún no hay conversaciones guardadas. Tus chats aparecerán aquí después de usar Clarity.",
  ],
  ["Load older conversations", "Cargar conversaciones anteriores"],
  ["Student pilot", "Piloto estudiantil"],
  [
    "Student access is invitation-only. Signing in does not enroll you or approve school consent.",
    "Solo puedes acceder al piloto con una invitación. Iniciar sesión no te inscribe ni aprueba el permiso escolar.",
  ],
  ["Student sign-in", "Acceso estudiantil"],
  [
    "Design preview · Sample data only · No student information is saved",
    "Vista de diseño · Solo datos de ejemplo · No se guarda información estudiantil",
  ],
  ["Skip to content", "Ir al contenido"],
  ["Counselor request sent", "Solicitud al consejero enviada"],
  ["Sending counselor request", "Enviando solicitud al consejero"],
  [
    "Counselor request confirmation pending",
    "Confirmación de solicitud al consejero pendiente",
  ],
  [
    "Talk to your counselor — send a request to Shelby",
    "Habla con tu consejero: envía una solicitud a Shelby",
  ],
  [
    "Send only your preferred name and a request to connect. No chats, goals, or scores.",
    "Envía solo tu nombre preferido y una solicitud de contacto. Sin chats, metas ni puntuaciones.",
  ],
  ["Request", "Solicitud"],
  ["sent", "enviada"],
  ["Sending", "Enviando"],
  ["request…", "solicitud…"],
  ["Confirmation", "Confirmación"],
  ["pending", "pendiente"],
  ["Your profile", "Tu perfil"],
  ["Student navigation", "Navegación estudiantil"],
  ["Your activity could not be loaded.", "No se pudo cargar tu actividad."],
  [
    "Choose a name between 1 and 50 characters.",
    "Elige un nombre de 1 a 50 caracteres.",
  ],
  [
    "Profile updated in this preview only. No account was changed.",
    "El perfil solo se actualizó en esta vista previa. No se cambió ninguna cuenta.",
  ],
  ["Your profile is saved.", "Tu perfil está guardado."],
  ["Your profile could not be saved.", "No se pudo guardar tu perfil."],
  [
    "Check-in saved. Thanks for taking a moment for yourself.",
    "Registro guardado. Gracias por darte un momento.",
  ],
  [
    "Your check-in could not be saved.",
    "No se pudo guardar tu registro de ánimo.",
  ],
  [
    "This is a design preview. No messages are sent to AI or saved.",
    "Esta es una vista de diseño. No se envían mensajes a la IA ni se guardan.",
  ],
  [
    "Your conversation could not be loaded. Please try again.",
    "No se pudo cargar tu conversación. Inténtalo de nuevo.",
  ],
  [
    "Clarity is unavailable right now. Please try later.",
    "Clarity no está disponible ahora. Inténtalo más tarde.",
  ],
  [
    "We could not sign you out. Please try again.",
    "No pudimos cerrar tu sesión. Inténtalo de nuevo.",
  ],
  [
    "We could not confirm that your request was sent. Please try again.",
    "No pudimos confirmar el envío de tu solicitud. Inténtalo de nuevo.",
  ],
  [
    "Goal saved in this preview only.",
    "La meta solo se guardó en esta vista previa.",
  ],
  [
    "Your goal is saved. Other goals are unchanged.",
    "Tu meta está guardada. Las demás metas no cambiaron.",
  ],
  ["Your goal could not be saved.", "No se pudo guardar tu meta."],
  [
    "Goal removed. You can undo this below.",
    "Meta eliminada. Puedes deshacerlo abajo.",
  ],
  ["Goal restored.", "Meta restaurada."],
  ["Your goal could not be updated.", "No se pudo actualizar tu meta."],
  ["Your goals could not be loaded.", "No se pudieron cargar tus metas."],
  ["Your history could not be loaded.", "No se pudo cargar tu historial."],
  [
    "Your Pattern Map could not be loaded.",
    "No se pudo cargar tu mapa de ánimo.",
  ],
]);
const files = [
  "StudentWorkspace",
  "StudentGoals",
  "StudentPatternMap",
  "StudentHistory",
  "StudentShell",
];
for (const name of files) {
  const file = `components/student/${name}.tsx`;
  const source = fs.readFileSync(file, "utf8");
  const ast = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const edits = [];
  function visit(node) {
    let english, mode;
    if (ts.isJsxText(node)) {
      english = node.text.replace(/\s+/g, " ").trim();
      mode = "jsx";
    }
    if (ts.isStringLiteral(node)) {
      const parent = node.parent;
      if (
        ts.isJsxAttribute(parent) &&
        ["aria-label", "placeholder", "title", "alt"].includes(
          parent.name.getText(ast),
        )
      ) {
        english = node.text;
        mode = "attribute";
      } else if (
        ts.isConditionalExpression(parent) ||
        ts.isNewExpression(parent) ||
        (ts.isCallExpression(parent) &&
          ["setError", "setSuccess", "setMessage", "setDraft"].includes(
            parent.expression.getText(ast),
          ))
      ) {
        english = node.text;
        mode = "expression";
      }
    }
    if (english && translations.has(english)) {
      const expression = `t(${JSON.stringify(english)}, ${JSON.stringify(translations.get(english))})`;
      const text =
        mode === "expression"
          ? expression
          : mode === "jsx"
            ? `${/^\s/.test(node.text) ? " " : ""}{${expression}}${/\s$/.test(node.text) ? " " : ""}`
            : `{${expression}}`;
      edits.push({ start: node.getStart(ast), end: node.getEnd(), text });
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  let result = source;
  for (const edit of edits.sort((a, b) => b.start - a.start))
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  fs.writeFileSync(file, result);
  console.log(`${file}: ${edits.length} static strings localized`);
}
