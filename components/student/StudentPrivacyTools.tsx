"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { studentFetch } from "@/lib/student/fetch-client";
import { EXPORT_SECTIONS, PRIVACY_KINDS } from "@/lib/student/privacy";
import { StudentLanguageProvider, StudentLanguageSwitch, useStudentLanguage } from "./StudentLanguage";
type PrivacyRequest = { id: string; kind: string; status: string; created_at: string };
export default function StudentPrivacyTools() { return <StudentLanguageProvider><PrivacyForm /></StudentLanguageProvider>; }
function PrivacyForm() {
  const { language, t } = useStudentLanguage();
  const [requests, setRequests] = useState<PrivacyRequest[]>([]); const [kind,setKind] = useState("access");
  const [confirmed,setConfirmed] = useState(false); const [busy,setBusy] = useState(false); const [ready,setReady] = useState(false);
  const [error,setError] = useState(""); const [message,setMessage] = useState("");
  const exportController=useRef<AbortController|null>(null);
  const [exporting,setExporting]=useState(false);
  useEffect(()=>()=>exportController.current?.abort(),[]);
  async function load() { const response = await studentFetch("/api/student/privacy"); const body = await response.json(); if (!response.ok) throw new Error(body.error); setRequests(body.requests); setReady(true); }
  useEffect(() => { let active = true; studentFetch("/api/student/privacy").then(async response => { const body=await response.json(); if (!active) return; if (!response.ok) throw new Error(body.error); setRequests(body.requests); setReady(true); }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : "Privacy tools unavailable."); }); return () => { active=false; }; }, []);
  async function action(payload: Record<string,unknown>,signal?:AbortSignal) { const response=await studentFetch("/api/student/privacy",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...payload,confirmed:true}),signal}); const body=await response.json(); if (!response.ok) throw new Error(body.error); return body; }
  async function request(event: React.FormEvent) {
    event.preventDefault(); if (!confirmed) return; setBusy(true);setError("");setMessage("");
    try { await action({action:"request",kind}); setMessage(t("Request saved for review. No records were deleted and no pilot permissions changed.","Solicitud guardada para revisión. No se borraron registros ni cambiaron los permisos del piloto.")); setConfirmed(false); try { await load(); } catch { setMessage(t("Request saved, but the list could not refresh. Reload before submitting again.","La solicitud se guardó, pero no pudimos actualizar la lista. Recarga antes de enviarla otra vez.")); } }
    catch(reason){setError(reason instanceof Error ? reason.message : t("Could not save request.","No pudimos guardar la solicitud."));}finally{setBusy(false);}
  }
  async function download() {
    if (!confirmed) return; setBusy(true);setError("");setMessage("");
    const controller=new AbortController();exportController.current=controller;setExporting(true);
    try {
      const start=await action({action:"start-export"},controller.signal); const data: Record<string,unknown>={format:"Arize Student app-data export v1",exportedAt:new Date().toISOString(),account:start.account,scope:"Student Edition records read during this download; not a point-in-time database snapshot. Excludes provider logs, backups, clinical records and other people's information."};
      let bytes=0;
      for (const section of EXPORT_SECTIONS) {
        const items: unknown[]=[]; let after: string|null=""; let pages=0;
        do { const page=await action({action:"export-page",exportId:start.exportId,section,after},controller.signal); bytes+=new TextEncoder().encode(JSON.stringify(page.items)).length; if (bytes>50_000_000 || ++pages>1000) throw new Error(t("This export is too large for this download. Nothing was downloaded. Request access help below to arrange a complete export.","Esta exportación es demasiado grande para esta descarga. No se descargó nada. Solicita ayuda de acceso abajo para obtener una exportación completa.")); items.push(...page.items); after=page.nextKey; } while(after);
        data[section]=items;
      }
      if(controller.signal.aborted)return;
      const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});const url=URL.createObjectURL(blob);const link=document.createElement("a");link.href=url;link.download=`arize-student-data-${new Date().toISOString().slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      setMessage(t("Your app-data download was created. Keep it private on a trusted device.","Se creó la descarga de tus datos de la app. Guárdala en privado en un dispositivo seguro."));setConfirmed(false);
    }catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error ? reason.message : t("The export could not finish. No partial download was created.","La exportación no pudo terminar. No se creó una descarga parcial."));}finally{exportController.current=null;setExporting(false);setBusy(false);}
  }
  const statuses: Record<string,string>={received:t("received","recibida"),in_review:t("in review","en revisión"),awaiting_owner:t("awaiting owner","en espera del responsable"),closed:t("closed","cerrada")};
  const labels: Record<string,string>={access:t("Access/help with my data","Acceso o ayuda con mis datos"),correction:t("Correct my information","Corregir mi información"),deletion:t("Request deletion review","Solicitar revisión para borrar datos"),withdrawal:t("Request consent-withdrawal review","Solicitar revisión para retirar consentimiento")};
  return <div lang={language}><StudentLanguageSwitch /><div className="student-intro"><h1>{t("Your data. Your choices.","Tus datos. Tus decisiones.")}</h1><p>{t("Available to student accounts, even after pilot access ends. Staff cannot use this page to download someone else’s chats.","Disponible para cuentas de estudiantes, incluso al terminar el acceso al piloto. El personal no puede usar esta página para descargar chats de otra persona.")}</p></div>{error&&<p className="student-error" role="alert">{language==="es"&&!/[áéíóúñ]/i.test(error)?"No pudimos completar la acción. Usa el contacto de la política de privacidad si necesitas ayuda.":error}</p>}{message&&<p className="student-success" role="status">{message}</p>}
  <section className="student-card"><h2>{t("Request privacy help","Solicita ayuda de privacidad")}</h2><p>{t("Do not include chats or private details. Requests go to an authorized project administrator for review. This is not an emergency contact. Submitting does not automatically delete data or revoke access.","No incluyas chats ni detalles privados. Una persona autorizada del proyecto revisará la solicitud. No es un contacto de emergencia. Enviarla no borra datos ni revoca el acceso automáticamente.")}</p><form className="student-form" onSubmit={request}><label>{t("Request type","Tipo de solicitud")}<select value={kind} onChange={event=>setKind(event.target.value)}>{PRIVACY_KINDS.map(value=><option key={value} value={value}>{labels[value]}</option>)}</select></label><label className="student-check"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)} required/>{t("I’m using my own account on a trusted device and want to continue.","Estoy usando mi propia cuenta en un dispositivo seguro y quiero continuar.")}</label><button className="student-action" disabled={!ready||busy||!confirmed}>{busy?t("Working…","Procesando…"):t("Send request for review","Enviar solicitud para revisión")}</button><button type="button" className="student-secondary" disabled={!ready||busy||!confirmed} onClick={download}>{t("Download my app data (JSON)","Descargar mis datos de la app (JSON)")}</button>{exporting&&<button type="button" className="student-secondary" onClick={()=>{exportController.current?.abort();setMessage(t("Export cancelled. No partial file was downloaded.","Exportación cancelada. No se descargó un archivo parcial."));}}>{t("Cancel download","Cancelar descarga")}</button>}</form></section>
  <section className="student-card" style={{marginTop:24}}><h2>{t("My recent privacy requests (up to 100)","Mis solicitudes recientes de privacidad (hasta 100)")}</h2>{requests.length?<ul>{requests.map(row=><li key={row.id}>{labels[row.kind]} · {statuses[row.status] ?? row.status} · {new Date(row.created_at).toLocaleDateString(language)}<br/><small>{t("Reference","Referencia")}: {row.id}</small></li>)}</ul>:<p>{t("No requests to show.","No hay solicitudes para mostrar.")}</p>}<a href="https://amazegen.com/privacy.html" target="_blank" rel="noopener noreferrer">{t("Privacy policy and contact information","Política de privacidad y datos de contacto")}</a></section><p><Link href="/student">{t("Back to Arize","Volver a Arize")}</Link></p></div>;
}
