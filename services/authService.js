// services/authService.js
const bcrypt = require('bcrypt');
const { generateId } = require('../utils/helpers');

const saltRounds = 10;
let usersByPhoneNumber = {}; // In-memory store: { phoneNumber: { userId, username, passwordHash } }
let usersByUserId = {};      // In-memory store: { userId: { phoneNumber, username, passwordHash } }

async function registerUser(phoneNumber, password) {
    if (!phoneNumber || !password || typeof phoneNumber !== 'string' || typeof password !== 'string' || password.length < 4) {
        return { success: false, message: '需要有效的手机号和至少4位密码。' };
    }
    if (usersByPhoneNumber[phoneNumber]) {
        return { success: false, message: '该手机号已被注册。' };
    }

    try {
        const passwordHash = await bcrypt.hash(password, saltRounds);
        const userId = generateId();
        const username = `用户${phoneNumber.slice(-4)}`;
        const newUser = { userId, phoneNumber, username, passwordHash };

        usersByPhoneNumber[phoneNumber] = newUser;
        usersByUserId[userId] = newUser;

        console.log(`[AUTH] User registered: ${username} (${phoneNumber}), ID: ${userId}`);
        return { success: true, message: '注册成功！', userId, username };
    } catch (error) {
        console.error('[AUTH] Registration error:', error);
        return { success: false, message: '注册过程中发生服务器错误。' };
    }
}

async function loginUser(phoneNumber, password) {
    if (!phoneNumber || !password) {
        return { success: false, message: '需要手机号和密码。' };
    }
    const userData = usersByPhoneNumber[phoneNumber];
    if (!userData) {
        return { success: false, message: '用户不存在或手机号错误。' };
    }

    try {
        const match = await bcrypt.compare(password, userData.passwordHash);
        if (match) {
            console.log(`[AUTH] User logged in: ${userData.username} (ID: ${userData.userId})`);
            return { success: true, message: '登录成功！', userId: userData.userId, username: userData.username };
        } else {
            return { success: false, message: '密码错误。' };
        }
    } catch (error) {
        console.error('[AUTH] Login error:', error);
        return { success: false, message: '登录过程中发生服务器错误。' };
    }
}

function findUserById(userId) {
    const userData = usersByUserId[userId];
    if (userData) {
        return { userId: userData.userId, username: userData.username, phoneNumber: userData.phoneNumber }; // Return a copy
    }
    return null;
}

// TODO: Add loadUsers and saveUsers if you want to persist to a file (e.g., users.json)

module.exports = {
    registerUser,
    loginUser,
    findUserById,
};
