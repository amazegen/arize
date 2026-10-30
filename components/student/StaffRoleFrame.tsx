"use client";
import Link from "next/link";
import { LayoutDashboard, BookOpen, Settings, ShieldCheck } from "lucide-react";
import StudentBrand from "./StudentBrand";
import StaffSignOut from "./StaffSignOut";
export default function StaffRoleFrame({ role, schoolName, home, notifications = false, preview = false, children }: { role: string; schoolName: string; home: string; notifications?: boolean; preview?: boolean; children: React.ReactNode }) {
  return <div className="staff-console"><aside className="staff-sidebar"><Link className="student-brand" href={home}><StudentBrand /></Link><div className="staff-role"><span className="staff-eyebrow">YOUR WORKSPACE</span><strong>{role}</strong><span>{schoolName}</span></div><nav aria-label={`${role} workspace`}><Link className="staff-settings-link" href={home}><LayoutDashboard size={20} />Workspace overview</Link><Link className="staff-settings-link" href="/student/class-reset"><BookOpen size={20} />Class Reset resources</Link>{notifications && <Link className="staff-settings-link" href={preview ? "/student-design?screen=admin-notifications" : "/student/admin/notifications"}><Settings size={20} />Notification settings</Link>}</nav>{!preview && <StaffSignOut />}<div className="staff-sidebar-note"><ShieldCheck size={22} /><p>School-scoped access only. No private student chats, goals or emotional scores.</p></div></aside>{children}</div>;
}
