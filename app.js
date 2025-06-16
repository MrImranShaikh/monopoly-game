class MonopolyDashboard {
    constructor() {
        this.mqtt = null;
        this.players = [];
        this.gameState = 'idle'; // idle, setup, playing
        this.setupPhase = 'cards'; // cards, names
        this.registeredCards = [];
        this.currentTransaction = null;
        this.transactionHistory = [];
        this.chart = null;
        this.currentAmount = 0;
        
        this.init();
    }

    init() {
        this.loadGameData();
        this.setupEventListeners();
        this.connectMQTT();
        this.updateUI();
    }

    setupEventListeners() {
        // New Game button
        document.getElementById('newGameBtn').addEventListener('click', () => {
            this.startNewGame();
        });

        // Undo button
        document.getElementById('undoBtn').addEventListener('click', () => {
            this.undoLastTransaction();
        });

        // Setup modal buttons
        document.getElementById('proceedToNames').addEventListener('click', () => {
            this.proceedToPlayerNames();
        });

        document.getElementById('startGameBtn').addEventListener('click', () => {
            this.startGame();
        });

        // Transaction modal buttons
        document.getElementById('nextStepBtn').addEventListener('click', () => {
            this.nextTransactionStep();
        });

        document.getElementById('confirmTransactionBtn').addEventListener('click', () => {
            this.confirmTransaction();
        });

        document.getElementById('cancelTransaction').addEventListener('click', () => {
            this.cancelTransaction();
        });

        // Transaction form changes
        document.querySelectorAll('input[name="transactionType"], input[name="transactionWith"]').forEach(radio => {
            radio.addEventListener('change', () => {
                this.validateTransactionForm();
            });
        });

        // Virtual keypad event listeners
        document.querySelectorAll('.keypad-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.handleKeypadInput(e.target.dataset.value);
            });
        });
    }

    connectMQTT() {
        console.log('Connecting to MQTT broker...');
        this.updateConnectionStatus(false);
        
        try {
            this.mqtt = mqtt.connect('wss://broker.hivemq.com:8884/mqtt', {
                clientId: 'monopoly_dashboard_' + Math.random().toString(36).substr(2, 9),
                clean: true,
                connectTimeout: 4000,
                reconnectPeriod: 1000,
            });

            this.mqtt.on('connect', () => {
                console.log('MQTT Connected');
                this.updateConnectionStatus(true);
                this.mqtt.subscribe('monopoly/card-tap', (err) => {
                    if (err) {
                        console.error('Subscription error:', err);
                    } else {
                        console.log('Subscribed to monopoly/card-tap');
                    }
                });
            });

            this.mqtt.on('message', (topic, message) => {
                if (topic === 'monopoly/card-tap') {
                    this.handleCardTap(message.toString());
                }
            });

            this.mqtt.on('error', (error) => {
                console.error('MQTT Error:', error);
                this.updateConnectionStatus(false);
            });

            this.mqtt.on('offline', () => {
                console.log('MQTT Offline');
                this.updateConnectionStatus(false);
            });

            this.mqtt.on('reconnect', () => {
                console.log('MQTT Reconnecting...');
                this.updateConnectionStatus(false);
            });

        } catch (error) {
            console.error('MQTT Connection Error:', error);
            this.updateConnectionStatus(false);
        }
    }

    updateConnectionStatus(connected) {
        const badge = document.getElementById('connectionBadge');
        if (connected) {
            badge.className = 'badge badge-connected';
            badge.innerHTML = '<i class="bi bi-wifi"></i> Connected';
        } else {
            badge.className = 'badge badge-disconnected';
            badge.innerHTML = '<i class="bi bi-wifi-off"></i> Disconnected';
        }
    }

    handleCardTap(message) {
        try {
            const data = JSON.parse(message);
            const uid = data.uid;
            console.log('Card tapped:', uid);

            if (this.gameState === 'setup') {
                this.handleSetupCardTap(uid);
            } else if (this.gameState === 'playing') {
                this.handleGameCardTap(uid);
            }
        } catch (error) {
            console.error('Error parsing MQTT message:', error);
        }
    }

    handleSetupCardTap(uid) {
        if (this.setupPhase === 'cards') {
            if (!this.registeredCards.find(card => card.uid === uid)) {
                this.registeredCards.push({ uid });
                this.updateCardRegistrationUI();
            }
        }
    }

    handleGameCardTap(uid) {
        const player = this.players.find(p => p.uid === uid);
        if (!player) {
            this.showStatus('Unknown card tapped. Please register this card first.', 'warning');
            return;
        }

        if (!this.currentTransaction) {
            // Start new transaction
            this.startTransaction(player);
        } else if (this.currentTransaction.step === 2 && this.currentTransaction.waitingForSecondPlayer) {
            // Second player for player-to-player transaction
            if (uid === this.currentTransaction.initiator.uid) {
                this.showStatus('Cannot select the same player twice!', 'warning');
                return;
            }
            this.setSecondPlayer(player);
        }
    }

    startNewGame() {
        this.registeredCards = [];
        this.players = [];
        this.gameState = 'setup';
        this.setupPhase = 'cards';
        this.currentTransaction = null;
        this.transactionHistory = [];
        
        // Reset UI
        document.getElementById('cardRegistration').style.display = 'block';
        document.getElementById('playerNames').style.display = 'none';
        document.getElementById('proceedToNames').disabled = true;
        document.getElementById('startGameBtn').style.display = 'none';
        document.getElementById('registeredCards').innerHTML = '';
        
        // Show setup modal
        const setupModal = new bootstrap.Modal(document.getElementById('setupModal'));
        setupModal.show();
    }

    updateCardRegistrationUI() {
        const container = document.getElementById('registeredCards');
        container.innerHTML = '';
        
        this.registeredCards.forEach((card, index) => {
            const cardDiv = document.createElement('div');
            cardDiv.className = 'alert alert-success d-flex justify-content-between align-items-center mb-2';
            cardDiv.innerHTML = `
                <span><i class="bi bi-credit-card"></i> Card ${index + 1}: ${card.uid}</span>
                <button class="btn btn-sm btn-outline-danger" onclick="monopolyGame.removeCard('${card.uid}')">
                    <i class="bi bi-trash"></i>
                </button>
            `;
            container.appendChild(cardDiv);
        });
        
        document.getElementById('proceedToNames').disabled = this.registeredCards.length === 0;
    }

    removeCard(uid) {
        this.registeredCards = this.registeredCards.filter(card => card.uid !== uid);
        this.updateCardRegistrationUI();
    }

    proceedToPlayerNames() {
        this.setupPhase = 'names';
        document.getElementById('cardRegistration').style.display = 'none';
        document.getElementById('playerNames').style.display = 'block';
        
        // Create name input fields
        const container = document.getElementById('nameInputs');
        container.innerHTML = '';
        
        this.registeredCards.forEach((card, index) => {
            const inputGroup = document.createElement('div');
            inputGroup.className = 'mb-3';
            inputGroup.innerHTML = `
                <label class="form-label">Player ${index + 1} (${card.uid}):</label>
                <input type="text" class="form-control player-name-input" data-uid="${card.uid}" placeholder="Enter player name" required>
            `;
            container.appendChild(inputGroup);
        });
        
        document.getElementById('startGameBtn').style.display = 'block';
        
        // Add validation
        const inputs = container.querySelectorAll('.player-name-input');
        inputs.forEach(input => {
            input.addEventListener('input', () => {
                const allFilled = Array.from(inputs).every(inp => inp.value.trim() !== '');
                document.getElementById('startGameBtn').disabled = !allFilled;
            });
        });
    }

    startGame() {
        // Collect player names
        const nameInputs = document.querySelectorAll('.player-name-input');
        this.players = [];
        
        nameInputs.forEach(input => {
            const uid = input.dataset.uid;
            const name = input.value.trim();
            this.players.push({
                uid,
                name,
                balance: 1500
            });
        });
        
        this.gameState = 'playing';
        this.saveGameData();
        
        // Hide setup modal
        const setupModal = bootstrap.Modal.getInstance(document.getElementById('setupModal'));
        setupModal.hide();
        
        // Show dashboard
        this.updateUI();
        this.showStatus('Game started! Each player has ₹1500. Tap a card to begin transactions.', 'success');
    }

    startTransaction(player) {
        this.currentTransaction = {
            initiator: player,
            step: 1,
            type: null,
            with: null,
            amount: null,
            secondPlayer: null,
            waitingForSecondPlayer: false
        };
        
        this.currentAmount = 0;
        document.getElementById('amountDisplay').textContent = '₹0';
        
        document.getElementById('transactionPlayerName').textContent = `Player: ${player.name}`;
        document.getElementById('transactionStep1').style.display = 'block';
        document.getElementById('transactionStep2').style.display = 'none';
        document.getElementById('transactionConfirmation').style.display = 'none';
        document.getElementById('nextStepBtn').style.display = 'inline-block';
        document.getElementById('confirmTransactionBtn').style.display = 'none';
        
        // Reset form
        document.querySelectorAll('input[name="transactionType"]').forEach(radio => radio.checked = false);
        document.querySelectorAll('input[name="transactionWith"]').forEach(radio => radio.checked = false);
        document.getElementById('nextStepBtn').disabled = true;
        
        const transactionModal = new bootstrap.Modal(document.getElementById('transactionModal'));
        transactionModal.show();
    }

    validateTransactionForm() {
        const type = document.querySelector('input[name="transactionType"]:checked');
        const withOption = document.querySelector('input[name="transactionWith"]:checked');
        
        const isValid = type && withOption && this.currentAmount > 0;
        document.getElementById('nextStepBtn').disabled = !isValid;
    }

    nextTransactionStep() {
        const type = document.querySelector('input[name="transactionType"]:checked').value;
        const withOption = document.querySelector('input[name="transactionWith"]:checked').value;
        
        this.currentTransaction.type = type;
        this.currentTransaction.with = withOption;
        this.currentTransaction.amount = this.currentAmount;
        
        if (withOption === 'bank') {
            // Direct transaction with bank
            this.currentTransaction.step = 3;
            this.showTransactionConfirmation();
        } else {
            // Player-to-player transaction
            this.currentTransaction.step = 2;
            this.currentTransaction.waitingForSecondPlayer = true;
            
            document.getElementById('transactionStep1').style.display = 'none';
            document.getElementById('transactionStep2').style.display = 'block';
            document.getElementById('nextStepBtn').style.display = 'none';
        }
    }

    setSecondPlayer(player) {
        this.currentTransaction.secondPlayer = player;
        this.currentTransaction.waitingForSecondPlayer = false;
        this.currentTransaction.step = 3;
        this.showTransactionConfirmation();
    }

    showTransactionConfirmation() {
        const { initiator, type, with: withOption, amount, secondPlayer } = this.currentTransaction;
        
        document.getElementById('transactionStep1').style.display = 'none';
        document.getElementById('transactionStep2').style.display = 'none';
        document.getElementById('transactionConfirmation').style.display = 'block';
        document.getElementById('nextStepBtn').style.display = 'none';
        document.getElementById('confirmTransactionBtn').style.display = 'inline-block';
        
        let summary = '';
        if (withOption === 'bank') {
            if (type === 'pay') {
                summary = `<strong>${initiator.name}</strong> pays <span class="currency">₹${amount.toLocaleString()}</span> to the Bank`;
            } else {
                summary = `<strong>${initiator.name}</strong> receives <span class="currency">₹${amount.toLocaleString()}</span> from the Bank`;
            }
        } else {
            if (type === 'pay') {
                summary = `<strong>${initiator.name}</strong> pays <span class="currency">₹${amount.toLocaleString()}</span> to <strong>${secondPlayer.name}</strong>`;
            } else {
                summary = `<strong>${initiator.name}</strong> receives <span class="currency">₹${amount.toLocaleString()}</span> from <strong>${secondPlayer.name}</strong>`;
            }
        }
        
        document.getElementById('transactionSummary').innerHTML = summary;
    }

    confirmTransaction() {
        const { initiator, type, with: withOption, amount, secondPlayer } = this.currentTransaction;
        
        // Create transaction record for undo
        const transactionRecord = {
            timestamp: Date.now(),
            initiator: { ...initiator },
            type,
            with: withOption,
            amount,
            secondPlayer: secondPlayer ? { ...secondPlayer } : null,
            balanceChanges: []
        };
        
        if (withOption === 'bank') {
            const oldBalance = initiator.balance;
            if (type === 'pay') {
                initiator.balance -= amount;
            } else {
                initiator.balance += amount;
            }
            transactionRecord.balanceChanges.push({
                player: { ...initiator },
                oldBalance,
                newBalance: initiator.balance
            });
        } else {
            // Player-to-player transaction
            const initiatorOldBalance = initiator.balance;
            const secondPlayerOldBalance = secondPlayer.balance;
            
            if (type === 'pay') {
                initiator.balance -= amount;
                secondPlayer.balance += amount;
            } else {
                initiator.balance += amount;
                secondPlayer.balance -= amount;
            }
            
            transactionRecord.balanceChanges.push(
                {
                    player: { ...initiator },
                    oldBalance: initiatorOldBalance,
                    newBalance: initiator.balance
                },
                {
                    player: { ...secondPlayer },
                    oldBalance: secondPlayerOldBalance,
                    newBalance: secondPlayer.balance
                }
            );
        }
        
        this.transactionHistory.push(transactionRecord);
        this.currentTransaction = null;
        
        // Save and update UI
        this.saveGameData();
        this.updateUI();
        
        // Hide modal
        const transactionModal = bootstrap.Modal.getInstance(document.getElementById('transactionModal'));
        transactionModal.hide();
        
        this.showStatus('Transaction completed successfully!', 'success');
        document.getElementById('undoBtn').disabled = false;
    }

    cancelTransaction() {
        this.currentTransaction = null;
        const transactionModal = bootstrap.Modal.getInstance(document.getElementById('transactionModal'));
        transactionModal.hide();
    }

    undoLastTransaction() {
        if (this.transactionHistory.length === 0) {
            this.showStatus('No transactions to undo.', 'warning');
            return;
        }
        
        const lastTransaction = this.transactionHistory.pop();
        
        // Restore balances
        lastTransaction.balanceChanges.forEach(change => {
            const player = this.players.find(p => p.uid === change.player.uid);
            if (player) {
                player.balance = change.oldBalance;
            }
        });
        
        this.saveGameData();
        this.updateUI();
        this.showStatus('Last transaction undone successfully!', 'info');
        
        if (this.transactionHistory.length === 0) {
            document.getElementById('undoBtn').disabled = true;
        }
    }

    updateUI() {
        if (this.gameState === 'playing') {
            document.getElementById('gameDashboard').style.display = 'block';
            this.updatePlayersTable();
            this.updateChart();
        } else {
            document.getElementById('gameDashboard').style.display = 'none';
        }
    }

    updatePlayersTable() {
        const tbody = document.getElementById('playersTableBody');
        tbody.innerHTML = '';
        
        this.players.forEach(player => {
            const row = document.createElement('tr');
            row.className = 'player-row';
            row.innerHTML = `
                <td><strong>${player.name}</strong></td>
                <td><code>${player.uid}</code></td>
                <td class="text-end"><span class="currency">₹${player.balance.toLocaleString()}</span></td>
            `;
            tbody.appendChild(row);
        });
    }

    updateChart() {
        const ctx = document.getElementById('balanceChart').getContext('2d');
        
        if (this.chart) {
            this.chart.destroy();
        }
        
        const data = {
            labels: this.players.map(p => p.name),
            datasets: [{
                label: 'Balance (₹)',
                data: this.players.map(p => p.balance),
                backgroundColor: this.players.map((_, index) => {
                    const colors = [
                        'rgba(102, 126, 234, 0.8)',
                        'rgba(118, 75, 162, 0.8)',
                        'rgba(78, 205, 196, 0.8)',
                        'rgba(255, 107, 107, 0.8)',
                        'rgba(255, 193, 7, 0.8)',
                        'rgba(40, 167, 69, 0.8)'
                    ];
                    return colors[index % colors.length];
                }),
                borderColor: this.players.map((_, index) => {
                    const colors = [
                        'rgba(102, 126, 234, 1)',
                        'rgba(118, 75, 162, 1)',
                        'rgba(78, 205, 196, 1)',
                        'rgba(255, 107, 107, 1)',
                        'rgba(255, 193, 7, 1)',
                        'rgba(40, 167, 69, 1)'
                    ];
                    return colors[index % colors.length];
                }),
                borderWidth: 2,
                borderRadius: 8,
                borderSkipped: false,
            }]
        };
        
        this.chart = new Chart(ctx, {
            type: 'bar',
            data: data,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '₹' + value.toLocaleString();
                            }
                        }
                    }
                },
                animation: {
                    duration: 1000,
                    easing: 'easeInOutQuart'
                }
            }
        });
    }

    showStatus(message, type = 'info') {
        const statusDiv = document.getElementById('statusMessage');
        const icons = {
            success: 'bi-check-circle',
            warning: 'bi-exclamation-triangle',
            error: 'bi-x-circle',
            info: 'bi-info-circle'
        };
        
        statusDiv.innerHTML = `<i class="bi ${icons[type]}"></i> ${message}`;
        
        // Add temporary color change
        const originalClass = statusDiv.className;
        statusDiv.className = `status-message bg-${type === 'error' ? 'danger' : type}`;
        
        setTimeout(() => {
            statusDiv.className = originalClass;
        }, 3000);
    }

    saveGameData() {
        const gameData = {
            gameState: this.gameState,
            players: this.players,
            transactionHistory: this.transactionHistory
        };
        localStorage.setItem('monopolyGameData', JSON.stringify(gameData));
    }

    loadGameData() {
        try {
            const saved = localStorage.getItem('monopolyGameData');
            if (saved) {
                const gameData = JSON.parse(saved);
                this.gameState = gameData.gameState || 'idle';
                this.players = gameData.players || [];
                this.transactionHistory = gameData.transactionHistory || [];
                
                if (this.transactionHistory.length > 0) {
                    document.getElementById('undoBtn').disabled = false;
                }
            }
        } catch (error) {
            console.error('Error loading game data:', error);
            this.gameState = 'idle';
            this.players = [];
            this.transactionHistory = [];
        }
    }

    handleKeypadInput(value) {
        const display = document.getElementById('amountDisplay');
        
        if (value === 'clear') {
            this.currentAmount = 0;
        } else {
            // Append the digit to current amount
            const currentStr = this.currentAmount.toString();
            const newStr = currentStr + value;
            this.currentAmount = parseInt(newStr) || 0;
            
            // Limit to reasonable amount (max 999999)
            if (this.currentAmount > 999999) {
                this.currentAmount = 999999;
            }
        }
        
        display.textContent = `₹${this.currentAmount.toLocaleString()}`;
        this.validateTransactionForm();
    }
}

// Initialize the game
let monopolyGame;
document.addEventListener('DOMContentLoaded', () => {
    monopolyGame = new MonopolyDashboard();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js')
      .then(reg => console.log("SW registered!", reg))
      .catch(err => console.error("SW registration failed:", err));
  });
}
