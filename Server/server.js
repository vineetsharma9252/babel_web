import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import OpenAI from "openai";

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "your-openai-api-key-here", // Replace with your key or use environment variable
});

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Store active rooms
const rooms = new Map();
const socketToRoom = new Map();

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", message: "Multilingual Voice Chat Server Running" });
});

app.post("/api/rooms", (req, res) => {
  const roomId = uuidv4().substring(0, 8).toUpperCase();
  const room = {
    id: roomId,
    host: null,
    users: new Map(),
    createdAt: new Date(),
    maxUsers: 2,
  };

  rooms.set(roomId, room);
  console.log(`Room created: ${roomId}`);
  res.json({ roomId, success: true });
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
  });
});

// Socket.io connection handling
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-room", (data) => {
    const { roomId, userLang, userName = "User" } = data;
    console.log(`Join attempt: ${socket.id} to room ${roomId}`);

    const room = rooms.get(roomId);

    if (!room) {
      socket.emit("join-error", { message: "Room not found" });
      console.log(`Room ${roomId} not found`);
      return;
    }

    if (room.users.size >= room.maxUsers) {
      socket.emit("join-error", { message: "Room is full (max 2 users)" });
      console.log(`Room ${roomId} is full`);
      return;
    }

    // Check if user is already in a room
    if (socketToRoom.has(socket.id)) {
      const currentRoomId = socketToRoom.get(socket.id);
      if (currentRoomId === roomId) {
        socket.emit("join-error", { message: "Already in this room" });
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
      joinedAt: new Date(),
    };
    room.users.set(socket.id, user);

    // Set first user as host
    if (room.users.size === 1) {
      room.host = socket.id;
    }

    console.log(
      `User ${socket.id} joined room ${roomId}. Total users: ${room.users.size}`
    );

    // Notify the user who just joined
    socket.emit("joined-room", {
      roomId,
      isHost: room.host === socket.id,
      partnerConnected: room.users.size > 1,
      users: Array.from(room.users.values()),
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
    });
  });

  socket.on("send-message", (data) => {
    const { roomId, message, originalLang, translatedLang } = data;
    const room = rooms.get(roomId);

    console.log("📤 Message received:", {
      roomId,
      message,
      originalLang,
      translatedLang,
      sender: socket.id,
    });

    if (!room || !room.users.has(socket.id)) {
      console.log("❌ Message rejected - user not in room or room not found");
      return;
    }

    // Broadcast to ALL users in the room (including sender for confirmation)
    io.to(roomId).emit("receive-message", {
      message,
      originalLang,
      translatedLang,
      senderId: socket.id,
      timestamp: new Date(),
      isOwnMessage: false,
    });

    console.log(`✅ Message broadcast to room ${roomId} by ${socket.id}`);
  });

  socket.on("speech-data", (data) => {
    const { roomId, transcript, language } = data;
    const room = rooms.get(roomId);

    console.log("🎤 Speech data received:", {
      roomId,
      transcript,
      language,
      sender: socket.id,
    });

    if (!room || !room.users.has(socket.id)) {
      return;
    }

    // Broadcast speech data to all other users in the room
    socket.to(roomId).emit("partner-speech", {
      transcript,
      language,
      senderId: socket.id,
      timestamp: new Date(),
    });

    console.log(`✅ Speech data broadcast to room ${roomId}`);
  });

  socket.on("translation-request", async (data) => {
    const { roomId, text, sourceLang, targetLang } = data;
    console.log("🔄 OpenAI Translation request:", {
      text,
      sourceLang,
      targetLang,
    });

    try {
      // Use OpenAI for translation
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `You are a professional translator. Translate the following text from ${sourceLang} to ${targetLang}. Only return the translated text without any additional explanations or notes. If the text contains proper nouns or names that shouldn't be translated, keep them as-is.`,
          },
          {
            role: "user",
            content: text,
          },
        ],
        max_tokens: 1000,
        temperature: 0.3, // Lower temperature for more consistent translations
      });

      const translatedText =
        completion.choices[0]?.message?.content?.trim() || text;

      socket.emit("translation-result", {
        original: text,
        translated: translatedText,
        sourceLang,
        targetLang,
      });

      console.log("✅ OpenAI Translation successful:", translatedText);
    } catch (error) {
      console.error("❌ OpenAI Translation error:", error.message);

      // Fallback to local translations if OpenAI fails
      const fallback = fallbackTranslation(text, sourceLang, targetLang);
      socket.emit("translation-result", {
        original: text,
        translated: fallback,
        sourceLang,
        targetLang,
        error: error.message,
        isFallback: true,
      });
    }
  });

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
        `User ${socket.id} left room ${roomId}. Remaining users: ${room.users.size}`
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
    hello: {
      es: "hola",
      fr: "bonjour",
      de: "hallo",
      hi: "नमस्ते",
      ja: "こんにちは",
      zh: "你好",
      ko: "안녕하세요",
      ar: "مرحبا",
      pt: "olá",
      ru: "привет",
    },
    "thank you": {
      es: "gracias",
      fr: "merci",
      de: "danke",
      hi: "धन्यवाद",
      ja: "ありがとう",
      zh: "谢谢",
      ko: "감사합니다",
      ar: "شكرا",
      pt: "obrigado",
      ru: "спасибо",
    },
    goodbye: {
      es: "adiós",
      fr: "au revoir",
      de: "auf wiedersehen",
      hi: "अलविदा",
      ja: "さようなら",
      zh: "再见",
      ko: "안녕히 가세요",
      ar: "مع السلامة",
      pt: "adeus",
      ru: "до свидания",
    },
    please: {
      es: "por favor",
      fr: "s'il vous plaît",
      de: "bitte",
      hi: "कृपया",
      ja: "お願いします",
      zh: "请",
      ko: "제발",
      ar: "من فضلك",
      pt: "por favor",
      ru: "пожалуйста",
    },
    yes: {
      es: "sí",
      fr: "oui",
      de: "ja",
      hi: "हाँ",
      ja: "はい",
      zh: "是的",
      ko: "예",
      ar: "نعم",
      pt: "sim",
      ru: "да",
    },
    no: {
      es: "no",
      fr: "non",
      de: "nein",
      hi: "नहीं",
      ja: "いいえ",
      zh: "不",
      ko: "아니요",
      ar: "لا",
      pt: "não",
      ru: "нет",
    },
    "how are you": {
      es: "¿cómo estás?",
      fr: "comment ça va?",
      de: "wie geht es dir?",
      hi: "आप कैसे हैं?",
      ja: "お元気ですか？",
      zh: "你好吗？",
      ko: "어떻게 지내세요?",
      ar: "كيف حالك؟",
      pt: "como você está?",
      ru: "как дела?",
    },
    "what is your name": {
      es: "¿cómo te llamas?",
      fr: "comment tu t'appelles?",
      de: "wie heißt du?",
      hi: "आपका नाम क्या है?",
      ja: "お名前は何ですか？",
      zh: "你叫什么名字？",
      ko: "당신의 이름은 무엇입니까?",
      ar: "ما اسمك؟",
      pt: "qual é o seu nome?",
      ru: "как тебя зовут?",
    },
    "good morning": {
      es: "buenos días",
      fr: "bonjour",
      de: "guten morgen",
      hi: "शुभ प्रभात",
      ja: "おはようございます",
      zh: "早上好",
      ko: "좋은 아침",
      ar: "صباح الخير",
      pt: "bom dia",
      ru: "доброе утро",
    },
    "good night": {
      es: "buenas noches",
      fr: "bonne nuit",
      de: "gute nacht",
      hi: "शुभ रात्रि",
      ja: "おやすみなさい",
      zh: "晚安",
      ko: "안녕히 주무세요",
      ar: "تصبح على خير",
      pt: "boa noite",
      ru: "спокойной ночи",
    },
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
  console.log(`🤖 OpenAI Translation Enabled`);
});
