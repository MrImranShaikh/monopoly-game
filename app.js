const client = mqtt.connect("ws://localhost:9001");

let playerList = []; // { uid: "UID123", name: "", balance: 1500 }
let initiatorUID = null;
let targetUID = null;
let transactionHistory = [];

client.on("connect", () => {
  console.log("Connected to MQTT");
  client.subscribe("monopoly/card-tap");
});

client.on("message", (topic, message) => {
  const { uid } = JSON.parse(message.toString());
  handleCardTap(uid);
});

$(document).ready(() => {
  loadFromLocal();
  renderChart();
  updateTable();

 $("#newGameBtn").click(() => {
  // Clear everything
  playerList = [];
  initiatorUID = null;
  targetUID = null;
  localStorage.removeItem("playerList");
  localStorage.removeItem("transactionHistory");

  // Reset chart and table
  if (window.balanceChart) window.balanceChart.destroy();
  $("#playerTableBody").empty();
  $("#cardUIDList").empty();

  // Show card tapping modal
  new bootstrap.Modal(document.getElementById("tapCardsModal")).show();
});

  $("#proceedToNames").click(() => {
    let inputs = "";
    playerList.forEach((p, i) => {
      inputs += `<input class='form-control my-2' data-uid='${p.uid}' placeholder='Player ${i + 1} Name'>`;
    });
    $("#nameInputs").html(inputs);
    bootstrap.Modal.getInstance(document.getElementById("tapCardsModal")).hide();
    new bootstrap.Modal(document.getElementById("nameInputModal")).show();
  });

  $("#startGameBtn").click(() => {
    $("#nameInputs input").each(function (i) {
      const uid = $(this).data("uid");
      const name = $(this).val().trim() || `Player ${i + 1}`;
      playerList[i] = { uid, name, balance: 1500 };
    });
    saveToLocal();
    renderChart();
    updateTable();
    bootstrap.Modal.getInstance(document.getElementById("nameInputModal")).hide();
  });

  $("#confirmTxnSetup").click(() => {
    const amount = parseInt($("#txnAmount").val());
    const type = $("input[name='txnType']:checked").val();
    const target = $("#txnTarget").val();
    if (target === "Bank") {
      applyTransaction(initiatorUID, null, type, amount);
      bootstrap.Modal.getInstance(document.getElementById("transactionInitModal")).hide();
    } else {
      // wait for second tap
    }
  });

  $("#finalizeTxn").click(() => {
    const amount = parseInt($("#txnAmount").val());
    const type = $("input[name='txnType']:checked").val();
    applyTransaction(initiatorUID, targetUID, type, amount);
    bootstrap.Modal.getInstance(document.getElementById("transactionConfirmModal")).hide();
    initiatorUID = targetUID = null;
  });

  $("#undoBtn").click(() => {
    undoTransaction();
  });
});

function handleCardTap(uid) {
  if (!playerList.find(p => p.uid === uid)) {
    playerList.push({ uid, name: `UID ${uid}`, balance: 1500 });
    $("#cardUIDList").append(`<li class='list-group-item'>Card ${playerList.length}: ${uid}</li>`);
    return;
  }

  if (!initiatorUID) {
    initiatorUID = uid;
    const player = playerList.find(p => p.uid === uid);
    $("#initiatorName").text(`Initiator: ${player.name}`);
    new bootstrap.Modal(document.getElementById("transactionInitModal")).show();
  } else if (!targetUID && uid !== initiatorUID) {
    targetUID = uid;
    const from = playerList.find(p => p.uid === initiatorUID);
    const to = playerList.find(p => p.uid === targetUID);
    const type = $("input[name='txnType']:checked").val();
    const amt = $("#txnAmount").val();
    $("#txnSummary").html(`${from.name} will ${type} ₹${amt} to/from ${to.name}`);
    new bootstrap.Modal(document.getElementById("transactionConfirmModal")).show();
  }
}

function applyTransaction(uid1, uid2, type, amount) {
  const p1 = playerList.find(p => p.uid === uid1);
  const p2 = uid2 ? playerList.find(p => p.uid === uid2) : null;

  // Store history before applying
  const snapshot = JSON.stringify(playerList);
  transactionHistory.push(snapshot);
  localStorage.setItem("transactionHistory", JSON.stringify(transactionHistory));

  if (type === "pay") {
    p1.balance -= amount;
    if (p2) p2.balance += amount;
  } else {
    p1.balance += amount;
    if (p2) p2.balance -= amount;
  }

  saveToLocal();
  renderChart();
  updateTable();
}

function undoTransaction() {
  if (transactionHistory.length === 0) return alert("No transaction to undo!");

  const lastState = transactionHistory.pop();
  playerList = JSON.parse(lastState);
  saveToLocal();
  renderChart();
  updateTable();
  localStorage.setItem("transactionHistory", JSON.stringify(transactionHistory));
}

function renderChart() {
  const ctx = document.getElementById("balanceChart").getContext("2d");
  if (window.balanceChart) window.balanceChart.destroy();
  window.balanceChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: playerList.map(p => p.name),
      datasets: [{
        label: "Balance",
        data: playerList.map(p => p.balance),
        backgroundColor: "#4e73df"
      }]
    },
    options: { scales: { y: { beginAtZero: true } } }
  });
}

function updateTable() {
  const tbody = playerList.map(p => `<tr><td>${p.name}</td><td>₹${p.balance}</td></tr>`).join("");
  $("#playerTableBody").html(tbody);
}