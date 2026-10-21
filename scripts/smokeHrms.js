/**
 * HRMS smoke test — module load, DB sanity, public + authenticated API checks.
 * Usage: node -r dotenv/config scripts/smokeHrms.js
 */
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

const results = [];
const pass = (area, msg) => results.push({ area, ok: true, msg });
const fail = (area, msg) => results.push({ area, ok: false, msg });

const PORT = Number(String(process.env.PORT || "5000").trim()) || 5000;
const BASE = `http://127.0.0.1:${PORT}/api/v1`;

async function checkSyntaxImports() {
  const mods = [
    ["../src/app.js", "app"],
    ["../src/routes/employee.routes.js", "employee.routes"],
    ["../src/routes/leave.routes.js", "leave.routes"],
    ["../src/routes/payroll.routes.js", "payroll.routes"],
    ["../src/routes/recruitment.routes.js", "recruitment.routes"],
    ["../src/routes/publicCareers.routes.js", "publicCareers.routes"],
    ["../src/routes/employeeDocument.routes.js", "employeeDocument.routes"],
    ["../src/routes/employeeAllowance.routes.js", "employeeAllowance.routes"],
    ["../src/routes/employeeSalaryHistory.routes.js", "salaryHistory.routes"],
    ["../src/routes/employeeFamily.routes.js", "employeeFamily.routes"],
    ["../src/routes/employeePreviousEmployment.routes.js", "prevEmployment.routes"],
    ["../src/controllers/employee.controller.js", "employee.controller"],
    ["../src/controllers/leave.controller.js", "leave.controller"],
    ["../src/controllers/payroll.controller.js", "payroll.controller"],
    ["../src/controllers/recruitment/offers.controller.js", "offers.controller"],
    ["../src/controllers/recruitment/joining.controller.js", "joining.controller"],
    ["../src/controllers/recruitment/publicJoining.controller.js", "publicJoining.controller"],
    ["../src/utils/joiningHelpers.js", "joiningHelpers"],
    ["../src/utils/hireHelpers.js", "hireHelpers"],
    ["../src/utils/recruitmentHireSync.js", "recruitmentHireSync"],
    ["../src/utils/leaveHelpers.js", "leaveHelpers"],
    ["../src/utils/payrollHelpers.js", "payrollHelpers"],
    ["../src/models/employee.model.js", "employee.model"],
    ["../src/models/leaveRequest.model.js", "leaveRequest.model"],
    ["../src/models/payrollRun.model.js", "payrollRun.model"],
    ["../src/models/recruitment/index.js", "recruitment.models"],
  ];

  for (const [path, label] of mods) {
    try {
      await import(path);
      pass("import", label);
    } catch (e) {
      fail("import", `${label}: ${e.message}`);
    }
  }
}

async function checkDb() {
  if (!process.env.MONGODB_URI) {
    fail("db", "MONGODB_URI missing");
    return null;
  }
  await mongoose.connect(process.env.MONGODB_URI);
  pass("db", "connected");

  const { Employee } = await import("../src/models/employee.model.js");
  const { Department } = await import("../src/models/department.model.js");
  const LeaveType = (await import("../src/models/leaveType.model.js")).LeaveType;
  const LeaveRequest = (await import("../src/models/leaveRequest.model.js"))
    .LeaveRequest;
  const PayrollRun = (await import("../src/models/payrollRun.model.js"))
    .PayrollRun;
  const {
    Job,
    Offer,
    Application,
    JoiningDetails,
    RecruitmentSettings,
  } = await import("../src/models/recruitment/index.js");

  const counts = {
    employees: await Employee.countDocuments(),
    departments: await Department.countDocuments(),
    leaveTypes: await LeaveType.countDocuments(),
    leaveRequests: await LeaveRequest.countDocuments(),
    payrollRuns: await PayrollRun.countDocuments(),
    jobs: await Job.countDocuments({ isDeleted: false }),
    offers: await Offer.countDocuments({ isDeleted: false }),
    applications: await Application.countDocuments({ isDeleted: false }),
    joining: await JoiningDetails.countDocuments({ isDeleted: false }),
    recruitmentSettings: await RecruitmentSettings.countDocuments(),
  };
  pass("db", `counts ${JSON.stringify(counts)}`);

  // Schema field checks for hire handoff
  const empPaths = Employee.schema.paths;
  if (empPaths.candidateId && empPaths.source) {
    pass("schema", "Employee.candidateId + source");
  } else {
    fail("schema", "Employee missing candidateId/source");
  }
  if (JoiningDetails.schema.paths.tokenHash) {
    pass("schema", "JoiningDetails.tokenHash");
  } else {
    fail("schema", "JoiningDetails missing tokenHash");
  }

  const admin = await Employee.findOne({
    role: { $in: ["ADMIN", "SUBADMIN", "HR_ADMIN"] },
    status: "active",
  })
    .select("_id email role fullName")
    .lean();

  return { admin, counts };
}

async function httpJson(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      ...(opts.body && !(opts.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...(opts.headers || {}),
    },
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body, ok: res.ok };
}

async function checkPublicApis() {
  try {
    const jobs = await httpJson(`${BASE}/public/careers/jobs?limit=5`);
    if (jobs.status === 200 && jobs.body?.success !== false) {
      pass("api-public", `GET /public/careers/jobs → ${jobs.status}`);
    } else if (jobs.status === 403 || jobs.status === 401) {
      fail("api-public", `careers jobs blocked (${jobs.status}) — IP restrict?`);
    } else {
      fail(
        "api-public",
        `careers jobs → ${jobs.status} ${jobs.body?.message || ""}`
      );
    }

    const badJoin = await httpJson(
      `${BASE}/public/careers/joining/notavalidtoken123`
    );
    if ([404, 400].includes(badJoin.status)) {
      pass("api-public", `joining invalid token → ${badJoin.status}`);
    } else {
      fail("api-public", `joining invalid → ${badJoin.status}`);
    }

    const badOffer = await httpJson(
      `${BASE}/public/careers/offers/respond/notavalidtoken123`
    );
    if ([404, 400].includes(badOffer.status)) {
      pass("api-public", `offer respond invalid → ${badOffer.status}`);
    } else {
      fail("api-public", `offer respond invalid → ${badOffer.status}`);
    }
  } catch (e) {
    fail("api-public", `server unreachable on :${PORT} — ${e.message}`);
  }
}

async function checkAuthApis(admin) {
  if (!admin?._id) {
    fail("api-auth", "No ADMIN/HR employee in DB to mint test JWT");
    return;
  }
  if (!process.env.ACCESS_TOKEN_SECRET) {
    fail("api-auth", "ACCESS_TOKEN_SECRET missing");
    return;
  }

  const token = jwt.sign(
    { _id: admin._id },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "10m" }
  );
  const auth = { Authorization: `Bearer ${token}` };

  const endpoints = [
    ["GET", "/user/employee", "employees list"],
    ["GET", "/user/department", "departments"],
    ["GET", "/user/leave/types", "leave types"],
    ["GET", "/user/leave/holidays", "leave holidays"],
    ["GET", "/user/leave/my-balances", "leave balances"],
    ["GET", "/user/leave/my-requests", "my leave requests"],
    ["GET", "/user/leave/team", "team leave"],
    ["GET", "/user/payroll/settings", "payroll settings"],
    ["GET", "/user/payroll/payslips/me", "my payslips"],
    ["GET", "/user/payroll/run", "payroll run"],
    ["GET", "/user/employee-documents?limit=5", "employee documents"],
    ["GET", "/user/employee-allowances?limit=5", "employee allowances"],
    ["GET", "/user/employee-salary-history?limit=5", "salary history"],
    ["GET", "/user/employee-family?limit=5", "employee family"],
    ["GET", "/user/employee-previous-employment?limit=5", "previous employment"],
    ["GET", "/user/recruitment/dashboard", "recruitment dashboard"],
    ["GET", "/user/recruitment/jobs?limit=5", "recruitment jobs"],
    ["GET", "/user/recruitment/applications?limit=5", "applications"],
    ["GET", "/user/recruitment/offers?limit=5", "offers"],
    ["GET", "/user/recruitment/settings", "recruitment settings"],
    ["GET", "/user/recruitment/interviews?limit=5", "interviews"],
    ["GET", "/user/recruitment/candidates?limit=5", "candidates"],
  ];

  for (const [method, path, label] of endpoints) {
    try {
      const r = await httpJson(`${BASE}${path}`, {
        method,
        headers: auth,
      });
      if (r.status >= 200 && r.status < 300) {
        pass("api-auth", `${label} → ${r.status}`);
      } else if (r.status === 403) {
        // role/IP — still reachable
        fail("api-auth", `${label} → 403 ${r.body?.message || ""}`);
      } else {
        fail(
          "api-auth",
          `${label} → ${r.status} ${r.body?.message || JSON.stringify(r.body)?.slice(0, 120) || ""}`
        );
      }
    } catch (e) {
      fail("api-auth", `${label}: ${e.message}`);
    }
  }

  // Hire-prefill against first accepted offer if any
  try {
    const { Offer } = await import("../src/models/recruitment/index.js");
    const accepted = await Offer.findOne({
      status: "accepted",
      isDeleted: false,
    })
      .select("_id")
      .lean();
    if (accepted) {
      const r = await httpJson(
        `${BASE}/user/recruitment/offers/${accepted._id}/hire-prefill`,
        { headers: auth }
      );
      if (r.status === 200) {
        pass("api-auth", `hire-prefill → 200 (offer ${accepted._id})`);
      } else {
        fail(
          "api-auth",
          `hire-prefill → ${r.status} ${r.body?.message || ""}`
        );
      }
    } else {
      pass("api-auth", "hire-prefill skipped (no accepted offer)");
    }
  } catch (e) {
    fail("api-auth", `hire-prefill: ${e.message}`);
  }
}

async function checkHelpers() {
  try {
    const { normalizePkPhone, normalizePkCnic } = await import(
      "../src/utils/hireHelpers.js"
    );
    if (normalizePkPhone("03001234567") === "0300-1234567") {
      pass("helpers", "normalizePkPhone");
    } else {
      fail("helpers", "normalizePkPhone mismatch");
    }
    if (normalizePkCnic("4210112345671") === "42101-1234567-1") {
      pass("helpers", "normalizePkCnic");
    } else {
      fail("helpers", "normalizePkCnic mismatch");
    }
    const { canCandidateEditJoining, mergeJoiningData } = await import(
      "../src/utils/joiningHelpers.js"
    );
    const merged = mergeJoiningData({}, { personal: { cnic: "x" }, ntn: "1" });
    if (merged.personal?.cnic === "x" && merged.ntn === "1") {
      pass("helpers", "mergeJoiningData");
    } else {
      fail("helpers", "mergeJoiningData failed");
    }
    if (
      canCandidateEditJoining({
        status: "sent",
        isDeleted: false,
        expiresAt: new Date(Date.now() + 86400000),
      })
    ) {
      pass("helpers", "canCandidateEditJoining(sent)");
    } else {
      fail("helpers", "canCandidateEditJoining(sent) false");
    }
  } catch (e) {
    fail("helpers", e.message);
  }
}

async function main() {
  console.log(`HRMS smoke — base ${BASE}\n`);

  await checkSyntaxImports();
  await checkHelpers();
  let dbInfo = null;
  try {
    dbInfo = await checkDb();
  } catch (e) {
    fail("db", e.message);
  }

  await checkPublicApis();
  if (dbInfo?.admin) {
    await checkAuthApis(dbInfo.admin);
  }

  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
  }

  const failed = results.filter((r) => !r.ok);
  const passed = results.filter((r) => r.ok);

  const byArea = {};
  for (const r of results) {
    if (!byArea[r.area]) byArea[r.area] = { pass: 0, fail: 0, items: [] };
    byArea[r.area][r.ok ? "pass" : "fail"] += 1;
    byArea[r.area].items.push(r);
  }

  console.log("=== Summary by area ===");
  for (const [area, s] of Object.entries(byArea)) {
    console.log(
      `${s.fail ? "FAIL" : "OK  "} ${area}: ${s.pass} passed, ${s.fail} failed`
    );
    for (const item of s.items.filter((i) => !i.ok)) {
      console.log(`     - ${item.msg}`);
    }
  }

  console.log(
    `\nTOTAL: ${passed.length} passed, ${failed.length} failed`
  );
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
