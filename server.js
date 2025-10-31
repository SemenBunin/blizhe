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
app.use(express.json({ limit: '10mb' }));

// Хранилища
const users = new Map();
const waitingUsers = new Map();
const rooms = new Map();
const userSessions = new Map();
const quests = new Map();

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

// Система квестов
const initializeQuests = () => {
    quests.set('daily_listen', {
        id: 'daily_listen',
        title: 'Активный слушатель',
        description: 'Выслушай 3 человек в грустном настроении',
        type: 'daily',
        target: 3,
        reward: { coins: 50, xp: 100 },
        mood: 'sad'
    });
    
    quests.set('daily_variety', {
        id: 'daily_variety',
        title: 'Разнообразие эмоций',
        description: 'Пообщайся с 3 разными настроениями',
        type: 'daily', 
        target: 3,
        reward: { coins: 30, xp: 75 }
    });
    
    quests.set('weekly_helper', {
        id: 'weekly_helper',
        title: 'Помощник недели',
        description: 'Помоги 15 разным людям',
        type: 'weekly',
        target: 15,
        reward: { coins: 200, xp: 500 }
    });
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
    }`,
    
    '/sw.js': `
        const CACHE_NAME = 'blizhe-v2.0';
        const urlsToCache = ['/', '/manifest.json'];
        
        self.addEventListener('install', event => {
            event.waitUntil(
                caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
            );
        });
        
        self.addEventListener('fetch', event => {
            event.respondWith(
                caches.match(event.request).then(response => response || fetch(event.request))
            );
        });
    `
};

// Маршруты
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/manifest.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(pwaFiles['/manifest.json']);
});

app.get('/sw.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.send(pwaFiles['/sw.js']);
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
            <text x="50%" y="50%" font-family="Arial" font-size="200" fill="white" text-anchor="middle" dy=".3em" font-weight="bold">B</text>
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
        version: '2.0.0'
    });
});

app.get('/api/quests', (req, res) => {
    res.json(Array.from(quests.values()));
});

app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Функция верификации фото (заглушка)
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
        }, 2000);
    });
};

// Socket.io
io.on('connection', (socket) => {
    console.log('🟢 Новое соединение:', socket.id);

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
                coins: 0,
                completedQuests: [],
                activeQuests: {},
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
                    level: user.level,
                    xp: user.xp,
                    coins: user.coins,
                    trustScore: user.trustScore
                },
                message: 'Регистрация успешна!'
            });

            io.emit('stats_update', {
                online: users.size,
                waiting: waitingUsers.size
            });

            console.log(`👤 Новый пользователь: ${user.name} (${user.age}, ${user.gender})`);

        } catch (error) {
            socket.emit('registration_error', { message: 'Ошибка регистрации' });
        }
    });

    socket.on('user_join', (data) => {
        const session = userSessions.get(socket.id);
        if (!session || !session.user.isVerified) return;

        session.currentMood = data.mood;
        session.user.currentMood = data.mood;

        // Поиск собеседника
        findCompanion(session.user);

        socket.emit('waiting_start', {
            message: `Ищем собеседника с настроением: "${moods[data.mood].name}"`,
            mood: data.mood
        });

        // Обновление квестов
        updateQuests(session.user, 'search_started');
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

        // Обновление квестов
        updateQuests(session.user, 'message_sent');
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

        // Обновление квестов
        updateQuests(session.user, 'conversation_rated', data);

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
        leaveChat(socket.id);
        io.emit('stats_update', {
            online: users.size,
            waiting: waitingUsers.size
        });
    });
});

// Поиск собеседника
function findCompanion(user) {
    for (let [waitingId, waitingUser] of waitingUsers) {
        if (waitingUser.currentMood === user.currentMood && waitingUser.id !== user.id) {
            createRoom(waitingUser, user);
            waitingUsers.delete(waitingId);
            return;
        }
    }
    waitingUsers.set(user.id, user);
}

// Создание комнаты
function createRoom(user1, user2) {
    const roomId = `room_${Date.now()}`;
    const room = {
        id: roomId,
        user1: user1.id,
        user2: user2.id,
        mood: user1.currentMood,
        createdAt: new Date()
    };

    rooms.set(roomId, room);

    user1.roomId = roomId;
    user2.roomId = roomId;
    
    const session1 = userSessions.get(user1.id);
    const session2 = userSessions.get(user2.id);
    session1.inRoom = true;
    session2.inRoom = true;

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

    // Обновление квестов
    updateQuests(user1, 'conversation_started');
    updateQuests(user2, 'conversation_started');
}

// Выход из чата
function leaveChat(userId) {
    const session = userSessions.get(userId);
    if (!session) return;

    if (session.user.roomId) {
        const room = rooms.get(session.user.roomId);
        if (room) {
            const companionId = room.user1 === userId ? room.user2 : room.user1;
            const companionSession = userSessions.get(companionId);
            
            if (companionSession) {
                companionSession.user.socket.emit('companion_left');
                companionSession.inRoom = false;
                findCompanion(companionSession.user);
            }
            rooms.delete(session.user.roomId);
        }
    }

    waitingUsers.delete(userId);
    session.inRoom = false;
    session.user.roomId = null;
}

// Система квестов
function updateQuests(user, action, data = {}) {
    user.activeQuests = user.activeQuests || {};

    switch (action) {
        case 'conversation_started':
            incrementQuestProgress(user, 'daily_variety');
            break;
        case 'message_sent':
            // Логика для квестов по сообщениям
            break;
        case 'conversation_rated':
            if (data.rating >= 4) {
                incrementQuestProgress(user, 'daily_listen');
            }
            break;
    }
}

function incrementQuestProgress(user, questId, amount = 1) {
    if (!user.activeQuests[questId]) {
        user.activeQuests[questId] = { progress: 0, completed: false };
    }

    user.activeQuests[questId].progress += amount;
    const quest = quests.get(questId);

    if (user.activeQuests[questId].progress >= quest.target && !user.activeQuests[questId].completed) {
        user.activeQuests[questId].completed = true;
        user.coins += quest.reward.coins;
        user.xp += quest.reward.xp;

        user.socket.emit('quest_completed', {
            quest: quest,
            reward: quest.reward,
            newBalance: { coins: user.coins, xp: user.xp }
        });

        // Проверка уровня
        const newLevel = levelSystem.getLevel(user.xp);
        if (newLevel.level > user.level) {
            user.level = newLevel.level;
            user.socket.emit('level_up', {
                level: newLevel.level,
                levelInfo: levelSystem.getLevelInfo(newLevel.level)
            });
        }
    }
}

// Инициализация
initializeQuests();

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`
🚀 Blizhe 2.0 запущен на порту ${PORT}
📸 Система фото-верификации
🎮 Игровая система уровней и квестов
👥 Поиск по настроениям
📱 PWA поддержка
🌐 Health: http://localhost:${PORT}/health
    `);
});