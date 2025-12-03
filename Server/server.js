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
    credentials: true,
  },
});

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "your-openai-api-key-here",
});

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Store active rooms
const rooms = new Map();
const socketToRoom = new Map();
const videoRooms = new Map(); // Store video room sessions

// ZegoCloud Configuration (same as frontend)
const ZEGO_APP_ID = 88211358;
const ZEGO_SERVER_SECRET = "9b8df477a18bc7ad4ce1d29542921aa9";

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
    videoSession: null, // Reference to video session if active
    createdAt: new Date(),
    maxUsers: 2,
    type: "voice", // 'voice' or 'video'
  };

  rooms.set(roomId, room);
  console.log(`Voice Room created: ${roomId}`);
  res.json({
    roomId,
    success: true,
    type: "voice",
  });
});

// Create video room
app.post("/api/video-rooms", (req, res) => {
  const { voiceRoomId, userName } = req.body;

  if (!voiceRoomId) {
    return res.status(400).json({ error: "Voice room ID is required" });
  }

  const voiceRoom = rooms.get(voiceRoomId);
  if (!voiceRoom) {
    return res.status(404).json({ error: "Voice room not found" });
  }

  // Generate video room ID based on voice room
  const videoRoomId = `${voiceRoomId}-VIDEO`;

  // Create video session
  const videoSession = {
    id: videoRoomId,
    voiceRoomId: voiceRoomId,
    users: new Map(),
    createdAt: new Date(),
    maxUsers: voiceRoom.maxUsers,
    zegoToken: null,
    type: "video",
  };

  videoRooms.set(videoRoomId, videoSession);

  // Link video session to voice room
  voiceRoom.videoSession = videoRoomId;

  console.log(
    `Video Room created: ${videoRoomId} for voice room: ${voiceRoomId}`
  );

  res.json({
    videoRoomId,
    voiceRoomId,
    success: true,
    type: "video",
    appId: ZEGO_APP_ID,
    serverSecret: ZEGO_SERVER_SECRET,
  });
});

// Get ZegoCloud token for video chat
app.post("/api/video-token", (req, res) => {
  const { videoRoomId, userId, userName } = req.body;

  const videoRoom = videoRooms.get(videoRoomId);
  if (!videoRoom) {
    return res.status(404).json({ error: "Video room not found" });
  }

  // In a real implementation, you would generate a proper Zego token
  // For now, we'll return the necessary info for frontend token generation
  res.json({
    videoRoomId,
    userId: userId || `user_${Date.now()}`,
    userName: userName || "User",
    appId: ZEGO_APP_ID,
    serverSecret: ZEGO_SERVER_SECRET,
    token: generateZegoToken(videoRoomId, userId || `user_${Date.now()}`),
  });
});

// Helper function to generate Zego token (simplified)
function generateZegoToken(roomId, userId) {
  // In production, use proper Zego token generation
  // This is a simplified version
  return `zego_${roomId}_${userId}_${Date.now()}`;
}

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

// Socket.io connection handling
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-room", (data) => {
    const { roomId, userLang, userName = "User", isVideo = false } = data;
    console.log(
      `Join attempt: ${socket.id} to room ${roomId} (${
        isVideo ? "video" : "voice"
      })`
    );

    if (isVideo) {
      handleVideoRoomJoin(socket, roomId, userLang, userName);
    } else {
      handleVoiceRoomJoin(socket, roomId, userLang, userName);
    }
  });

  function handleVoiceRoomJoin(socket, roomId, userLang, userName) {
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
      socketId: socket.id,
    };
    room.users.set(socket.id, user);

    // Set first user as host
    if (room.users.size === 1) {
      room.host = socket.id;
    }

    console.log(
      `User ${socket.id} joined voice room ${roomId}. Total users: ${room.users.size}`
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
        partnerSocketId: socket.id,
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
          partnerSocketId: partner.socketId,
        });
      });
    }

    // Send updated room state to all users
    io.to(roomId).emit("room-update", {
      userCount: room.users.size,
      users: Array.from(room.users.values()),
      type: "voice",
    });

    // If room has active video session, notify about it
    if (room.videoSession && videoRooms.has(room.videoSession)) {
      socket.emit("video-session-available", {
        videoRoomId: room.videoSession,
        voiceRoomId: room.id,
      });
    }
  }

  function handleVideoRoomJoin(socket, videoRoomId, userLang, userName) {
    const videoRoom = videoRooms.get(videoRoomId);

    if (!videoRoom) {
      socket.emit("join-error", { message: "Video room not found" });
      return;
    }

    // Get the voice room
    const voiceRoom = rooms.get(videoRoom.voiceRoomId);
    if (!voiceRoom) {
      socket.emit("join-error", { message: "Associated voice room not found" });
      return;
    }

    // Check if user is in the voice room
    const voiceUser = Array.from(voiceRoom.users.values()).find(
      (user) => user.name === userName || user.language === userLang
    );

    if (!voiceUser) {
      socket.emit("join-error", {
        message: "You must be in the voice room first",
      });
      return;
    }

    // Add user to video room
    videoRoom.users.set(socket.id, {
      id: socket.id,
      name: userName,
      language: userLang,
      voiceUserId: voiceUser.id,
      joinedAt: new Date(),
    });

    socket.join(videoRoomId);
    console.log(`User ${socket.id} joined video room ${videoRoomId}`);

    // Notify all users in video room about new participant
    io.to(videoRoomId).emit("video-participant-joined", {
      userId: socket.id,
      userName,
      userLang,
      timestamp: new Date(),
    });

    // Send current participants to the new user
    const participants = Array.from(videoRoom.users.values());
    socket.emit("video-room-info", {
      videoRoomId,
      voiceRoomId: videoRoom.voiceRoomId,
      participants,
      appId: ZEGO_APP_ID,
      serverSecret: ZEGO_SERVER_SECRET,
    });

    // Notify voice room that video chat is active
    io.to(videoRoom.voiceRoomId).emit("video-chat-started", {
      videoRoomId,
      participantsCount: videoRoom.users.size,
    });
  }

  socket.on("send-message", (data) => {
    const {
      roomId,
      message,
      originalLang,
      translatedLang,
      isVideoRoom = false,
    } = data;

    if (isVideoRoom) {
      // Handle video room messages (text chat within video)
      const videoRoom = videoRooms.get(roomId);
      if (!videoRoom || !videoRoom.users.has(socket.id)) return;

      console.log("📹 Video room message:", {
        roomId,
        message,
        sender: socket.id,
      });

      // Broadcast to all users in video room
      io.to(roomId).emit("video-chat-message", {
        message,
        senderId: socket.id,
        senderName: videoRoom.users.get(socket.id)?.name || "User",
        timestamp: new Date(),
        originalLang,
        translatedLang,
      });

      // Also send to voice room for speech translation
      const voiceRoom = rooms.get(videoRoom.voiceRoomId);
      if (voiceRoom) {
        // Find which voice user sent this message
        const videoUser = videoRoom.users.get(socket.id);
        const voiceUser = videoUser
          ? Array.from(voiceRoom.users.values()).find(
              (user) =>
                user.name === videoUser.name ||
                user.id === videoUser.voiceUserId
            )
          : null;

        if (voiceUser) {
          // Send to voice room for speech synthesis (only to partner)
          socket.to(videoRoom.voiceRoomId).emit("receive-message", {
            message,
            originalLang,
            translatedLang,
            senderId: voiceUser.socketId || voiceUser.id,
            timestamp: new Date(),
            isOwnMessage: false,
            shouldSpeak: true,
            fromVideoChat: true,
          });
        }
      }
    } else {
      // Handle voice room messages (existing functionality)
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

      // Send message to sender (for UI display) without speech
      socket.emit("receive-message", {
        message,
        originalLang,
        translatedLang,
        senderId: socket.id,
        timestamp: new Date(),
        isOwnMessage: true,
        shouldSpeak: false,
      });

      // Send message to OTHER users (partners) WITH speech
      socket.to(roomId).emit("receive-message", {
        message,
        originalLang,
        translatedLang,
        senderId: socket.id,
        timestamp: new Date(),
        isOwnMessage: false,
        shouldSpeak: true,
        originalMessage: message,
      });

      // If room has active video session, also send to video room
      if (room.videoSession && videoRooms.has(room.videoSession)) {
        const videoRoom = videoRooms.get(room.videoSession);
        const videoUser = Array.from(videoRoom.users.values()).find(
          (user) => user.voiceUserId === socket.id
        );

        if (videoUser) {
          io.to(room.videoSession).emit("video-chat-message", {
            message,
            senderId: videoUser.id,
            senderName: room.users.get(socket.id)?.name || "User",
            timestamp: new Date(),
            originalLang,
            translatedLang,
            fromVoiceChat: true,
          });
        }
      }

      console.log(
        `✅ Message sent to room ${roomId}. Own message: shown without speech. Partner message: with speech.`
      );
    }
  });

  // Speech recognition data from voice chat
  socket.on("speech-data", (data) => {
    const { roomId, transcript, language, isVideoRoom = false } = data;

    if (isVideoRoom) {
      const videoRoom = videoRooms.get(roomId);
      if (!videoRoom || !videoRoom.users.has(socket.id)) return;

      console.log("🎤 Video room speech:", {
        roomId,
        transcript,
        language,
        sender: socket.id,
      });

      // Broadcast to video room participants
      socket.to(roomId).emit("video-speech-data", {
        transcript,
        language,
        senderId: socket.id,
        senderName: videoRoom.users.get(socket.id)?.name || "User",
        timestamp: new Date(),
      });

      // Also send to voice room for translation
      const voiceRoom = rooms.get(videoRoom.voiceRoomId);
      if (voiceRoom) {
        const videoUser = videoRoom.users.get(socket.id);
        const voiceUser = videoUser
          ? Array.from(voiceRoom.users.values()).find(
              (user) =>
                user.name === videoUser.name ||
                user.id === videoUser.voiceUserId
            )
          : null;

        if (voiceUser) {
          socket.to(videoRoom.voiceRoomId).emit("partner-speech", {
            transcript,
            language,
            senderId: voiceUser.socketId || voiceUser.id,
            timestamp: new Date(),
          });
        }
      }
    } else {
      const room = rooms.get(roomId);

      console.log("🎤 Voice speech data received:", {
        roomId,
        transcript,
        language,
        sender: socket.id,
      });

      if (!room || !room.users.has(socket.id)) {
        return;
      }

      // Broadcast speech data to all OTHER users in the room (partners only)
      socket.to(roomId).emit("partner-speech", {
        transcript,
        language,
        senderId: socket.id,
        timestamp: new Date(),
      });

      // If room has active video session, also send to video room
      if (room.videoSession && videoRooms.has(room.videoSession)) {
        const videoRoom = videoRooms.get(room.videoSession);
        const videoUser = Array.from(videoRoom.users.values()).find(
          (user) => user.voiceUserId === socket.id
        );

        if (videoUser) {
          socket.to(room.videoSession).emit("video-speech-data", {
            transcript,
            language,
            senderId: videoUser.id,
            senderName: room.users.get(socket.id)?.name || "User",
            timestamp: new Date(),
          });
        }
      }

      console.log(`✅ Speech data broadcast to partners in room ${roomId}`);
    }
  });

  // Translation request (works for both voice and video)
  socket.on("translation-request", async (data) => {
    const {
      roomId,
      text,
      sourceLang,
      targetLang,
      isForSpeech = false,
      isVideoRoom = false,
    } = data;
    console.log("🔄 Translation request:", {
      roomId,
      text,
      sourceLang,
      targetLang,
      isForSpeech,
      isVideoRoom,
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
        temperature: 0.3,
      });

      const translatedText =
        completion.choices[0]?.message?.content?.trim() || text;

      socket.emit("translation-result", {
        original: text,
        translated: translatedText,
        sourceLang,
        targetLang,
        isForSpeech,
        isVideoRoom,
      });

      console.log("✅ Translation successful:", translatedText);
    } catch (error) {
      console.error("❌ Translation error:", error.message);

      // Fallback to local translations if OpenAI fails
      const fallback = fallbackTranslation(text, sourceLang, targetLang);
      socket.emit("translation-result", {
        original: text,
        translated: fallback,
        sourceLang,
        targetLang,
        error: error.message,
        isFallback: true,
        isForSpeech,
        isVideoRoom,
      });
    }
  });

  // Video chat controls
  socket.on("video-control", (data) => {
    const { videoRoomId, controlType, value } = data;
    const videoRoom = videoRooms.get(videoRoomId);

    if (!videoRoom || !videoRoom.users.has(socket.id)) return;

    console.log(`🎬 Video control: ${controlType} = ${value}`, {
      videoRoomId,
      sender: socket.id,
    });

    // Broadcast control to all participants except sender
    socket.to(videoRoomId).emit("video-control-update", {
      controlType,
      value,
      senderId: socket.id,
      senderName: videoRoom.users.get(socket.id)?.name || "User",
      timestamp: new Date(),
    });

    // Also notify voice room about video control changes
    const voiceRoom = rooms.get(videoRoom.voiceRoomId);
    if (voiceRoom) {
      io.to(videoRoom.voiceRoomId).emit("video-status-update", {
        videoRoomId,
        controlType,
        value,
        userId: socket.id,
      });
    }
  });

  // Start video chat from voice room
  socket.on("start-video-chat", (data) => {
    const { voiceRoomId } = data;
    const voiceRoom = rooms.get(voiceRoomId);

    if (!voiceRoom || !voiceRoom.users.has(socket.id)) {
      socket.emit("video-chat-error", {
        message: "Voice room not found or not a member",
      });
      return;
    }

    // Check if video chat already exists
    let videoRoomId = voiceRoom.videoSession;
    if (!videoRoomId || !videoRooms.has(videoRoomId)) {
      videoRoomId = `${voiceRoomId}-VIDEO-${Date.now()}`;

      // Create new video session
      const videoSession = {
        id: videoRoomId,
        voiceRoomId: voiceRoomId,
        users: new Map(),
        createdAt: new Date(),
        maxUsers: voiceRoom.maxUsers,
        type: "video",
      };

      videoRooms.set(videoRoomId, videoSession);
      voiceRoom.videoSession = videoRoomId;
    }

    const videoRoom = videoRooms.get(videoRoomId);

    // Add user to video room
    const voiceUser = voiceRoom.users.get(socket.id);
    videoRoom.users.set(socket.id, {
      id: socket.id,
      name: voiceUser.name,
      language: voiceUser.language,
      voiceUserId: socket.id,
      joinedAt: new Date(),
    });

    // Join video room socket room
    socket.join(videoRoomId);

    // Notify all users in voice room
    io.to(voiceRoomId).emit("video-chat-invitation", {
      videoRoomId,
      initiatedBy: socket.id,
      initiatedByName: voiceUser.name,
      timestamp: new Date(),
    });

    // Send video room info to initiator
    socket.emit("video-chat-ready", {
      videoRoomId,
      voiceRoomId,
      appId: ZEGO_APP_ID,
      serverSecret: ZEGO_SERVER_SECRET,
      participants: Array.from(videoRoom.users.values()),
    });

    console.log(
      `🎥 Video chat started: ${videoRoomId} for voice room: ${voiceRoomId}`
    );
  });

  // Join existing video chat
  socket.on("join-video-chat", (data) => {
    const { videoRoomId } = data;
    const videoRoom = videoRooms.get(videoRoomId);

    if (!videoRoom) {
      socket.emit("video-chat-error", { message: "Video room not found" });
      return;
    }

    const voiceRoom = rooms.get(videoRoom.voiceRoomId);
    if (!voiceRoom || !voiceRoom.users.has(socket.id)) {
      socket.emit("video-chat-error", {
        message: "You must be in the voice room to join video",
      });
      return;
    }

    // Add user to video room
    const voiceUser = voiceRoom.users.get(socket.id);
    videoRoom.users.set(socket.id, {
      id: socket.id,
      name: voiceUser.name,
      language: voiceUser.language,
      voiceUserId: socket.id,
      joinedAt: new Date(),
    });

    socket.join(videoRoomId);

    // Notify all participants in video room
    io.to(videoRoomId).emit("video-participant-joined", {
      userId: socket.id,
      userName: voiceUser.name,
      userLang: voiceUser.language,
      timestamp: new Date(),
    });

    // Send video room info to new participant
    socket.emit("video-chat-ready", {
      videoRoomId,
      voiceRoomId: videoRoom.voiceRoomId,
      appId: ZEGO_APP_ID,
      serverSecret: ZEGO_SERVER_SECRET,
      participants: Array.from(videoRoom.users.values()),
    });

    console.log(`🎥 User ${socket.id} joined video chat: ${videoRoomId}`);
  });

  // Leave video chat
  socket.on("leave-video-chat", (data) => {
    const { videoRoomId } = data;
    const videoRoom = videoRooms.get(videoRoomId);

    if (videoRoom && videoRoom.users.has(socket.id)) {
      videoRoom.users.delete(socket.id);
      socket.leave(videoRoomId);

      console.log(`User ${socket.id} left video room ${videoRoomId}`);

      // Notify remaining participants
      socket.to(videoRoomId).emit("video-participant-left", {
        userId: socket.id,
        timestamp: new Date(),
      });

      // Notify voice room
      const voiceRoom = rooms.get(videoRoom.voiceRoomId);
      if (voiceRoom) {
        io.to(videoRoom.voiceRoomId).emit("video-participant-update", {
          videoRoomId,
          participantsCount: videoRoom.users.size,
          userId: socket.id,
        });
      }

      // Clean up empty video room
      if (videoRoom.users.size === 0) {
        videoRooms.delete(videoRoomId);

        // Remove reference from voice room
        if (voiceRoom && voiceRoom.videoSession === videoRoomId) {
          voiceRoom.videoSession = null;
        }

        console.log(`Video room ${videoRoomId} removed (empty)`);
      }
    }
  });

  // Existing events for speech synthesis
  socket.on("speak-translated-text", (data) => {
    const {
      roomId,
      text,
      language,
      isOwnMessage = false,
      isVideoRoom = false,
    } = data;

    const room = isVideoRoom ? videoRooms.get(roomId) : rooms.get(roomId);
    if (
      !room ||
      !(isVideoRoom ? room.users.has(socket.id) : room.users.has(socket.id))
    ) {
      return;
    }

    // Only speak if it's NOT the user's own message
    if (!isOwnMessage) {
      console.log(
        `🔊 Request to speak text: "${text}" in ${language} for user ${socket.id}`
      );

      // Send to the specific user to speak the text
      socket.emit("speak-text", {
        text,
        language,
        timestamp: new Date(),
        isVideoRoom,
      });
    } else {
      console.log(`🔇 Skipping speech for own message: "${text}"`);
    }
  });

  socket.on("trigger-partner-speech", (data) => {
    const { roomId, text, language, targetUserId, isVideoRoom = false } = data;

    const room = isVideoRoom ? videoRooms.get(roomId) : rooms.get(roomId);
    if (
      !room ||
      !(isVideoRoom ? room.users.has(socket.id) : room.users.has(socket.id)) ||
      !(isVideoRoom
        ? room.users.has(targetUserId)
        : room.users.has(targetUserId))
    ) {
      return;
    }

    // Send speech request to the partner
    io.to(targetUserId).emit("speak-text", {
      text,
      language,
      timestamp: new Date(),
      fromUser: socket.id,
      isVideoRoom,
    });

    console.log(
      `🔊 Triggered speech for partner ${targetUserId}: "${text}" in ${language}`
    );
  });

  socket.on("leave-room", (data) => {
    const { roomId, isVideoRoom = false } = data;

    if (isVideoRoom) {
      // Handle video room leave
      socket.emit("leave-video-chat", { videoRoomId: roomId });
    } else {
      // Handle voice room leave
      leaveRoom(socket, roomId);
    }
  });

  socket.on("disconnect", () => {
    const roomId = socketToRoom.get(socket.id);
    if (roomId) {
      leaveRoom(socket, roomId);
    }

    // Also remove from any video rooms
    for (const [videoRoomId, videoRoom] of videoRooms.entries()) {
      if (videoRoom.users.has(socket.id)) {
        videoRoom.users.delete(socket.id);
        socket.leave(videoRoomId);

        // Notify other participants
        io.to(videoRoomId).emit("video-participant-left", {
          userId: socket.id,
          timestamp: new Date(),
        });

        // Clean up empty video room
        if (videoRoom.users.size === 0) {
          videoRooms.delete(videoRoomId);

          // Remove reference from voice room
          const voiceRoom = rooms.get(videoRoom.voiceRoomId);
          if (voiceRoom && voiceRoom.videoSession === videoRoomId) {
            voiceRoom.videoSession = null;
          }
        }
      }
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

      // Also remove from associated video room if exists
      if (room.videoSession && videoRooms.has(room.videoSession)) {
        const videoRoom = videoRooms.get(room.videoSession);
        if (videoRoom.users.has(socket.id)) {
          videoRoom.users.delete(socket.id);
          socket.leave(room.videoSession);

          io.to(room.videoSession).emit("video-participant-left", {
            userId: socket.id,
            timestamp: new Date(),
          });

          if (videoRoom.users.size === 0) {
            videoRooms.delete(room.videoSession);
            room.videoSession = null;
          }
        }
      }

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

// Fallback translation function (unchanged)
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
      ar: "नعم",
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
      ru: "دоброе утро",
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

  return text;
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Multilingual Voice & Video Chat API Ready`);
  console.log(`🤖 OpenAI Translation Enabled`);
  console.log(`🎥 Video Chat Integration Ready`);
  console.log(`🔊 Speech: Partners only (not own messages)`);
  console.log(`📡 ZegoCloud App ID: ${ZEGO_APP_ID}`);
});
