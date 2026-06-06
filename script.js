// Generate random room name if needed
if (!location.hash) {
  location.hash = Math.floor(Math.random() * 0xFFFFFF).toString(16);
}
const roomHash = location.hash.substring(1);

// Replace with your own channel ID
const drone = new ScaleDrone('2xmbUiTsqTzukyf7');
// Room name needs to be prefixed with 'observable-'
const roomName = 'observable-' + roomHash;
const configuration = {
  iceServers: [{
    urls: 'stun:stun.l.google.com:19302'
  }]
};
let room;
let pc;
let localStream;

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const errorOverlay = document.getElementById('errorOverlay');
const errorText = document.getElementById('errorText');

function onSuccess() {};
function onError(error) {
  console.error(error);
  if (errorOverlay && error.name) {
     errorOverlay.style.display = 'flex';
     errorText.innerHTML = `Error: ${error.message} <br/><br/>To use the camera locally, make sure you are using <strong>localhost</strong> or <strong>HTTPS</strong>.`;
  }
};

drone.on('open', error => {
  if (error) {
    return console.error(error);
  }
  room = drone.subscribe(roomName);
  room.on('open', error => {
    if (error) {
      onError(error);
    }
  });
  // We're connected to the room and received an array of 'members'
  // connected to the room (including us). Signaling server is ready.
  room.on('members', members => {
    console.log('MEMBERS', members);
    // If we are the second user to connect to the room we will be creating the offer
    const isOfferer = members.length === 2;
    startWebRTC(isOfferer);
  });
});

// Send signaling data via Scaledrone
function sendMessage(message) {
  drone.publish({
    room: roomName,
    message
  });
}

function startWebRTC(isOfferer) {
  pc = new RTCPeerConnection(configuration);

  // 'onicecandidate' notifies us whenever an ICE agent needs to deliver a
  // message to the other peer through the signaling server
  pc.onicecandidate = event => {
    if (event.candidate) {
      sendMessage({'candidate': event.candidate});
    }
  };

  // If user is offerer let the 'negotiationneeded' event create the offer
  if (isOfferer) {
    pc.onnegotiationneeded = () => {
      pc.createOffer().then(localDescCreated).catch(onError);
    }
  }

  // When a remote stream arrives display it in the #remoteVideo element
  pc.ontrack = event => {
    remoteVideo.srcObject = event.streams[0];
  };

  // Checking if mediaDevices is available (fixes local HTTP errors)
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    if (errorOverlay) errorOverlay.style.display = 'flex';
    return;
  }

  navigator.mediaDevices.getUserMedia({
    audio: true,
    video: true,
  }).then(stream => {
    localStream = stream;
    // Display your local video in #localVideo element
    localVideo.srcObject = stream;
    
    // Add your stream to be sent to the connecting peer
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
  }).catch(onError);

  // Listen to signaling data from Scaledrone
  room.on('data', (message, client) => {
    // Message was sent by us
    if (client.id === drone.clientId) {
      return;
    }

    if (message.sdp) {
      // This is called after receiving an offer or answer from another peer
      pc.setRemoteDescription(new RTCSessionDescription(message.sdp), () => {
        // When receiving an offer lets answer it
        if (pc.remoteDescription.type === 'offer') {
          pc.createAnswer().then(localDescCreated).catch(onError);
        }
      }, onError);
    } else if (message.candidate) {
      // Add the new ICE candidate to our connections remote description
      pc.addIceCandidate(
        new RTCIceCandidate(message.candidate), onSuccess, onError
      );
    }
  });
}

function localDescCreated(desc) {
  pc.setLocalDescription(
    desc,
    () => sendMessage({'sdp': pc.localDescription}),
    onError
  );
}

// UI Controls
document.getElementById('copyUrlBtn').addEventListener('click', () => {
  navigator.clipboard.writeText(window.location.href).then(() => {
    const btn = document.getElementById('copyUrlBtn');
    btn.innerText = 'Copied!';
    setTimeout(() => btn.innerText = 'Copy Link', 2000);
  }).catch(() => {
    // Fallback if clipboard API fails
    const dummy = document.createElement('input');
    document.body.appendChild(dummy);
    dummy.value = window.location.href;
    dummy.select();
    document.execCommand('copy');
    document.body.removeChild(dummy);
    const btn = document.getElementById('copyUrlBtn');
    btn.innerText = 'Copied!';
    setTimeout(() => btn.innerText = 'Copy Link', 2000);
  });
});

document.getElementById('toggleMic').addEventListener('click', function() {
  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      this.classList.toggle('disabled', !audioTrack.enabled);
    }
  }
});

document.getElementById('toggleCam').addEventListener('click', function() {
  if (localStream) {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      this.classList.toggle('disabled', !videoTrack.enabled);
    }
  }
});
