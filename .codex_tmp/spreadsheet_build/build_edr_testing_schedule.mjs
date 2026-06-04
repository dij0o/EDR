import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outDir = path.resolve("outputs/edr_testing_schedule");
const outFile = path.join(outDir, "EDR_High_Level_Testing_Schedule.xlsx");
await fs.mkdir(outDir, { recursive: true });

const workbook = Workbook.create();

const colors = {
  navy: "#17365D",
  blue: "#1F4E79",
  teal: "#0F6B6E",
  green: "#2E7D32",
  amber: "#F9A825",
  red: "#C00000",
  purple: "#6A4C93",
  gray: "#F2F2F2",
  darkGray: "#666666",
  white: "#FFFFFF",
  lightBlue: "#D9EAF7",
  lightTeal: "#DDEFEF",
  lightGreen: "#E2F0D9",
  lightAmber: "#FFF2CC",
  lightRed: "#FCE4D6",
  lightPurple: "#EADCF8",
};

const phases = [
  {
    id: "P0",
    phase: "Dependency Closure",
    window: "Pre-T0 / 5 business days",
    startDay: -5,
    duration: 5,
    stream: "Readiness",
    scope: "Close missing artifacts, environment details, access, source code gaps, seed data, Fabric setup details, and test credentials.",
    dependency: "Client responses and required artifacts.",
    output: "Dependency tracker and testing start confirmation.",
    note: "Testing start date is confirmed only after this phase is cleared.",
  },
  {
    id: "P1",
    phase: "Environment Setup and Smoke Validation",
    window: "Days 1-5",
    startDay: 1,
    duration: 5,
    stream: "Setup",
    scope: "Set up Docker/Fabric/MySQL/API/frontend/mobile environment, import seed data, validate startup order, and perform smoke checks.",
    dependency: "Docker Compose or equivalent runbook, Fabric assets, SQL dump, env files.",
    output: "Environment readiness note and smoke test evidence.",
    note: "Generous buffer included for setup fixes and clarification loops.",
  },
  {
    id: "P2",
    phase: "Test Planning and Traceability",
    window: "Days 1-5",
    startDay: 1,
    duration: 5,
    stream: "Planning",
    scope: "Finalize test scenarios, map BRD/SRS requirements, confirm roles, expected evidence, data needs, and pass/fail criteria.",
    dependency: "Final requirements, confirmed runnable scope, test users.",
    output: "Traceability matrix and high-level test cases.",
    note: "Runs in parallel with environment setup.",
  },
  {
    id: "P3",
    phase: "Functional Testing",
    window: "Days 6-15",
    startDay: 6,
    duration: 10,
    stream: "Functional",
    scope: "Validate web, mobile, backend API, database views, login, roles, patient/doctor/admin workflows, and cross-service integrations.",
    dependency: "Runnable application stack, frontend/mobile source, seed data, test credentials.",
    output: "Functional execution results and defects.",
    note: "Covers manual web/mobile testing and API/database verification.",
  },
  {
    id: "P4",
    phase: "Blockchain and Smart Contract Testing",
    window: "Days 10-18",
    startDay: 10,
    duration: 9,
    stream: "Blockchain",
    scope: "Validate Fabric network startup, chaincode deployment, ledger read/write behavior, consent workflow, unauthorized access attempts, and negative paths.",
    dependency: "Complete Fabric test-network, connection profile, wallet identities, deployed chaincode.",
    output: "Blockchain workflow evidence and smart contract findings.",
    note: "Overlaps with functional testing once Fabric is stable.",
  },
  {
    id: "P5",
    phase: "Security Testing",
    window: "Days 12-22",
    startDay: 12,
    duration: 11,
    stream: "Security",
    scope: "Run source, secret, dependency, container, TLS, endpoint, authentication, authorization, and API negative testing.",
    dependency: "Complete source, package files, running endpoints, test users.",
    output: "Security test evidence and security defect register.",
    note: "Includes buffer for re-runs after environment corrections.",
  },
  {
    id: "P6",
    phase: "Performance and Load Baseline",
    window: "Days 20-27",
    startDay: 20,
    duration: 8,
    stream: "Performance",
    scope: "Conduct baseline API and blockchain load tests, capture throughput, response time, errors, logs, and resource observations.",
    dependency: "Stable environment, agreed workload model, Caliper files or approved benchmark scripts.",
    output: "Performance baseline results.",
    note: "This is a baseline test, not production capacity certification.",
  },
  {
    id: "P7",
    phase: "Horizontal Scaling Readiness",
    window: "Days 26-30",
    startDay: 26,
    duration: 5,
    stream: "Scalability",
    scope: "Assess whether the provided environment supports scaling validation and document gaps where Docker Compose cannot prove autoscaling behavior.",
    dependency: "Infrastructure details and scaling target/thresholds.",
    output: "Scaling readiness note and recommendations.",
    note: "Autoscaling validation requires Kubernetes or equivalent scaling environment.",
  },
  {
    id: "P8",
    phase: "HIPAA and GDPR Compliance-Oriented Testing",
    window: "Days 28-37",
    startDay: 28,
    duration: 10,
    stream: "Compliance",
    scope: "Assess access control, audit logging, consent, data handling, privacy workflow readiness, sensitive data exposure, and retention indicators.",
    dependency: "Stable workflows, logs/configuration access, documentation, test evidence from functional/security phases.",
    output: "HIPAA/GDPR checklist and gap register.",
    note: "Testing only. Formal certification and remediation are outside scope.",
  },
  {
    id: "P9",
    phase: "Defect Triage and Retesting Window",
    window: "Days 35-44",
    startDay: 35,
    duration: 10,
    stream: "Retest",
    scope: "Support defect walkthroughs, retest fixes completed by the implementation team, update evidence, and track residual risks.",
    dependency: "Dedicated implementation team available for defect/gap resolution.",
    output: "Retest evidence and updated defect status.",
    note: "Resolution of defects/gaps is not included in testing scope.",
  },
  {
    id: "P10",
    phase: "Final Reporting and Closure",
    window: "Days 45-50",
    startDay: 45,
    duration: 6,
    stream: "Reporting",
    scope: "Prepare final report, executive summary, evidence index, unresolved risk register, recommendations, and closure walkthrough.",
    dependency: "Testing execution complete and retest status agreed.",
    output: "Final testing report and evidence pack.",
    note: "Final dates may shift if environment or retest delays occur.",
  },
];

const dependencies = [
  ["D-01", "Docker Compose file or equivalent setup automation", "Not present", "Required to bring up MySQL, APIs, Fabric services, frontend/mobile support services, ports, volumes, and startup order.", "Before T0", "Open"],
  ["D-02", "Complete web frontend source code", "bc-dentistry-frontend is empty", "Required for web workflow and end-to-end testing.", "Before T0", "Open"],
  ["D-03", "Complete mobile application source code", "BC-Dentistry-Mobile-App is empty", "Required for patient consent and mobile workflow testing.", "Before T0", "Open"],
  ["D-04", "Complete Fabric test-network assets", "network.sh references missing compose/configtx/organizations/bin/config assets", "Required to start Fabric, create channel, deploy chaincode, and generate connection profile.", "Before T0", "Open"],
  ["D-05", "Validated SQL dump and seed/login data", "datamodel2.sql has partial seed data and schema mismatch indicators", "Required for login, roles, database views, repeatable functional tests.", "Before T0", "Open"],
  ["D-06", "Environment variables and sanitized configuration", ".env examples exist but code also has hardcoded ports/hosts", "Required for API, Fabric, DB, frontend, and mobile connectivity.", "Before T0", "Open"],
  ["D-07", "Confirmed test credentials", "README lists users but seed records are not fully aligned", "Required for Admin, Doctor, Patient, and consent workflow execution.", "Before Day 5", "Open"],
  ["D-08", "Caliper/workload files or approved workload model", "caliper-benchmarks is empty", "Required for repeatable performance testing.", "Before Day 20", "Open"],
  ["D-09", "Infrastructure details for running environment", "Not included", "Required for performance assumptions and scaling readiness assessment.", "Before Day 20", "Open"],
  ["D-10", "Defect resolution team confirmation", "Testing scope excludes remediation", "Required to support triage and retesting without blocking final reporting.", "Before Day 35", "Open"],
];

const scopeRows = [
  ["Functional", "Web, mobile, backend API, database validation, roles, login, consent workflow, integrations.", "Manual testing, curl/API scripts, SQL checks.", "Functional test results and defect records."],
  ["Blockchain", "Fabric startup, chaincode deployment, ledger operations, consent workflow, unauthorized and negative paths.", "Fabric peer CLI, API scripts, Semgrep CE, custom negative-test scripts.", "Blockchain evidence and smart contract findings."],
  ["Security", "Source scan, secrets, dependencies, containers, TLS, endpoints, authentication, authorization, API negative tests.", "Semgrep CE, Gitleaks, Trivy, OWASP ZAP, testssl.sh, OpenSSL, curl.", "Security evidence and defect register."],
  ["Performance", "Baseline API and blockchain load behavior, response times, errors, throughput, resource observations.", "Hyperledger Caliper, custom load scripts, docker stats/logs.", "Performance baseline report."],
  ["Horizontal Scaling", "Readiness assessment for autoscaling validation and Docker Compose limitations.", "Configuration/infrastructure review, container observations.", "Scaling readiness note."],
  ["HIPAA", "Access control, authentication, audit logging, transmission security, sensitive data exposure, minimum necessary handling.", "Manual compliance checklist supported by test evidence.", "HIPAA checklist and gaps."],
  ["GDPR", "Consent, personal data handling, data access/deletion readiness, privacy workflow readiness, retention indicators.", "Manual compliance checklist supported by workflow evidence.", "GDPR checklist and gaps."],
  ["Reporting", "Status updates, defect/gap register, retest evidence, final report, evidence index, residual risks.", "Report compilation and defect tracker review.", "Final test report and evidence pack."],
];

const streamFills = {
  Readiness: colors.lightAmber,
  Setup: colors.lightTeal,
  Planning: colors.lightBlue,
  Functional: colors.lightGreen,
  Blockchain: colors.lightAmber,
  Security: colors.lightRed,
  Performance: colors.lightPurple,
  Scalability: colors.lightPurple,
  Compliance: "#E2F0CB",
  Retest: colors.gray,
  Reporting: colors.gray,
};

function styleHeader(range, fill = colors.blue) {
  range.format = {
    fill,
    font: { bold: true, color: colors.white },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
  };
}

function styleBody(range) {
  range.format = {
    wrapText: true,
    verticalAlignment: "top",
  };
}

function setWidths(sheet, widths) {
  widths.forEach((width, idx) => {
    sheet.getRangeByIndexes(0, idx, 1, 1).format.columnWidthPx = width;
  });
}

function setTitle(sheet, title, subtitle) {
  sheet.showGridLines = false;
  sheet.getRange("A1:H1").merge();
  sheet.getRange("A1").values = [[title]];
  sheet.getRange("A1").format = {
    fill: colors.navy,
    font: { bold: true, color: colors.white, size: 16 },
    horizontalAlignment: "left",
  };
  sheet.getRange("A2:H2").merge();
  sheet.getRange("A2").values = [[subtitle]];
  sheet.getRange("A2").format = {
    fill: colors.lightBlue,
    font: { color: colors.navy, italic: true },
    wrapText: true,
  };
}

const overview = workbook.worksheets.add("Overview");
setTitle(overview, "EDR High-Level Testing Schedule", "Reference schedule. Formal testing starts once missing setup artifacts, access, source code, configuration, and environment details are cleared.");
setWidths(overview, [145, 180, 150, 150, 150, 160, 160, 160]);
overview.getRange("A4:B9").values = [
  ["Schedule basis", "T0 is the first business day after all start-gate dependencies are cleared."],
  ["Overall window", "Approximately 50 business days from T0, with selected phases running in parallel where feasible."],
  ["Planning approach", "High-level schedule with generous buffers for environment stabilization, clarification cycles, evidence collection, and retesting."],
  ["Testing start", "Testing execution should not begin until the missing technical details and setup artifacts are received and validated."],
  ["Remediation note", "Resolution of any defects or gaps identified during testing is outside testing scope and requires a dedicated implementation team."],
  ["Primary outputs", "Readiness note, test evidence, defect/gap register, compliance checklists, performance baseline, scaling readiness note, final report."],
];
for (let row = 4; row <= 9; row += 1) {
  overview.getRange(`B${row}:H${row}`).merge();
  overview.getRange(`A${row}:H${row}`).format.rowHeightPx = 38;
}
overview.getRange("A4:A9").format = { fill: colors.lightBlue, font: { bold: true, color: colors.navy }, wrapText: true };
overview.getRange("B4:B9").format = { wrapText: true, verticalAlignment: "top" };

overview.getRange("A11:H11").values = [["Phase", "Window", "Business Days", "Main Area", "Key Dependency", "Output", "Status", "Notes"]];
styleHeader(overview.getRange("A11:H11"));
overview.getRange(`A12:H${phases.length + 11}`).values = phases.map((p) => [
  p.phase,
  p.window,
  p.duration,
  p.stream,
  p.dependency,
  p.output,
  "Planned",
  p.note,
]);
styleBody(overview.getRange(`A12:H${phases.length + 11}`));
overview.freezePanes.freezeRows(11);

const schedule = workbook.worksheets.add("High-Level Schedule");
schedule.showGridLines = false;
schedule.getRange("A1:J1").values = [["ID", "Phase", "Relative Window", "Estimated Business Days", "Stream", "Included Scope", "Entry Dependency", "Output / Evidence", "Notes", "Status"]];
styleHeader(schedule.getRange("A1:J1"));
schedule.getRange(`A2:J${phases.length + 1}`).values = phases.map((p) => [
  p.id,
  p.phase,
  p.window,
  p.duration,
  p.stream,
  p.scope,
  p.dependency,
  p.output,
  p.note,
  "Planned",
]);
styleBody(schedule.getRange(`A2:J${phases.length + 1}`));
schedule.getRange(`A2:A${phases.length + 1}`).format = { font: { bold: true, color: colors.navy }, horizontalAlignment: "center" };
schedule.getRange(`D2:D${phases.length + 1}`).format = { horizontalAlignment: "center" };
for (let i = 0; i < phases.length; i += 1) {
  schedule.getRangeByIndexes(i + 1, 4, 1, 1).format = {
    fill: streamFills[phases[i].stream] || colors.gray,
    font: { bold: true, color: colors.navy },
    wrapText: true,
  };
}
setWidths(schedule, [60, 220, 145, 110, 120, 410, 310, 260, 300, 90]);
schedule.freezePanes.freezeRows(1);

const gantt = workbook.worksheets.add("Phase Timeline");
gantt.showGridLines = false;
const weekHeaders = ["ID", "Phase", "Stream", "Pre-T0", "Wk 1", "Wk 2", "Wk 3", "Wk 4", "Wk 5", "Wk 6", "Wk 7", "Wk 8", "Wk 9", "Wk 10"];
gantt.getRangeByIndexes(0, 0, 1, weekHeaders.length).values = [weekHeaders];
styleHeader(gantt.getRangeByIndexes(0, 0, 1, weekHeaders.length));
const timelineRows = phases.map((p) => [p.id, p.phase, p.stream, ...Array(11).fill("")]);
gantt.getRangeByIndexes(1, 0, timelineRows.length, weekHeaders.length).values = timelineRows;
styleBody(gantt.getRangeByIndexes(1, 0, timelineRows.length, weekHeaders.length));
setWidths(gantt, [60, 260, 110, ...Array(11).fill(70)]);
for (let i = 0; i < phases.length; i += 1) {
  const p = phases[i];
  gantt.getRangeByIndexes(i + 1, 2, 1, 1).format = {
    fill: streamFills[p.stream] || colors.gray,
    font: { bold: true, color: colors.navy },
  };
  if (p.startDay < 1) {
    gantt.getRangeByIndexes(i + 1, 3, 1, 1).format = { fill: colors.teal };
  } else {
    const startWeek = Math.ceil(p.startDay / 5);
    const endWeek = Math.ceil((p.startDay + p.duration - 1) / 5);
    const col = 3 + startWeek;
    const count = Math.max(1, endWeek - startWeek + 1);
    gantt.getRangeByIndexes(i + 1, col, 1, count).format = { fill: colors.teal };
  }
}
gantt.freezePanes.freezeRows(1);
gantt.freezePanes.freezeColumns(3);

const deps = workbook.worksheets.add("Start Gate Dependencies");
deps.showGridLines = false;
deps.getRange("A1:F1").values = [["ID", "Required Item", "Current Finding", "Why Needed", "Required By", "Status"]];
styleHeader(deps.getRange("A1:F1"), colors.red);
deps.getRange(`A2:F${dependencies.length + 1}`).values = dependencies;
styleBody(deps.getRange(`A2:F${dependencies.length + 1}`));
deps.getRange(`A2:A${dependencies.length + 1}`).format = { font: { bold: true, color: colors.navy }, horizontalAlignment: "center" };
deps.getRange(`F2:F${dependencies.length + 1}`).format = { fill: colors.lightRed, font: { bold: true, color: colors.red }, horizontalAlignment: "center" };
setWidths(deps, [70, 270, 300, 420, 110, 90]);
deps.freezePanes.freezeRows(1);

const scope = workbook.worksheets.add("Testing Scope");
scope.showGridLines = false;
scope.getRange("A1:D1").values = [["Test Area", "High-Level Scope", "Tools / Method", "Output"]];
styleHeader(scope.getRange("A1:D1"), colors.teal);
scope.getRange(`A2:D${scopeRows.length + 1}`).values = scopeRows;
styleBody(scope.getRange(`A2:D${scopeRows.length + 1}`));
scope.getRange(`A2:A${scopeRows.length + 1}`).format = {
  fill: colors.lightTeal,
  font: { bold: true, color: colors.navy },
  wrapText: true,
};
setWidths(scope, [160, 450, 340, 310]);
scope.freezePanes.freezeRows(1);

for (const sheetName of ["Overview", "High-Level Schedule", "Phase Timeline", "Start Gate Dependencies", "Testing Scope"]) {
  const preview = await workbook.render({ sheetName, autoCrop: "all", scale: 1, format: "png" });
  await fs.writeFile(path.join(outDir, `${sheetName.replaceAll(" ", "_")}.png`), new Uint8Array(await preview.arrayBuffer()));
}

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(outFile);
console.log(outFile);
process.exit(0);
