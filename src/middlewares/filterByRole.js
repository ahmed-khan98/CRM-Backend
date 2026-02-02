export const filterByRole = (req, res, next) => {
    // Agar user Admin hai, to koi filter nahi lagega (sb kuch dikhega)
    if (req?.user?.role === "ADMIN") {
        req.roleFilter = {}; 
    } 
    else if(req?.user?.role === "SUBADMIN") {
        req.roleFilter = { departmentId: req.user.departmentId };
    }
    else if(req?.user?.role === "USER") {
        req.roleFilter = { departmentId: req.user.departmentId };
    }
    next();
};