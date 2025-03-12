const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");
const cors = require("cors");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const rooms = new Map(); // Хранение комнат
const roomsMoveHistory = new Map(); // Хранение истории сообщений

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
          roomsMoveHistory.set(data.roomId, {turn:'white', movesHistory:[]}); // Создаём комнату с пустой историей
        }
        rooms.get(data.roomId).clients.push(ws);
        ws.currentRoom = data.roomId;

        wsSend(ws, "roomCreated", {
          roomId: data.roomId,
          messages: roomsMoveHistory.get(data.roomId) || [],
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
          state: roomsMoveHistory.get(data.roomId) || [],
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
        roomsMoveHistory.delete(data.roomId);
        console.log(`Room ${data.roomId} deleted`);
        break;

      case "sendMessage":
        if (!rooms.has(data.roomId)) return;

        const msg = {
          roomId: data.roomId,
          move: data.message.toString(),
          sender: data.sender,
        };

        roomsMoveHistory.get(data.roomId).movesHistory.push(msg);
        roomsMoveHistory.get(data.roomId).turn = roomsMoveHistory.get(data.roomId).turn == 'white' ? 'black' : 'white'
        notifyRoomParticipants(data.roomId, msg.message, msg.sender);
        console.log(`Message "${msg.message}" sent`);
        break;

      case "getRooms":
        sendRoomList(ws);
        break;
      case "getRoomsObj":
        sendRoomsObj(ws);
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
        // wsSendMsg(client, { message, roomId, sender });
      }
    });

    // rooms.get(roomId).clients.forEach((client) => {
    //   client.readyState === 1 && wsSend(client, "message", { message, roomId, sender });
    // });
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

function sendRoomsObj(ws){
  console.log(rooms);
  
  const roomsObj = deepClone(rooms)
  wsSend(ws, "roomsObj", {roomsObj})
}

function wsSend(ws, typeString, dataObj = { text: "no data" }) {
  ws.send(JSON.stringify({ type: typeString, data: dataObj }));
}

function wsSendFactory(typeString) {
  return function(ws, dataObj = { text: "no data" }) {
    ws.send(JSON.stringify({ type: typeString, data: dataObj }));
  }
}

function deepClone(obj) {
  if (Array.isArray(obj)) {
      const clonedArray = [];
      for (let i = 0; i < obj.length; i++) {
          clonedArray[i] = deepClone(obj[i]);
      }
      return clonedArray;
  }
  else if (typeof obj === 'object' && obj !== null) {
      const clonedObject = {};
      for (const key in obj) {
          if (Object.hasOwnProperty.call(obj, key)) {
              clonedObject[key] = deepClone(obj[key]);
          }
      }
      return clonedObject;
  }
  else {
      return obj;
  }
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
