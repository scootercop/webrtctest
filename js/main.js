"use strict";
let localAudioStream;
let localVideoStream;
let pcs = {};
let remoteAudioStream;
let remoteVideoStream;
let _uid = Math.random() * 10000000;
const configuration = {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};
let _room, _username;
let roomNameElement = document.querySelector("#roomName");
let userNameElement = document.querySelector("#userName");
let joinElement = document.querySelector("#join");
let usersInRoomElement = document.querySelector("#usersInRoom");
let shareScreenButton = document.querySelector("#shareScreen");
let socket = io.connect();
let usersInRoom = [];

function joinroom() {
    _room = roomNameElement.value.length ? roomNameElement.value : "Demo-Room";
    roomNameElement.value = _room;
    _username = userNameElement.value.length ? userNameElement.value : "Dummy";
    userNameElement.value = _username;
    joinElement.disabled = true;
    socket.emit("create or join", {
        room: _room,
        uid: _uid,
        name: _username,
    });
}

async function shareScreen() {
    let stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    localVideoStream = stream;
    for (var key in pcs) {
        pcs[key].addTrack(localVideoStream.getVideoTracks()[0]);
    }
    shareScreenButton.disabled = true;
}

function updateUsersInRoomUi() {
    usersInRoomElement.innerHTML = "";
    usersInRoom.forEach((v) => {
        var li = document.createElement("li");
        li.appendChild(document.createTextNode(v.name));
        usersInRoomElement.appendChild(li);
    });
}

socket.on("joined", (member) => {
    start().then((pc) => createOfferAndSetLocal(pc, member));
});

socket.on("updateUsers", (members) => {
    usersInRoom = members;
    updateUsersInRoomUi();
});

socket.on("disconnected", (userId) => {
    for (let key in pcs) {
        if (pcs[key].ruid == userId) {
            remoteAudioStream.removeTrack(pcs[key].track);
            if (!remoteAudioStream.active) {
                remoteAudioStream = null;
                remoteAudio.srcObject = remoteAudioStream;
            }
            break;
        }
    }
});

socket.on("message", function(message) {
    if (message.type === "offer") {
        start().then((pc) => {
            pcs[pc.id].rid = message.pcid;
            pc.setRemoteDescription(new RTCSessionDescription(message));
            createAnswerAndSetLocal(pc, message.pcuid);
        });
    } else if (message.type === "answer") {
        pcs[message.pcrid].rid = message.pcid;
        pcs[message.pcrid].setRemoteDescription(new RTCSessionDescription(message));
    } else if (message.type === "candidate") {
        let candidate = new RTCIceCandidate({
            sdpMLineIndex: message.label,
            candidate: message.candidate,
        });
        let pc;
        for (let key in pcs) {
            if (pcs[key].rid == message.pcrid) {
                pc = pcs[key];
                break;
            }
        }
        if (pc) {
            pc.addIceCandidate(candidate);
        }
    } else if (message === "bye") {
        handleRemoteHangup();
    }
});

function sendMessage(message) {
    message.room = _room;
    message.pcuid = _uid;
    socket.emit("message", message);
}
let remoteAudio = document.querySelector("#remoteAudio");
let remoteVideo = document.querySelector("#remoteVideo");

let gotStreamPromise = navigator.mediaDevices
    .getUserMedia({
        audio: true,
        noiseSuppression: true,
        echoCancellation: true,
    })
    .then(gotStream)
    .catch(function(e) {
        console.log("getUserMedia() error: " + e.name);
    });

function gotStream(stream) {
    localAudioStream = stream;
}

async function start() {
    await gotStreamPromise;
    let pc = createPeerConnection();
    pc.addTrack(localAudioStream.getAudioTracks()[0]);
    if (localVideoStream && localVideoStream.getVideoTracks()[0]) {
        pc.addTrack(localVideoStream.getVideoTracks()[0]);
    }
    return pc;
}

function createPeerConnection() {
    try {
        let pc = new RTCPeerConnection(configuration);
        pc.onicecandidate = handleIceCandidate;
        pc.ontrack = handleRemoteTrackAdded;
        pc.id = new Date().getTime();
        pc.uid = _uid;
        pcs[pc.id] = pc;
        return pc;
    } catch (e) {
        console.log("Cannot create RTCPeerConnection object.");
        return;
    }
}

function handleIceCandidate(event) {
    if (event.candidate) {
        let candidate = {
            type: "candidate",
            label: event.candidate.sdpMLineIndex,
            id: event.candidate.sdpMid,
            candidate: event.candidate.candidate,
            pcrid: this.id,
            ruid: pcs[this.id].ruid,
        };
        sendMessage(candidate);
    }
}

function handleCreateOfferError() {}

function createOfferAndSetLocal(pc, member) {
    let offerPromise = pc.createOffer();
    offerPromise.then(
        (sdp) => {
            setLocalAndSendMessage(sdp, pc, member.uid);
        },
        (event) => {
            handleCreateOfferError(event);
        }
    );
}

function createAnswerAndSetLocal(pc, uid) {
    pc.createAnswer().then(
        (sdp) => {
            setLocalAndSendMessage(sdp, pc, uid);
        },
        (event) => {
            onCreateSessionDescriptionError(event);
        }
    );
}

function setLocalAndSendMessage(sessionDescription, pc, uid) {
    pc.setLocalDescription(sessionDescription);
    pcs[pc.id].ruid = uid;
    let sdp = {
        pcid: pc.id,
        pcrid: pc.rid,
        type: sessionDescription.type,
        sdp: sessionDescription.sdp,
        ruid: uid,
    };
    sendMessage(sdp);
}

function onCreateSessionDescriptionError(error) {
    trace("Failed to create session description: " + error.toString());
}

function handleRemoteTrackAdded(event) {
    if (event.track.kind == "audio") {
        if (remoteAudioStream) {
            remoteAudioStream.addTrack(event.track);
        } else {
            remoteAudioStream = new MediaStream([event.track]);
        }
        remoteAudio.srcObject = remoteAudioStream;
    } else {
        remoteVideoStream = new MediaStream([event.track]);
        remoteVideo.srcObject = remoteVideoStream;
    }
}

function handleRemoteStreamRemoved(event) {
    remoteAudioStream.removeTrack(event.stream.getAudioTracks()[0]);
}

function hangup() {
    stop();
}

function handleRemoteHangup() {
    stop();
}

function stop() {
    pc.close();
    pc = null;
}