const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");

const app = express();
const server = http.createServer(app);

const wss = new WebSocketServer({ server });
const rooms = new Map();

wss.on("connection", (ws) => {
  ws.currentRoom = null;

  ws.on("message", (message) => {
    const data = JSON.parse(message);
    
    switch (data.type) {
      case "createRoom":
        const roomId = data.roomId;
        if (!rooms.has(roomId)) {
          rooms.set(roomId, []);
        }
        rooms.get(roomId).push(ws);
        ws.currentRoom = roomId;
        ws.send(JSON.stringify({ type: "roomCreated", roomId }));
        break;

      case "joinRoom":
        const joinRoomId = data.roomId;
        if (rooms.has(joinRoomId)) {
          if (ws.currentRoom) leaveRoom(ws);
          rooms.get(joinRoomId).push(ws);
          ws.currentRoom = joinRoomId;
          ws.send(JSON.stringify({ type: "roomJoined", roomId: joinRoomId }));
        } else {
          ws.send(JSON.stringify({ type: "error", message: "Room does not exist" }));
        }
        break;

      case "leaveRoom":
        leaveRoom(ws);
        ws.send(JSON.stringify({ type: "leftRoom" }));
        break;

      case "deleteRoom":
        const deleteRoomId = data.roomId;
        if (rooms.has(deleteRoomId)) {
          rooms.delete(deleteRoomId);
          notifyAllClients(`Room "${deleteRoomId}" has been deleted.`);
          ws.send(JSON.stringify({ type: "roomDeleted", roomId: deleteRoomId }));
        }
        break;

      case "sendMessage":
        const sendRoomId = data.roomId;
        const messageText = data.message;
        if (rooms.has(sendRoomId)) {
          notifyRoomParticipants(sendRoomId, messageText, ws);
        }
        break;

      case "getRooms":
        sendRoomList(ws);
        break;

      default:
        ws.send(JSON.stringify({ type: "error", message: "Invalid type" }));
    }
  });

  ws.on("close", () => {
    leaveRoom(ws);
  });
});

function notifyRoomParticipants(roomId, message, sender = null) {
  if (rooms.has(roomId)) {
    rooms.get(roomId).forEach((client) => {
      if (client.readyState === 1) {
        client.send(JSON.stringify({ type: "message", roomId, message }));
      }
    });
  }
}

function notifyAllClients(message) {
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify({ type: "message", message }));
    }
  });
}

function leaveRoom(ws) {
  if (ws.currentRoom) {
    const clients = rooms.get(ws.currentRoom);
    if (clients) {
      const index = clients.indexOf(ws);
      if (index !== -1) {
        clients.splice(index, 1);
      }
    }
    ws.currentRoom = null;
  }
}

function sendRoomList(ws) {
  const roomList = Array.from(rooms.entries()).map(([roomId, clients]) => ({
    roomId,
    participants: clients.length
  }));
  ws.send(JSON.stringify({ type: "roomList", rooms: roomList }));
}

const PORT = 4000;
server.listen(PORT, () => {
  console.log(`Server running at port ${PORT}`);
});
