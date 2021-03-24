"use strict";

var nodeStatic = require("node-static");
var http = require("http");
var socketIO = require("socket.io");
const port = process.env.port || 8080;
var fileServer = new nodeStatic.Server();
var app = http
    .createServer(function(req, res) {
        fileServer.serve(req, res);
    })
    .listen(port);

var users = new Map();
var usersInRoom = new Map();
var io = socketIO.listen(app);
io.sockets.on("connection", function(socket) {
    socket.on("message", function(message) {
        try {
            users.get(message.ruid).emit("message", message);
        } catch {
            // koi ni
        }
        // socket.broadcast.to(message.room).emit("message", message);
    });

    socket.on("disconnecting", function() {
        users.forEach((v, k) => {
            if (v == socket) {
                users.delete(k);
                for (const room in socket.rooms) {
                    var currentUsers = usersInRoom.get(room) || [];
                    currentUsers.splice(
                        currentUsers.findIndex((x) => x.uid == k),
                        1
                    );
                    usersInRoom.set(room, currentUsers);
                    socket.to(room).emit("disconnected", k);
                    socket.to(room).emit("updateUsers", currentUsers);
                }
            }
        });
    });

    socket.on("create or join", function(data) {
        var currentUsers = usersInRoom.get(data.room) || [];
        currentUsers.push(data);
        usersInRoom.set(data.room, currentUsers);
        socket.to(data.room).emit("joined", data);
        socket.to(data.room).emit("updateUsers", currentUsers);
        socket.emit("updateUsers", currentUsers);
        socket.join(data.room);
        users.set(data.uid, socket);
    });
});