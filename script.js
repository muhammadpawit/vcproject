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
let currentFacingMode = 'user';

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

  pc.onicecandidate = event => {
    if (event.candidate) {
      sendMessage({'candidate': event.candidate});
    }
  };

  if (isOfferer) {
    pc.onnegotiationneeded = () => {
      pc.createOffer().then(localDescCreated).catch(onError);
    }
  }

  // When a remote stream arrives display it in the #remoteVideo element
  pc.onaddstream = event => {
    remoteVideo.srcObject = event.stream;
  };

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    if (errorOverlay) errorOverlay.style.display = 'flex';
    return;
  }

  navigator.mediaDevices.getUserMedia({
    audio: true,
    video: { facingMode: currentFacingMode }
  }).then(stream => {
    localStream = stream;
    localVideo.srcObject = stream;
    pc.addStream(stream);
  }).catch(onError);

  // Listen to signaling data from Scaledrone
  room.on('data', (message, client) => {
    if (client.id === drone.clientId) {
      return;
    }
    
    // Handle camera toggle signaling to show/hide remote avatar
    if (message.type === 'cam_toggle') {
      if (message.enabled) {
        remoteVideo.classList.remove('video-hidden');
      } else {
        remoteVideo.classList.add('video-hidden');
      }
      return;
    }

    if (message.sdp) {
      pc.setRemoteDescription(new RTCSessionDescription(message.sdp), () => {
        if (pc.remoteDescription.type === 'offer') {
          pc.createAnswer().then(localDescCreated).catch(onError);
        }
      }, onError);
    } else if (message.candidate) {
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

const micSvgOn = '<path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>';
const micSvgOff = '<path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6 6V11c0 1.66 1.34 3 3 3 .23 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/>';

const camSvgOn = '<path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>';
const camSvgOff = '<path d="M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5zM3.27 2L2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.36 0 .68-.19.86-.48l2.87 2.87 1.27-1.27L3.27 2z"/>';

document.getElementById('toggleMic').addEventListener('click', function() {
  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      this.classList.toggle('disabled', !audioTrack.enabled);
      this.querySelector('svg').innerHTML = audioTrack.enabled ? micSvgOn : micSvgOff;
    }
  }
});

document.getElementById('toggleCam').addEventListener('click', function() {
  if (localStream) {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      this.classList.toggle('disabled', !videoTrack.enabled);
      this.querySelector('svg').innerHTML = videoTrack.enabled ? camSvgOn : camSvgOff;
      
      if (videoTrack.enabled) {
        localVideo.classList.remove('video-hidden');
      } else {
        localVideo.classList.add('video-hidden');
      }
      
      // Notify remote peer to show/hide their guest avatar
      sendMessage({ type: 'cam_toggle', enabled: videoTrack.enabled });
    }
  }
});

// Switch Front/Back Camera
document.getElementById('switchCam').addEventListener('click', async function() {
  if (!localStream) return;
  
  // Toggle facing mode
  currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
  
  try {
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { exact: currentFacingMode } }
    });
    
    replaceCameraTrack(newStream);
  } catch (e) {
    // If exact constraint fails (e.g., desktop/laptop without back cam), fallback to general
    try {
      const fallbackStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: currentFacingMode }
      });
      replaceCameraTrack(fallbackStream);
    } catch (err) {
      console.error("Failed to switch camera", err);
      // Revert facing mode state if it failed
      currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    }
  }
});

function replaceCameraTrack(newStream) {
  const newVideoTrack = newStream.getVideoTracks()[0];
  const oldVideoTrack = localStream.getVideoTracks()[0];
  
  if (pc) {
    const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
    if (sender) {
      sender.replaceTrack(newVideoTrack);
    }
  }
  
  localStream.removeTrack(oldVideoTrack);
  localStream.addTrack(newVideoTrack);
  oldVideoTrack.stop();
  
  // Keep UI sync if camera was disabled
  const camBtn = document.getElementById('toggleCam');
  if (camBtn.classList.contains('disabled')) {
    newVideoTrack.enabled = false;
  }
}

// Picture-in-Picture Swapping Logic
document.getElementById('localWrapper').addEventListener('click', swapVideos);
document.getElementById('remoteWrapper').addEventListener('click', function() {
  if (this.classList.contains('secondary-wrapper')) {
    swapVideos();
  }
});

function swapVideos() {
  const lw = document.getElementById('localWrapper');
  const rw = document.getElementById('remoteWrapper');
  
  if (lw.classList.contains('secondary-wrapper')) {
    // Make Local Primary, Remote Secondary
    lw.classList.remove('secondary-wrapper');
    lw.classList.add('primary-wrapper');
    
    rw.classList.remove('primary-wrapper');
    rw.classList.add('secondary-wrapper');
  } else {
    // Make Remote Primary, Local Secondary
    lw.classList.remove('primary-wrapper');
    lw.classList.add('secondary-wrapper');
    
    rw.classList.remove('secondary-wrapper');
    rw.classList.add('primary-wrapper');
  }
}
