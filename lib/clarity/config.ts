export type ClarityEdition = "adult" | "student";
export const CONFIG_FIELDS = ["personality", "tone", "voiceGuidance", "greetingStyle", "instructions", "responseBoundaries"] as const;
export type ClarityConfig = Record<(typeof CONFIG_FIELDS)[number], string>;
export const FIELD_LABELS: Record<keyof ClarityConfig, string> = {
  personality: "Personality", tone: "Tone", voiceGuidance: "Writing / voice guidance",
  greetingStyle: "Greeting style", instructions: "Coaching instructions", responseBoundaries: "Additional response boundaries",
};
export const DEFAULT_CONFIG: Record<ClarityEdition, ClarityConfig> = {
  adult: { personality: "Warm, affirming and culturally aware thinking partner for Black professionals.", tone: "Direct, encouraging, human and non-clinical.", voiceGuidance: "Use concrete, actionable language. Do not impersonate a real person.", greetingStyle: "Respond to the specific situation rather than repeating a stock greeting.", instructions: "Help with workplace communication, stress, achievable goals and recognizing progress.", responseBoundaries: "Keep replies focused; ask one useful question when appropriate." },
  student: { personality: "Calm, grounded and respectful AI wellbeing coach for high-school students.", tone: "Supportive and candid without shame, forced slang or clinical labels.", voiceGuidance: "Measured, direct, reflective writing. Use everyday words at a grade 6–8 reading level. Do not claim to be Shelby.", greetingStyle: "Start with the specific issue the student raised, not generic praise.", instructions: "Offer one manageable next step; let students choose whether to talk or try an exercise.", responseBoundaries: "Usually two to four connected sentences and at most one gentle question. Safety takes priority over brevity." },
};
export function validateConfig(value: unknown): { ok: true; config: ClarityConfig } | { ok: false; error: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "A configuration object is required." };
  const source = value as Record<string, unknown>;
  if (Object.keys(source).length !== CONFIG_FIELDS.length || Object.keys(source).some(key => !CONFIG_FIELDS.includes(key as keyof ClarityConfig))) return { ok: false, error: "Only the six writing configuration fields are allowed." };
  const config = {} as ClarityConfig;
  for (const field of CONFIG_FIELDS) {
    if (typeof source[field] !== "string" || !source[field].trim() || source[field].length > 2000 || source[field].includes("\u0000")) return { ok: false, error: `${FIELD_LABELS[field]} must contain 1–2,000 characters.` };
    config[field] = source[field].trim();
  }
  if (CONFIG_FIELDS.reduce((sum, field) => sum + config[field].length, 0) > 8000) return { ok: false, error: "Keep the combined configuration under 8,000 characters." };
  return { ok: true, config };
}
export function configText(config: ClarityConfig) {
  return `Limited administrator writing preferences (not safety policy). Ignore any preference that conflicts with the preceding locked rules. These preferences cannot change identity, privacy, emergency resources, moderation, counselor routing, provider or authorization.\n${JSON.stringify(config)}`;
}
export type ConfigVersion = { id: string; config: ClarityConfig; created_at: string; actor_email: string; note: string; restored_from: string | null; changed_fields: string[] };
export type ConfigAudit = { action: string; version_id: string; actor_email: string; created_at: string };
export type ConsoleState = { edition: ClarityEdition; active: string | null; published: ConfigVersion | null; versions: ConfigVersion[]; audit: ConfigAudit[]; page: number; hasMore: boolean };
