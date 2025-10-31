const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

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

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API для получения статистики
app.get('/api/stats', (req, res) => {
    res.json({
        online: users.size,
        waiting: waitingUsers.size,
        activeRooms: rooms.size,
        moods: Object.keys(moods).length
    });
});

// Socket.io соединения
io.on('connection', (socket) => {
    console.log('Новое соединение:', socket.id);

    socket.on('user_join', (userData) => {
        const user = {
            id: socket.id,
            name: userData.name,
            age: userData.age,
            mood: userData.mood,
            socket: socket
        };
        
        users.set(socket.id, user);
        
        // Ищем подходящего собеседника
        findCompanion(user);
        
        socket.emit('waiting_start', {
            message: `Ищем собеседника с настроением: "${moods[user.mood]}"`
        });
        
        // Обновляем статистику для всех
        io.emit('stats_update', {
            online: users.size,
            waiting: waitingUsers.size
        });
    });

    socket.on('send_message', (data) => {
        const user = users.get(socket.id);
        if (user && user.roomId) {
            const room = rooms.get(user.roomId);
            if (room) {
                const companionId = room.user1 === socket.id ? room.user2 : room.user1;
                io.to(companionId).emit('receive_message', {
                    from: user.name,
                    text: data.text,
                    timestamp: new Date().toLocaleTimeString()
                });
            }
        }
    });

    socket.on('leave_chat', () => {
        leaveChat(socket.id);
    });

    socket.on('disconnect', () => {
        leaveChat(socket.id);
        console.log('Пользователь отключился:', socket.id);
        
        io.emit('stats_update', {
            online: users.size,
            waiting: waitingUsers.size
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
            return;
        }
    }
    
    // Если не нашли - добавляем в ожидание
    waitingUsers.set(user.id, user);
}

function createRoom(user1, user2) {
    const roomId = `room_${Date.now()}`;
    const room = {
        id: roomId,
        user1: user1.id,
        user2: user2.id,
        mood: user1.mood,
        createdAt: new Date()
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
        roomId: roomId
    });
    
    user2.socket.emit('companion_found', {
        companionName: user1.name,
        companionAge: user1.age,
        mood: moods[user2.mood],
        roomId: roomId
    });
    
    console.log(`Создана комната ${roomId} для ${user1.name} и ${user2.name}`);
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
                    companion.socket.emit('companion_left');
                    companion.roomId = null;
                    // Возвращаем собеседника в поиск
                    findCompanion(companion);
                }
                rooms.delete(user.roomId);
            }
        }
        waitingUsers.delete(userId);
        users.delete(userId);
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Blizhe сервер запущен на порту ${PORT}`);
    console.log(`📊 Доступно настроений: ${Object.keys(moods).length}`);
});