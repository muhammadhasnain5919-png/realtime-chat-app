const express = require('express');
const Friend = require('../models/Friend');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const me = req.user._id;
    const relations = await Friend.find({
      $or: [{ requester: me }, { recipient: me }],
      status: { $in: ['pending', 'accepted'] },
    })
      .populate('requester', 'username displayName avatar isOnline status customStatus lastSeen emailVerified')
      .populate('recipient', 'username displayName avatar isOnline status customStatus lastSeen emailVerified');

    const friends = [];
    const incoming = [];
    const outgoing = [];

    for (const r of relations) {
      const isRequester = r.requester._id.toString() === me.toString();
      const other = isRequester ? r.recipient : r.requester;
      if (r.status === 'accepted') {
        friends.push({ relationId: r._id, user: other });
      } else if (r.status === 'pending') {
        if (isRequester) outgoing.push({ relationId: r._id, user: other });
        else incoming.push({ relationId: r._id, user: other });
      }
    }

    res.json({ friends, incoming, outgoing });
  } catch (err) {
    console.error('Get friends error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/request', auth, async (req, res) => {
  try {
    const { username } = req.body;
    if (!username?.trim()) return res.status(400).json({ message: 'Username required' });

    const target = await User.findOne({ username: username.trim().toLowerCase() });
    if (!target) return res.status(404).json({ message: 'User not found' });
    if (target._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'Cannot add yourself' });
    }

    const existing = await Friend.findOne({
      $or: [
        { requester: req.user._id, recipient: target._id },
        { requester: target._id, recipient: req.user._id },
      ],
    });

    if (existing) {
      if (existing.status === 'accepted') return res.status(400).json({ message: 'Already friends' });
      if (existing.status === 'pending') return res.status(400).json({ message: 'Request already pending' });
      if (existing.status === 'blocked') return res.status(400).json({ message: 'Unable to send request' });
    }

    const relation = await Friend.create({
      requester: req.user._id,
      recipient: target._id,
      status: 'pending',
    });

    await relation.populate('recipient', 'username displayName avatar isOnline status');
    res.status(201).json({
      message: 'Friend request sent',
      relation: { relationId: relation._id, user: relation.recipient, status: 'pending' },
    });
  } catch (err) {
    console.error('Friend request error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/accept/:id', auth, async (req, res) => {
  try {
    const relation = await Friend.findById(req.params.id);
    if (!relation || relation.status !== 'pending') {
      return res.status(404).json({ message: 'Request not found' });
    }
    if (relation.recipient.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not allowed' });
    }
    relation.status = 'accepted';
    await relation.save();
    await relation.populate('requester', 'username displayName avatar isOnline status customStatus lastSeen');
    res.json({ message: 'Friend request accepted', user: relation.requester });
  } catch (err) {
    console.error('Accept friend error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/reject/:id', auth, async (req, res) => {
  try {
    const relation = await Friend.findById(req.params.id);
    if (!relation || relation.status !== 'pending') {
      return res.status(404).json({ message: 'Request not found' });
    }
    const me = req.user._id.toString();
    if (relation.recipient.toString() !== me && relation.requester.toString() !== me) {
      return res.status(403).json({ message: 'Not allowed' });
    }
    await relation.deleteOne();
    res.json({ message: 'Request removed' });
  } catch (err) {
    console.error('Reject friend error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/:userId', auth, async (req, res) => {
  try {
    await Friend.findOneAndDelete({
      status: 'accepted',
      $or: [
        { requester: req.user._id, recipient: req.params.userId },
        { requester: req.params.userId, recipient: req.user._id },
      ],
    });
    res.json({ message: 'Friend removed' });
  } catch (err) {
    console.error('Remove friend error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
