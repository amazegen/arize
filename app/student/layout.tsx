import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isStudentEdition } from "@/lib/student/policy";
import "./student.css";
import { connection } from "next/server";

export const metadata: Metadata = {
  title: "Arize · Student Edition",
  robots: { index: false, follow: false },
};

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isStudentEdition()) notFound();
  // Each document needs a fresh request nonce; never statically cache this shell.
  await connection();
  return <div className="student-app">{children}</div>;
}
