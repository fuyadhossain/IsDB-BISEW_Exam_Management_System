import assert from "node:assert/strict";
import { hasCourseScope, scopeRecords } from "../client/src/lib/course-scope.js";

const pwadAdmin = { mode: "admin", isSuperAdmin: false, courseCodes: ["PWAD"] };
const gdAdmin = { mode: "admin", isSuperAdmin: false, courseCodes: ["GD"] };
const superAdmin = { mode: "admin", isSuperAdmin: true, courseCodes: [] };
const questions = [
  { id: "q-pwad", course: "PWAD" },
  { id: "q-gd", course: "GD" },
];
const batches = [
  { id: "b-pwad", identifier: "PWAD/CCSL-M/71/01" },
  { id: "b-gd", identifier: "GD/CCSL-M/71/01" },
];

assert.deepEqual(scopeRecords("questions", questions, pwadAdmin).map((record) => record.id), ["q-pwad"]);
assert.deepEqual(scopeRecords("batches", batches, pwadAdmin).map((record) => record.id), ["b-pwad"]);
assert.deepEqual(scopeRecords("questions", questions, gdAdmin).map((record) => record.id), ["q-gd"]);
assert.deepEqual(scopeRecords("batches", batches, gdAdmin).map((record) => record.id), ["b-gd"]);
assert.deepEqual(scopeRecords("questions", questions, superAdmin).map((record) => record.id), ["q-pwad", "q-gd"]);
assert.equal(hasCourseScope(pwadAdmin, "PWAD"), true);
assert.equal(hasCourseScope(pwadAdmin, "GD"), false);
assert.equal(hasCourseScope(gdAdmin, "PWAD"), false);
assert.equal(hasCourseScope(gdAdmin, "GD"), true);
assert.equal(hasCourseScope(superAdmin, "GD"), true);

console.log("Course scope checks passed: PWAD and GD admins are restricted; Super Admin has all-course access.");
