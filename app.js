const client = mqtt.connect('wss://test.mosquitto.org:8081');

client.on('connect', () => {
  console.log('Connected to MQTT broker');
  client.subscribe('monopoly/card-tap');
});

client.on('message', (topic, payload) => {
  const msg = JSON.parse(payload.toString());
  $('#status').html(`Card Tap from UID: ${msg.uid}`);
});