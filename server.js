const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware
app.use(express.static('public'));
app.use(express.json());

// Хранилище пользователей и комнат
const users = new Map();
const waitingUsers = new Map();
const rooms = new Map();

// Настройки настроений
const moods = {
    'sad': 'Грустное',
    'happy': 'Радостное', 
    'anxious': 'Тревожное',
    'advice': 'Совет',
    'chat': 'Веселое',
    'thoughts': 'Философское',
    'angry': 'Злое',
    'love': 'Влюбленное',
    'bored': 'Скучающее',
    'friends': 'Поиск друзей',
    'relationship': 'Поиск отношений',
    'neutral': 'Нейтральное'
};

// PWA файлы
const pwaFiles = {
    '/manifest.json': `
{
  "name": "Blizhe",
  "short_name": "Blizhe",
  "description": "Найди собеседника по настроению",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#667eea",
  "theme_color": "#667eea",
  "orientation": "portrait",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ],
  "categories": ["social", "entertainment"]
}
    `.trim(),
    
    '/sw.js': `
const CACHE_NAME = 'blizhe-v1.2';
const urlsToCache = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      }
    )
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
    `.trim()
};

// Создаем простую PNG иконку программно (base64)
const createIcon = (size, color = '#667eea') => {
    // Простая SVG иконка как fallback
    const svg = `
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="${color}"/>
  <text x="50%" y="50%" font-family="Arial" font-size="${size/3}" fill="white" text-anchor="middle" dy=".3em">B</text>
</svg>
    `;
    return Buffer.from(svg).toString('base64');
};

// Основной маршрут
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// PWA маршруты
app.get('/manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(pwaFiles['/manifest.json']);
});

app.get('/sw.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.send(pwaFiles['/sw.js']);
});

// Иконки для PWA
app.get('/icon-192.png', (req, res) => {
    res.setHeader('Content-Type', 'image/svg+xml');
    const svgIcon = `
<svg width="192" height="192" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#667eea"/>
      <stop offset="100%" stop-color="#764ba2"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#grad)" rx="20"/>
  <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="80" fill="white" text-anchor="middle" dy=".3em" font-weight="bold">B</text>
</svg>
    `;
    res.send(svgIcon);
});

app.get('/icon-512.png', (req, res) => {
    res.setHeader('Content-Type', 'image/svg+xml');
    const svgIcon = `
<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#667eea"/>
      <stop offset="100%" stop-color="#764ba2"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#grad)" rx="50"/>
  <text x="50%" y="50%" font-family="Arial, sans-serif" font-size="200" fill="white" text-anchor="middle" dy=".3em" font-weight="bold">B</text>
</svg>
    `;
    res.send(svgIcon);
});

// Звуковые файлы
app.get('/sounds/message.mp3', (req, res) => {
    res.setHeader('Content-Type', 'audio/mpeg');
    // Заглушка для звука - в реальном проекте добавь настоящие звуковые файлы
    res.send(Buffer.from(''));
});

app.get('/sounds/notification.mp3', (req, res) => {
    res.setHeader('Content-Type', 'audio/mpeg');
    // Заглушка для звука
    res.send(Buffer.from(''));
});

// API для получения статистики
app.get('/api/stats', (req, res) => {
    res.json({
        online: users.size,
        waiting: waitingUsers.size,
        activeRooms: rooms.size,
        moods: Object.keys(moods).length,
        version: '1.2.0'
    });
});

// Health check для Render
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        users: users.size,
        rooms: rooms.size
    });
});

// Socket.io соединения
io.on('connection', (socket) => {
    console.log('🟢 Новое соединение:', socket.id);

    socket.on('user_join', (userData) => {
        const user = {
            id: socket.id,
            name: userData.name,
            age: userData.age,
            mood: userData.mood,
            socket: socket,
            joinedAt: new Date()
        };
        
        users.set(socket.id, user);
        
        // Ищем подходящего собеседника
        findCompanion(user);
        
        socket.emit('waiting_start', {
            message: `Ищем собеседника с настроением: "${moods[user.mood]}"`,
            mood: user.mood,
            position: waitingUsers.size + 1
        });
        
        // Обновляем статистику для всех
        io.emit('stats_update', {
            online: users.size,
            waiting: waitingUsers.size,
            activeRooms: rooms.size
        });
        
        console.log(`👤 ${user.name} (${user.age}) ищет с настроением: ${moods[user.mood]}`);
    });

    socket.on('send_message', (data) => {
        const user = users.get(socket.id);
        if (user && user.roomId) {
            const room = rooms.get(user.roomId);
            if (room) {
                const companionId = room.user1 === socket.id ? room.user2 : room.user1;
                const companion = users.get(companionId);
                
                io.to(companionId).emit('receive_message', {
                    from: user.name,
                    text: data.text,
                    timestamp: new Date().toLocaleTimeString()
                });
                
                // Логируем сообщение
                console.log(`💬 ${user.name} -> ${companion.name}: ${data.text}`);
            }
        }
    });

    socket.on('typing_start', () => {
        const user = users.get(socket.id);
        if (user && user.roomId) {
            const room = rooms.get(user.roomId);
            if (room) {
                const companionId = room.user1 === socket.id ? room.user2 : room.user1;
                io.to(companionId).emit('companion_typing', true);
            }
        }
    });

    socket.on('typing_stop', () => {
        const user = users.get(socket.id);
        if (user && user.roomId) {
            const room = rooms.get(user.roomId);
            if (room) {
                const companionId = room.user1 === socket.id ? room.user2 : room.user1;
                io.to(companionId).emit('companion_typing', false);
            }
        }
    });

    socket.on('leave_chat', () => {
        console.log(`🔙 ${socket.id} покинул чат`);
        leaveChat(socket.id);
    });

    socket.on('disconnect', (reason) => {
        console.log(`🔴 Отключение: ${socket.id} (${reason})`);
        leaveChat(socket.id);
        
        io.emit('stats_update', {
            online: users.size,
            waiting: waitingUsers.size,
            activeRooms: rooms.size
        });
    });
});

function findCompanion(user) {
    // Ищем подходящего собеседника по настроению
    for (let [waitingId, waitingUser] of waitingUsers) {
        if (waitingUser.mood === user.mood && waitingUser.id !== user.id) {
            // Нашли подходящего собеседника!
            createRoom(waitingUser, user);
            waitingUsers.delete(waitingId);
            console.log(`🎯 Найден собеседник: ${waitingUser.name} + ${user.name}`);
            return;
        }
    }
    
    // Если не нашли - добавляем в ожидание
    waitingUsers.set(user.id, user);
    console.log(`⏳ ${user.name} добавлен в очередь ожидания`);
}

function createRoom(user1, user2) {
    const roomId = `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const room = {
        id: roomId,
        user1: user1.id,
        user2: user2.id,
        mood: user1.mood,
        createdAt: new Date(),
        users: [user1.name, user2.name]
    };
    
    rooms.set(roomId, room);
    
    // Обновляем пользователей
    user1.roomId = roomId;
    user2.roomId = roomId;
    users.set(user1.id, user1);
    users.set(user2.id, user2);
    
    // Уведомляем пользователей о соединении
    user1.socket.emit('companion_found', {
        companionName: user2.name,
        companionAge: user2.age,
        mood: moods[user1.mood],
        roomId: roomId,
        welcomeMessage: `Привет! Я ${user2.name}, тоже искал общения по настроению "${moods[user1.mood]}"`
    });
    
    user2.socket.emit('companion_found', {
        companionName: user1.name,
        companionAge: user1.age,
        mood: moods[user2.mood],
        roomId: roomId,
        welcomeMessage: `Привет! Я ${user1.name}, рад познакомиться!`
    });
    
    console.log(`🚀 Создана комната ${roomId} для ${user1.name} и ${user2.name}`);
}

function leaveChat(userId) {
    const user = users.get(userId);
    if (user) {
        if (user.roomId) {
            const room = rooms.get(user.roomId);
            if (room) {
                // Уведомляем собеседника
                const companionId = room.user1 === userId ? room.user2 : room.user1;
                const companion = users.get(companionId);
                if (companion) {
                    companion.socket.emit('companion_left', {
                        message: 'Собеседник покинул чат',
                        reason: 'disconnected'
                    });
                    companion.roomId = null;
                    // Возвращаем собеседника в поиск
                    findCompanion(companion);
                }
                rooms.delete(user.roomId);
                console.log(`🗑️ Комната ${user.roomId} удалена`);
            }
        }
        waitingUsers.delete(userId);
        users.delete(userId);
    }
}

// Очистка старых комнат (каждые 30 минут)
setInterval(() => {
    const now = new Date();
    let cleaned = 0;
    
    for (let [roomId, room] of rooms) {
        const roomAge = now - room.createdAt;
        if (roomAge > 2 * 60 * 60 * 1000) { // 2 часа
            rooms.delete(roomId);
            cleaned++;
        }
    }
    
    if (cleaned > 0) {
        console.log(`🧹 Очищено ${cleaned} старых комнат`);
    }
}, 30 * 60 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`
🚀 Blizhe сервер запущен на порту ${PORT}
📱 PWA готов к установке
💬 Реальный чат с поиском по настроению
📊 Статистика: ${Object.keys(moods).length} настроений
🌐 Health check: http://localhost:${PORT}/health
    `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Получен SIGTERM, завершаем работу...');
    server.close(() => {
        console.log('✅ Сервер остановлен');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('🛑 Получен SIGINT, завершаем работу...');
    server.close(() => {
        console.log('✅ Сервер остановлен');
        process.exit(0);
    });
});