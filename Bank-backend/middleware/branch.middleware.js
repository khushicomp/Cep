exports.filterByBranch = (req, res, next) => {
    const user = req.user;
    
    if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    
    // Inject filter object that controllers can use to build SQL
    req.branchFilter = {
        canViewAll: (user.role === 'ADMIN' || user.can_view_all_branches),
        branchId: user.branch_id
    };
    
    // Inject branch context
    req.userBranch = {
        branch_id: user.branch_id,
        branch_code: user.branch_code,
        branch_name: user.branch_name
    };
    
    next();
};
