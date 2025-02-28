const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");
const cors = require("cors");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const rooms = new Map(); // Хранение комнат
const roomMessages = new Map(); // Хранение истории сообщений

app.options("*", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.sendStatus(200);
});

app.use(
  cors({
    origin: "*",
    methods: "GET,POST,OPTIONS",
    allowedHeaders: "Content-Type",
    optionSuccessStatus: 200,
  })
);

app.use(express.static(path.join(__dirname, "client"))); // Подключаем статику

app.get("/", (req, res) => {
  res.sendFile(path.resolve("client/index.html"));
});

app.get("/check", (req, res) => {
  res.status(200).send("1");
});

app.get("/chat/:uuid", (req, res) => {
  const uuid = req.params.uuid;
  if (rooms.has(uuid)) {
    res.sendFile(path.resolve("client/room.html"));
  } else {
    res.status(404).send("Room not found");
  }
});

wss.on("connection", (ws) => {
  ws.currentRoom = null;

  ws.on("message", (message) => {
    console.log('server on msg event');
    
    const request = JSON.parse(message);
    const { type, data } = request;

    switch (type) {
      case "createRoom":
        if (!rooms.has(data.roomId)) {
          rooms.set(data.roomId, { clients: [] });
          roomMessages.set(data.roomId, []); // Создаём комнату с пустой историей
        }
        rooms.get(data.roomId).clients.push(ws);
        ws.currentRoom = data.roomId;

        wsSend(ws, "roomCreated", {
          roomId: data.roomId,
          messages: roomMessages.get(data.roomId) || [],
        });

        console.log(`Room ${data.roomId} created`);
        break;

      case "joinRoom":
        if (!rooms.has(data.roomId)) {
          wsSend(ws, "error", { message: "Room does not exist" });
          return;
        }
        joinToRoom(data.roomId, ws);

        wsSend(ws, "roomJoined", {
          roomId: data.roomId,
          messages: roomMessages.get(data.roomId) || [],
        });

        console.log(`Room ${data.roomId} joined`);
        break;

      case "leaveRoom":
        if (leaveRoom(ws)) {
          wsSend(ws, "leftRoom");
        }
        break;

      case "deleteRoom":
        console.log('in delete case');
        if (!rooms.has(data.roomId)) return;
        
        console.log(rooms.get(data.roomId));
        wsSend(ws, "roomDeleted", { roomId: data.roomId });

        rooms.delete(data.roomId);
        roomMessages.delete(data.roomId);
        console.log(`Room ${data.roomId} deleted`);
        break;

      case "sendMessage":
        if (!rooms.has(data.roomId)) return;

        const msg = {
          roomId: data.roomId,
          message: data.message.toString(),
          sender: data.sender,
        };

        roomMessages.get(data.roomId).push(msg); // Сохраняем сообщение
        notifyRoomParticipants(data.roomId, msg.message, msg.sender);
        console.log(`Message "${msg.message}" sent`);
        break;

      case "getRooms":
        sendRoomList(ws);
        break;

      default:
        wsSend(ws, "error", { message: "Invalid type" });
    }
  });

  ws.on("close", () => {
    leaveRoom(ws);
  });
});

function notifyRoomParticipants(roomId, message, sender) {
  if (rooms.has(roomId)) {
    rooms.get(roomId).clients.forEach((client) => {
      if (client.readyState === 1) {
        wsSend(client, "message", { message, roomId, sender });
      }
    });
  }
}

function leaveRoom(ws) {
  if (!ws.currentRoom) return false;

  const clients = rooms.get(ws.currentRoom).clients;
  if (clients.length > 0) {
    const index = clients.indexOf(ws);
    if (index !== -1) {
      clients.splice(index, 1);
      ws.currentRoom = null;
    }
  }
  return true;
}

function sendRoomList(ws) {
  const roomList = Array.from(rooms.keys());
  wsSend(ws, "roomList", { rooms: roomList });
}

function wsSend(ws, typeString, dataObj = { text: "no data" }) {
  ws.send(JSON.stringify({ type: typeString, data: dataObj }));
}

function joinToRoom(roomId, ws) {
  if (ws.currentRoom) leaveRoom(ws);
  rooms.get(roomId).clients.push(ws);
  ws.currentRoom = roomId;
}

const PORT = 4000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running at port ${PORT}`);
});
