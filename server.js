const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");
const cors = require('cors')
const path = require('path');

const app = express();
const server = http.createServer(app);

const wss = new WebSocketServer({ server });
const rooms = new Map();
const roomMessages = new Map();


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

app.use(express.static(path.join("./client"))); // img , css , js , FONTS , media , any other files (pdf, txt, svg)

app.get('/', (req, res) => {
  res.sendFile(path.resolve("./client/index.html"))
})

app.get('/check', (req, res) => {
  res.status(200).send("1")
})

app.get('/chat/:uuid', (req, res) => {
  const uuid = req.params.uuid;
    let responseText = "Your roomId is " + uuid + '.';
    
  if (rooms.has(uuid)){
    // res.status(200).send('in if')
      responseText = "You have created room." + responseText;
      res.sendFile(path.resolve("./client/room.html"))
  } else {
    responseText = "You don't have room with this id. " + responseText;
    res.status(200).send(responseText)
  }

  // res.status(200).send(responseText)
})

wss.on("connection", (ws) => {
  ws.currentRoom = null;

  ws.on("message", (message) => {
    const request = JSON.parse(message);
    const { type, data } = request
    // console.log(data);
    
    switch (type) {
      case "createRoom":
        if (!rooms.has(data.roomId)) {
          const newRoomLink = linkGenerate()
          rooms.set(data.roomId, {link: newRoomLink , clients: []});
          roomMessages.set(data.roomId, []);
        }
        const newRoomLink = data.originLink + rooms.get(data.roomId).link
        rooms.get(data.roomId).clients.push(ws);
        ws.currentRoom = data.roomId;
        ws.send(JSON.stringify({
          type: "roomCreated",
          data: {
            roomLink: newRoomLink,
            roomId: data.roomId,
            messages: roomMessages.get(data.roomId) || []
          }
        }));
        console.log(`room ${data.roomId} created`);
        break;

      case "joinRoom":
        if (!rooms.has(data.roomId)) {
          wsSend(ws, "error", { message: "Room does not exist" })
          return
        }
        joinToRoom(data.roomId, ws);
        wsSend(ws, "roomJoined", {
          roomId: data.roomId,
          messages: roomMessages.get(data.roomId) || []
        })
        console.log(`room ${data.roomId} joined`);
        break;

      case "leaveRoom":
        const isLeaved = leaveRoom(ws);
        isLeaved && wsSend(ws, "leftRoom");
        break;

      case "deleteRoom":
        if (!rooms.has(data.roomId)) {
          return
        }
        rooms.get(data.roomId).clients.forEach(client => {
          if (client.readyState === 1) {
            wsSend(client, "roomDeleted", { roomId: data.roomId })
          }
        });
        rooms.delete(data.roomId);
        roomMessages.delete(data.roomId);
        console.log(`room ${data.roomId} deleted`);
        break;

      case "sendMessage":
        if (!rooms.has(data.roomId)) {
          return
        }
        const msg = { roomId: data.roomId, message: data.message.toString(), sender: data.sender };
        roomMessages.get(data.roomId).push(msg);
        console.log(`message "${msg.message}" sended`);
        notifyRoomParticipants(data.roomId, msg.message, msg.sender);
        break;

      case "getRooms":
        sendRoomList(ws);
        break;

      default:
        wsSend(ws, "error", { message: "Invalid type" })
    }
  });

  ws.on("close", () => {
    leaveRoom(ws);
  });
});

function notifyRoomParticipants(roomId, message, sender) {
  if (rooms.has(roomId)) {
    const clients = rooms.get(roomId).clients;
    clients.forEach((client) => {
      if (client.readyState === 1) {
        wsSend(client, "message", { message, roomId, sender })
      }
    });
  }
}

function leaveRoom(ws) {
  if (!ws.currentRoom) {
    return false
  }

  const clients = rooms.get(ws.currentRoom).clients;
  if (clients && clients.length > 0) {
    const index = clients.indexOf(ws);
    if (index !== -1) {
      clients.splice(index, 1);
      ws.currentRoom = null;
    }
  }
  return true
}

function sendRoomList(ws) {
  const roomList = Array.from(rooms.entries()).map(([roomId, roomData]) => (roomId));

  wsSend(ws, "roomList", { rooms: roomList })
}

function wsSend(ws, typeString, dataObj = { text: "no data" }) {
  const sendedObject = {
    type: typeString,
    data: dataObj
  }
  ws.send(JSON.stringify(sendedObject));
}

function joinToRoom(roomId, ws) {
  if (ws.currentRoom) leaveRoom(ws);
  rooms.get(roomId).clients.push(ws);
  ws.currentRoom = roomId;
}

function linkGenerate(){
  return crypto.randomUUID()
}

const PORT = 4000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at port ${PORT}`);
});