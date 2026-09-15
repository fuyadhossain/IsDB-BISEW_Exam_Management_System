import { csvSchemas, validateCsvContent } from "../client/src/lib/csv-validation.js";

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const studentSchema = csvSchemas.students;
const validStudent = `${studentSchema.columns.join(",")}\nSTU-2001,Demo Student,2004-01-15,demo.student@example.org,PWAD/CCSL-M/71/03,Active\n`;
const invalidStudent = `${studentSchema.columns.join(",")}\nSTU-2001,Demo Student,2004-01-15,demo.student@example.org,PWAD/CCSL-M/71/03,Active\nSTU-2002,,15/01/2004,not-an-email,,Pending\n`;
const missingHeader = "student_id,full_name,date_of_birth,email,batch_identifier\nSTU-2001,Demo Student,2004-01-15,demo.student@example.org,PWAD/CCSL-M/71/03\n";
const malformed = `${studentSchema.columns.join(",")}\nSTU-2001,"Demo Student,2004-01-15,demo.student@example.org,PWAD/CCSL-M/71/03,Active\n`;

assert(validateCsvContent(validStudent, studentSchema).valid, "Expected the valid student file to pass.");
const invalidResult = validateCsvContent(invalidStudent, studentSchema);
assert(!invalidResult.valid && invalidResult.acceptedRows.length === 0, "Expected a bad row to block the entire import.");
assert(invalidResult.errors.some((error) => error.line === 3 && error.column === "email"), "Expected the invalid email to identify line 3.");
assert(!validateCsvContent(missingHeader, studentSchema).valid, "Expected a missing required header to block the import.");
assert(!validateCsvContent(malformed, studentSchema).valid, "Expected malformed CSV quoting to block the import.");
console.log("CSV validation checks passed: header, row, format, and all-or-nothing safeguards.");
