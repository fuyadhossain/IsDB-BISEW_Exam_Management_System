const results = [
  { course: "PWAD", batch: "PWAD/CCSL-M/71/01", examNumber: "01", status: "Pass" },
  { course: "PWAD", batch: "PWAD/CCSL-M/71/01", examNumber: "01", status: "Fail" },
  { course: "PWAD", batch: "PWAD/BDS-D/71/02", examNumber: "01", status: "Pass" },
];
const filters = { course: "PWAD", batch: "PWAD/CCSL-M/71/01", examNumber: "01" };
const findResults = (selection) => results.filter((record) => record.course === selection.course && record.batch === selection.batch && record.examNumber === selection.examNumber && (!selection.outcome || selection.outcome === "all" || record.status === selection.outcome));
const matching = findResults(filters);
const passing = findResults({ ...filters, outcome: "Pass" });
const wrongBatch = findResults({ ...filters, batch: "PWAD/BDS-D/71/02" });
if (matching.length !== 2) throw new Error("The selected course, batch, and exam number did not return the expected result records.");
if (passing.length !== 1 || passing[0].status !== "Pass") throw new Error("The outcome filter did not return the expected result records.");
if (wrongBatch.length !== 1) throw new Error("Changing the selected batch must return only that batch's records.");
console.log("Result filter checks passed: course, batch, exam number, outcome, and selection boundaries.");
