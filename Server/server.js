import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import mediasoup from 'mediasoup';
import { v4 as uuidv4 } from 'uuid';
import os from 'os';

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

// MediaSoup variables
let worker;
let router;
const rooms = new Map();
const peers = new Map();

// MediaSoup configuration
const mediaCodecs = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2
  }
];

// Initialize MediaSoup
async function createMediaSoupWorker() {
  worker = await mediasoup.createWorker({
    logLevel: 'warn',
    rtcMinPort: 10000,
    rtcMaxPort: 59999,
  });

  worker.on('died', () => {
    console.error('MediaSoup worker died, exiting in 2 seconds...');
    setTimeout(() => process.exit(1), 2000);
  });

  router = await worker.createRouter({ mediaCodecs });
  console.log('✅ MediaSoup worker and router created');
}

// Room management
function createRoom(roomId) {
  const room = {
    id: roomId,
    peers: new Map(),
    router,
    audioProducers: new Map(),
    audioConsumers: new Map(),
    createdAt: new Date()
  };
  rooms.set(roomId, room);
  return room;
}

function getRoom(roomId) {
  return rooms.get(roomId);
}

// Add quick translation function for common phrases
function quickTranslate(text, sourceLang, targetLang) {
  const quickTranslations = {
    'hello': { 
      es: 'hola', fr: 'bonjour', de: 'hallo', it: 'ciao', 
      ja: 'こんにちは', ko: '안녕하세요', zh: '你好', ru: 'привет',
      ar: 'مرحبا', hi: 'नमस्ते', pt: 'olá'
    },
    'thank you': { 
      es: 'gracias', fr: 'merci', de: 'danke', it: 'grazie',
      ja: 'ありがとう', ko: '감사합니다', zh: '谢谢', ru: 'спасибо',
      ar: 'شكرا', hi: 'धन्यवाद', pt: 'obrigado'
    },
    'goodbye': { 
      es: 'adiós', fr: 'au revoir', de: 'auf wiedersehen', it: 'arrivederci',
      ja: 'さようなら', ko: '안녕', zh: '再见', ru: 'до свидания',
      ar: 'مع السلامة', hi: 'अलविदा', pt: 'adeus'
    },
    'please': { 
      es: 'por favor', fr: 's\'il vous plaît', de: 'bitte', it: 'per favore',
      ja: 'お願いします', ko: '제발', zh: '请', ru: 'пожалуйста',
      ar: 'من فضلك', hi: 'कृपया', pt: 'por favor'
    },
    'yes': { 
      es: 'sí', fr: 'oui', de: 'ja', it: 'sì',
      ja: 'はい', ko: '네', zh: '是', ru: 'да',
      ar: 'نعم', hi: 'हाँ', pt: 'sim'
    },
    'no': { 
      es: 'no', fr: 'non', de: 'nein', it: 'no',
      ja: 'いいえ', ko: '아니요', zh: '不', ru: 'нет',
      ar: 'لا', hi: 'नहीं', pt: 'não'
    },
    'how are you': {
      es: 'cómo estás', fr: 'comment allez-vous', de: 'wie geht es dir', it: 'come stai',
      ja: 'お元気ですか', ko: '어떻게 지내세요', zh: '你好吗', ru: 'как дела',
      ar: 'كيف حالك', hi: 'आप कैसे हैं', pt: 'como você está'
    },
    'what is your name': {
      es: 'cómo te llamas', fr: 'comment tu t\'appelles', de: 'wie heißt du', it: 'come ti chiami',
      ja: 'お名前は何ですか', ko: '이름이 뭐에요', zh: '你叫什么名字', ru: 'как тебя зовут',
      ar: 'ما اسمك', hi: 'तुम्हारा नाम क्या है', pt: 'qual é o seu nome'
    }
  };

  const lowerText = text.toLowerCase().trim();
  
  // Check for exact matches first
  if (quickTranslations[lowerText] && quickTranslations[lowerText][targetLang]) {
    return quickTranslations[lowerText][targetLang];
  }

  // Check for partial matches
  for (const [phrase, translations] of Object.entries(quickTranslations)) {
    if (lowerText.includes(phrase) && translations[targetLang]) {
      return translations[targetLang];
    }
  }

  return text; // Return original if no quick translation found
}

function fallbackTranslation(text, sourceLang, targetLang) {
  const translations = {
    'hello': { es: 'hola', fr: 'bonjour', de: 'hallo', hi: 'नमस्ते', ja: 'こんにちは' },
    'thank you': { es: 'gracias', fr: 'merci', de: 'danke', hi: 'धन्यवाद', ja: 'ありがとう' },
    'goodbye': { es: 'adiós', fr: 'au revoir', de: 'auf wiedersehen', hi: 'अलविदा', ja: 'さようなら' },
    'please': { es: 'por favor', fr: 's\'il vous plaît', de: 'bitte', hi: 'कृपया', ja: 'お願いします' },
    'yes': { es: 'sí', fr: 'oui', de: 'ja', hi: 'हाँ', ja: 'はい' },
    'no': { es: 'no', fr: 'non', de: 'nein', hi: 'नहीं', ja: 'いいえ' }
  };

  const lowerText = text.toLowerCase();
  for (const [english, trans] of Object.entries(translations)) {
    if (lowerText.includes(english) && trans[targetLang]) {
      return trans[targetLang];
    }
  }
  return text;
}

function getAnnouncedIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('✅ User connected:', socket.id);

  // Store peer info immediately on connection
  const peer = {
    id: socket.id,
    roomId: null,
    transports: new Map(),
    producers: new Map(),
    consumers: new Map(),
    rtpCapabilities: null,
    userLang: 'en',
    userName: 'User'
  };
  peers.set(socket.id, peer);

  socket.on('create-room', async (data, callback) => {
    try {
      const roomId = uuidv4().substring(0, 8).toUpperCase();
      const room = createRoom(roomId);
      
      // Update peer info
      peer.roomId = roomId;
      peer.userLang = data.userLang || 'en';
      peer.userName = data.userName || 'User';
      
      room.peers.set(socket.id, peer);
      socket.join(roomId);

      callback({ 
        success: true, 
        roomId,
        peers: Array.from(room.peers.values()).map(p => ({
          id: p.id,
          userLang: p.userLang,
          userName: p.userName
        }))
      });
      
      console.log(`✅ Room created: ${roomId} by ${socket.id}`);
      
      // Notify the creator that they joined
      socket.emit('joined-room', {
        roomId: roomId,
        peers: Array.from(room.peers.values()).map(p => ({
          partnerId: p.id,
          partnerLang: p.userLang,
          partnerName: p.userName
        }))
      });

    } catch (error) {
      console.error('Error creating room:', error);
      callback({ success: false, error: error.message });
    }
  });

  socket.on('join-room', async (data, callback) => {
    try {
      const { roomId, userLang, userName } = data;
      const room = getRoom(roomId);

      if (!room) {
        callback({ success: false, error: 'Room not found' });
        return;
      }

      if (room.peers.size >= 2) {
        callback({ success: false, error: 'Room is full' });
        return;
      }

      // Update peer info
      peer.roomId = roomId;
      peer.userLang = userLang || 'es';
      peer.userName = userName || 'Partner';
      
      room.peers.set(socket.id, peer);
      socket.join(roomId);

      callback({ 
        success: true, 
        roomId,
        rtpCapabilities: router.rtpCapabilities,
        peers: Array.from(room.peers.values()).map(p => ({
          id: p.id,
          userLang: p.userLang,
          userName: p.userName
        }))
      });

      console.log(`✅ User ${socket.id} joined room ${roomId}`);

      // Notify the joiner that they joined
      socket.emit('joined-room', {
        roomId: roomId,
        peers: Array.from(room.peers.values()).map(p => ({
          partnerId: p.id,
          partnerLang: p.userLang,
          partnerName: p.userName
        }))
      });

      // Notify other peers
      socket.to(roomId).emit('partner-joined', {
        partnerId: socket.id,
        partnerLang: userLang || 'es',
        partnerName: userName || 'Partner'
      });

    } catch (error) {
      console.error('Error joining room:', error);
      callback({ success: false, error: error.message });
    }
  });

  // Real-time speech translation handler
  socket.on('real-time-speech', async (data) => {
    try {
      const { roomId, transcript, sourceLang, targetLang } = data;
      const room = getRoom(roomId);

      if (!room) {
        console.error('Room not found for real-time speech');
        return;
      }

      console.log(`🔄 Real-time translation: "${transcript}" from ${sourceLang} to ${targetLang}`);

      // Immediate translation without waiting for API
      let translatedText = transcript; // Fallback to original
      
      // Try quick translation first
      const quickTranslation = quickTranslate(transcript, sourceLang, targetLang);
      if (quickTranslation !== transcript) {
        translatedText = quickTranslation;
        console.log(`✅ Used quick translation: "${translatedText}"`);
      } else {
        // Fallback to API if quick translation doesn't work
        try {
          const response = await fetch(
            `https://api.mymemory.translated.net/get?q=${encodeURIComponent(transcript)}&langpair=${sourceLang}|${targetLang}`
          );
          const result = await response.json();
          
          if (result.responseStatus === 200) {
            translatedText = result.responseData.translatedText;
            console.log(`✅ Used API translation: "${translatedText}"`);
          } else {
            translatedText = fallbackTranslation(transcript, sourceLang, targetLang);
            console.log(`✅ Used fallback translation: "${translatedText}"`);
          }
        } catch (apiError) {
          translatedText = fallbackTranslation(transcript, sourceLang, targetLang);
          console.log(`✅ Used fallback after API error: "${translatedText}"`);
        }
      }

      // Send translated speech to ALL other users in the room immediately
      room.peers.forEach((peer) => {
        if (peer.id !== socket.id) {
          io.to(peer.id).emit('speech-to-speak', {
            text: translatedText,
            targetLang: targetLang,
            originalText: transcript,
            sourceLang: sourceLang,
            senderId: socket.id,
            timestamp: new Date()
          });
          console.log(`🎯 Sent speech to speak to ${peer.id}: "${translatedText}"`);
        }
      });

      // Send confirmation back to sender
      socket.emit('speech-sent', {
        original: transcript,
        translated: translatedText,
        targetLang: targetLang
      });

    } catch (error) {
      console.error('Real-time speech error:', error);
      
      // Emergency fallback - send original text
      const room = getRoom(data.roomId);
      if (room) {
        room.peers.forEach((peer) => {
          if (peer.id !== socket.id) {
            io.to(peer.id).emit('speech-to-speak', {
              text: data.transcript,
              targetLang: data.targetLang,
              originalText: data.transcript,
              sourceLang: data.sourceLang,
              senderId: socket.id
            });
          }
        });
      }
    }
  });

  // Original speech translation handler (keep for backward compatibility)
  socket.on('speech-translation-request', async (data) => {
    try {
      const { roomId, transcript, sourceLang, targetLang } = data;
      const room = getRoom(roomId);

      if (!room) {
        console.error('Room not found for translation');
        return;
      }

      console.log(`🔄 Translating: "${transcript}" from ${sourceLang} to ${targetLang}`);

      // Translate the speech
      const response = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(transcript)}&langpair=${sourceLang}|${targetLang}`
      );
      const result = await response.json();
      
      let translatedText = transcript; // Fallback to original
      
      if (result.responseStatus === 200) {
        translatedText = result.responseData.translatedText;
      } else {
        console.warn('Translation API failed, using fallback');
        translatedText = fallbackTranslation(transcript, sourceLang, targetLang);
      }

      // Send translated speech to the partner
      const senderPeer = peers.get(socket.id);
      if (senderPeer) {
        // Find the partner in the room
        room.peers.forEach((peer) => {
          if (peer.id !== socket.id) {
            // Send to the partner
            io.to(peer.id).emit('translated-speech', {
              originalText: transcript,
              translatedText: translatedText,
              sourceLang: sourceLang,
              targetLang: targetLang,
              senderId: socket.id,
              senderName: senderPeer.userName
            });
            console.log(`✅ Sent translated speech to ${peer.id}`);
          }
        });
      }

      // Also send back to sender for confirmation
      socket.emit('translation-complete', {
        original: transcript,
        translated: translatedText,
        sourceLang,
        targetLang
      });

    } catch (error) {
      console.error('Translation error:', error);
      
      // Fallback: send original text if translation fails
      const room = getRoom(data.roomId);
      if (room) {
        room.peers.forEach((peer) => {
          if (peer.id !== socket.id) {
            io.to(peer.id).emit('translated-speech', {
              originalText: data.transcript,
              translatedText: data.transcript, // Fallback to original
              sourceLang: data.sourceLang,
              targetLang: data.targetLang,
              senderId: socket.id
            });
          }
        });
      }
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('❌ User disconnected:', socket.id);
    const peer = peers.get(socket.id);
    if (peer) {
      const room = getRoom(peer.roomId);
      if (room) {
        room.peers.delete(socket.id);
        
        // Notify other peers
        socket.to(room.id).emit('partner-left', { partnerId: socket.id });

        // Cleanup MediaSoup resources
        peer.transports.forEach(transport => transport.close());
        peer.producers.forEach(producer => producer.close());
        peer.consumers.forEach(consumer => consumer.close());

        // Remove empty room
        if (room.peers.size === 0) {
          rooms.delete(room.id);
          console.log(`🗑️ Room ${room.id} removed`);
        }
      }
      peers.delete(socket.id);
    }
  });

  socket.on('leave-room', () => {
    console.log('🚪 User leaving room:', socket.id);
    const peer = peers.get(socket.id);
    if (peer) {
      const room = getRoom(peer.roomId);
      if (room) {
        socket.leave(room.id);
        room.peers.delete(socket.id);
        socket.to(room.id).emit('partner-left', { partnerId: socket.id });

        // Cleanup MediaSoup resources
        peer.transports.forEach(transport => transport.close());
        peer.producers.forEach(producer => producer.close());
        peer.consumers.forEach(consumer => consumer.close());

        if (room.peers.size === 0) {
          rooms.delete(room.id);
        }
        
        // Reset peer roomId
        peer.roomId = null;
      }
    }
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'MediaSoup Voice Chat Server Running',
    rooms: rooms.size,
    peers: peers.size
  });
});

// Initialize server
async function startServer() {
  await createMediaSoupWorker();
  
  const PORT = process.env.PORT || 3001;
  server.listen(PORT, () => {
    console.log(`🚀 MediaSoup server running on port ${PORT}`);
    console.log(`🌍 Real-time audio communication ready`);
  });
}

startServer().catch(console.error);