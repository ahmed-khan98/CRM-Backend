import { Employee } from "../models/employee.model.js";
import {
  Offer,
  Application,
  Candidate,
  Job,
  JoiningDetails,
} from "../models/recruitment/index.js";

const GENDERS = ["Male", "Female", "Other", ""];
const MARITAL = ["Single", "Married", "Divorced", "Widowed", ""];
const BLOOD = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", ""];

export function normalizePkPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 11) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }
  return String(value || "").trim();
}

export function normalizePkCnic(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length === 13) {
    return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
  }
  return String(value || "").trim();
}

function pickEnum(val, allowed) {
  const s = String(val || "").trim();
  if (!s) return "";
  if (allowed.includes(s)) return s;
  const found = allowed.find((a) => a.toLowerCase() === s.toLowerCase());
  return found || "";
}

function dateOnly(v) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/**
 * Build Add Employee prefill + duplicate / already-hired hints for an offer.
 */
export async function buildHirePrefillFromOffer(offerId) {
  const offer = await Offer.findOne({ _id: offerId, isDeleted: false });
  if (!offer) {
    const err = new Error("Offer not found");
    err.statusCode = 404;
    throw err;
  }
  if (offer.status !== "accepted") {
    const err = new Error("Offer must be accepted before creating an employee");
    err.statusCode = 400;
    throw err;
  }

  const app = await Application.findOne({
    _id: offer.applicationId,
    isDeleted: false,
  });
  const candidate = app
    ? await Candidate.findOne({ _id: app.candidateId, isDeleted: false })
    : null;
  const job = app ? await Job.findById(app.jobId).lean() : null;
  const joining = await JoiningDetails.findOne({
    offerId: offer._id,
    isDeleted: false,
  });

  let existingEmployee = null;
  if (app?.employeeId) {
    existingEmployee = await Employee.findById(app.employeeId)
      .select("_id fullName email phoneNo CNIC status")
      .lean();
  }
  if (!existingEmployee && candidate?._id) {
    existingEmployee = await Employee.findOne({ candidateId: candidate._id })
      .select("_id fullName email phoneNo CNIC status")
      .lean();
  }

  const data = joining?.data || {};
  const personal = data.personal || {};
  const bank = data.bank || {};
  const emergency = data.emergencyContact || {};
  const joiningApproved = joining?.status === "approved";
  const joiningUsed = joining?.status === "used";

  let warning = null;
  if (!joining) {
    warning =
      "Joining details were not sent or submitted. Some fields will be empty.";
  } else if (!joiningApproved && !joiningUsed) {
    warning =
      "Joining details are not approved. Some fields will be empty.";
  }

  const email = String(candidate?.email || "").toLowerCase().trim();
  const cnic = normalizePkCnic(personal.cnic || "");
  const phoneNo = normalizePkPhone(candidate?.phone || "");

  const duplicates = { email: null, cnic: null };
  if (email) {
    duplicates.email = await Employee.findOne({ email })
      .select("_id fullName email CNIC")
      .lean();
  }
  if (cnic) {
    duplicates.cnic = await Employee.findOne({ CNIC: cnic })
      .select("_id fullName email CNIC")
      .lean();
  }

  const prefill = {
    fullName: offer.candidateName || candidate?.fullName || "",
    email,
    phoneNo,
    address:
      personal.address ||
      candidate?.currentLocation ||
      "",
    designation: offer.jobTitle || job?.title || "",
    departmentId: job?.departmentId ? String(job.departmentId) : "",
    joiningDate: dateOnly(offer.joiningDate),
    employmentType: "", // leave empty for HR
    currentSalary: offer.salary != null ? offer.salary : "",
    role: "USER",
    image: personal.photoUrl || "",
    CNIC: cnic,
    dateOfBirth: dateOnly(personal.dateOfBirth),
    gender: pickEnum(personal.gender, GENDERS),
    maritalStatus: pickEnum(personal.maritalStatus, MARITAL),
    bloodGroup: pickEnum(personal.bloodGroup, BLOOD),
    emergencyContact: {
      name: emergency.name || "",
      phone: emergency.phone || "",
      relationship: emergency.relationship || "",
      address: emergency.address || "",
    },
    bankName: bank.bankName || "",
    accountTitle: bank.accountTitle || "",
    accountNumber: bank.accountNumber || "",
    iban: bank.iban || "",
    ntn: data.ntn || "",
    shiftStart: "",
    shiftEnd: "",
    password: "",
  };

  return {
    prefill,
    meta: {
      offerId: String(offer._id),
      applicationId: app ? String(app._id) : null,
      candidateId: candidate ? String(candidate._id) : null,
      joiningDetailsId: joining ? String(joining._id) : null,
      source: "recruitment",
    },
    joiningStatus: joining?.status || "not_sent",
    joiningApproved: Boolean(joiningApproved || joiningUsed),
    warning,
    existingEmployee,
    duplicates: {
      email: duplicates.email,
      cnic: duplicates.cnic,
    },
  };
}

export async function checkEmployeeDuplicates({ email, cnic }) {
  const result = { email: null, cnic: null };
  const e = String(email || "").toLowerCase().trim();
  const c = normalizePkCnic(cnic || "");
  if (e) {
    result.email = await Employee.findOne({ email: e })
      .select("_id fullName email CNIC")
      .lean();
  }
  if (c) {
    result.cnic = await Employee.findOne({ CNIC: c })
      .select("_id fullName email CNIC")
      .lean();
  }
  return result;
}
