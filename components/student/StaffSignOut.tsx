"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
export default function StaffSignOut(){
 const router=useRouter();const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 async function leave(){setBusy(true);setError("");try{const result=await createClient().auth.signOut();if(result.error)throw new Error();router.replace("/student/sign-in?next=%2Fstudent%2Fstaff");router.refresh();}catch{setError("Could not sign out. Try again.");setBusy(false);}}
 return <div className="student-inline"><Link className="student-secondary" href="/student/security">Account security</Link><button className="student-secondary" disabled={busy} onClick={leave}>{busy?"Signing out…":"Sign out"}</button>{error&&<p role="alert">{error}</p>}</div>;
}
