import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Store active rooms
const rooms = new Map();
const socketToRoom = new Map();

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Multilingual Voice Chat Server Running' });
});

app.post('/api/rooms', (req, res) => {
  const roomId = uuidv4().substring(0, 8).toUpperCase();
  const room = {
    id: roomId,
    host: null,
    users: new Map(),
    createdAt: new Date(),
    maxUsers: 2
  };
  
  rooms.set(roomId, room);
  console.log(`Room created: ${roomId}`);
  res.json({ roomId, success: true });
});

app.get('/api/rooms/:roomId', (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json({
    roomId: room.id,
    userCount: room.users.size,
    maxUsers: room.maxUsers,
    createdAt: room.createdAt
  });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', (data) => {
    const { roomId, userLang, userName = 'User' } = data;
    console.log(`Join attempt: ${socket.id} to room ${roomId}`);

    const room = rooms.get(roomId);

    if (!room) {
      socket.emit('join-error', { message: 'Room not found' });
      console.log(`Room ${roomId} not found`);
      return;
    }

    if (room.users.size >= room.maxUsers) {
      socket.emit('join-error', { message: 'Room is full (max 2 users)' });
      console.log(`Room ${roomId} is full`);
      return;
    }

    // Check if user is already in a room
    if (socketToRoom.has(socket.id)) {
      const currentRoomId = socketToRoom.get(socket.id);
      if (currentRoomId === roomId) {
        socket.emit('join-error', { message: 'Already in this room' });
        return;
      }
    }

    // Join the room
    socket.join(roomId);
    socketToRoom.set(socket.id, roomId);

    // Add user to room
    const user = {
      id: socket.id,
      name: userName,
      language: userLang,
      joinedAt: new Date()
    };
    room.users.set(socket.id, user);

    // Set first user as host
    if (room.users.size === 1) {
      room.host = socket.id;
    }

    console.log(`User ${socket.id} joined room ${roomId}. Total users: ${room.users.size}`);
    
    // Notify the user who just joined
    socket.emit('joined-room', {
      roomId,
      isHost: room.host === socket.id,
      partnerConnected: room.users.size > 1,
      users: Array.from(room.users.values())
    });

    // Notify other users in the room about the new user
    if (room.users.size > 1) {
      socket.to(roomId).emit('partner-joined', {
        partnerId: socket.id,
        partnerLang: userLang,
        partnerName: userName
      });
      
      // Also send the current user info to the new user about existing partners
      const otherUsers = Array.from(room.users.values()).filter(user => user.id !== socket.id);
      otherUsers.forEach(partner => {
        socket.emit('partner-joined', {
          partnerId: partner.id,
          partnerLang: partner.language,
          partnerName: partner.name
        });
      });
    }

    // Send updated room state to all users
    io.to(roomId).emit('room-update', {
      userCount: room.users.size,
      users: Array.from(room.users.values())
    });
  });

  socket.on('send-message', (data) => {
    const { roomId, message, originalLang, translatedLang } = data;
    const room = rooms.get(roomId);

    if (!room || !room.users.has(socket.id)) {
      return;
    }

    // Broadcast to all other users in the room
    socket.to(roomId).emit('receive-message', {
      message,
      originalLang,
      translatedLang,
      senderId: socket.id,
      timestamp: new Date()
    });

    console.log(`Message sent in room ${roomId} by ${socket.id}`);
  });

  socket.on('speech-data', (data) => {
    const { roomId, transcript, language } = data;
    const room = rooms.get(roomId);

    if (!room || !room.users.has(socket.id)) {
      return;
    }

    // Broadcast speech data to partner
    socket.to(roomId).emit('partner-speech', {
      transcript,
      language,
      senderId: socket.id
    });
  });

  socket.on('translation-request', async (data) => {
    const { roomId, text, sourceLang, targetLang } = data;
    
    try {
      // Use MyMemory Translation API
      const response = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`
      );
      const result = await response.json();
      
      if (result.responseStatus === 200) {
        socket.emit('translation-result', {
          original: text,
          translated: result.responseData.translatedText,
          sourceLang,
          targetLang
        });
      } else {
        throw new Error('Translation failed');
      }
    } catch (error) {
      // Fallback translation
      const fallback = fallbackTranslation(text, sourceLang, targetLang);
      socket.emit('translation-result', {
        original: text,
        translated: fallback,
        sourceLang,
        targetLang
      });
    }
  });

  socket.on('leave-room', (data) => {
    const { roomId } = data;
    leaveRoom(socket, roomId);
  });

  socket.on('disconnect', () => {
    const roomId = socketToRoom.get(socket.id);
    if (roomId) {
      leaveRoom(socket, roomId);
    }
    console.log('User disconnected:', socket.id);
  });

  function leaveRoom(socket, roomId) {
    const room = rooms.get(roomId);
    
    if (room) {
      room.users.delete(socket.id);
      socketToRoom.delete(socket.id);
      socket.leave(roomId);
      
      console.log(`User ${socket.id} left room ${roomId}. Remaining users: ${room.users.size}`);
      
      // Notify other users
      socket.to(roomId).emit('partner-left', { partnerId: socket.id });
      
      if (room.users.size > 0) {
        // Update host if host left
        if (room.host === socket.id) {
          const newHost = Array.from(room.users.keys())[0];
          room.host = newHost;
        }
        
        io.to(roomId).emit('room-update', {
          userCount: room.users.size,
          users: Array.from(room.users.values())
        });
      } else {
        // Remove empty room after 1 minute
        setTimeout(() => {
          if (rooms.get(roomId)?.users.size === 0) {
            rooms.delete(roomId);
            console.log(`Room ${roomId} removed due to inactivity`);
          }
        }, 60000);
      }
    }
  }
});

// Fallback translation function
function fallbackTranslation(text, sourceLang, targetLang) {
  const translations = {
    'hello': { es: 'hola', fr: 'bonjour', de: 'hallo', hi: 'नमस्ते', ja: 'こんにちは' },
    'thank you': { es: 'gracias', fr: 'merci', de: 'danke', hi: 'धन्यवाद', ja: 'ありがとう' },
    'goodbye': { es: 'adiós', fr: 'au revoir', de: 'auf wiedersehen', hi: 'अलविदा', ja: 'さようなら' },
    'please': { es: 'por favor', fr: 's\'il vous plaît', de: 'bitte', hi: 'कृपया', ja: 'お願いします' },
    'yes': { es: 'sí', fr: 'oui', de: 'ja', hi: 'हाँ', ja: 'はい' },
    'no': { es: 'no', fr: 'non', de: 'nein', hi: 'नहीं', ja: 'いいえ' },
    'how are you': { es: '¿cómo estás?', fr: 'comment ça va?', de: 'wie geht es dir?', hi: 'आप कैसे हैं?', ja: 'お元気ですか？' },
    'what is your name': { es: '¿cómo te llamas?', fr: 'comment tu t\'appelles?', de: 'wie heißt du?', hi: 'आपका नाम क्या है?', ja: 'お名前は何ですか？' }
  };

  const lowerText = text.toLowerCase();
  for (const [english, trans] of Object.entries(translations)) {
    if (lowerText.includes(english) && trans[targetLang]) {
      return trans[targetLang];
    }
  }

  return text; // Return original text if no translation found
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Multilingual Voice Chat API Ready`);
});