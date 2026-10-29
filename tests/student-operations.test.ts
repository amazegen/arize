import test from "node:test";
import assert from "node:assert/strict";
import { validAttendance, staffDestination } from "../lib/student/operations.ts";
import { reportInsights, safeBand } from "../lib/student/reporting.ts";
test("class attendance accepts totals only when present plus absent equals enrolled",()=>{
 assert.equal(validAttendance({enrolled:25,present:23,absent:2}),true);
 for(const v of [{enrolled:0,present:0,absent:0},{enrolled:25,present:24,absent:2},{enrolled:25,present:-1,absent:26},{enrolled:25,present:22.5,absent:2.5},{enrolled:"25",present:23,absent:2},{enrolled:501,present:500,absent:1}])assert.equal(validAttendance(v),false);
});
test("verified role destinations are distinct; pending applicants remain in onboarding",()=>{
 assert.equal(staffDestination({operator:false,role:null}),"/student/staff");
 assert.equal(staffDestination({operator:false,role:"teacher"}),"/student/teacher");
 assert.equal(staffDestination({operator:false,role:"therapist"}),"/student/admin");
 assert.equal(staffDestination({operator:true,role:null}),"/student/operator");
});
test("operational report projection never forwards raw detail or arbitrary JSON fields",()=>{
 const raw={version:2,topics:{tests:"20–29",student_name:"Private Name"},belonging:{welcome:{positive:"10–19",respondents:"40–49",raw:"private response"}},attendance:{rate:"90–99",roster:"private roster"},resets:{"fresh-start":2,connection:-1,"private-class-name":40},ambassadors:{interested:"20–29",oriented:"10–19",active:"10–19",roster:"private names"}};
 const result=reportInsights(raw);const text=JSON.stringify(result);
 for(const word of ["Private Name","private response","private roster","private-class-name","private names"])assert.equal(text.includes(word),false);
 assert.equal(result.resets?.connection,null);assert.equal(result.resets?.["fresh-start"],2);
 assert.equal(safeBand("29–20"),null);assert.equal(safeBand("private name"),null);
 assert.deepEqual(reportInsights({}),{});
});
