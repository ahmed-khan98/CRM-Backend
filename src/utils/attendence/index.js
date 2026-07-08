// ─── Constants ───────────────────────────────────────────────────────────────
import moment from "moment-timezone";

const SHIFT_HOURS = { start: 20, end: 6 }; // 8PM to 6AM
const GRACE_MINUTES = 30;
const HALF_DAY_THRESHOLD_HOURS = 5;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TZ = "Asia/Karachi";
const nowInPKT = () => moment().tz(TZ);

const getAttendanceStatus = (timeInMoment, shiftStart,shiftDate) => {
  const [sHour, sMin] = (shiftStart || process.env.SHIFT_START ).split(":").map(Number);
  // const graceTime = timeInMoment
  //   .clone()
  //   .startOf("day")
  //   .set({ hour: sHour, minute: sMin })
  //   .add(GRACE_MINUTES, "minutes");
  const graceTime = moment.tz(shiftDate, "YYYY-MM-DD", TZ)
    .set({ hour: sHour, minute: sMin })
    .add(GRACE_MINUTES, "minutes");
  return timeInMoment.isAfter(graceTime) ? "late" : "present";
};

// const resolveFinalStatus = (timeInMoment, timeOutMoment, baseStatus) => {
//   const hoursWorked = timeOutMoment.diff(timeInMoment, "hours", true);
//   console.log(hoursWorked, "hoursWorked");
//   return hoursWorked < HALF_DAY_THRESHOLD_HOURS ? "half-day" : baseStatus;
// };

const resolveFinalStatus = (timeInMoment, timeOutMoment, baseStatus) => {
  let out = timeOutMoment.clone();
  let ins = timeInMoment.clone();

  // Agar TimeOut ka waqt TimeIn se pehle ka dikh raha hai (e.g. In: 20:00, Out: 07:00)
  // To iska matlab hai Out agle din hua hai.
  if (out.isBefore(ins)) {
    out.add(1, "days");
  }

  const hoursWorked = out.diff(ins, "hours", true);
  console.log(`Final Calculation -> In: ${ins.format()}, Out: ${out.format()}, Hours: ${hoursWorked}`);
  
  return hoursWorked < HALF_DAY_THRESHOLD_HOURS ? "half-day" : baseStatus;
};

const adjustForMidnight = (momentObj) => {
  return momentObj.hour() >= 0 && momentObj.hour() < 7
    ? momentObj.clone().add(1, "days")
    : momentObj;
};


export{
    nowInPKT,
    getAttendanceStatus,
    resolveFinalStatus,
    adjustForMidnight,
    GRACE_MINUTES,
    HALF_DAY_THRESHOLD_HOURS,
    SHIFT_HOURS,
    TZ
}