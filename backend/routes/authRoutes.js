const express = require('express');
const router = express.Router();
const {
  loginUser,
  logoutUser,
  getUserProfile,
  getActiveSessions,
  revokeSession,
  revokeAllSessions,
  resetPassword,
  changeUserRole
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

// Public
router.post('/login', loginUser);

// Protected
router.get('/profile', protect, getUserProfile);
router.post('/logout', protect, logoutUser);
router.get('/sessions', protect, getActiveSessions);
router.post('/sessions/revoke', protect, revokeSession);
router.post('/sessions/revoke-all', protect, revokeAllSessions);
router.post('/reset-password', protect, resetPassword);
router.post('/change-role', protect, changeUserRole);

module.exports = router;
