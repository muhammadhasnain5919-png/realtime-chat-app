require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const messageRoutes = require('./routes/messages');
const friendsRoutes = require('./routes/friends');
const profileRoutes = require('./routes/profile');
const User = require('./models/User');
const Message = require('./models/Message');

const app = express();
const server = http.createServer(app);

const corsOptions = {
  origin: (origin, callback) => {
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
};

const io = new Server(server, { cors: corsOptions });

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/friends', friendsRoutes);
app.use('/api/profile', profileRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.get('/health', (req, res) => res.send('OK'));

const onlineUsers = new Map();

io.use(async (socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token ||
      socket.handshake.headers?.authorization?.replace('Bearer ', '');
    if (!token) return next(new Error('Authentication error: No token'));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (!user) return next(new Error('Authentication error: User not found'));
    socket.user = user;
    next();
  } catch (err) {
    next(new Error('Authentication error'));
  }
});

io.on('connection', async (socket) => {
  const userId = socket.user._id.toString();
  onlineUsers.set(userId, socket.id);
  await User.findByIdAndUpdate(userId, { isOnline: true, status: 'online', lastSeen: new Date() });
  socket.broadcast.emit('userOnline', { userId, username: socket.user.username });
  socket.emit('onlineUsers', Array.from(onlineUsers.keys()));
  socket.join(userId);

  socket.on('sendMessage', async (data, callback) => {
    try {
      const { receiverId, content } = data;
      if (!receiverId || !content?.trim()) {
        if (typeof callback === 'function') callback({ success: false, error: 'Invalid message data' });
        return;
      }
      const message = new Message({
        sender: userId,
        receiver: receiverId,
        content: content.trim(),
        delivered: false,
        read: false,
      });
      await message.save();
      await message.populate('sender', 'username displayName avatar');
      await message.populate('receiver', 'username displayName avatar');
      const messagePayload = {
        _id: message._id,
        sender: message.sender,
        receiver: message.receiver,
        content: message.content,
        delivered: message.delivered,
        read: message.read,
        createdAt: message.createdAt,
        type: message.type,
      };
      if (onlineUsers.get(receiverId)) {
        io.to(receiverId).emit('receiveMessage', messagePayload);
        message.delivered = true;
        await message.save();
        messagePayload.delivered = true;
        socket.emit('messageDelivered', { messageId: message._id, delivered: true });
      }
      socket.emit('receiveMessage', messagePayload);
      if (typeof callback === 'function') callback({ success: true, message: messagePayload });
    } catch (err) {
      if (typeof callback === 'function') callback({ success: false, error: 'Failed to send message' });
    }
  });

  socket.on('typing', ({ receiverId, isTyping }) => {
    if (onlineUsers.get(receiverId)) {
      io.to(receiverId).emit('userTyping', {
        userId,
        username: socket.user.displayName || socket.user.username,
        isTyping: !!isTyping,
      });
    }
  });

  socket.on('markAsRead', async ({ senderId }) => {
    try {
      const result = await Message.updateMany(
        { sender: senderId, receiver: userId, read: false },
        { $set: { read: true, delivered: true } }
      );
      if (onlineUsers.get(senderId)) {
        io.to(senderId).emit('messagesRead', { readerId: userId, count: result.modifiedCount });
      }
    } catch (err) {}
  });

  // WebRTC signaling for 1:1 voice/video/screen
  socket.on('call:invite', ({ to, callType }) => {
    const targetSocket = onlineUsers.get(to);
    if (targetSocket) {
      io.to(to).emit('call:incoming', {
        from: userId,
        fromUser: {
          id: userId,
          username: socket.user.username,
          displayName: socket.user.displayName || socket.user.username,
          avatar: socket.user.avatar,
        },
        callType: callType || 'video',
      });
    } else {
      socket.emit('call:unavailable', { to });
    }
  });

  socket.on('call:accept', ({ to }) => {
    if (onlineUsers.get(to)) io.to(to).emit('call:accepted', { from: userId });
  });

  socket.on('call:reject', ({ to }) => {
    if (onlineUsers.get(to)) io.to(to).emit('call:rejected', { from: userId });
  });

  socket.on('call:end', ({ to }) => {
    if (onlineUsers.get(to)) io.to(to).emit('call:ended', { from: userId });
  });

  socket.on('webrtc:offer', ({ to, offer }) => {
    if (onlineUsers.get(to)) io.to(to).emit('webrtc:offer', { from: userId, offer });
  });

  socket.on('webrtc:answer', ({ to, answer }) => {
    if (onlineUsers.get(to)) io.to(to).emit('webrtc:answer', { from: userId, answer });
  });

  socket.on('webrtc:ice', ({ to, candidate }) => {
    if (onlineUsers.get(to)) io.to(to).emit('webrtc:ice', { from: userId, candidate });
  });

  socket.on('disconnect', async () => {
    onlineUsers.delete(userId);
    await User.findByIdAndUpdate(userId, { isOnline: false, status: 'offline', lastSeen: new Date() });
    socket.broadcast.emit('userOffline', {
      userId,
      username: socket.user.username,
      lastSeen: new Date(),
    });
  });
});

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/chat-app';

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
