import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isStudentEdition } from "@/lib/student/policy";
import "./student.css";

export const metadata: Metadata = {
  title: "Arize · Student Edition",
  robots: { index: false, follow: false },
};

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isStudentEdition()) notFound();
  return <div className="student-app">{children}</div>;
}
