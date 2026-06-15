const express = require('express');
const router = express.Router();
const { loginUser, getUserProfile } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');

router.post('/login', loginUser);
router.get('/profile', protect, getUserProfile);

module.exports = router;
