export const requireRole = (...roles) => (req, res, next) => {
  const currentRole = req.profile?.role;

  if (!currentRole) {
    return res.status(403).json({ error: 'Profile role is missing.' });
  }

  if (!roles.includes(currentRole)) {
    return res.status(403).json({ error: 'You do not have permission to perform this action.' });
  }

  next();
};
