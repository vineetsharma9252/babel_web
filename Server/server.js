import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import fetch from "node-fetch";

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Store active rooms
const rooms = new Map();
const socketToRoom = new Map();
const videoRooms = new Map();

// Free Translation API Configuration (Google Translate via RapidAPI)
const TRANSLATION_API_KEY = process.env.TRANSLATION_API_KEY || "your-rapidapi-key";
const TRANSLATION_API_HOST = "google-translate1.p.rapidapi.com";
const TRANSLATION_API_URL = "https://google-translate1.p.rapidapi.com/language/translate/v2";

app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "Multilingual Voice & Video Chat Server Running",
    features: ["voice-chat", "video-chat", "translation", "speech-synthesis"],
  });
});

// Voice Room endpoints
app.post("/api/rooms", (req, res) => {
  const roomId = uuidv4().substring(0, 8).toUpperCase();
  const room = {
    id: roomId,
    host: null,
    users: new Map(),
    videoSession: null,
    createdAt: new Date(),
    maxUsers: 2,
    type: "voice",
  };

  rooms.set(roomId, room);
  console.log(`Voice Room created: ${roomId}`);
  res.json({
    roomId,
    success: true,
    type: "voice",
  });
});

app.get("/api/rooms/:roomId", (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: "Room not found" });
  }
  res.json({
    roomId: room.id,
    userCount: room.users.size,
    maxUsers: room.maxUsers,
    createdAt: room.createdAt,
    type: room.type,
    videoSession: room.videoSession
      ? {
          id: room.videoSession,
          active: videoRooms.has(room.videoSession),
        }
      : null,
  });
});

// Helper function to translate text using Google Translate API
async function translateText(text, sourceLang, targetLang) {
  // If same language, no translation needed
  if (sourceLang === targetLang || !text.trim()) {
    return text;
  }

  console.log(`🔄 Translating: "${text}" from ${sourceLang} to ${targetLang}`);

  try {
    // First, try RapidAPI (Google Translate)
    const response = await fetch(TRANSLATION_API_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'X-RapidAPI-Key': TRANSLATION_API_KEY,
        'X-RapidAPI-Host': TRANSLATION_API_HOST
      },
      body: new URLSearchParams({
        q: text,
        target: targetLang,
        source: sourceLang
      })
    });

    const data = await response.json();
    
    if (data.data && data.data.translations && data.data.translations.length > 0) {
      const translatedText = data.data.translations[0].translatedText;
      console.log(`✅ Translation successful: "${text}" → "${translatedText}"`);
      return translatedText;
    }
    
    throw new Error('No translation found in response');
    
  } catch (error) {
    console.error("❌ RapidAPI translation failed:", error.message);
    
    // Fallback 1: Try LibreTranslate (completely free, no API key needed)
    try {
      const libreResponse = await fetch('https://libretranslate.com/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q: text,
          source: sourceLang,
          target: targetLang,
          format: 'text'
        })
      });
      
      const libreData = await libreResponse.json();
      if (libreData.translatedText) {
        console.log(`✅ LibreTranslate fallback: "${text}" → "${libreData.translatedText}"`);
        return libreData.translatedText;
      }
    } catch (libreError) {
      console.error("❌ LibreTranslate failed:", libreError.message);
    }
    
    // Fallback 2: Try MyMemory (free translation API)
    try {
      const myMemoryResponse = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`
      );
      
      const myMemoryData = await myMemoryResponse.json();
      if (myMemoryData.responseData && myMemoryData.responseData.translatedText) {
        console.log(`✅ MyMemory fallback: "${text}" → "${myMemoryData.responseData.translatedText}"`);
        return myMemoryData.responseData.translatedText;
      }
    } catch (myMemoryError) {
      console.error("❌ MyMemory translation failed:", myMemoryError.message);
    }
    
    // Final fallback: Use built-in dictionary
    console.log(`🔄 Using built-in dictionary fallback`);
    return fallbackTranslation(text, sourceLang, targetLang);
  }
}

// Fallback translation dictionary (basic)
function fallbackTranslation(text, sourceLang, targetLang) {
  const translations = {
    'en': { // English to other languages
      'es': {
        'hello': 'hola',
        'goodbye': 'adiós',
        'thank you': 'gracias',
        'please': 'por favor',
        'yes': 'sí',
        'no': 'no',
        'how are you': '¿cómo estás?',
        'what is your name': '¿cómo te llamas?',
        'good morning': 'buenos días',
        'good night': 'buenas noches',
        'i love you': 'te quiero',
        'where is the bathroom': '¿dónde está el baño?',
        'how much does this cost': '¿cuánto cuesta esto?',
        'help': 'ayuda',
        'sorry': 'lo siento',
        'excuse me': 'disculpe',
        'water': 'agua',
        'food': 'comida',
        'friend': 'amigo'
      },
      'fr': {
        'hello': 'bonjour',
        'goodbye': 'au revoir',
        'thank you': 'merci',
        'please': 's\'il vous plaît',
        'yes': 'oui',
        'no': 'non',
        'how are you': 'comment allez-vous',
        'what is your name': 'comment vous appelez-vous',
        'good morning': 'bonjour',
        'good night': 'bonne nuit',
        'i love you': 'je t\'aime',
        'where is the bathroom': 'où sont les toilettes',
        'help': 'aide',
        'sorry': 'désolé',
        'excuse me': 'excusez-moi'
      },
      'de': {
        'hello': 'hallo',
        'goodbye': 'auf wiedersehen',
        'thank you': 'danke',
        'please': 'bitte',
        'yes': 'ja',
        'no': 'nein',
        'how are you': 'wie geht es dir',
        'what is your name': 'wie heißt du',
        'good morning': 'guten morgen',
        'good night': 'gute nacht'
      },
      'hi': {
        'hello': 'नमस्ते',
        'thank you': 'धन्यवाद',
        'please': 'कृपया',
        'yes': 'हाँ',
        'no': 'नहीं',
        'how are you': 'आप कैसे हैं',
        'what is your name': 'आपका नाम क्या है'
      }
    },
    'es': { // Spanish to other languages
      'en': {
        'hola': 'hello',
        'adiós': 'goodbye',
        'gracias': 'thank you',
        'por favor': 'please',
        'sí': 'yes',
        'no': 'no',
        'cómo estás': 'how are you',
        'cómo te llamas': 'what is your name',
        'buenos días': 'good morning',
        'buenas noches': 'good night'
      }
    }
  };

  const lowerText = text.toLowerCase().trim();
  
  // Check if we have translation for this language pair
  if (translations[sourceLang] && translations[sourceLang][targetLang]) {
    const langDict = translations[sourceLang][targetLang];
    
    // Try to find exact match
    if (langDict[lowerText]) {
      return langDict[lowerText];
    }
    
    // Try to find partial match
    for (const [key, value] of Object.entries(langDict)) {
      if (lowerText.includes(key)) {
        return value;
      }
    }
  }
  
  // If no translation found, return original text
  return text;
}

// Socket.io connection handling
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-room", (data) => {
    const { roomId, userLang, userName = "User", isVideo = false } = data;
    
    if (isVideo) {
      // Handle video room join
    } else {
      handleVoiceRoomJoin(socket, roomId, userLang, userName);
    }
  });

  function handleVoiceRoomJoin(socket, roomId, userLang, userName) {
    const room = rooms.get(roomId);

    if (!room) {
      socket.emit("join-error", { message: "Room not found" });
      return;
    }

    if (room.users.size >= room.maxUsers) {
      socket.emit("join-error", { message: "Room is full (max 2 users)" });
      return;
    }

    // Join the room
    socket.join(roomId);
    socketToRoom.set(socket.id, roomId);

    // Add user to room
    const user = {
      id: socket.id,
      name: userName,
      language: userLang,
      joinedAt: new Date(),
      socketId: socket.id,
    };
    room.users.set(socket.id, user);

    // Set first user as host
    if (room.users.size === 1) {
      room.host = socket.id;
    }

    console.log(
      `User ${socket.id} joined voice room ${roomId}. Language: ${userLang}`
    );

    // Notify the user who just joined
    socket.emit("joined-room", {
      roomId,
      isHost: room.host === socket.id,
      partnerConnected: room.users.size > 1,
      users: Array.from(room.users.values()),
      type: "voice",
    });

    // Notify other users in the room about the new user
    if (room.users.size > 1) {
      socket.to(roomId).emit("partner-joined", {
        partnerId: socket.id,
        partnerLang: userLang,
        partnerName: userName,
      });

      // Also send the current user info to the new user about existing partners
      const otherUsers = Array.from(room.users.values()).filter(
        (user) => user.id !== socket.id
      );
      otherUsers.forEach((partner) => {
        socket.emit("partner-joined", {
          partnerId: partner.id,
          partnerLang: partner.language,
          partnerName: partner.name,
        });
      });
    }

    // Send updated room state to all users
    io.to(roomId).emit("room-update", {
      userCount: room.users.size,
      users: Array.from(room.users.values()),
      type: "voice",
    });
  }

  // Handle sending messages with automatic translation
  socket.on("send-message", async (data) => {
    const {
      roomId,
      message,
      originalLang,
      translatedLang,
    } = data;

    const room = rooms.get(roomId);

    console.log("📤 Message received:", {
      roomId,
      message,
      originalLang,
      sender: socket.id,
    });

    if (!room || !room.users.has(socket.id)) {
      console.log("❌ Message rejected - user not in room");
      return;
    }

    // Get the sender
    const sender = room.users.get(socket.id);
    
    // Find the receiver (partner)
    const receiver = Array.from(room.users.values()).find(
      (user) => user.id !== socket.id
    );

    if (!receiver) {
      console.log("❌ No receiver found - sending back to sender only");
      
      // Send message back to sender only (no partner yet)
      socket.emit("receive-message", {
        message: message,
        originalLang: sender.language,
        translatedLang: sender.language,
        senderId: socket.id,
        timestamp: new Date(),
        isOwnMessage: true,
        shouldSpeak: false,
      });
      return;
    }

    console.log("🔄 Translation needed:", {
      from: sender.language,
      to: receiver.language,
      text: message,
    });

    try {
      // TRANSLATE the message to receiver's language
      const translatedMessage = await translateText(
        message,
        sender.language,
        receiver.language
      );

      console.log("✅ Translation complete:", {
        original: message,
        translated: translatedMessage,
        from: sender.language,
        to: receiver.language,
      });

      // Send ORIGINAL message to sender (for display)
      socket.emit("receive-message", {
        message: message, // Original message
        originalLang: sender.language,
        translatedLang: sender.language, // No translation for sender
        senderId: socket.id,
        timestamp: new Date(),
        isOwnMessage: true,
        shouldSpeak: false,
      });

      // Send TRANSLATED message to receiver (for hearing)
      socket.to(receiver.id).emit("receive-message", {
        message: translatedMessage, // TRANSLATED message!
        originalLang: sender.language,
        translatedLang: receiver.language, // Receiver's language
        senderId: socket.id,
        timestamp: new Date(),
        isOwnMessage: false,
        shouldSpeak: true, // Speak translated text
        originalMessage: message, // Keep original for reference
      });

      console.log(
        `✅ Message sent. Sender (${sender.language}) sees: "${message}". Receiver (${receiver.language}) hears: "${translatedMessage}"`
      );
      
    } catch (error) {
      console.error("❌ Translation failed:", error);

      // Fallback: send original message without translation
      socket.emit("receive-message", {
        message: message,
        originalLang: sender.language,
        translatedLang: sender.language,
        senderId: socket.id,
        timestamp: new Date(),
        isOwnMessage: true,
        shouldSpeak: false,
      });

      socket.to(receiver.id).emit("receive-message", {
        message: message, // Send original as fallback
        originalLang: sender.language,
        translatedLang: receiver.language,
        senderId: socket.id,
        timestamp: new Date(),
        isOwnMessage: false,
        shouldSpeak: true,
        isFallback: true,
      });
      
      console.log(`⚠️ Using fallback - no translation available`);
    }
  });

  // Speech recognition data
  socket.on("speech-data", (data) => {
    const { roomId, transcript, language } = data;
    const room = rooms.get(roomId);

    if (!room || !room.users.has(socket.id)) {
      return;
    }

    console.log("🎤 Speech data received:", {
      roomId,
      transcript,
      language,
      sender: socket.id,
    });

    // Broadcast speech data to partner for real-time display
    socket.to(roomId).emit("partner-speech", {
      transcript,
      language,
      senderId: socket.id,
      timestamp: new Date(),
    });

    console.log(`✅ Speech data broadcast to partner`);
  });

  // Direct translation request (for manual translation)
  socket.on("translation-request", async (data) => {
    const {
      text,
      sourceLang,
      targetLang,
    } = data;

    console.log("🔄 Manual translation request:", {
      text,
      sourceLang,
      targetLang,
      socketId: socket.id,
    });

    try {
      const translatedText = await translateText(text, sourceLang, targetLang);
      
      console.log("✅ Manual translation successful:", {
        original: text,
        translated: translatedText,
      });

      socket.emit("translation-result", {
        original: text,
        translated: translatedText,
        sourceLang,
        targetLang,
      });
      
    } catch (error) {
      console.error("❌ Manual translation failed:", error);
      
      const fallback = fallbackTranslation(text, sourceLang, targetLang);
      
      socket.emit("translation-result", {
        original: text,
        translated: fallback,
        sourceLang,
        targetLang,
        isFallback: true,
      });
    }
  });

  // Handle leaving room
  socket.on("leave-room", (data) => {
    const { roomId } = data;
    leaveRoom(socket, roomId);
  });

  socket.on("disconnect", () => {
    const roomId = socketToRoom.get(socket.id);
    if (roomId) {
      leaveRoom(socket, roomId);
    }
    console.log("User disconnected:", socket.id);
  });

  function leaveRoom(socket, roomId) {
    const room = rooms.get(roomId);

    if (room) {
      room.users.delete(socket.id);
      socketToRoom.delete(socket.id);
      socket.leave(roomId);

      console.log(
        `User ${socket.id} left voice room ${roomId}. Remaining users: ${room.users.size}`
      );

      // Notify other users
      socket.to(roomId).emit("partner-left", { partnerId: socket.id });

      if (room.users.size > 0) {
        // Update host if host left
        if (room.host === socket.id) {
          const newHost = Array.from(room.users.keys())[0];
          room.host = newHost;
        }

        io.to(roomId).emit("room-update", {
          userCount: room.users.size,
          users: Array.from(room.users.values()),
          type: "voice",
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

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Multilingual Voice Chat API Ready`);
  console.log(`🔄 Free Translation Enabled (Google Translate via RapidAPI)`);
  console.log(`🔊 Speech: Automatic translation to partner's language`);
  console.log(`💡 To use translation, get a free API key from:`);
  console.log(`   https://rapidapi.com/googlecloud/api/google-translate1`);
  console.log(`   Then set TRANSLATION_API_KEY environment variable`);
});