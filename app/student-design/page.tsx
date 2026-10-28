import { notFound } from "next/navigation";
import StudentWorkspace from "@/components/student/StudentWorkspace";
import type { StudentScreen } from "@/components/student/StudentShell";
import StudentPreviewControls from "@/components/student/StudentPreviewControls";
import StudentNotificationSettings from "@/components/student/StudentNotificationSettings";
import { STUDENT_NOTICE_VERSION } from "@/lib/student/policy";
import "../student/student.css";

// Local design fixtures are never an authentication bypass and never ship as a
// public preview route. Production/Preview builds always return 404 here.
export default async function StudentDesign({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (process.env.NODE_ENV !== "development") notFound();
  const params = await searchParams;
  if (params.screen === "admin-notifications")
    return (
      <div className="student-app">
        <StudentPreviewControls
          screen="admin-notifications"
          state="default"
          device="desktop"
        />
        <StudentNotificationSettings
          preview
          schoolName="Sample school"
          initial={{
            email: "counselor@example.test",
            updatedAt: null,
            history: [],
          }}
        />
      </div>
    );
  const screen = [
    "home",
    "check-in",
    "goals",
    "clarity",
    "counselor",
    "profile",
    "feedback",
    "toolkit",
    "class-reset",
  ].includes(String(params.screen))
    ? (String(params.screen) as StudentScreen)
    : "home";
  const state = ["first-use", "loading", "onboarding"].includes(
    String(params.state),
  )
    ? String(params.state)
    : "default";
  const device = ["phone", "chromebook"].includes(String(params.device))
    ? String(params.device)
    : "desktop";
  const controls =
    params.embedded !== "true" ? (
      <StudentPreviewControls screen={screen} state={state} device={device} />
    ) : null;
  if (params.device === "phone" || params.device === "chromebook") {
    const width = params.device === "phone" ? 390 : 1366;
    const inner = new URLSearchParams();
    inner.set("embedded", "true");
    if (typeof params.state === "string") inner.set("state", params.state);
    if (typeof params.screen === "string") inner.set("screen", params.screen);
    return (
      <>
        <div className="student-app" style={{ minHeight: 0 }}>
          {controls}
        </div>
        <div
          className="student-app"
          style={{
            padding: 24,
            display: "grid",
            justifyItems: "center",
            gap: 20,
          }}
        >
          <p>Local {params.device} layout preview · Synthetic data only</p>
          <iframe
            title={`${params.device} student layout`}
            src={`/student-design?${inner}`}
            style={{
              width,
              maxWidth: "100%",
              height: 850,
              border: "1px solid #cbdacb",
              borderRadius: 24,
              background: "#fffbf3",
            }}
          />
        </div>
      </>
    );
  }
  return (
    <div className="student-app">
      {controls}
      <div className={controls ? "student-preview-canvas" : undefined}>
        <StudentWorkspace
          key={params.state === "onboarding" ? "onboarding" : "home"}
          preview
          firstUse={params.state === "first-use"}
          loadingPreview={params.state === "loading"}
          initialScreen={screen}
          initialProfile={
            params.state === "onboarding"
              ? null
              : {
                  display_name: "Marcus",
                  grade: "10",
                  notice_version: STUDENT_NOTICE_VERSION,
                }
          }
          school={{
            name: "Sample school",
            counselor_url: null,
            counselor_instructions:
              "Your school will share its usual counselor contact process before the pilot begins.",
          }}
        />
      </div>
    </div>
  );
}
