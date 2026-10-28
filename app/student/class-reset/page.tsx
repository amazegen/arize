import Link from "next/link";
import StudentBrand from "@/components/student/StudentBrand";
import StudentClassReset from "@/components/student/StudentClassReset";
import {
  StudentLanguageProvider,
  StudentLanguageSwitch,
} from "@/components/student/StudentLanguage";

// Public lesson content only: no roster, session data, student responses,
// attendance signals, tracking, or teacher permission is exposed here.
export default function ClassResetPage() {
  return (
    <StudentLanguageProvider>
      <div className="student-facilitator">
        <header className="student-header">
          <Link className="student-brand" href="/student">
            <StudentBrand />
          </Link>
          <StudentLanguageSwitch />
        </header>
        <main className="student-main">
          <StudentClassReset />
        </main>
      </div>
    </StudentLanguageProvider>
  );
}
