// export const filterByRole = (req, res, next) => {
//     // Agar user Admin hai, to koi filter nahi lagega (sb kuch dikhega)
//     if (req?.user?.role === "ADMIN") {
//         req.roleFilter = {}; 
//     } 
//     if (req?.user?.role === "HR_ADMIN") {
//         req.roleFilter = {}; 
//     } 
//     if (req?.user?.role === "FINANCE_ADMIN") {
//         req.roleFilter = {}; 
//     } 
//     if (req?.user?.role === "SUBADMIN") {
//         req.roleFilter = {}; 
//     } 
//     else if(req?.user?.role === "DEP_ADMIN") {
//         req.roleFilter = { departmentId: req.user.departmentId };
//     }
//     else if(req?.user?.role === "USER") {
//         req.roleFilter = { departmentId: req.user.departmentId };
//     }
//     next();
// };

export const filterByRole = (req, res, next) => {
  const role = req?.user?.role;

  const superRoles = ["ADMIN", "HR_ADMIN", "FINANCE_ADMIN", "SUBADMIN"];

  if (superRoles.includes(role)) {
    req.roleFilter = {};
  } 
  else if (role === "DEP_ADMIN" || role === "USER") {
    req.roleFilter = { departmentId: req.user.departmentId };
  } 
  else {
    // fallback safety
    req.roleFilter = { _id: null }; // kuch bhi return na ho
  }

  next();
};