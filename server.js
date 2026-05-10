const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Store waiting users
let waitingUsers = [];
// Store active chat pairs
let activePairs = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // User starts looking for match
  socket.on('find-match', ({ gender, preference }) => {
    socket.gender = gender;
    socket.preference = preference;

    // Try to find a match
    const matchIndex = waitingUsers.findIndex(user => {
      // Check if preferences match
      const userWantsMe = user.preference === 'anyone' || user.preference === gender;
      const iWantUser = preference === 'anyone' || preference === user.gender;
      return userWantsMe && iWantUser;
    });

    if (matchIndex !== -1) {
      // Found a match!
      const partner = waitingUsers[matchIndex];
      waitingUsers.splice(matchIndex, 1);

      // Create pair
      activePairs[socket.id] = partner.id;
      activePairs[partner.id] = socket.id;

      // Notify both users
      socket.emit('match-found', { partnerGender: partner.gender });
      partner.emit('match-found', { partnerGender: gender });

      console.log(`Matched: ${socket.id} with ${partner.id}`);
    } else {
      // No match, add to waiting
      waitingUsers.push(socket);
      console.log('User waiting:', socket.id);
    }
  });

  // Send message
  socket.on('send-message', (message) => {
    const partnerId = activePairs[socket.id];
    if (partnerId) {
      io.to(partnerId).emit('receive-message', message);
    }
  });

  // Disconnect
  socket.on('disconnect-chat', () => {
    handleDisconnect(socket);
  });

  socket.on('disconnect', () => {
    handleDisconnect(socket);
  });

  function handleDisconnect(socket) {
    // Remove from waiting
    waitingUsers = waitingUsers.filter(user => user.id !== socket.id);

    // Notify partner if in active chat
    const partnerId = activePairs[socket.id];
    if (partnerId) {
      io.to(partnerId).emit('partner-disconnected');
      delete activePairs[partnerId];
      delete activePairs[socket.id];
    }

    console.log('User disconnected:', socket.id);
  }
});

const PORT = 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});