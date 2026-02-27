// ─── Constants ───────────────────────────────────────────────────────────────

const TZ = "Asia/Karachi";
const SHIFT_HOURS = { start: 18, end: 6 }; // 6PM to 6AM
const GRACE_MINUTES = 30;
const HALF_DAY_THRESHOLD_HOURS = 5;

// ─── Helpers ─────────────────────────────────────────────────────────────────

const nowInPKT = () => moment().tz(TZ);

const getAttendanceStatus = (timeInMoment, shiftStart) => {
  const [sHour, sMin] = (shiftStart || "20:30").split(":").map(Number);
  const graceTime = timeInMoment
    .clone()
    .startOf("day")
    .set({ hour: sHour, minute: sMin })
    .add(GRACE_MINUTES, "minutes");

  return timeInMoment.isAfter(graceTime) ? "late" : "present";
};

const resolveFinalStatus = (timeInMoment, timeOutMoment, baseStatus) => {
  const hoursWorked = timeOutMoment.diff(timeInMoment, "hours", true);
  console.log(hoursWorked, "hoursWorked");
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
    SHIFT_HOURS
}