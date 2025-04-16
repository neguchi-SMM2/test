let players = [];
let currentIndex = 0;
let previousMaxVolume = 0;
let audioContext, analyser, microphone, dataArray;
let animationId;
let maxVolumeThisTurn = 0;
let silenceTimer;
let hasPassedVolumeThreshold = false;
let volumeSamples = [];

let isOnline = false;
let socket, peer, roomId, username;
let localStream;
let isHost = false;

function startLocalMode() {
  isOnline = false;
  document.getElementById("modeSelection").classList.add("hidden");
  document.getElementById("setup").classList.remove("hidden");
  document.getElementById("startGameButton").classList.remove("hidden");
  updatePlayerList();
}

function startOnlineMode() {
  isOnline = true;
  document.getElementById("modeSelection").classList.add("hidden");
  document.getElementById("onlineSetup").classList.remove("hidden");
}

function connectToRoom() {
  roomId = document.getElementById("roomInput").value.trim();
  username = document.getElementById("usernameInput").value.trim();
  if (!roomId || !username) {
    alert("ルーム名とユーザー名を入力してください");
    return;
  }

  socket = new WebSocket("wss://mozzarella-server.onrender.com");

  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({ type: "join", roomId, username }));
    document.getElementById("onlineStatus").textContent = "接続中...";
  });

  socket.addEventListener("message", async (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "initPeer") {
      isHost = data.initiator;
      if (isHost) {
        document.getElementById("startGameButton").classList.remove("hidden");
      }
      await setupPeer(data.initiator);
    }

    if (data.type === "playerList") {
      players = data.players;
      updatePlayerList();
      updateOnlinePlayerDisplay(); // オンライン設定画面用
      if (isHost) {
        document.getElementById("startGameButton").classList.remove("hidden");
      }
    }

    if (data.type === "startGame") {
      document.getElementById("onlineSetup").classList.add("hidden");
      document.getElementById("setup").classList.remove("hidden");
    }

    if (data.type === "turnData") {
      currentIndex = data.currentIndex;
      previousMaxVolume = data.previousMaxVolume;
    }

    if (data.type === "signal") {
      peer.signal(data.signal);
    }

    if (data.type === "chat") {
      const chatBox = document.getElementById("chatMessages");
      chatBox.innerHTML += `<div><strong>${data.username}:</strong> ${data.message}</div>`;
      chatBox.scrollTop = chatBox.scrollHeight;
    }
  });
}

function setupPeer(initiator) {
  return navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    localStream = stream;
    peer = new SimplePeer({ initiator, trickle: false, stream });

    peer.on("signal", data => {
      socket.send(JSON.stringify({ type: "signal", roomId, signal: data }));
    });

    peer.on("stream", stream => {
      document.getElementById("remoteAudio").srcObject = stream;
    });
  });
}

function updateOnlinePlayerDisplay() {
  const el = document.getElementById("onlinePlayers");
  el.innerHTML = "<h4>ルーム参加者:</h4>" +
    players.map(name => `<div>${name}</div>`).join("");
}

function addPlayer() {
  const nameInput = document.getElementById("playerName");
  const name = nameInput.value.trim();
  if (name) {
    players.push(name);
    updatePlayerList();
    nameInput.value = "";
  }
}

function removePlayer(index) {
  players.splice(index, 1);
  updatePlayerList();
}

function clearPlayers() {
  players = [];
  updatePlayerList();
}

function updatePlayerList() {
  const list = document.getElementById("playerList");
  list.innerHTML = players.map((name, i) =>
    `<div class="player-entry"><span>${name}</span>${!isOnline ? `<button onclick="removePlayer(${i})">削除</button>` : ""}</div>`
  ).join("");
}

function startGame() {
  if (players.length < 2) {
    alert("プレイヤーは2人以上必要です！");
    return;
  }
  currentIndex = 0;
  previousMaxVolume = 0;
  document.getElementById("setup").classList.add("hidden");
  document.getElementById("game").classList.remove("hidden");
  document.getElementById("chat").classList.toggle("hidden", !isOnline);
  document.body.style.backgroundColor = "#fff8e1";
  document.getElementById("startTurnButton").classList.remove("hidden");
  document.getElementById("nextPlayerButton").classList.add("hidden");

  if (isOnline && isHost) {
    socket.send(JSON.stringify({ type: "startGame" }));
  }
}

function prepareTurn() {
  document.getElementById("startTurnButton").classList.add("hidden");
  document.getElementById("nextPlayerButton").classList.add("hidden");
  maxVolumeThisTurn = 0;
  volumeSamples = [];
  hasPassedVolumeThreshold = false;
  silenceTimer = null;
  document.getElementById("maxVolumeDisplay").textContent = "";
  document.getElementById("maxVolumeThisTurnText").textContent = "0";
  document.body.style.backgroundColor = "#fff8e1";
  document.getElementById("currentPlayerName").textContent = `${players[currentIndex]} の番！`;
  startMic();
}

function startMic() {
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioContext.createAnalyser();
      microphone = audioContext.createMediaStreamSource(stream);
      analyser.fftSize = 256;
      dataArray = new Uint8Array(analyser.frequencyBinCount);
      microphone.connect(analyser);
      update();
    })
    .catch(err => {
      console.error("マイクのアクセスが許可されていないか、エラーが発生しました:", err);
      alert("マイクのアクセスを許可してください。ページを再読み込みしてください。");
    });
}

function update() {
  analyser.getByteTimeDomainData(dataArray);
  drawWaveform(dataArray);

  let sum = 0;
  for (let i = 0; i < dataArray.length; i++) {
    const v = (dataArray[i] - 128) / 128;
    sum += v * v;
  }
  const volume = Math.sqrt(sum / dataArray.length);
  const volumeRounded = Math.round(volume * 100);

  if (volumeRounded >= 4) {
    volumeSamples.push(volumeRounded);
  }

  const averageVolume = volumeSamples.length > 0
    ? Math.round(volumeSamples.reduce((a, b) => a + b, 0) / volumeSamples.length)
    : 0;

  maxVolumeThisTurn = averageVolume;
  document.getElementById("maxVolumeThisTurnText").textContent = maxVolumeThisTurn;
  document.getElementById("currentVolume").textContent = volumeRounded;
  document.getElementById("previousVolume").textContent = previousMaxVolume;
  document.getElementById("volumeBar").style.width = `${volumeRounded}%`;

  if (maxVolumeThisTurn > previousMaxVolume) {
    document.body.style.backgroundColor = "#d4f5d4"; // 緑
  } else if (maxVolumeThisTurn < previousMaxVolume && previousMaxVolume > 0) {
    document.body.style.backgroundColor = "#f5d4d4"; // 赤
  } else {
    document.body.style.backgroundColor = "#fff8e1"; // 肌色
  }

  if (volumeRounded > 4) {
    hasPassedVolumeThreshold = true;
    if (silenceTimer) clearTimeout(silenceTimer);
  }

  if (hasPassedVolumeThreshold && volumeRounded <= 1) {
    if (!silenceTimer) {
      silenceTimer = setTimeout(() => {
        document.getElementById("nextPlayerButton").classList.remove("hidden");
        document.getElementById("maxVolumeDisplay").textContent = `このターンの平均音量: ${maxVolumeThisTurn}`;
        cancelAnimationFrame(animationId);

        if (isOnline && isHost) {
          socket.send(JSON.stringify({
            type: "turnData",
            currentIndex,
            previousMaxVolume: maxVolumeThisTurn,
          }));
        }
      }, 500);
    }
  } else {
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = null;
  }

  animationId = requestAnimationFrame(update);
}

function drawWaveform(dataArray) {
  const canvas = document.getElementById("waveform");
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "lime";
  ctx.beginPath();
  const sliceWidth = canvas.width / dataArray.length;
  let x = 0;

  for (let i = 0; i < dataArray.length; i++) {
    const v = dataArray[i] / 128.0;
    const y = v * canvas.height / 2;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    x += sliceWidth;
  }

  ctx.lineTo(canvas.width, canvas.height / 2);
  ctx.stroke();
}

function nextTurn() {
  if (maxVolumeThisTurn < previousMaxVolume && previousMaxVolume > 0) {
    endGame();
    return;
  }
  previousMaxVolume = maxVolumeThisTurn;
  currentIndex = (currentIndex + 1) % players.length;
  document.getElementById("nextPlayerButton").classList.add("hidden");
  document.getElementById("startTurnButton").classList.remove("hidden");
  document.getElementById("maxVolumeDisplay").textContent = "";
}

function endGame() {
  cancelAnimationFrame(animationId);
  document.getElementById("game").classList.add("hidden");
  document.getElementById("result").classList.remove("hidden");
  const loser = players[currentIndex];
  document.getElementById("resultText").textContent = `${loser} の負け！`;
}

function resetGame() {
  currentIndex = 0;
  previousMaxVolume = 0;
  document.getElementById("setup").classList.remove("hidden");
  document.getElementById("game").classList.add("hidden");
  document.getElementById("result").classList.add("hidden");
  updatePlayerList();
}

function sendChat() {
  const input = document.getElementById("chatInput");
  const message = input.value.trim();
  if (!message) return;
  socket.send(JSON.stringify({ type: "chat", message, username }));
  input.value = "";
}
