let players = [];
let currentIndex = 0;
let previousMaxVolume = 0;
let audioContext, analyser, microphone, dataArray;
let animationId;
let maxVolumeThisTurn = 0;
let silenceTimer;
let startedSpeaking = false;
let hasPassedVolumeThreshold = false;
let roomId, socket, peer, localStream;
let username = "";
let isHost = false;

function startOnlineMode() {
  document.getElementById("modeSelection").classList.add("hidden");
  document.getElementById("onlineSetup").classList.remove("hidden");
}

function startLocalMode() {
  document.getElementById("modeSelection").classList.add("hidden");
  document.getElementById("setup").classList.remove("hidden");
}

function updatePlayerList() {
  const list = document.getElementById("playerList");
  list.innerHTML = players.map(name => `<div>${name}</div>`).join("");
}

function connectToRoom() {
  roomId = document.getElementById("roomInput").value.trim();
  username = document.getElementById("usernameInput").value.trim();
  if (!roomId || !username) return alert("ルーム名とユーザー名を入力してください");

  socket = new WebSocket("wss://mozzarella-server.onrender.com");

  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({ type: "join", roomId, username }));
    document.getElementById("onlineStatus").textContent = "接続中…";
  });

  socket.addEventListener("message", async (event) => {
    const msg = JSON.parse(event.data);

    if (msg.type === "initPeer") {
      isHost = msg.initiator;
      if (isHost) {
        document.getElementById("startGameButton").classList.remove("hidden");
      }
    }

    if (msg.type === "playerList") {
      players = msg.players;
      updatePlayerList();
    }

    if (msg.type === "startGame") {
      document.getElementById("onlineSetup").classList.add("hidden");
      document.getElementById("setup").classList.remove("hidden");
      if (!isHost) {
        document.getElementById("startGameButton").classList.add("hidden");
      }
      document.getElementById("chat").classList.remove("hidden");
    }

    if (msg.type === "turnData") {
      currentIndex = msg.currentIndex;
      previousMaxVolume = msg.previousMaxVolume;
    }

    if (msg.type === "signal" && peer) {
      peer.signal(msg.signal);
    }

    if (msg.type === "chat") {
      const chatBox = document.getElementById("chatMessages");
      const line = document.createElement("div");
      line.textContent = `${msg.username}: ${msg.message}`;
      chatBox.appendChild(line);
      chatBox.scrollTop = chatBox.scrollHeight;
    }
  });
}

function sendChat() {
  const input = document.getElementById("chatInput");
  const message = input.value.trim();
  if (message && socket) {
    socket.send(JSON.stringify({ type: "chat", username, message }));
    input.value = "";
  }
}

function startGame() {
  if (players.length < 2) {
    alert("プレイヤーは2人以上必要です！");
    return;
  }

  if (socket && isHost) {
    socket.send(JSON.stringify({ type: "startGame", roomId }));
  }

  currentIndex = 0;
  previousMaxVolume = 0;
  document.getElementById("setup").classList.add("hidden");
  document.getElementById("game").classList.remove("hidden");
  document.body.style.backgroundColor = "white";
  document.getElementById("startTurnButton").classList.remove("hidden");
  document.getElementById("nextPlayerButton").classList.add("hidden");
  startMic();
}

function nextTurn() {
  if (maxVolumeThisTurn < previousMaxVolume) {
    endGame();
    return;
  }

  previousMaxVolume = maxVolumeThisTurn;
  currentIndex = (currentIndex + 1) % players.length;
  document.getElementById("nextPlayerButton").classList.add("hidden");
  document.getElementById("startTurnButton").classList.remove("hidden");
  document.getElementById("maxVolumeDisplay").textContent = "";

  if (socket) {
    socket.send(JSON.stringify({
      type: "turnData",
      currentIndex,
      previousMaxVolume,
      roomId,
    }));
  }
}
