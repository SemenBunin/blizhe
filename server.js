const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Важная настройка CORS для Socket.IO
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(express.static('public'));
app.use(express.json({ limit: '10mb' }));

// Хранилища (временные - в продакшене заменить на БД)
const users = new Map();
const waitingUsers = new Map();
const rooms = new Map();
const userSessions = new Map();

// Настройки настроений
const moods = {
    'sad': { name: 'Грустное', emoji: '😢', color: '#4A90E2' },
    'happy': { name: 'Радостное', emoji: '😊', color: '#FFD93D' },
    'anxious': { name: 'Тревожное', emoji: '😰', color: '#6BCF7F' },
    'advice': { name: 'Совет', emoji: '🤔', color: '#A78BFA' },
    'chat': { name: 'Веселое', emoji: '🎉', color: '#FF6B6B' },
    'thoughts': { name: 'Философское', emoji: '💭', color: '#667eea' },
    'angry': { name: 'Злое', emoji: '😠', color: '#FF8E53' },
    'love': { name: 'Влюбленное', emoji: '😍', color: '#FF6B9D' },
    'bored': { name: 'Скучающее', emoji: '🥱', color: '#95E1D3' },
    'friends': { name: 'Поиск друзей', emoji: '👫', color: '#4ECDC4' },
    'relationship': { name: 'Поиск отношений', emoji: '💕', color: '#FF9A8B' },
    'neutral': { name: 'Нейтральное', emoji: '😐', color: '#95A5A6' }
};

// Система уровней
const levelSystem = {
    getLevel: (xp) => {
        const level = Math.floor(xp / 1000) + 1;
        const progress = (xp % 1000) / 10;
        return { level, progress, xp };
    },
    
    getLevelInfo: (level) => {
        const levels = {
            1: { name: 'Новичок', color: '#95A5A6', perks: [] },
            10: { name: 'Слушатель', color: '#3498DB', perks: ['Доступ к группам'] },
            30: { name: 'Поддерживающий', color: '#2ECC71', perks: ['Расширенные квесты'] },
            50: { name: 'Эмпат', color: '#9B59B6', perks: ['Менторские возможности'] },
            80: { name: 'Мастер настроений', color: '#E74C3C', perks: ['Эксклюзивные фичи'] }
        };
        
        for (let i = level; i >= 1; i--) {
            if (levels[i]) return levels[i];
        }
        return levels[1];
    }
};

// PWA файлы
const pwaFiles = {
    '/manifest.json': `{
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
    }`
};

// Маршруты
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(pwaFiles['/manifest.json']);
});

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
            <text x="50%" y="50%" font-family="Arial" font-size="80" fill="white" text-anchor="middle" dy=".3em" font-weight="bold">B</text>
        </svg>
    `;
    res.send(svgIcon);
});

// API endpoints
app.get('/api/stats', (req, res) => {
    res.json({
        online: users.size,
        waiting: waitingUsers.size,
        activeRooms: rooms.size,
        moods: Object.keys(moods).length,
        version: '2.1.0'
    });
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        users: users.size,
        rooms: rooms.size
    });
});

// Функция верификации фото
const verifyPhoto = async (photoData, userData) => {
    return new Promise((resolve) => {
        setTimeout(() => {
            // В реальном проекте здесь будет AI проверка
            const isVerified = Math.random() > 0.1; // 90% успех
            resolve({
                verified: isVerified,
                trustScore: isVerified ? 75 : 0,
                flags: isVerified ? [] : ['suspicious_photo'],
                message: isVerified ? 'Фото верифицировано' : 'Фото не прошло проверку'
            });
        }, 1500);
    });
};

// Socket.IO соединения
io.on('connection', (socket) => {
    console.log('🟢 Новое соединение:', socket.id);

    // Отправляем статистику при подключении
    socket.emit('stats_update', {
        online: users.size,
        waiting: waitingUsers.size,
        activeRooms: rooms.size
    });

    socket.on('user_register', async (userData) => {
        try {
            // Проверка возраста
            if (userData.age < 18) {
                socket.emit('registration_error', { message: 'Минимальный возраст 18 лет' });
                return;
            }

            // Проверка пола
            if (!['male', 'female'].includes(userData.gender)) {
                socket.emit('registration_error', { message: 'Выберите пол' });
                return;
            }

            // Верификация фото
            const verification = await verifyPhoto(userData.photo, userData);
            
            if (!verification.verified) {
                socket.emit('photo_verification_failed', verification);
                return;
            }

            // Создание пользователя
            const user = {
                id: socket.id,
                name: userData.name,
                age: userData.age,
                gender: userData.gender,
                photo: userData.photo,
                trustScore: verification.trustScore,
                level: 1,
                xp: 0,
                coins: 100, // Начальный бонус
                joinedAt: new Date(),
                socket: socket,
                isVerified: true
            };

            users.set(socket.id, user);
            userSessions.set(socket.id, {
                user: user,
                currentMood: null,
                inRoom: false
            });

            socket.emit('registration_success', {
                user: {
                    id: user.id,
                    name: user.name,
                    age: user.age,
                    gender: user.gender,
                    level: user.level,
                    xp: user.xp,
                    coins: user.coins,
                    trustScore: user.trustScore
                },
                message: 'Регистрация успешна!'
            });

            // Обновляем статистику для всех
            io.emit('stats_update', {
                online: users.size,
                waiting: waitingUsers.size,
                activeRooms: rooms.size
            });

            console.log(`👤 Новый пользователь: ${user.name} (${user.age}, ${user.gender})`);

        } catch (error) {
            console.error('Ошибка регистрации:', error);
            socket.emit('registration_error', { message: 'Ошибка регистрации' });
        }
    });

    // Обновление профиля
    socket.on('update_profile', (profileData) => {
        const session = userSessions.get(socket.id);
        if (!session) return;

        // Обновляем данные
        if (profileData.name) session.user.name = profileData.name;
        if (profileData.age) session.user.age = profileData.age;
        if (profileData.gender) session.user.gender = profileData.gender;

        socket.emit('profile_updated', {
            user: {
                id: session.user.id,
                name: session.user.name,
                age: session.user.age,
                gender: session.user.gender,
                level: session.user.level,
                xp: session.user.xp,
                coins: session.user.coins,
                trustScore: session.user.trustScore
            },
            message: 'Профиль обновлен'
        });
    });

    socket.on('user_join', (data) => {
        const session = userSessions.get(socket.id);
        if (!session || !session.user.isVerified) {
            socket.emit('join_error', { message: 'Сначала завершите регистрацию' });
            return;
        }

        session.currentMood = data.mood;
        session.user.currentMood = data.mood;

        // Поиск собеседника
        findCompanion(session.user);

        socket.emit('waiting_start', {
            message: `Ищем собеседника с настроением: "${moods[data.mood].name}"`,
            mood: data.mood,
            position: waitingUsers.size
        });
    });

    socket.on('send_message', (data) => {
        const session = userSessions.get(socket.id);
        if (!session || !session.inRoom) return;

        const room = rooms.get(session.user.roomId);
        if (!room) return;

        const companionId = room.user1 === socket.id ? room.user2 : room.user1;
        const companion = users.get(companionId);

        io.to(companionId).emit('receive_message', {
            from: session.user.name,
            text: data.text,
            timestamp: new Date().toLocaleTimeString(),
            level: session.user.level
        });

        console.log(`💬 ${session.user.name} -> ${companion.name}: ${data.text}`);
    });

    socket.on('typing_start', () => {
        const session = userSessions.get(socket.id);
        if (!session || !session.inRoom) return;

        const room = rooms.get(session.user.roomId);
        if (!room) return;

        const companionId = room.user1 === socket.id ? room.user2 : room.user1;
        io.to(companionId).emit('companion_typing', true);
    });

    socket.on('typing_stop', () => {
        const session = userSessions.get(socket.id);
        if (!session || !session.inRoom) return;

        const room = rooms.get(session.user.roomId);
        if (!room) return;

        const companionId = room.user1 === socket.id ? room.user2 : room.user1;
        io.to(companionId).emit('companion_typing', false);
    });

    socket.on('rate_conversation', (data) => {
        const session = userSessions.get(socket.id);
        if (!session) return;

        // Начисление опыта и монет
        session.user.xp += data.rating * 25;
        session.user.coins += data.rating * 10;

        const newLevel = levelSystem.getLevel(session.user.xp);
        if (newLevel.level > session.user.level) {
            session.user.level = newLevel.level;
            socket.emit('level_up', {
                level: newLevel.level,
                levelInfo: levelSystem.getLevelInfo(newLevel.level)
            });
        }

        socket.emit('xp_update', {
            xp: session.user.xp,
            coins: session.user.coins,
            level: session.user.level
        });
    });

    socket.on('leave_chat', () => {
        leaveChat(socket.id);
    });

    socket.on('disconnect', () => {
        console.log('🔴 Отключение:', socket.id);
        leaveChat(socket.id);
        
        io.emit('stats_update', {
            online: users.size,
            waiting: waitingUsers.size,
            activeRooms: rooms.size
        });
    });
});

// Поиск собеседника
function findCompanion(user) {
    // Ищем по такому же настроению
    for (let [waitingId, waitingUser] of waitingUsers) {
        if (waitingUser.currentMood === user.currentMood && waitingUser.id !== user.id) {
            createRoom(waitingUser, user);
            waitingUsers.delete(waitingId);
            console.log(`🎯 Найден собеседник: ${waitingUser.name} + ${user.name}`);
            return;
        }
    }
    
    // Если не нашли - добавляем в ожидание
    waitingUsers.set(user.id, user);
    console.log(`⏳ ${user.name} добавлен в очередь (${waitingUsers.size} в ожидании)`);
}

// Создание комнаты
function createRoom(user1, user2) {
    const roomId = `room_${Date.now()}`;
    const room = {
        id: roomId,
        user1: user1.id,
        user2: user2.id,
        mood: user1.currentMood,
        createdAt: new Date(),
        users: [user1.name, user2.name]
    };
    
    rooms.set(roomId, room);
    
    // Обновляем пользователей
    user1.roomId = roomId;
    user2.roomId = roomId;
    
    const session1 = userSessions.get(user1.id);
    const session2 = userSessions.get(user2.id);
    session1.inRoom = true;
    session2.inRoom = true;
    
    // Уведомляем пользователей о соединении
    user1.socket.emit('companion_found', {
        companionName: user2.name,
        companionAge: user2.age,
        companionGender: user2.gender,
        companionLevel: user2.level,
        mood: moods[user1.currentMood].name,
        roomId: roomId
    });
    
    user2.socket.emit('companion_found', {
        companionName: user1.name,
        companionAge: user1.age,
        companionGender: user1.gender,
        companionLevel: user1.level,
        mood: moods[user2.currentMood].name,
        roomId: roomId
    });
    
    console.log(`🚀 Создана комната ${roomId} для ${user1.name} и ${user2.name}`);
}

// Выход из чата
function leaveChat(userId) {
    const session = userSessions.get(userId);
    if (!session) return;

    if (session.user.roomId) {
        const room = rooms.get(session.user.roomId);
        if (room) {
            // Уведомляем собеседника
            const companionId = room.user1 === userId ? room.user2 : room.user1;
            const companionSession = userSessions.get(companionId);
            if (companionSession) {
                companionSession.user.socket.emit('companion_left');
                companionSession.inRoom = false;
                // Возвращаем собеседника в поиск
                findCompanion(companionSession.user);
            }
            rooms.delete(session.user.roomId);
        }
    }

    waitingUsers.delete(userId);
    if (session) {
        session.inRoom = false;
        session.user.roomId = null;
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`
🚀 Blizhe 2.1 запущен на порту ${PORT}
📸 Система фото-верификации
🎮 Игровая система уровней
👥 Поиск по настроениям
📱 PWA поддержка
🔧 Исправлены проблемы соединения
🌐 Health: http://localhost:${PORT}/health
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