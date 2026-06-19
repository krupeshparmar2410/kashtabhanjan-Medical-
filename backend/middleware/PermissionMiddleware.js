const checkPermission = (requiredPermission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authorized, session missing' });
    }

    const rolePermissions = {
      admin: [
        'create_sale',
        'cancel_sale',
        'process_return',
        'override_credit_limit',
        'edit_customer',
        'view_profit_reports',
        'manage_recalls',
        'close_cash_counter'
      ],
      staff: [
        'create_sale',
        'edit_customer',
        'close_cash_counter'
      ]
    };

    const userPermissions = rolePermissions[req.user.role] || [];

    if (!userPermissions.includes(requiredPermission)) {
      return res.status(403).json({
        success: false,
        message: `Forbidden: User role '${req.user.role}' lacks required permission '${requiredPermission}'`
      });
    }

    next();
  };
};

module.exports = {
  checkPermission
};
