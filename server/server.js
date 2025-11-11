// server.js - Main server file for Socket.io chat application

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store connected users and messages
const users = {};
const messages = [];
const typingUsers = {};
const rooms = { global: { name: 'global', members: new Set() } };

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Handle user joining
  socket.on('user_join', (username) => {
    users[socket.id] = { username, id: socket.id, rooms: new Set(['global']) };
    socket.join('global');
    rooms.global.members.add(socket.id);
    io.emit('user_list', Object.values(users));
    io.emit('user_joined', { username, id: socket.id });
    console.log(`${username} joined the chat`);
  });

  // Handle chat messages
  socket.on('send_message', (messageData, ack) => {
    const message = {
      ...messageData,
      id: Date.now(),
      sender: users[socket.id]?.username || 'Anonymous',
      senderId: socket.id,
      timestamp: new Date().toISOString(),
      room: messageData?.room || 'global',
      deliveredTo: new Set(), // socket ids
      readBy: new Set(), // socket ids
    };
    
    messages.push(message);
    
    // Limit stored messages to prevent memory issues
    if (messages.length > 100) {
      messages.shift();
    }
    
    // delivery ack to sender
    if (typeof ack === 'function') {
      ack({ ok: true, messageId: message.id });
    }

    const payload = {
      ...message,
      deliveredTo: undefined,
      readBy: undefined,
    };

    if (message.room && rooms[message.room]) {
      io.to(message.room).emit('receive_message', payload);
    } else {
      io.emit('receive_message', payload);
    }
  });

  // Handle typing indicator
  socket.on('typing', (isTyping) => {
    if (users[socket.id]) {
      const username = users[socket.id].username;
      
      if (isTyping) {
        typingUsers[socket.id] = username;
      } else {
        delete typingUsers[socket.id];
      }
      
      io.emit('typing_users', Object.values(typingUsers));
    }
  });

  // Join a room
  socket.on('join_room', (roomName) => {
    if (!roomName) return;
    if (!rooms[roomName]) {
      rooms[roomName] = { name: roomName, members: new Set() };
    }
    socket.join(roomName);
    rooms[roomName].members.add(socket.id);
    users[socket.id]?.rooms?.add(roomName);
    io.to(roomName).emit('room_notification', {
      room: roomName,
      message: `${users[socket.id]?.username || 'User'} joined ${roomName}`,
      timestamp: new Date().toISOString(),
    });
  });

  // Leave a room
  socket.on('leave_room', (roomName) => {
    if (!roomName || !rooms[roomName]) return;
    socket.leave(roomName);
    rooms[roomName].members.delete(socket.id);
    users[socket.id]?.rooms?.delete(roomName);
    io.to(roomName).emit('room_notification', {
      room: roomName,
      message: `${users[socket.id]?.username || 'User'} left ${roomName}`,
      timestamp: new Date().toISOString(),
    });
  });

  // Handle private messages
  socket.on('private_message', ({ to, message }, ack) => {
    const messageData = {
      id: Date.now(),
      sender: users[socket.id]?.username || 'Anonymous',
      senderId: socket.id,
      message,
      timestamp: new Date().toISOString(),
      isPrivate: true,
    };
    
    socket.to(to).emit('private_message', messageData);
    socket.emit('private_message', messageData);
    if (typeof ack === 'function') {
      ack({ ok: true, messageId: messageData.id });
    }
  });

  // Read receipts
  socket.on('message_read', ({ messageId }) => {
    const msg = messages.find((m) => m.id === messageId);
    if (!msg) return;
    msg.readBy?.add?.(socket.id);
    io.to(msg.senderId).emit('message_read', {
      messageId,
      readerId: socket.id,
      reader: users[socket.id]?.username,
    });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    if (users[socket.id]) {
      const { username } = users[socket.id];
      io.emit('user_left', { username, id: socket.id });
      console.log(`${username} left the chat`);
    }
    
    // cleanup rooms
    Object.values(rooms).forEach((room) => room.members.delete(socket.id));
    users[socket.id]?.rooms?.clear?.();
    delete users[socket.id];
    delete typingUsers[socket.id];
    
    io.emit('user_list', Object.values(users));
    io.emit('typing_users', Object.values(typingUsers));
  });
});

// API routes
app.get('/api/messages', (req, res) => {
  res.json(
    messages.map((m) => ({
      ...m,
      deliveredTo: undefined,
      readBy: undefined,
    }))
  );
});

app.get('/api/users', (req, res) => {
  res.json(Object.values(users));
});

// Root route
app.get('/', (req, res) => {
  res.send('Socket.io Chat Server is running');
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, server, io }; 