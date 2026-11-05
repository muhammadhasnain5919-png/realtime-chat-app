const express = require('express');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/me', auth, async (req, res) => {
  try {
    const { displayName, phone, bio, customStatus, status, avatar } = req.body;
    const updates = {};
    if (displayName !== undefined) updates.displayName = String(displayName).slice(0, 32);
    if (phone !== undefined) updates.phone = String(phone).slice(0, 20);
    if (bio !== undefined) updates.bio = String(bio).slice(0, 190);
    if (customStatus !== undefined) updates.customStatus = String(customStatus).slice(0, 128);
    if (status && ['online', 'idle', 'dnd', 'offline'].includes(status)) updates.status = status;
    if (avatar !== undefined) updates.avatar = String(avatar).slice(0, 500);

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true }).select('-password');
    res.json({ message: 'Profile updated', user });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// UI-only email verify (no real email sending yet)
router.post('/verify-email', auth, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { emailVerified: true },
      { new: true }
    ).select('-password');
    res.json({ message: 'Email marked as verified', user });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
