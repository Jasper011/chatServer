const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");
const cors = require('cors')

const app = express();
const server = http.createServer(app);

const wss = new WebSocketServer({ server });
const rooms = new Map();
const roomMessages = new Map();


// const corsOptions ={
//   origin:'*', 
//   credentials:true,            //access-control-allow-credentials:true
//   optionSuccessStatus:200,
// }

app.options("*", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.sendStatus(200);
});

app.use(cors({
  origin: "*",
  methods: "GET,POST,OPTIONS",
  allowedHeaders: "Content-Type",
  optionSuccessStatus: 200,
}));

app.get('/', (req, res) => {
  res.status(200).send("1")
})

wss.on("connection", (ws) => {
  ws.currentRoom = null;

  ws.on("message", (message) => {
    const data = JSON.parse(message);
    switch (data.type) {
      case "createRoom":
        if (!rooms.has(data.roomId)) {
          rooms.set(data.roomId, []);
          roomMessages.set(data.roomId, []);
        }
        rooms.get(data.roomId).push(ws);
        ws.currentRoom = data.roomId;

        ws.send(JSON.stringify({
          type: "roomCreated",
          roomId: data.roomId,
          messages: roomMessages.get(data.roomId) || []
        }));
        console.log(`room ${data.roomId} created`);
        
        break;

      case "joinRoom":
        if (rooms.has(data.roomId)) {
          if (ws.currentRoom) leaveRoom(ws);
          rooms.get(data.roomId).push(ws);
          ws.currentRoom = data.roomId;

          ws.send(JSON.stringify({
            type: "roomJoined",
            roomId: data.roomId,
            messages: roomMessages.get(data.roomId) || []
          }));
          console.log(`room ${data.roomId} joined`);
        } else {
          ws.send(JSON.stringify({ type: "error", message: "Room does not exist" }));
        }
        break;

      case "leaveRoom":
        leaveRoom(ws);
        ws.send(JSON.stringify({ type: "leftRoom" }));
        break;

      case "deleteRoom":
        if (rooms.has(data.roomId)) {
          rooms.get(data.roomId).forEach(client => {
            if (client.readyState === 1) {
              client.send(JSON.stringify({ type: "roomDeleted", roomId: data.roomId }));
            }
          });
          rooms.delete(data.roomId);
          roomMessages.delete(data.roomId);
          console.log(`room ${data.roomId} deleted`);
        }
        break;

      case "sendMessage":
        if (rooms.has(data.roomId)) {
          const msg = { roomId: data.roomId, message: data.message };
          roomMessages.get(data.roomId).push(msg);
          console.log(`message "${data.message}" sended`);
          
          notifyRoomParticipants(data.roomId, msg);
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

function notifyRoomParticipants(roomId, message) {
  if (rooms.has(roomId)) {
    rooms.get(roomId).forEach((client) => {
      if (client.readyState === 1) {
        client.send(JSON.stringify({ type: "message", ...message }));
      }
    });
  }
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
  }));
  ws.send(JSON.stringify({ type: "roomList", rooms: roomList }));
}

const PORT = 4000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at port ${PORT}`);
});