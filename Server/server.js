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

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('create-room', async (data, callback) => {
    try {
      const roomId = uuidv4().substring(0, 8).toUpperCase();
      const room = createRoom(roomId);
      
      const peer = {
        id: socket.id,
        roomId,
        transports: new Map(),
        producers: new Map(),
        consumers: new Map(),
        rtpCapabilities: null,
        userLang: data.userLang || 'en',
        userName: data.userName || 'User'
      };
      
      peers.set(socket.id, peer);
      room.peers.set(socket.id, peer);
      socket.join(roomId);

      callback({ success: true, roomId });
      console.log(`✅ Room created: ${roomId} by ${socket.id}`);
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

      const peer = {
        id: socket.id,
        roomId,
        transports: new Map(),
        producers: new Map(),
        consumers: new Map(),
        rtpCapabilities: null,
        userLang: userLang || 'es',
        userName: userName || 'Partner'
      };

      peers.set(socket.id, peer);
      room.peers.set(socket.id, peer);
      socket.join(roomId);

      // Get router RTP capabilities
      const rtpCapabilities = router.rtpCapabilities;

      callback({ 
        success: true, 
        roomId,
        rtpCapabilities,
        peers: Array.from(room.peers.values()).map(p => ({
          id: p.id,
          userLang: p.userLang,
          userName: p.userName
        }))
      });

      console.log(`✅ User ${socket.id} joined room ${roomId}`);

      // Notify other peers
      socket.to(roomId).emit('peer-joined', {
        peerId: socket.id,
        userLang,
        userName
      });

    } catch (error) {
      console.error('Error joining room:', error);
      callback({ success: false, error: error.message });
    }
  });

  // WebRTC Transport creation
  socket.on('create-transport', async (data, callback) => {
    try {
      const { peerId } = data;
      const peer = peers.get(peerId || socket.id);
      
      if (!peer) {
        callback({ success: false, error: 'Peer not found' });
        return;
      }

      const transport = await router.createWebRtcTransport({
        listenIps: [
          {
            ip: '0.0.0.0',
            announcedIp: getAnnouncedIp()
          }
        ],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
      });

      peer.transports.set(transport.id, transport);

      callback({
        success: true,
        transport: {
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters
        }
      });

      transport.on('dtlsstatechange', (dtlsState) => {
        if (dtlsState === 'closed') {
          transport.close();
        }
      });

    } catch (error) {
      console.error('Error creating transport:', error);
      callback({ success: false, error: error.message });
    }
  });

  // Connect transport
  socket.on('connect-transport', async (data, callback) => {
    try {
      const { transportId, dtlsParameters } = data;
      const peer = peers.get(socket.id);
      
      if (!peer) {
        callback({ success: false, error: 'Peer not found' });
        return;
      }

      const transport = peer.transports.get(transportId);
      if (!transport) {
        callback({ success: false, error: 'Transport not found' });
        return;
      }

      await transport.connect({ dtlsParameters });
      callback({ success: true });

    } catch (error) {
      console.error('Error connecting transport:', error);
      callback({ success: false, error: error.message });
    }
  });

  // Produce audio
  socket.on('produce-audio', async (data, callback) => {
    try {
      const { transportId, kind, rtpParameters } = data;
      const peer = peers.get(socket.id);
      const room = getRoom(peer.roomId);

      if (!peer || !room) {
        callback({ success: false, error: 'Peer or room not found' });
        return;
      }

      const transport = peer.transports.get(transportId);
      if (!transport) {
        callback({ success: false, error: 'Transport not found' });
        return;
      }

      const producer = await transport.produce({
        kind,
        rtpParameters
      });

      peer.producers.set(producer.id, producer);
      room.audioProducers.set(producer.id, producer);

      callback({ success: true, id: producer.id });

      // Notify other peers about new producer
      socket.to(room.id).emit('new-producer', {
        peerId: socket.id,
        producerId: producer.id,
        kind: producer.kind
      });

      console.log(`🎤 Audio producer created: ${producer.id} for peer ${socket.id}`);

    } catch (error) {
      console.error('Error producing audio:', error);
      callback({ success: false, error: error.message });
    }
  });

  // Consume audio
  socket.on('consume-audio', async (data, callback) => {
    try {
      const { transportId, producerId, rtpCapabilities } = data;
      const peer = peers.get(socket.id);
      const room = getRoom(peer.roomId);

      if (!peer || !room) {
        callback({ success: false, error: 'Peer or room not found' });
        return;
      }

      const transport = peer.transports.get(transportId);
      if (!transport) {
        callback({ success: false, error: 'Transport not found' });
        return;
      }

      if (!router.canConsume({ producerId, rtpCapabilities })) {
        callback({ success: false, error: 'Cannot consume' });
        return;
      }

      const consumer = await transport.consume({
        producerId,
        rtpCapabilities,
        paused: false
      });

      peer.consumers.set(consumer.id, consumer);
      room.audioConsumers.set(consumer.id, consumer);

      callback({
        success: true,
        consumer: {
          id: consumer.id,
          producerId: consumer.producerId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters
        }
      });

      consumer.on('transportclose', () => {
        consumer.close();
        peer.consumers.delete(consumer.id);
      });

    } catch (error) {
      console.error('Error consuming audio:', error);
      callback({ success: false, error: error.message });
    }
  });

  // Text message handling
  socket.on('send-message', (data) => {
    const { roomId, message, originalLang, translatedLang } = data;
    const room = getRoom(roomId);

    if (!room) return;

    console.log('📨 Message received:', { roomId, message, sender: socket.id });

    // Broadcast to all users in the room
    io.to(roomId).emit('receive-message', {
      message,
      originalLang,
      translatedLang,
      senderId: socket.id,
      timestamp: new Date()
    });
  });

  // Translation request
  socket.on('translation-request', async (data) => {
    const { text, sourceLang, targetLang } = data;
    
    try {
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
      const fallback = fallbackTranslation(text, sourceLang, targetLang);
      socket.emit('translation-result', {
        original: text,
        translated: fallback,
        sourceLang,
        targetLang
      });
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    const peer = peers.get(socket.id);
    if (peer) {
      const room = getRoom(peer.roomId);
      if (room) {
        room.peers.delete(socket.id);
        
        // Notify other peers
        socket.to(room.id).emit('peer-left', { peerId: socket.id });

        // Cleanup MediaSoup resources
        peer.transports.forEach(transport => transport.close());
        peer.producers.forEach(producer => producer.close());
        peer.consumers.forEach(consumer => consumer.close());

        // Remove empty room
        if (room.peers.size === 0) {
          rooms.delete(room.id);
          console.log(`Room ${room.id} removed`);
        }
      }
      peers.delete(socket.id);
    }
    console.log('User disconnected:', socket.id);
  });

  socket.on('leave-room', () => {
    const peer = peers.get(socket.id);
    if (peer) {
      const room = getRoom(peer.roomId);
      if (room) {
        socket.leave(room.id);
        room.peers.delete(socket.id);
        socket.to(room.id).emit('peer-left', { peerId: socket.id });

        // Cleanup MediaSoup resources
        peer.transports.forEach(transport => transport.close());
        peer.producers.forEach(producer => producer.close());
        peer.consumers.forEach(consumer => consumer.close());

        if (room.peers.size === 0) {
          rooms.delete(room.id);
        }
      }
      peers.delete(socket.id);
    }
  });
});

// Helper functions

function getAnnouncedIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {   // renamed from 'interface' to 'iface'
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
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