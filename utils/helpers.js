// utils/helpers.js
const { v4: uuidv4 } = require('uuid');

function generateId() {
  return uuidv4();
}

function generateRoomId(length = 6) {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result.toLowerCase(); // Or keep as is
}


module.exports = {
  generateId,
  generateRoomId
};
