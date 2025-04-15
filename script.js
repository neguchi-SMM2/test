let players = [];
let currentPlayerIndex = 0;
let maxVolume = 0;
let localStream, audioContext, analyser, dataArray, mediaRecorder;
let isRecording = false;
let volumeTimeout;
let isOnline = false;
let socket, peer, roomId;
let remoteStream;

const currentVolumeSpan = document.getElementById("currentVolume");
const previousVolumeSpan = document.getElementById("previousVolume");
const maxVolumeThisTurnText = document.getElementById("maxVolumeThisTurnText");
const currentPlayerName = document.getElementById("currentPlayerName");
const volumeBar = document.getElementById("volumeBar");
const waveformCanvas = document.getElementById("waveform");
const waveformCtx = waveformCanvas.getContext("2d");

function startLocalMode() {
  document.getElementById("modeSelection").classList.add("hidden");
  document.getElementById("setup").classList.remove("hidden");
}

function startOnlineMode() {
  isOnline = true;
  document.getElementById("modeSelection").classList.add("hidden");
  document.getElementById("onlineSetup").classList.remove("hidden");
  initSocket();
}

function initSocket() {
  socket = io();

  socket.on("ready", () => {
    document.getElementById("onlineStatus").textContent = "相手を待っています...";
  });

  socket.on("offer", async (offer) => {
    createPeer(false);
    await peer.signal(offer);
  });

  socket.on("answer", async (answer) => {
    await peer.signal(answer);
  });

  socket.on("candidate", (candidate) => {
    if (peer) peer.signal(candidate);
  });
}

function joinRoom() {
  roomId = document.getElementById("roomId").value;
  socket.emit("join", roomId);
  createPeer(true);
  document.getElementById("onlineSetup").classList.add("hidden");
  document.getElementById("setup").classList.remove("hidden");
}

function createPeer(isInitiator) {
  navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(stream => {
    localStream = stream;
    peer = new SimplePeer({
      initiator: isInitiator,
      trickle: false,
      stream: localStream
    });

    peer.on("signal", data => {
      socket.emit("signal", { roomId, data });
    });

    peer.on("stream", stream => {
      remoteStream = stream;
      const audio = new Audio();
      audio.srcObject = stream;
      audio.play();
    });
  });
}

function addPlayer() {
  const name = document.getElementById("playerName").value.trim();
  if (name) {
    players.push(name);
    updatePlayerList();
    document.getElementById("playerName").value = "";
  }
}

function updatePlayerList() {
  const playerList = document.getElementById("playerList");
  playerList.innerHTML = "";
  players.forEach((name, index) => {
    const div = document.createElement("div");
    div.textContent = name;
    const delBtn = document.createElement("button");
    delBtn.textContent = "削除";
    delBtn.onclick = () => {
      players.splice(index, 1);
      updatePlayerList();
    };
    div.appendChild(delBtn);
    playerList.appendChild(div);
  });
}

function clearPlayers() {
  players = [];
  updatePlayerList();
}

function startGame() {
  if (players.length < 2) {
    alert("プレイヤーは2人以上必要です！");
    return;
  }
  document.getElementById("setup").classList.add("hidden");
  document.getElementById("game").classList.remove("hidden");
  startAudioProcessing();
  showCurrentPlayer();
}

function showCurrentPlayer() {
  currentPlayerName.textContent = `${players[currentPlayerIndex]} の番です`;
  previousVolumeSpan.textContent = maxVolume;
  maxVolumeThisTurnText.textContent = "0";
}

function prepareTurn() {
  document.getElementById("startTurnButton").classList.add("hidden");
  maxVolume = 0;
  maxVolumeThisTurnText.textContent = "0";
  isRecording = true;
}

function nextTurn() {
  currentPlayerIndex++;
  if (currentPlayerIndex >= players.length) {
    endGame();
    return;
  }
  showCurrentPlayer();
  document.getElementById("startTurnButton").classList.remove("hidden");
  document.getElementById("nextPlayerButton").classList.add("hidden");
  document.getElementById("maxVolumeDisplay").textContent = "";
}

function endGame() {
  document.getElementById("game").classList.add("hidden");
  document.getElementById("result").classList.remove("hidden");

  const min = Math.min(...volumeHistory);
  const loserIndex = volumeHistory.indexOf(min);
  const loser = players[loserIndex];

  document.getElementById("resultText").textContent = `${loser} が負けです！`;
}

function resetGame() {
  currentPlayerIndex = 0;
  volumeHistory = [];
  maxVolume = 0;
  isRecording = false;
  document.getElementById("result").classList.add("hidden");
  document.getElementById("game").classList.remove("hidden");
  showCurrentPlayer();
  document.getElementById("startTurnButton").classList.remove("hidden");
  document.getElementById("nextPlayerButton").classList.add("hidden");
  document.getElementById("maxVolumeDisplay").textContent = "";
}

let volumeHistory = [];

function startAudioProcessing() {
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioContext.createMediaStreamSource(localStream);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  const bufferLength = analyser.frequencyBinCount;
  dataArray = new Uint8Array(bufferLength);
  source.connect(analyser);
  draw();
}

function draw() {
  requestAnimationFrame(draw);
  analyser.getByteTimeDomainData(dataArray);

  waveformCtx.clearRect(0, 0, waveformCanvas.width, waveformCanvas.height);
  waveformCtx.beginPath();
  const sliceWidth = waveformCanvas.width / dataArray.length;
  let x = 0;
  for (let i = 0; i < dataArray.length; i++) {
    const v = dataArray[i] / 128.0;
    const y = (v * waveformCanvas.height) / 2;
    if (i === 0) {
      waveformCtx.moveTo(x, y);
    } else {
      waveformCtx.lineTo(x, y);
    }
    x += sliceWidth;
  }
  waveformCtx.strokeStyle = "black";
  waveformCtx.stroke();

  const rms = Math.sqrt(dataArray.reduce((sum, val) => sum + Math.pow(val - 128, 2), 0) / dataArray.length);
  const volume = Math.round((rms / 128) * 100);
  currentVolumeSpan.textContent = volume;
  volumeBar.style.width = `${volume}%`;

  if (isRecording) {
    if (volume > maxVolume) {
      maxVolume = volume;
      maxVolumeThisTurnText.textContent = volume;
    }

    if (volume >= 4) {
      clearTimeout(volumeTimeout);
      volumeTimeout = setTimeout(() => {
        isRecording = false;
        volumeHistory.push(maxVolume);
        document.getElementById("nextPlayerButton").classList.remove("hidden");
        document.getElementById("maxVolumeDisplay").textContent = `最大音量: ${maxVolume}`;
      }, 500);
    }
  }

  if (isOnline && peer && peer.connected) {
    peer.send(JSON.stringify({ volume }));
  }
}
