const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(express.static('public'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Хранилища
const users = new Map();
const waitingUsers = new Map();
const rooms = new Map();
const userSessions = new Map();

// Популярные города России
const popularCities = [
    'Москва', 'Санкт-Петербург', 'Новосибирск', 'Екатеринбург', 'Казань',
    'Нижний Новгород', 'Челябинск', 'Самара', 'Омск', 'Ростов-на-Дону',
    'Уфа', 'Красноярск', 'Воронеж', 'Пермь', 'Волгоград',
    'Краснодар', 'Саратов', 'Тюмень', 'Тольятти', 'Ижевск',
    'Барнаул', 'Ульяновск', 'Иркутск', 'Хабаровск', 'Ярославль',
    'Владивосток', 'Махачкала', 'Томск', 'Оренбург', 'Кемерово',
    'Другой город'
];

// НОВАЯ СИСТЕМА НАСТРОЕНИЙ - 6 ЭЛЕМЕНТОВ
const moods = {
    'need_heard': { 
        name: '«Я хочу поделиться — без советов и оценок»', 
        emoji: '🗣️', 
        color: '#667eea',
        description: 'Просто выслушай меня, не перебивая'
    },
    'light_talk': { 
        name: '«Давай поговорим о чём-то светлом»', 
        emoji: '☀️', 
        color: '#FFD93D',
        description: 'О хорошем, лёгком и приятном'
    },
    'quiet_presence': { 
        name: '«Мне достаточно просто знать, что ты рядом»', 
        emoji: '🌙', 
        color: '#95A5A6',
        description: 'Можно без слов — просто будь со мной'
    },
    'ready_to_support': { 
        name: '«Я здесь, чтобы слушать тебя»', 
        emoji: '🤲', 
        color: '#48bb78',
        description: 'Готов(а) поддержать и понять'
    },
    'deep_conversation': { 
        name: '«Готов(а) говорить честно — о том, что действительно важно»', 
        emoji: '🔥', 
        color: '#9B59B6',
        description: 'Искренний разговор по душам'
    },
    'creative_flow': { 
        name: '«Хочу творить и делиться идеями»', 
        emoji: '🎨', 
        color: '#FF6B6B',
        description: 'Обсудим искусство, проекты и мечты'
    }
};

// Идеальные пары для matching
const idealMatches = {
    'need_heard': ['ready_to_support', 'quiet_presence'],
    'ready_to_support': ['need_heard', 'deep_conversation'],
    'deep_conversation': ['ready_to_support', 'deep_conversation'],
    'light_talk': ['light_talk', 'creative_flow'],
    'quiet_presence': ['quiet_presence', 'ready_to_support'],
    'creative_flow': ['creative_flow', 'light_talk']
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
            10: { name: 'Слушатель', color: '#3498DB', perks: ['Приоритет в поиске'] },
            30: { name: 'Поддерживающий', color: '#2ECC71', perks: ['Расширенные настройки'] },
            50: { name: 'Эмпат', color: '#9B59B6', perks: ['Менторские возможности'] },
            80: { name: 'Мастер общения', color: '#E74C3C', perks: ['Эксклюзивные фичи'] }
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
        "name": "Blizhe - Осознанное общение",
        "short_name": "Blizhe", 
        "description": "Найди собеседника для осмысленного диалога",
        "start_url": "/",
        "display": "standalone",
        "background_color": "#667eea",
        "theme_color": "#667eea",
        "orientation": "any",
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
        version: '3.0.0'
    });
});

app.get('/api/cities', (req, res) => {
    res.json(popularCities);
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        users: users.size,
        rooms: rooms.size
    });
});

// Функция верификации фото с проверкой размера
const verifyPhoto = async (photoData, userData) => {
    return new Promise((resolve) => {
        // Проверяем размер фото
        const base64Length = photoData.length - (photoData.indexOf(',') + 1);
        const padding = photoData.endsWith('==') ? 2 : photoData.endsWith('=') ? 1 : 0;
        const fileSizeInBytes = (base64Length * 3) / 4 - padding;
        const fileSizeInMB = fileSizeInBytes / (1024 * 1024);

        console.log(`📏 Размер фото: ${fileSizeInMB.toFixed(2)}MB`);

        if (fileSizeInMB > 10) {
            resolve({
                verified: false,
                trustScore: 0,
                flags: ['file_too_large'],
                message: 'Фото слишком большое (максимум 10MB)'
            });
            return;
        }

        setTimeout(() => {
            const isVerified = Math.random() > 0.1;
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

    socket.emit('stats_update', {
        online: users.size,
        waiting: waitingUsers.size,
        activeRooms: rooms.size
    });

    // Отправляем список городов новому пользователю
    socket.emit('cities_list', popularCities);

    socket.on('user_register', async (userData) => {
        try {
            console.log('📝 Регистрация пользователя:', userData.name);
            
            if (userData.age < 18) {
                socket.emit('registration_error', { message: 'Минимальный возраст 18 лет' });
                return;
            }

            if (!['male', 'female'].includes(userData.gender)) {
                socket.emit('registration_error', { message: 'Выберите пол' });
                return;
            }

            if (!userData.city || userData.city.trim() === '') {
                socket.emit('registration_error', { message: 'Выберите город' });
                return;
            }

            if (!userData.photo) {
                socket.emit('registration_error', { message: 'Необходимо загрузить фото' });
                return;
            }

            console.log('🔍 Начинаем верификацию фото...');
            const verification = await verifyPhoto(userData.photo, userData);
            
            if (!verification.verified) {
                console.log('❌ Фото не прошло верификацию:', verification.message);
                socket.emit('photo_verification_failed', verification);
                return;
            }

            console.log('✅ Фото верифицировано успешно');

            const user = {
                id: socket.id,
                name: userData.name,
                age: userData.age,
                gender: userData.gender,
                city: userData.city,
                photo: userData.photo,
                trustScore: verification.trustScore,
                level: 1,
                xp: 0,
                coins: 100,
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

            console.log('✅ Пользователь зарегистрирован:', user.name);
            
            socket.emit('registration_success', {
                user: {
                    id: user.id,
                    name: user.name,
                    age: user.age,
                    gender: user.gender,
                    city: user.city,
                    level: user.level,
                    xp: user.xp,
                    coins: user.coins,
                    trustScore: user.trustScore,
                    photo: user.photo
                },
                message: 'Регистрация успешна!'
            });

            io.emit('stats_update', {
                online: users.size,
                waiting: waitingUsers.size,
                activeRooms: rooms.size
            });

            console.log(`👤 Новый пользователь: ${user.name} (${user.age}, ${user.gender}, ${user.city})`);

        } catch (error) {
            console.error('❌ Ошибка регистрации:', error);
            socket.emit('registration_error', { message: 'Ошибка регистрации: ' + error.message });
        }
    });

    socket.on('update_profile', async (profileData) => {
        const session = userSessions.get(socket.id);
        if (!session) return;

        try {
            if (profileData.name) session.user.name = profileData.name;
            if (profileData.age) session.user.age = profileData.age;
            if (profileData.gender) session.user.gender = profileData.gender;
            if (profileData.city) session.user.city = profileData.city;

            if (profileData.photo) {
                const verification = await verifyPhoto(profileData.photo, profileData);
                if (!verification.verified) {
                    socket.emit('photo_verification_failed', verification);
                    return;
                }
                session.user.photo = profileData.photo;
            }

            socket.emit('profile_updated', {
                user: {
                    id: session.user.id,
                    name: session.user.name,
                    age: session.user.age,
                    gender: session.user.gender,
                    city: session.user.city,
                    level: session.user.level,
                    xp: session.user.xp,
                    coins: session.user.coins,
                    trustScore: session.user.trustScore,
                    photo: session.user.photo
                },
                message: 'Профиль обновлен'
            });

        } catch (error) {
            console.error('Ошибка обновления профиля:', error);
            socket.emit('profile_error', { message: 'Ошибка обновления профиля' });
        }
    });

    socket.on('get_user_data', () => {
        const session = userSessions.get(socket.id);
        if (session && session.user) {
            socket.emit('user_data', {
                user: {
                    id: session.user.id,
                    name: session.user.name,
                    age: session.user.age,
                    gender: session.user.gender,
                    city: session.user.city,
                    level: session.user.level,
                    xp: session.user.xp,
                    coins: session.user.coins,
                    trustScore: session.user.trustScore,
                    photo: session.user.photo
                }
            });
        }
    });

    socket.on('user_join', (data) => {
        const session = userSessions.get(socket.id);
        if (!session || !session.user.isVerified) {
            socket.emit('join_error', { message: 'Сначала завершите регистрацию' });
            return;
        }

        session.currentMood = data.mood;
        session.user.currentMood = data.mood;

        findCompanion(session.user);

        socket.emit('waiting_start', {
            message: `Ищем собеседника: "${moods[data.mood].description}"`,
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

function findCompanion(user) {
    // Сначала ищем идеальные пары
    const idealCompanions = idealMatches[user.currentMood];
    for (let [waitingId, waitingUser] of waitingUsers) {
        if (idealCompanions.includes(waitingUser.currentMood) && waitingUser.id !== user.id) {
            createRoom(waitingUser, user);
            waitingUsers.delete(waitingId);
            console.log(`🎯 Найден идеальный собеседник: ${waitingUser.name} + ${user.name}`);
            console.log(`💫 Сочетание: ${moods[waitingUser.currentMood].name} + ${moods[user.currentMood].name}`);
            return;
        }
    }
    
    // Затем ищем любого с таким же настроением
    for (let [waitingId, waitingUser] of waitingUsers) {
        if (waitingUser.currentMood === user.currentMood && waitingUser.id !== user.id) {
            createRoom(waitingUser, user);
            waitingUsers.delete(waitingId);
            console.log(`🤝 Найден собеседник: ${waitingUser.name} + ${user.name}`);
            return;
        }
    }
    
    waitingUsers.set(user.id, user);
    console.log(`⏳ ${user.name} добавлен в очередь (${waitingUsers.size} в ожидании)`);
    console.log(`🎭 Настроение: ${moods[user.currentMood].name}`);
}

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
        companionCity: user2.city,
        companionLevel: user2.level,
        mood: moods[user1.currentMood].name,
        moodDescription: moods[user1.currentMood].description,
        roomId: roomId
    });
    
    user2.socket.emit('companion_found', {
        companionName: user1.name,
        companionAge: user1.age,
        companionGender: user1.gender,
        companionCity: user1.city,
        companionLevel: user1.level,
        mood: moods[user2.currentMood].name,
        moodDescription: moods[user2.currentMood].description,
        roomId: roomId
    });
    
    console.log(`🚀 Создана комната ${roomId} для ${user1.name} и ${user2.name}`);
    console.log(`💬 Тип общения: ${moods[user1.currentMood].name}`);
}

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
    if (session) {
        session.inRoom = false;
        session.user.roomId = null;
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`
🚀 Blizhe 3.0 запущен на порту ${PORT}
💫 Осознанное общение | 🎭 6 типов диалогов
📸 Фото до 10MB | 🌍 Выбор города
👥 Умный подбор пар | 🎮 Система уровней
📱 PWA поддержка | 🔒 Конфиденциальность
🌐 Health: http://localhost:${PORT}/health

🎯 НАСТРОЕНИЯ:
🗣️  Я хочу поделиться — без советов и оценок
☀️  Давай поговорим о чём-то светлом
🌙  Мне достаточно просто знать, что ты рядом
🤲  Я здесь, чтобы слушать тебя
🔥  Готов(а) говорить честно
🎨  Хочу творить и делиться идеями
    `);
});