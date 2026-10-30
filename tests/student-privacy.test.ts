import test from "node:test";
import assert from "node:assert/strict";
import { validPrivacyReview, EXPORT_SECTIONS } from "../lib/student/privacy.ts";
import { dateKey, weekStart } from "../lib/student/features.ts";
import { reportInsights } from "../lib/student/reporting.ts";
test("privacy review requires a real UUID, bounded reference and explicit confirmation",()=>{
 const value={requestId:"10000000-0000-4000-8000-000000000001",status:"in_review",reference:"CASE-001",confirmed:true};
 assert.ok(validPrivacyReview(value));
 for(const change of [{requestId:"-".repeat(36)},{status:"deleted"},{reference:"  "},{reference:"x".repeat(201)},{confirmed:false}])assert.equal(validPrivacyReview({...value,...change}),false);
 assert.equal(new Set(EXPORT_SECTIONS).size,EXPORT_SECTIONS.length);
 assert.equal(EXPORT_SECTIONS.includes("staff" as never),false);
});
test("school calendar handles midnight and daylight-saving boundaries",()=>{
 assert.equal(dateKey(new Date("2026-11-01T03:30:00Z"),"America/New_York"),"2026-10-31");
 assert.equal(dateKey(new Date("2026-11-01T06:30:00Z"),"America/New_York"),"2026-11-01");
 assert.equal(weekStart(dateKey(new Date("2026-11-01T03:30:00Z"),"America/New_York")),"2026-10-25");
});
test("report calendar metadata remains explicitly whitelisted",()=>{
 assert.equal(reportInsights({version:2,timeZone:"America/New_York"}).timeZone,"America/New_York");
 assert.equal(reportInsights({version:2,timeZone:"<script>"}).timeZone,undefined);
});
