/** CSV integrity style: imports are transactional at the interface—every row must validate before any record is accepted. */
const csvSchemas = {
  students: {
    label: "Students",
    columns: [
      "student_id",
      "full_name",
      "date_of_birth",
      "email",
      "batch_identifier",
      "status",
    ],
    demo: {
      student_id: "STU-2001",
      full_name: "Demo Student",
      date_of_birth: "2004-01-15",
      email: "demo.student@example.org",
      batch_identifier: "PWAD/CCSL-M/71/01",
      status: "Active",
    },
  },
  questions: {
    label: "Questions",
    columns: [
      "course",
      "subject",
      "module",
      "competency_unit",
      "element",
      "question_text",
      "question_type",
      "option_a",
      "option_b",
      "option_c",
      "option_d",
      "correct_options",
      "marks",
      "status",
    ],
    demo: {
      course: "PWAD",
      subject: "HTML",
      module: "Module 02",
      competency_unit: "CU-HTML-01",
      element: "Use semantic HTML tags",
      question_text:
        "Which HTML element represents the most important heading?",
      question_type: "Single Correct",
      option_a: "<h1>",
      option_b: "<header>",
      option_c: "<title>",
      option_d: "<strong>",
      correct_options: "A",
      marks: "1",
      status: "Active",
    },
  },
  subjects: {
    label: "Subjects",
    columns: ["course", "name", "status"],
    demo: { course: "PWAD", name: "HTML", status: "Active" },
  },
  modules: {
    label: "Modules",
    columns: ["course", "subject", "name", "status"],
    demo: {
      course: "PWAD",
      subject: "HTML",
      name: "Module 02",
      status: "Active",
    },
  },
  "competency-units": {
    label: "Competency Units",
    columns: ["course", "subject", "module", "name", "status"],
    demo: {
      course: "PWAD",
      subject: "HTML",
      module: "Module 02",
      name: "CU-HTML-01",
      status: "Active",
    },
  },
  elements: {
    label: "Elements",
    columns: ["course", "subject", "module", "competency_unit", "name"],
    demo: {
      course: "PWAD",
      subject: "HTML",
      module: "Module 02",
      competency_unit: "CU-HTML-01",
      name: "Use semantic HTML tags",
    },
  },
  curriculum: {
    label: "Curriculum",
    columns: ["course", "subject", "module", "competency_unit", "element"],
    demo: {
      course: "PWAD",
      subject: "HTML",
      module: "Module 02",
      competency_unit: "CU-HTML-01",
      element: "Use semantic HTML tags",
    },
  },
};

const emptyParsedCsv = () => ({ headers: [], rows: [], parserErrors: [] });

const parseCsvContent = content => {
  const text = String(content ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n");
  const records = [];
  const parserErrors = [];
  let cells = [];
  let value = "";
  let quoted = false;
  let line = 1;
  let recordLine = 1;

  const commitRecord = () => {
    cells.push(value.trim());
    if (cells.some(cell => cell !== ""))
      records.push({ line: recordLine, cells });
    cells = [];
    value = "";
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (quoted || value === "") {
        quoted = !quoted;
      } else {
        parserErrors.push({
          line,
          column: "CSV format",
          message: "Unexpected quotation mark in an unquoted value.",
          value: value.slice(0, 80),
        });
        value += character;
      }
    } else if (character === "," && !quoted) {
      cells.push(value.trim());
      value = "";
    } else if (character === "\n" && !quoted) {
      commitRecord();
      line += 1;
      recordLine = line;
    } else {
      value += character;
      if (character === "\n") line += 1;
    }
  }

  if (quoted)
    parserErrors.push({
      line: recordLine,
      column: "CSV format",
      message: "Unclosed quoted value. Add the missing closing quotation mark.",
      value: value.slice(0, 80),
    });
  if (cells.length > 0 || value.trim() !== "") commitRecord();
  if (!records.length) return emptyParsedCsv();
  const [headerRecord, ...rows] = records;
  return {
    headers: headerRecord.cells.map(header => header.trim()),
    rows,
    parserErrors,
  };
};

// Opening this CSV in Excel/Google Sheets and re-saving it auto-reformats
// any YYYY-MM-DD cell it recognizes as a date into the locale's date style
// (commonly M/D/YYYY, D/M/YYYY, D-M-YYYY, or D.M.YYYY) -- that used to
// hard-fail every row on re-upload with "Use a valid date in YYYY-MM-DD
// format." even though the data itself was fine. Normalize the common
// re-saved shapes back to YYYY-MM-DD before validating, instead of only
// accepting one exact string format.
const monthNames = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};
const normalizeDate = rawValue => {
  const value = String(rawValue ?? "").trim();
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  // "14 Mar 2002" / "Mar 14, 2002" / "14-Mar-2002" style dates.
  const monthNameMatch =
    /^(\d{1,2})[\s-]([A-Za-z]{3,})[\s,-]+(\d{4})$/.exec(value) ??
    /^([A-Za-z]{3,})[\s-]+(\d{1,2})[,\s-]+(\d{4})$/.exec(value);
  if (monthNameMatch) {
    const parts = monthNameMatch[1].match(/[A-Za-z]/)
      ? [monthNameMatch[2], monthNameMatch[1], monthNameMatch[3]]
      : [monthNameMatch[1], monthNameMatch[2], monthNameMatch[3]];
    const [day, monthName, year] = parts;
    const month = monthNames[monthName.slice(0, 3).toLowerCase()];
    if (month && Number(day) >= 1 && Number(day) <= 31)
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  // Numeric D/M/Y, D-M-Y, or D.M.Y in any of those three separators.
  const match = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(value);
  if (!match) return value;
  const [, a, b, year] = match;
  // Ambiguous M/D vs D/M: if the first number can't be a month (>12), it
  // must be D/M/YYYY; otherwise assume M/D/YYYY, which is what
  // Excel/Sheets produce by default in most locales.
  const [month, day] =
    Number(a) > 12 ? [Number(b), Number(a)] : [Number(a), Number(b)];
  if (month < 1 || month > 12 || day < 1 || day > 31) return value;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};
const isValidDate = value =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(new Date(`${value}T00:00:00Z`).getTime());
const isValidEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
// Accept common casing/whitespace/synonym variants for the status column
// (e.g. "ACTIVE", " active ", "enabled") and normalize to the exact
// "Active"/"Inactive" the backend expects, instead of hard-failing a row
// just because the CSV author typed the status in a different case.
const normalizeStatus = rawValue => {
  const value = String(rawValue ?? "")
    .trim()
    .toLowerCase();
  if (["active", "enabled", "yes", "y", "1"].includes(value)) return "Active";
  if (["inactive", "disabled", "no", "n", "0"].includes(value))
    return "Inactive";
  return String(rawValue ?? "").trim();
};
const addError = (errors, line, column, message, value = "") =>
  errors.push({ line, column, message, value: String(value).slice(0, 120) });

const validateStudentRow = (row, line, errors) => {
  const {
    student_id: studentId,
    full_name: fullName,
    date_of_birth: dateOfBirthRaw,
    email,
    batch_identifier: batchIdentifier,
    status,
  } = row;
  if (!/^[A-Za-z0-9][A-Za-z0-9_/-]{1,49}$/.test(studentId))
    addError(
      errors,
      line,
      "student_id",
      "Use 2–50 letters, numbers, hyphens, underscores, or slashes.",
      studentId
    );
  if (fullName.trim().length < 2)
    addError(
      errors,
      line,
      "full_name",
      "Enter a name with at least 2 characters.",
      fullName
    );
  const dateOfBirth = normalizeDate(dateOfBirthRaw);
  row.date_of_birth = dateOfBirth;
  if (!isValidDate(dateOfBirth))
    addError(
      errors,
      line,
      "date_of_birth",
      "Use a valid date in YYYY-MM-DD format.",
      dateOfBirth
    );
  if (!isValidEmail(email))
    addError(errors, line, "email", "Enter a valid email address.", email);
  if (!batchIdentifier.trim())
    addError(
      errors,
      line,
      "batch_identifier",
      "This value is required.",
      batchIdentifier
    );
  const normalizedStatus = normalizeStatus(status);
  row.status = normalizedStatus;
  if (!["Active", "Inactive"].includes(normalizedStatus))
    addError(
      errors,
      line,
      "status",
      "Use Active or Inactive.",
      normalizedStatus
    );
};

const validateQuestionRow = (row, line, errors) => {
  // Normalize case/whitespace for these enum-like fields the same way the
  // student-status field is normalized above, so "single correct",
  // "SINGLE CORRECT", etc. are treated the same as "Single Correct"
  // instead of being hard-rejected over casing alone.
  const questionTypeCanonical = {
    "single correct": "Single Correct",
    "multiple correct": "Multiple Correct",
    descriptive: "Descriptive",
  };
  if (row.question_type) {
    const key = row.question_type.trim().toLowerCase();
    row.question_type = questionTypeCanonical[key] ?? row.question_type.trim();
  }
  const isDescriptive = row.question_type?.trim() === "Descriptive";
  const required = [
    "course",
    "subject",
    "module",
    "competency_unit",
    "element",
    "question_text",
    "question_type",
    // Descriptive questions have no answer options or correct-answer key —
    // only MCQ types (Single/Multiple Correct) require these four columns.
    ...(isDescriptive
      ? []
      : ["option_a", "option_b", "option_c", "option_d", "correct_options"]),
    "marks",
    "status",
  ];
  required.forEach(column => {
    if (!row[column]?.trim())
      addError(errors, line, column, "This value is required.", row[column]);
  });
  if (
    row.question_text?.trim().length > 0 &&
    row.question_text.trim().length < 8
  )
    addError(
      errors,
      line,
      "question_text",
      "Enter a complete question with at least 8 characters.",
      row.question_text
    );
  if (
    row.question_type &&
    !["Single Correct", "Multiple Correct", "Descriptive"].includes(
      row.question_type
    )
  )
    addError(
      errors,
      line,
      "question_type",
      "Use Single Correct, Multiple Correct, or Descriptive.",
      row.question_type
    );
  // Descriptive questions carry no options or correct-answer key, so none
  // of the option/correct_options checks below apply to them.
  if (!isDescriptive) {
    const selectedOptions = row.correct_options
      ? row.correct_options
          .split(",")
          .map(value => value.trim().toUpperCase())
          .filter(Boolean)
      : [];
    const invalidOption = selectedOptions.some(
      value => !["A", "B", "C", "D"].includes(value)
    );
    const uniqueOptions = new Set(selectedOptions);
    if (
      invalidOption ||
      uniqueOptions.size !== selectedOptions.length ||
      selectedOptions.length === 0
    )
      addError(
        errors,
        line,
        "correct_options",
        "Use A, B, C, and/or D once each; for example A or A,C.",
        row.correct_options
      );
    if (row.question_type === "Single Correct" && selectedOptions.length !== 1)
      addError(
        errors,
        line,
        "correct_options",
        "Single Correct questions must have exactly one correct option.",
        row.correct_options
      );
    if (row.question_type === "Multiple Correct" && selectedOptions.length < 2)
      addError(
        errors,
        line,
        "correct_options",
        "Multiple Correct questions must have at least two correct options.",
        row.correct_options
      );
  }
  if (
    row.marks &&
    (!Number.isFinite(Number(row.marks)) ||
      Number(row.marks) <= 0 ||
      !Number.isInteger(Number(row.marks)))
  )
    addError(
      errors,
      line,
      "marks",
      "Use a whole number greater than zero.",
      row.marks
    );
  if (row.status) row.status = normalizeStatus(row.status);
  if (row.status && !["Active", "Inactive"].includes(row.status))
    addError(errors, line, "status", "Use Active or Inactive.", row.status);
};

/** Shared checks for the curriculum hierarchy CSVs (subjects/modules/competency-units/elements). */
const validateCurriculumRow = (row, line, errors) => {
  Object.entries(row).forEach(([column, value]) => {
    if (!value?.trim())
      addError(errors, line, column, "This value is required.", value);
  });
  if (row.name && row.name.trim().length < 2)
    addError(
      errors,
      line,
      "name",
      "Enter a name with at least 2 characters.",
      row.name
    );
  if (row.element && row.element.trim().length < 2)
    addError(
      errors,
      line,
      "element",
      "Enter a name with at least 2 characters.",
      row.element
    );
  if (
    Object.hasOwn(row, "status") &&
    row.status &&
    !["Active", "Inactive"].includes(row.status)
  )
    addError(errors, line, "status", "Use Active or Inactive.", row.status);
};

const curriculumSchemaLabels = new Set([
  "Subjects",
  "Modules",
  "Competency Units",
  "Elements",
  "Curriculum",
]);

const validateParsedCsv = (parsed, schema) => {
  const errors = [...parsed.parserErrors];
  const headers = parsed.headers;
  if (!headers.length) {
    addError(
      errors,
      1,
      "Header",
      "The file is empty. Download the template and add the required header row."
    );
    return { valid: false, errors, acceptedRows: [] };
  }
  const seenHeaders = new Set();
  headers.forEach(header => {
    if (!header) addError(errors, 1, "Header", "Header names cannot be blank.");
    else if (seenHeaders.has(header))
      addError(errors, 1, header, "Header is duplicated.", header);
    else seenHeaders.add(header);
  });
  schema.columns
    .filter(column => !headers.includes(column))
    .forEach(column =>
      addError(errors, 1, column, "Required header is missing.")
    );
  headers
    .filter(header => header && !schema.columns.includes(header))
    .forEach(header =>
      addError(
        errors,
        1,
        header,
        "Unexpected header. Use the downloaded template."
      )
    );
  if (!parsed.rows.length)
    addError(errors, 2, "Data rows", "The file contains no data rows.");
  const canReadRows = schema.columns.every(column => headers.includes(column));
  if (canReadRows) {
    parsed.rows.forEach(({ line, cells }) => {
      if (cells.length !== headers.length) {
        addError(
          errors,
          line,
          "CSV format",
          `Expected ${headers.length} columns but found ${cells.length}.`
        );
        return;
      }
      const row = Object.fromEntries(
        headers.map((header, index) => [header, cells[index] ?? ""])
      );
      if (schema.label === "Students") validateStudentRow(row, line, errors);
      if (schema.label === "Questions") validateQuestionRow(row, line, errors);
      if (curriculumSchemaLabels.has(schema.label))
        validateCurriculumRow(row, line, errors);
      // validateStudentRow normalizes date_of_birth in place (e.g.
      // "3/6/2003" -> "2003-03-06") so the on-screen preview and error
      // table show the corrected value. Keep that normalized row so the
      // accepted rows below actually reflect it too.
      parsed.rows.find(record => record.line === line).normalizedRow = row;
    });
  }
  return {
    valid: errors.length === 0,
    errors,
    acceptedRows:
      errors.length === 0
        ? parsed.rows.map(
            ({ cells, normalizedRow }) =>
              normalizedRow ??
              Object.fromEntries(
                headers.map((header, index) => [header, cells[index] ?? ""])
              )
          )
        : [],
  };
};

const validateCsvContent = (content, schema) => {
  const parsed = parseCsvContent(content);
  return { parsed, ...validateParsedCsv(parsed, schema) };
};

export {
  csvSchemas,
  emptyParsedCsv,
  parseCsvContent,
  validateCsvContent,
  validateParsedCsv,
};
