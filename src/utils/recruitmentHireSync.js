import mongoose from "mongoose";
import { Employee } from "../models/employee.model.js";
import { EmployeeDocument } from "../models/employeeDocument.model.js";
import { EmployeeFamily } from "../models/employeeFamily.model.js";
import { EmployeePreviousEmployment } from "../models/employeePreviousEmployment.model.js";
import { EmployeeSalaryHistory } from "../models/employeeSalaryHistory.model.js";
import {
  Offer,
  Application,
  Candidate,
  Job,
  JoiningDetails,
} from "../models/recruitment/index.js";
import {
  recordStageChange,
  logActivity,
} from "./recruitmentHelpers.js";

const DOC_TYPES = new Set([
  "PROFILE_PICTURE",
  "CV",
  "EXPERIENCE_CERTIFICATE",
  "CNIC_PASSPORT",
  "EDUCATIONAL_DOCUMENTS",
  "SALARY_SLIPS",
  "SKILL_CERTIFICATES",
  "OTHER",
]);

function mapDocType(t) {
  const s = String(t || "OTHER");
  return DOC_TYPES.has(s) ? s : "OTHER";
}

function mapChildGender(g) {
  const s = String(g || "").trim();
  if (["Male", "Female", "Other", ""].includes(s)) return s;
  const lower = s.toLowerCase();
  if (lower === "male" || lower === "m") return "Male";
  if (lower === "female" || lower === "f") return "Female";
  if (lower === "other") return "Other";
  return "";
}

/**
 * After employee create from recruitment: copy joining/offer artifacts,
 * mark application Hired, joining Used. Compensating rollback on failure.
 */
export async function syncRecruitmentHire({
  employee,
  applicationId,
  offerId,
  joiningDetailsId,
  candidateId,
  actorId = null,
}) {
  const created = {
    documents: [],
    previousJobs: [],
    familyId: null,
    salaryHistoryId: null,
    applicationPrev: null,
    joiningPrev: null,
  };

  try {
    const [offer, application, candidate, joining] = await Promise.all([
      offerId
        ? Offer.findOne({ _id: offerId, isDeleted: false })
        : applicationId
          ? Offer.findOne({
              applicationId,
              isDeleted: false,
              status: "accepted",
            }).sort({ updatedAt: -1 })
          : null,
      applicationId
        ? Application.findOne({ _id: applicationId, isDeleted: false })
        : null,
      candidateId
        ? Candidate.findOne({ _id: candidateId, isDeleted: false })
        : null,
      joiningDetailsId
        ? JoiningDetails.findOne({ _id: joiningDetailsId, isDeleted: false })
        : offerId
          ? JoiningDetails.findOne({ offerId, isDeleted: false })
          : null,
    ]);

    const job = application?.jobId
      ? await Job.findById(application.jobId).lean()
      : null;
    const jobTitle =
      offer?.jobTitle || job?.title || employee.designation || "Role";

    // --- Salary: ensure starting package entry with hire reason ---
    const salary =
      employee.currentSalary != null
        ? Number(employee.currentSalary)
        : offer?.salary != null
          ? Number(offer.salary)
          : null;
    if (salary != null && !Number.isNaN(salary)) {
      const existing = await EmployeeSalaryHistory.findOne({
        employeeId: employee._id,
        reason: /Starting package/i,
      });
      if (existing) {
        existing.reason = `Starting package — Hired via Recruitment: ${jobTitle}`;
        existing.newSalary = salary;
        existing.effectiveDate =
          employee.joiningDate || offer?.joiningDate || new Date();
        await existing.save();
        created.salaryHistoryId = existing._id;
      } else {
        const row = await EmployeeSalaryHistory.create({
          employeeId: employee._id,
          previousSalary: 0,
          newSalary: salary,
          effectiveDate:
            employee.joiningDate || offer?.joiningDate || new Date(),
          reason: `Starting package — Hired via Recruitment: ${jobTitle}`,
          updatedBy: actorId,
          createdBy: actorId,
        });
        created.salaryHistoryId = row._id;
      }
      if (employee.currentSalary == null) {
        employee.currentSalary = salary;
        await employee.save();
      }
    }

    // --- Documents ---
    const docsToCreate = [];

    if (candidate?.resumeUrl) {
      docsToCreate.push({
        documentType: "CV",
        fileUrl: candidate.resumeUrl,
        fileName: candidate.resumeFileName || "Resume",
        publicId: candidate.resumePublicId || "",
        mimeType: "",
        notes: "Copied from recruitment application",
      });
    }

    if (offer?.pdfUrl) {
      docsToCreate.push({
        documentType: "OTHER",
        fileUrl: offer.pdfUrl,
        fileName: `Offer_Letter_${(offer.candidateName || "Candidate").replace(
          /[^a-zA-Z0-9]/g,
          "_"
        )}.pdf`,
        publicId: offer.pdfPublicId || "",
        mimeType: "application/pdf",
        notes: "Offer Letter",
      });
    }

    if (employee.image) {
      docsToCreate.push({
        documentType: "PROFILE_PICTURE",
        fileUrl: employee.image,
        fileName: "Profile photo",
        publicId: joining?.data?.personal?.photoPublicId || "",
        mimeType: "",
        notes: "From joining / hire",
      });
    }

    const joiningDocs = joining?.data?.documents || [];
    for (const d of joiningDocs) {
      if (!d?.fileUrl) continue;
      docsToCreate.push({
        documentType: mapDocType(d.documentType),
        fileUrl: d.fileUrl,
        fileName: d.fileName || "",
        publicId: d.publicId || "",
        mimeType: d.mimeType || "",
        notes: d.notes || "From joining details",
      });
    }

    for (const d of docsToCreate) {
      const row = await EmployeeDocument.create({
        employeeId: employee._id,
        ...d,
        uploadedBy: actorId,
        createdBy: actorId,
        updatedBy: actorId,
      });
      created.documents.push(row._id);
    }

    // --- Family ---
    const fam = joining?.data?.family;
    if (
      fam &&
      (fam.fatherName ||
        fam.motherName ||
        fam.spouse?.name ||
        (fam.children || []).length)
    ) {
      const familyDoc = await EmployeeFamily.create({
        employeeId: employee._id,
        fatherName: fam.fatherName || "",
        motherName: fam.motherName || "",
        spouse: {
          name: fam.spouse?.name || "",
          dob: fam.spouse?.dob || null,
          cnic: fam.spouse?.cnic || "",
          occupation: fam.spouse?.occupation || "",
        },
        children: (fam.children || [])
          .filter((c) => c?.name)
          .map((c) => ({
            name: c.name,
            dob: c.dob || null,
            gender: mapChildGender(c.gender),
          })),
        createdBy: actorId,
        updatedBy: actorId,
      });
      created.familyId = familyDoc._id;
    }

    // --- Previous jobs ---
    for (const j of joining?.data?.previousJobs || []) {
      if (!j?.companyName || !j?.designation || !j?.startDate) continue;
      const row = await EmployeePreviousEmployment.create({
        employeeId: employee._id,
        companyName: j.companyName,
        designation: j.designation,
        startDate: j.startDate,
        endDate: j.endDate || null,
        lastSalary: j.lastSalary != null ? Number(j.lastSalary) : undefined,
        reasonForLeaving: j.reasonForLeaving || "",
        createdBy: actorId,
        updatedBy: actorId,
      });
      created.previousJobs.push(row._id);
    }

    // --- Application → Hired ---
    if (application) {
      created.applicationPrev = {
        id: application._id,
        stage: application.stage,
        employeeId: application.employeeId,
        hiredAt: application.hiredAt,
      };
      const from = application.stage;
      application.employeeId = employee._id;
      application.hiredAt = application.hiredAt || new Date();
      if (from !== "hired") {
        application.stage = "hired";
        await application.save();
        await recordStageChange({
          applicationId: application._id,
          fromStage: from,
          toStage: "hired",
          by: actorId,
          note: `Hired via Recruitment: ${jobTitle}`,
        });
      } else {
        await application.save();
      }
    }

    // Ensure employee linkage
    if (candidate?._id && String(employee.candidateId) !== String(candidate._id)) {
      employee.candidateId = candidate._id;
      employee.source = "recruitment";
      await employee.save();
    }

    // --- Joining → Used ---
    if (joining && joining.status !== "used") {
      created.joiningPrev = {
        id: joining._id,
        status: joining.status,
      };
      joining.status = "used";
      joining.editLog.push({
        at: new Date(),
        by: actorId,
        section: "used",
        note: `Employee created: ${employee._id}`,
      });
      await joining.save();
    }

    await logActivity({
      entityType: "offer",
      entityId: offer?._id || employee._id,
      action: "hired_employee_synced",
      actorId,
      meta: {
        employeeId: employee._id,
        applicationId: application?._id,
        joiningId: joining?._id,
        jobTitle,
      },
    });

    return {
      ok: true,
      employeeId: employee._id,
      jobTitle,
      documents: created.documents.length,
      previousJobs: created.previousJobs.length,
      family: Boolean(created.familyId),
    };
  } catch (err) {
    await rollbackRecruitmentHire(employee._id, created).catch((e) =>
      console.error("hire sync rollback failed:", e?.message || e)
    );
    const error = new Error(
      err?.message || "Recruitment hire sync failed; employee rolled back"
    );
    error.statusCode = 500;
    error.cause = err;
    throw error;
  }
}

async function rollbackRecruitmentHire(employeeId, created) {
  if (created.documents?.length) {
    await EmployeeDocument.deleteMany({ _id: { $in: created.documents } });
  }
  if (created.previousJobs?.length) {
    await EmployeePreviousEmployment.deleteMany({
      _id: { $in: created.previousJobs },
    });
  }
  if (created.familyId) {
    await EmployeeFamily.deleteOne({ _id: created.familyId });
  }
  if (created.salaryHistoryId) {
    await EmployeeSalaryHistory.deleteOne({ _id: created.salaryHistoryId });
  }
  if (created.applicationPrev?.id) {
    await Application.updateOne(
      { _id: created.applicationPrev.id },
      {
        $set: {
          stage: created.applicationPrev.stage,
          employeeId: created.applicationPrev.employeeId || null,
          hiredAt: created.applicationPrev.hiredAt || null,
        },
      }
    );
  }
  if (created.joiningPrev?.id) {
    await JoiningDetails.updateOne(
      { _id: created.joiningPrev.id },
      { $set: { status: created.joiningPrev.status } }
    );
  }
  // Delete any remaining related rows for this employee, then employee
  await Promise.all([
    EmployeeDocument.deleteMany({ employeeId }),
    EmployeePreviousEmployment.deleteMany({ employeeId }),
    EmployeeFamily.deleteOne({ employeeId }),
    EmployeeSalaryHistory.deleteMany({ employeeId }),
  ]);
  if (mongoose.isValidObjectId(employeeId)) {
    await Employee.findByIdAndDelete(employeeId);
  }
}
