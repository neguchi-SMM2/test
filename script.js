let players = [];
let currentIndex = 0;
let previousMaxVolume = 0;
let audioContext, analyser, microphone, dataArray;
let animationId;
let maxVolumeThisTurn = 0;
let silenceTimer;
let startedSpeaking = false;
let hasPassedVolumeThreshold = false;

function startLocalMode() {
  document.getElementById("modeSelection").classList.add("hidden");
  document.getElementById("setup").classList.remove("hidden");
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

function updatePlayerList() {
  const list = document.getElementById("playerList");
  list.innerHTML = players.map(name => `<div>${name}</div>`).join("");
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
  document.body.style.backgroundColor = "white";
  document.getElementById("startTurnButton").classList.remove("hidden");
  document.getElementById("nextPlayerButton").classList.add("hidden");

  // マイク起動を開始
  startAudioProcessing();
}

function startAudioProcessing() {
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      // AudioContextの作成
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioContext.createAnalyser();

      // マイクの音声ストリームを取得
      microphone = audioContext.createMediaStreamSource(stream);
      analyser.fftSize = 256;
      dataArray = new Uint8Array(analyser.frequencyBinCount);

      // マイクの音声データをanalyserに接続
      microphone.connect(analyser);

      // 音量を更新するためのupdate関数を呼び出し
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

  if (volumeRounded > maxVolumeThisTurn) {
    maxVolumeThisTurn = volumeRounded;
    document.getElementById("maxVolumeThisTurnText").textContent = maxVolumeThisTurn;
  }

  document.getElementById("currentPlayerName").textContent = `${players[currentIndex]} の番！`;
  document.getElementById("currentVolume").textContent = volumeRounded;
  document.getElementById("previousVolume").textContent = previousMaxVolume;
  document.getElementById("volumeBar").style.width = `${volumeRounded}%`;

  if (volumeRounded > previousMaxVolume) {
    document.body.style.backgroundColor = "#d4f5d4";
  } else if (volumeRounded < previousMaxVolume && previousMaxVolume > 0) {
    document.body.style.backgroundColor = "#f5d4d4";
  } else {
    document.body.style.backgroundColor = "white";
  }

  if (volumeRounded > 10) {
    hasPassedVolumeThreshold = true;
    startedSpeaking = true;
    if (silenceTimer) clearTimeout(silenceTimer);
  }

  if (hasPassedVolumeThreshold && volumeRounded <= 1) {
    if (!silenceTimer) {
      silenceTimer = setTimeout(() => {
        document.getElementById("nextPlayerButton").classList.remove("hidden");
        document.getElementById("maxVolumeDisplay").textContent = `このターンの最大音量: ${maxVolumeThisTurn}`;
        cancelAnimationFrame(animationId);
      }, 500);
    }
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

  const sliceWidth = canvas.width * 1.0 / dataArray.length;
  let x = 0;

  for (let i = 0; i < dataArray.length; i++) {
    const v = dataArray[i] / 128.0;
    const y = v * canvas.height / 2;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }

    x += sliceWidth;
  }

  ctx.lineTo(canvas.width, canvas.height / 2);
  ctx.stroke();
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
}

function endGame() {
  cancelAnimationFrame(animationId);
  document.getElementById("game").classList.add("hidden");
  document.getElementById("result").classList.remove("hidden");

  const winnerIndex = (currentIndex - 1 + players.length) % players.length;
  const winner = players[winnerIndex];
  document.getElementById("resultText").textContent = `${winner} の勝ち！`;
}

function resetGame() {
  players = [];
  currentIndex = 0;
  previousMaxVolume = 0;
  document.getElementById("setup").classList.remove("hidden");
  document.getElementById("game").classList.add("hidden");
  document.getElementById("result").classList.add("hidden");
  updatePlayerList();
}
