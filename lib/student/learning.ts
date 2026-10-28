export type StudentLanguage = "en" | "es";
export type Bilingual = { en: string; es: string };
export const words = (en: string, es: string): Bilingual => ({ en, es });

// Original, non-clinical pilot activities. CASEL mapping is descriptive,
// not a claim of certification, endorsement, or proven outcomes.
export const SEL_SKILLS = [
  words("Self-awareness", "Autoconciencia"),
  words("Self-management", "Autogestión"),
  words("Social awareness", "Conciencia social"),
  words("Relationship skills", "Habilidades para relacionarse"),
  words("Responsible decision-making", "Toma de decisiones responsable"),
] as const;

export const STUDENT_TOPICS = [
  {
    id: "tests",
    label: words("Tests & AP stress", "Exámenes y clases AP"),
    prompt: words(
      "I feel stressed about a test or AP class. Help me choose one small step to prepare without burning out.",
      "Me estresa un examen o una clase AP. Ayúdame a elegir un paso pequeño para prepararme sin agotarme.",
    ),
  },
  {
    id: "future",
    label: words("College & career", "Universidad y trabajo"),
    prompt: words(
      "I feel pressure about college or my future job. Can we sort out one thing I can do now?",
      "Siento presión por la universidad o mi futuro trabajo. ¿Podemos pensar en algo que pueda hacer ahora?",
    ),
  },
  {
    id: "social",
    label: words("Social media pressure", "Presión en redes sociales"),
    prompt: words(
      "Social media is making me compare myself to others. Help me find a healthy next step.",
      "Las redes sociales hacen que me compare con otras personas. Ayúdame a pensar en un próximo paso saludable.",
    ),
  },
  {
    id: "relationships",
    label: words("Friends & relationships", "Amistades y relaciones"),
    prompt: words(
      "Something feels hard in a friendship or relationship. Help me think about my boundaries and how to ask for support.",
      "Algo está difícil en una amistad o relación. Ayúdame a pensar en mis límites y en cómo pedir apoyo.",
    ),
  },
  {
    id: "identity",
    label: words("Identity & belonging", "Identidad y pertenencia"),
    prompt: words(
      "I am figuring out who I am and where I fit in. Can we talk without making assumptions about me?",
      "Estoy descubriendo quién soy y dónde encajo. ¿Podemos hablar sin hacer suposiciones sobre mí?",
    ),
  },
  {
    id: "sleep",
    label: words("Sleep & rest", "Sueño y descanso"),
    prompt: words(
      "School and life are getting in the way of rest. Help me make one small, realistic change to my routine.",
      "La escuela y la vida me dejan poco tiempo para descansar. Ayúdame a hacer un cambio pequeño y realista en mi rutina.",
    ),
  },
  {
    id: "responsibilities",
    label: words(
      "Jobs & family responsibilities",
      "Trabajo y responsabilidades familiares",
    ),
    prompt: words(
      "I am balancing school, work, or helping my family. Help me plan a small next step and ask for help when needed.",
      "Estoy tratando de cumplir con la escuela, el trabajo o ayudar a mi familia. Ayúdame a planear un paso pequeño y pedir ayuda cuando la necesite.",
    ),
  },
  {
    id: "grief",
    label: words("Grief & loss", "Duelo y pérdida"),
    prompt: words(
      "I am dealing with a loss. I do not want to be rushed to feel better. Help me think about support and one gentle step for today.",
      "Estoy pasando por una pérdida. No quiero que me apresuren a sentirme mejor. Ayúdame a pensar en apoyo y un paso pequeño para hoy.",
    ),
  },
] as const;

export type ResetStep = {
  title: Bilingual;
  instruction: Bilingual;
  seconds: number;
  skill: number;
};
export type ResetLesson = {
  id: string;
  title: Bilingual;
  description: Bilingual;
  steps: readonly ResetStep[];
};
export const RESET_LESSONS: readonly ResetLesson[] = [
  {
    id: "fresh-start",
    title: words("A fresh start", "Un nuevo comienzo"),
    description: words(
      "Make room for the next part of your school day.",
      "Haz espacio para la siguiente parte del día escolar.",
    ),
    steps: [
      {
        title: words("Notice", "Observa"),
        instruction: words(
          "Keep your eyes open if you like. Notice your feet and the room around you. Silently name how you feel. You do not have to share.",
          "Puedes mantener los ojos abiertos. Siente tus pies y observa el salón. Piensa cómo te sientes. No tienes que compartirlo.",
        ),
        seconds: 60,
        skill: 0,
      },
      {
        title: words("Settle", "Toma una pausa"),
        instruction: words(
          "Sit or stand in a way that feels comfortable. Breathe at your own pace, or look for three colors in the room. Choose what works for you.",
          "Siéntate o ponte de pie como prefieras. Respira a tu ritmo o busca tres colores en el salón. Elige lo que te ayude.",
        ),
        seconds: 60,
        skill: 1,
      },
      {
        title: words("Make space", "Haz espacio"),
        instruction: words(
          "People may be having very different days. Think of one way to make room for someone else without guessing how they feel.",
          "Cada persona puede tener un día distinto. Piensa en una forma de hacer espacio para otra persona sin adivinar cómo se siente.",
        ),
        seconds: 60,
        skill: 2,
      },
      {
        title: words("Ask or offer", "Pide u ofrece"),
        instruction: words(
          "Practice a simple sentence silently: “Can you help me with one thing?” or “Would you like some space?” Nobody needs to tell a personal story.",
          "Practica en silencio: «¿Puedes ayudarme con algo?» o «¿Quieres un poco de espacio?». Nadie tiene que contar una historia personal.",
        ),
        seconds: 60,
        skill: 3,
      },
      {
        title: words("One next step", "Un próximo paso"),
        instruction: words(
          "Pick one small action for the next class. It could be asking a question, taking out your notes, or getting water. Consider whether it helps you and others.",
          "Elige una acción pequeña para la siguiente clase: hacer una pregunta, sacar tus notas o tomar agua. Piensa si te ayuda a ti y a los demás.",
        ),
        seconds: 60,
        skill: 4,
      },
    ],
  },
  {
    id: "before-a-test",
    title: words("Before a test", "Antes de un examen"),
    description: words(
      "Turn pressure into a manageable next step.",
      "Convierte la presión en un próximo paso posible.",
    ),
    steps: [
      {
        title: words("Name the pressure", "Reconoce la presión"),
        instruction: words(
          "Notice what test pressure feels like for you. A feeling is not a prediction of your result. Keep your answer to yourself if you want.",
          "Observa cómo sientes la presión de un examen. Una emoción no predice tu resultado. Puedes guardar tu respuesta para ti.",
        ),
        seconds: 60,
        skill: 0,
      },
      {
        title: words("Find an anchor", "Encuentra un apoyo"),
        instruction: words(
          "Feel the chair or floor supporting you. Let your shoulders rest if that feels good. You can also quietly look at one object in the room.",
          "Siente el apoyo de la silla o el piso. Relaja los hombros si te resulta cómodo. También puedes mirar un objeto del salón en silencio.",
        ),
        seconds: 60,
        skill: 1,
      },
      {
        title: words("Different needs", "Distintas necesidades"),
        instruction: words(
          "A classmate may need quiet, time, or clear directions. Think about how you can respect a different need without comparing scores or abilities.",
          "Un compañero puede necesitar silencio, tiempo o instrucciones claras. Piensa cómo respetar una necesidad distinta sin comparar notas o habilidades.",
        ),
        seconds: 60,
        skill: 2,
      },
      {
        title: words("Ask clearly", "Pregunta con claridad"),
        instruction: words(
          "Practice asking your teacher one helpful question about the instructions or available support. You do not have to explain private worries to the class.",
          "Practica una pregunta útil para tu docente sobre las instrucciones o el apoyo disponible. No tienes que explicar preocupaciones privadas al grupo.",
        ),
        seconds: 60,
        skill: 3,
      },
      {
        title: words("Choose your start", "Elige cómo empezar"),
        instruction: words(
          "Choose a first step: read the directions, plan your time, or start with one question. Decide what you will do if you get stuck.",
          "Elige un primer paso: leer las instrucciones, organizar tu tiempo o empezar con una pregunta. Decide qué harás si te atoras.",
        ),
        seconds: 60,
        skill: 4,
      },
    ],
  },
  {
    id: "connection",
    title: words("Room for everyone", "Espacio para todos"),
    description: words(
      "Practice belonging without putting anyone on the spot.",
      "Practica la inclusión sin poner a nadie en evidencia.",
    ),
    steps: [
      {
        title: words("What helps you?", "¿Qué te ayuda?"),
        instruction: words(
          "Think of one thing that helps you feel welcome in a group. You can write or think silently. Passing is always okay.",
          "Piensa en algo que te ayude a sentirte parte de un grupo. Puedes escribir o pensar en silencio. Siempre puedes pasar.",
        ),
        seconds: 60,
        skill: 0,
      },
      {
        title: words("Pause before reacting", "Haz una pausa"),
        instruction: words(
          "Think about a time you felt left out, without sharing names or details. Notice a calm action you could choose next time. Skip this reflection if you prefer.",
          "Piensa en una vez que te sentiste fuera de un grupo, sin compartir nombres ni detalles. Considera una acción tranquila para otra vez. Puedes saltar esta reflexión.",
        ),
        seconds: 60,
        skill: 1,
      },
      {
        title: words("Another perspective", "Otra perspectiva"),
        instruction: words(
          "People can join in different ways. Being quiet does not mean someone does not care. Think about a way to include others without forcing them to speak.",
          "Cada persona participa de forma distinta. Estar en silencio no significa que no le importe. Piensa cómo incluir a otros sin obligarlos a hablar.",
        ),
        seconds: 60,
        skill: 2,
      },
      {
        title: words("An invitation", "Una invitación"),
        instruction: words(
          "Practice: “You can join us if you want.” Leave room for “no” and for quiet participation. No one has to earn a place by sharing private information.",
          "Practica: «Puedes acompañarnos si quieres». Acepta un «no» y la participación en silencio. Nadie tiene que compartir información privada para pertenecer.",
        ),
        seconds: 60,
        skill: 3,
      },
      {
        title: words("Make it real", "Llévalo a la práctica"),
        instruction: words(
          "Choose one kind action you can take today. Think about its effect, not just your intention. You can change your plan if someone asks for something different.",
          "Elige una acción amable para hoy. Piensa en su efecto, no solo en tu intención. Puedes cambiar de plan si alguien pide algo distinto.",
        ),
        seconds: 60,
        skill: 4,
      },
    ],
  },
];

export function resetPosition(
  elapsedSeconds: number,
  steps: readonly ResetStep[],
) {
  let remaining = Math.max(
    0,
    Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0,
  );
  for (let i = 0; i < steps.length; i++) {
    if (remaining < steps[i].seconds)
      return {
        index: i,
        remaining: Math.ceil(steps[i].seconds - remaining),
        done: false,
      };
    remaining -= steps[i].seconds;
  }
  return { index: Math.max(0, steps.length - 1), remaining: 0, done: true };
}

export const BELONGING_QUESTIONS = [
  {
    id: "welcome",
    text: words(
      "I feel welcome at my school.",
      "Siento que me reciben bien en mi escuela.",
    ),
  },
  {
    id: "trusted_adult",
    text: words(
      "There is an adult at school I can ask for help.",
      "Hay una persona adulta en la escuela a quien puedo pedir ayuda.",
    ),
  },
  {
    id: "connection",
    text: words(
      "I feel connected to people at my school.",
      "Siento una conexión con personas de mi escuela.",
    ),
  },
] as const;
