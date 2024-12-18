<script lang="ts">
    import {
        PUBLIC_ANT_MEDIA_URL
    } from '$env/static/public';
    import {
        WebRTCAdaptor
    } from "@antmedia/webrtc_adaptor";
    import {
        page
    } from "$app/stores";
    import {
        onMount
    } from "svelte";
    import BottomBar from '$lib/components/layout/bottom-bar.svelte';
        import LeftBar from '$lib/components/layout/left-bar.svelte';
        import RightBar from '$lib/components/layout/right-bar.svelte';
        import { currentVideoUrl } from '$lib/callStores.js';
        import { sendMessage } from '$lib/helpers/sendMessage';
        import { getStreamInfo } from '$lib/helpers/getStreamInfo';
        import { anonymousUser } from '$lib/stores/anonymousUser.js';
        import NameInputModal from '$lib/components/name-input-modal.svelte';
        import RepresentativeIndicator from '$lib/components/room/representative-indicator.svelte';
        import { Button } from '$lib/components/ui/button';
        import { MessageSquareDashed, UsersRound } from 'lucide-svelte';
        import Participants from '$lib/call/Participants.svelte';
        import Chat from '$lib/call/Chat.svelte';
        import { chatMessages } from '$lib/stores/chatMessages';
    
    export let data;
    console.log("Data", data)
    let roomIdentity = data.roomId;
    console.log("Room identity", roomIdentity)
    
    // Reactive declarations for data from the load function
    $: ({
        user,
        representatives,
        users,
        roomId: roomIdentity,
        videoRepresentativesInfo
    } = data);
    
    // Initialize state based on loaded data
    $: isAuthenticated = !!user;
    $: name = isAuthenticated ? user.name : "";
    
    // State management
    let webRTCAdaptor: any;
    let urlRepresentativeName: string = '';
    let anonymousUserId: string = '';
    let hostUserId: string = '';
    let isPlaying = false;
    let isDataChannelOpen = false;
    let isMicMuted = false;
    let isCameraOff = false;
    let allParticipants = {};
    let meetingParticipants = [];
    let isReconnectionInProgress = false;
    let reconnecting = false;
    let publishReconnected = false;
    let playReconnected = false;
    let isNoStreamExist = false;
    const joinURL = $page.url.href;
    let scheduleOpen = false;
    
    // Add video state management
    let videoPlayer;
    let isVideoPlaying = false;
    let currentVideoTime = 0;
    
    
    // Add WebSocket state management
    let wsConnection = null;
    let isWsConnected = false;
    
    // Add this near the top of your script section with other state management variables
    let videoElements = new Map();
    
    // $:{
    //     console.log("meetingParticipants", meetingParticipants);
    // }
    
    // Function to initialize WebSocket connection
    function initializeWebSocket() {
        if (wsConnection) {
            wsConnection.close();
        }
    
        wsConnection = new WebSocket(`${getWebSocketURL()}?target=origin`);
        
        wsConnection.onopen = () => {
            console.log('WebSocket connected');
            isWsConnected = true;
        };
        
        wsConnection.onclose = () => {
            console.log('WebSocket closed');
            isWsConnected = false;
            // Attempt to reconnect after a delay
            setTimeout(initializeWebSocket, 3000);
        };
        
        wsConnection.onerror = (error) => {
            console.error('WebSocket error:', error);
            isWsConnected = false;
        };
    }
    
    
    // Room data
    const roomName = $page.url.pathname.split("/").pop().split("&")[0];
    const isHost = $page.url.pathname.split("/").pop().split("-").pop() === (user ? user.id : "") || $page.url.pathname.split("/").pop().split("-").pop() == anonymousUserId;
    let isRepresentative = false;
    $:{
        const urlRepName = $page.url.searchParams.get('representativeName');
        isRepresentative = urlRepName !== null && urlRepName !== '';
        console.log('isRepresentative:', isRepresentative); // Debug log
    }
    
    console.log("host", isHost);
     console.log("isHost", isHost);
     console.log("anonymousUserId", anonymousUserId);
     console.log('page url', $page.url);
    // ... existing code ...
    
    // Stream configuration
    let publishStreamId = null;
    let showNameModal = !isAuthenticated;
    const streamName = roomIdentity[0]?.associated_video_name;
    const dcOnly = false;
    const playOnly = false;
    
    // WebRTC configuration
    const mediaConstraints = {
        video: false,
        audio: true
    };
    
    function getWebSocketURL() {
        // Implement your WebSocket URL logic here
        return `wss://${PUBLIC_ANT_MEDIA_URL}/WebRTCAppEE/websocket`
    }
    
    onMount(async () => {
        if ($anonymousUser || isAuthenticated) {
            // Start with camera on for representatives, off for others
            isCameraOff = !isRepresentative;
            mediaConstraints.video = isRepresentative;
            
            initializeWebRTC();
            
            // Initialize sync source based on role
            if (isHost) {
                syncSource = 'host';
            } else if (isRepresentative) {
                syncSource = 'representative';
            }
        }
        
        return () => {
            if (webRTCAdaptor) {
                webRTCAdaptor.stop(publishStreamId);
                webRTCAdaptor.stop(roomName);
            }
        };
    });
    
    function initializeWebRTC() {
        if (!roomIdentity?.[0]?.room_id) {
            console.error('No valid room ID found');
            return;
        }

        webRTCAdaptor = new WebRTCAdaptor({
            websocket_url: getWebSocketURL(),
            mediaConstraints,
            localVideoId: "localVideo",
            isPlayMode: playOnly,
            onlyDataChannel: dcOnly,
            dataChannelEnabled: true,
            debug: true,
            callback: handleWebRTCCallback,
            callbackError: handleWebRTCError,
            bandwidth: 900, // Reduce bandwidth since video is optional
            publishMode: "camera" // This ensures basic camera/mic publishing
        });
    }
    
    function handleWebRTCCallback(info: string, obj: any) {
        switch (info) {
            case "initialized":
                console.log("WebRTC initialized");
                // Add delay before joining room
                setTimeout(() => {
                    console.log("Joining room after delay...");
                    joinRoom();
                }, 2000); // 2 second delay
                break;
            case "broadcastObject":
                if (obj.broadcast === undefined) return;
                let broadcastObject = JSON.parse(obj.broadcast);
    
                if (obj.streamId === roomName) {
                    handleMainTrackBroadcastObject(broadcastObject);
                } else {
                    handleSubtrackBroadcastObject(broadcastObject);
                }
                break;
            case "newTrackAvailable":
                playVideo(obj);
                break;
            case "publish_started":
                isPlaying = true;
                webRTCAdaptor.getBroadcastObject(roomName);
                break;
            case "play_started":
                isPlaying = true;
                isNoStreamExist = false;
                webRTCAdaptor.getBroadcastObject(roomName);
                break;
            case "play_finished":
                removeAllRemoteVideos();
                isPlaying = false;
                break;
            case "data_channel_opened":
                console.log('Data channel opened'); // Debug log
                isDataChannelOpen = true;
                
                // If we're not the host, request the current sync source
                if (!isHost) {
                    const syncSourceRequest = {
                        streamId: roomName,
                        eventType: 'sync_source_request'
                    };
                    try {
                        sendMessage(
                            syncSourceRequest.streamId,
                            Date.now(),
                            JSON.stringify(syncSourceRequest),
                            roomName
                        );
                    } catch (error) {
                        console.error('Error requesting sync source:', error);
                    }
                }
                break;
            case "data_channel_closed":
                isDataChannelOpen = false;
                break;
            case "data_received":
                try {
                    const data = JSON.parse(obj.data);
                    let messageBody;
                    if (data.messageBody) {
                        messageBody = JSON.parse(data.messageBody);
                    }
                    
                    console.log('Received data message:', messageBody); // Debug log
                    
                    switch (messageBody?.eventType) {
                        case 'chat_message':
                            handleChatMessage(messageBody);
                            break;
                        case 'video_sync':
                            handleVideoSync(messageBody);
                            break;
                        case 'sync_source_change':
                            // Only non-host participants should update their sync source
                            if (!isHost) {
                                console.log('Updating sync source to:', messageBody.syncSource);
                                syncSource = messageBody.syncSource;
                            }
                            break;
                    }
                } catch (e) {
                    console.error("Error parsing data message:", e);
                }
                break;
            case "data_sent":
                console.log("Data sent:", obj);
                break;            
            case "connected":
                console.log("Connected to", obj);
                break;
            case "peerconnection_created":
                console.log("PeerConnection created for", obj);
                break;
            case "sdp_received":
                console.log("SDP received for", obj);
                break;
                // Add other cases as needed
        }
    }
    
    function handleWebRTCError(error: string, message: string) {
        console.error("WebRTC Error:", error, message);
        
        if (error === "no_stream_exist") {
            isNoStreamExist = true;
            // Retry playing the stream after a delay
            setTimeout(() => {
                if (webRTCAdaptor && !isPlaying) {
                    console.log('Retrying stream play...');
                    webRTCAdaptor.play(roomName);
                }
            }, 3000); // Retry after 3 seconds
        }
    }
    
    function sanitizeStreamName(name: string): string {
        if (!name) return '';
        // First decode any URL encoded characters
        const decodedName = decodeURIComponent(name);
        // Then replace any spaces or special characters with underscores
        return decodedName.replace(/[^a-zA-Z0-9-]/g, '_');
    }
    
    function joinRoom() {
        if (!publishStreamId) {
            publishStreamId = generateRandomString(12);            
        }
    
        const sanitizedName = sanitizeStreamName(name || anonymousUserId);
        const sanitizedRoomName = sanitizeStreamName(roomName);
    
        // First publish our stream (if not playOnly)
        if (!playOnly) {
            const streamId = `${publishStreamId}-${sanitizedName}`;
            console.log('starting publish with streamId:', streamId);
            
            const metadata = JSON.stringify({
                isCameraOff,
                isMicMuted
            });
            
            webRTCAdaptor.publish(
                streamId,
                null,
                metadata,
                null,
                sanitizedName,
                roomIdentity[0].room_id
            );

            // Increase delay before playing to 2 seconds
            setTimeout(() => {
                console.log('starting play with roomName:', sanitizedRoomName);
                webRTCAdaptor.play(sanitizedRoomName);
            }, 2000);
        } else {
            // If playOnly, just play immediately
            webRTCAdaptor.play(sanitizedRoomName);
        }
    }
    
    function leaveRoom() {
        allParticipants = {};
        webRTCAdaptor.stop(roomName);
        isPlaying = false;
        window.location.href = "/";
    
    }
    
    // Helper functions
    function generateRandomString(length: number): string {
        return Math.random().toString(36).substring(2, length + 2);
    }
    
    setInterval(() => {
        getStreamInfo(roomName).then(streamInfo => {
            meetingParticipants = streamInfo.subTrackStreamIds;
        });
    }, 5000);
    
    // Add these handler functions
    function handlePublishStarted() {
        console.log('Published successfully');
        isPlaying = true;
    }
    
    function handlePlayStarted() {
        console.log('Playing successfully66');
        isPlaying = true;
    }
    
    function muteLocalMic() {
        webRTCAdaptor.muteLocalMic();
        isMicMuted = true;
    }
    
    function unmuteLocalMic() {
        webRTCAdaptor.unmuteLocalMic();
        isMicMuted = false;
    }
    
    function toggleMicrophone() {
        if (isMicMuted) {
            unmuteLocalMic();
        } else {
            muteLocalMic();
        }
    }
    
    function turnOnCamera() {
        if (!webRTCAdaptor) return;
        
        // Update media constraints to include video
        mediaConstraints.video = true;
        
        // Stop current connection
        webRTCAdaptor.stop(publishStreamId);
        
        // Reinitialize with new constraints
        setTimeout(() => {
            webRTCAdaptor.turnOnLocalCamera();
            isCameraOff = false;
            
            // Republish stream with camera
            const streamId = `${publishStreamId}-${sanitizeStreamName(name || anonymousUserId)}`;
            const metadata = JSON.stringify({
                isCameraOff: false,
                isMicMuted
            });
            
            webRTCAdaptor.publish(
                streamId,
                null,
                metadata,
                null,
                sanitizeStreamName(name || anonymousUserId),
                roomIdentity[0].room_id
            );
        }, 500);
    }
    
    function turnOffCamera() {
        if (!webRTCAdaptor) return;
        
        // Update media constraints to disable video
        mediaConstraints.video = false;
        
        // Stop video track
        webRTCAdaptor.turnOffLocalCamera();
        isCameraOff = true;
        
        // Update stream metadata
        const streamId = `${publishStreamId}-${sanitizeStreamName(name || anonymousUserId)}`;
        const metadata = JSON.stringify({
            isCameraOff: true,
            isMicMuted
        });
        
        // Republish with updated metadata
        webRTCAdaptor.updateMetadata(streamId, metadata);
    }
    
    function toggleCamera() {
        if (isCameraOff) {
            turnOnCamera();
        } else {
            turnOffCamera();
        }
    }
    
    // Function to handle video state changes by host
    function handleVideoStateChange() {
        if (!videoPlayer) return;
        
        // Only send sync messages if we're the current sync source
        const shouldSendSync = (isHost && syncSource === 'host') || 
                             (isRepresentative && syncSource === 'representative');
        
        console.log('Sync conditions:', { 
            isHost, 
            isRepresentative, 
            syncSource, 
            shouldSendSync 
        }); // Debug log
        
        if (shouldSendSync) {
            const videoState = {
                streamId: roomName,
                eventType: 'video_sync',
                currentTime: videoPlayer.currentTime,
                isPlaying: !videoPlayer.paused,
                syncSource: syncSource
            };
            
            if (webRTCAdaptor && isDataChannelOpen) {
                try {
                    console.log('Sending sync message:', videoState); // Debug log
                    sendMessage(
                        videoState.streamId,
                        videoState.currentTime,
                        JSON.stringify(videoState),
                        roomName
                    );
                } catch (error) {
                    console.error('Error sending video sync:', error);
                }
            } else {
                console.log('WebRTC data channel not ready:', { 
                    webRTCAdaptor: !!webRTCAdaptor, 
                    isDataChannelOpen 
                });
            }
        }
    }
    
    // Function to handle incoming video sync messages
    function handleVideoSync(data) {
        if (!videoPlayer) return;
    
        // Don't process our own sync messages
        const isOwnMessage = (isHost && data.syncSource === 'host') || 
                            (isRepresentative && data.syncSource === 'representative');
        if (isOwnMessage) return;
    
        try {
            // Always sync if we're not the current sync source
            const shouldSync = (isHost && syncSource !== 'host') || 
                             (isRepresentative && syncSource !== 'representative') || 
                             (!isHost && !isRepresentative);
    
            if (shouldSync) {
                // Sync video time if difference is more than 0.5 seconds
                if (Math.abs(videoPlayer.currentTime - data.currentTime) > 0.5) {
                    videoPlayer.currentTime = data.currentTime;
                }
    
                // Sync play/pause state
                if (data.isPlaying && videoPlayer.paused) {
                    videoPlayer.play();
                } else if (!data.isPlaying && !videoPlayer.paused) {
                    videoPlayer.pause();
                }
            }
        } catch (e) {
            console.error("Error handling video sync data:", e);
        }
    }
    
    
    
    const handleScheduleClose = () => {
        scheduleOpen = false;
    };
    
    function togglePanel(id) {
            if (id === "chatPanel") {
                document.getElementById("participantsPanel").style.width = "0px";
            }
            if (id === "participantsPanel") {
                document.getElementById("chatPanel").style.width = "0px";
            }
            const panel = document.getElementById(id);
            panel.style.width = panel.style.width === "30rem" ? "0px" : "30rem";
    }
    
     
    // Add these helper functions
    function handleMainTrackBroadcastObject(broadcastObject) {
        let participantIds = broadcastObject.subTrackStreamIds;
    
        // Find and remove not available tracks
        let currentTracks = Object.keys(allParticipants);
        currentTracks.forEach(trackId => {
            if (!allParticipants[trackId].isFake && !participantIds.includes(trackId)) {
                console.log("stream removed:" + trackId);
                delete allParticipants[trackId];
            }
        });
    
        // Request broadcast object for new tracks
        participantIds.forEach(pid => {// Update the sync source buttons to use the new function
            if (allParticipants[pid] === undefined) {
                webRTCAdaptor.getBroadcastObject(pid);
            }
        });
    }
    
    function handleSubtrackBroadcastObject(broadcastObject) {
        if (broadcastObject.metaData !== undefined && broadcastObject.metaData !== null) {
            let userStatusMetadata = JSON.parse(broadcastObject.metaData);
            if (userStatusMetadata.isCameraOff !== undefined) {
                broadcastObject.isCameraOff = userStatusMetadata.isCameraOff;
            }
            if (userStatusMetadata.isMicMuted !== undefined) {
                broadcastObject.isMicMuted = userStatusMetadata.isMicMuted;
            }
        }
        allParticipants[broadcastObject.streamId] = broadcastObject;
    }
    
    function playVideo(obj) {
        const roomId = roomName;
        console.log("new track available with id: " + obj.trackId + " and kind: " + obj.track.kind + " on the room:" + roomId);
    
        const incomingTrackId = obj.trackId.substring("ARDAMSx".length);
        const streamId = obj.stream.id;
    
        if (incomingTrackId == roomId || incomingTrackId == publishStreamId) {
            return;
        }
    
        // Handle audio tracks
        if (obj.track.kind === "audio") {
            let audio = document.getElementById("remoteAudio" + incomingTrackId);
    
            if (audio == null) {
                createRemoteAudio(incomingTrackId);
                audio = document.getElementById("remoteAudio" + incomingTrackId);
            }
    
            if (audio) {
                if (!audio.srcObject) {
                    audio.srcObject = new MediaStream();
                }
                audio.srcObject.addTrack(obj.track);
                audio.play().catch(e => console.error("Error playing audio:", e));
            }
        } else if (obj.track.kind === "video") {
            let video = document.getElementById("remoteVideo" + incomingTrackId);
            
            if (video == null) {
                video = document.createElement('video');
                video.id = "remoteVideo" + incomingTrackId;
                video.autoplay = true;
                video.playsInline = true;
                video.style.width = '100%';
                video.style.height = '100%';
                video.style.objectFit = 'cover';
                video.srcObject = new MediaStream();
            }
    
            video.srcObject.addTrack(obj.track);
            
            // Store the video element reference for the representative indicator
            videoElements.set(incomingTrackId, video);
            console.log("Video element stored for", incomingTrackId);
        }
    
        obj.track.onended = event => {
            console.log("track is ended with id: " + event.target.id);
        }
    
        obj.stream.onremovetrack = event => {
            console.log("track is removed with id: " + event.track.id);
            const removedTrackId = event.track.id.substring("ARDAMSx".length);
            removeRemoteAudio(removedTrackId);
            // Also remove video elements
            if (videoElements.has(removedTrackId)) {
                videoElements.delete(removedTrackId);
                }
            }
        };
    
    
    function createRemoteAudio(trackLabel: string) {
        // Create a container for audio elements if it doesn't exist
        let playersContainer = document.getElementById("players");
        if (!playersContainer) {
            playersContainer = document.createElement("div");
            playersContainer.id = "players";
            document.body.appendChild(playersContainer);
        }
    
        const player = document.createElement("div");
        player.id = "player" + trackLabel;
    
        const audio = document.createElement("audio");
        audio.id = "remoteAudio" + trackLabel;
        audio.autoplay = true;
        audio.controls = true;  // Make controls visible for debugging
        audio.style.visibility = "hidden";
    
        player.appendChild(audio);
        playersContainer.appendChild(player);
    }
    
    function removeRemoteAudio(trackLabel: string) {
        const player = document.getElementById("player" + trackLabel);
        if (player) {
            player.remove();
        }
    }
    
    let videoURL;
    
    let videoUrl = `http://localhost:3001${roomIdentity?.[0]?.associated_video ?? ''}`;
    console.log("videoUrl", videoUrl);
    
    // Add timestamp for throttling
    let lastUpdate = 0;
    
    // Reactive declarations with immediate logging
    $: {
        urlRepresentativeName = $page.url.searchParams.get('representativeName');
        anonymousUserId = $anonymousUser;
        hostUserId = $page.url.searchParams.get('hostUserId');
        
        // Debug logging
        console.log('URL Params updated:', {
            urlRepresentativeName,
            anonymousUserId,
            hostUserId,
            rawUrl: $page.url.toString(),
            searchParams: Object.fromEntries($page.url.searchParams)
        });
    }
    
    function handleNameSubmitted(event) {
        const submittedName = event.detail;
        console.log("submittedName", submittedName);
        anonymousUser.set(submittedName);
        // Initialize WebRTC after name is set
        initializeWebRTC();
    }
    
    function handleChatMessage(messageBody) {
        if (!messageBody || !messageBody.name || !messageBody.text) {
            console.error("Invalid chat message format:", messageBody);
            return;
        }
    
        // Check if this is a message from the current user
        const isCurrentUser = messageBody.name === (name || $anonymousUser);
    
        chatMessages.update(messages => {
            // Check if message already exists
            const isDuplicate = messages.some(msg => 
                msg.name === messageBody.name && 
                msg.text === messageBody.text
            );
    
            // Only add the message if it's not a duplicate and not from current user
            if (!isDuplicate && !isCurrentUser) {
                return [...messages, messageBody];
            }
            return messages;
        });
    }
    
    // Add near other state management variables (around line 32-54)
    let syncSource = 'host'; // Can be 'host' or 'representative'
    
    // Add a new message type for sync source changes
    function updateSyncSource(newSource: 'host' | 'representative') {
        syncSource = newSource;
        
        // Broadcast the sync source change to all participants
        if (isHost && webRTCAdaptor && isDataChannelOpen) {
            const syncSourceUpdate = {
                streamId: roomName,
                eventType: 'sync_source_change',
                syncSource: newSource
            };
            
            try {
                sendMessage(
                    syncSourceUpdate.streamId,
                    Date.now(),
                    JSON.stringify(syncSourceUpdate),
                    roomName
                );
            } catch (error) {
                console.error('Error sending sync source update:', error);
            }
        }
    }
    
    
    
    </script>
    
    
    {#if !isAuthenticated && (!$anonymousUser || $anonymousUser === '')}
        <NameInputModal 
            on:nameSubmitted={handleNameSubmitted} 
            roomName={roomIdentity?.[0]?.associated_video_name ?? ''} 
        />
    {:else}
    <div class="h-screen min-w-full bg-[#9d9d9f] relative overflow-hidden">
        <div class="h-full">
            <div class="flex items-center h-full pt-6 pb-24">
                <!-- left sidebar -->
                 <!-- <LeftBar joinURL={joinURL} videoRepresentatives={videoRepresentatives} userId={user?.id || ''} {scheduleOpen} on:closeSchedule={handleScheduleClose} /> -->
                 <div class="flex-grow h-full bg-[#9d9d9f] relative flex gap-2">
                    {#if isHost || isRepresentative}
                        <div class="video-container h-full w-full">
                            {#if isHost}
                                <div class="absolute top-4 right-4 z-[32] flex gap-2 bg-black/50 p-2 rounded">
                                    <Button
                                        variant={syncSource === 'host' ? 'default' : 'secondary'}
                                        size="sm"
                                        on:click={() => updateSyncSource('host')}
                                    >
                                        Sync My Video
                                    </Button>
                                    <Button
                                        variant={syncSource === 'representative' ? 'default' : 'secondary'}
                                        size="sm"
                                        on:click={() => updateSyncSource('representative')}
                                    >
                                        Sync Representative Video
                                    </Button>
                                </div>
                            {/if}
                            <video
                                bind:this={videoPlayer}
                                src={videoUrl}
                                autoplay={false}
                                controls={isHost || isRepresentative}
                                playsinline
                                class="h-full w-full"
                                loop
                                on:play={() => {
                                    console.log('Video play event:', { isRepresentative, syncSource }); // Debug log
                                    if (videoPlayer) handleVideoStateChange();
                                }}
                                on:pause={() => {
                                    console.log('Video pause event:', { isRepresentative, syncSource }); // Debug log
                                    if (videoPlayer) handleVideoStateChange();
                                }}
                                on:seeked={() => {
                                    console.log('Video seek event:', { isRepresentative, syncSource }); // Debug log
                                    if (videoPlayer) handleVideoStateChange();
                                }}
                                on:timeupdate={() => {
                                    if (!videoPlayer) return;
                                    
                                    const shouldSendSync = (isHost && syncSource === 'host') || 
                                                         (isRepresentative && syncSource === 'representative');
                                    
                                    if (shouldSendSync) {
                                        const now = Date.now();
                                        if (!lastUpdate || now - lastUpdate > 1000) {
                                            lastUpdate = now;
                                            handleVideoStateChange();
                                        }
                                    }
                                }}
                            >
                                <track kind="captions">
                                Your browser does not support the video element.
                            </video>
                        </div>
                    {:else}
                        <div class="video-container h-full w-full">
                            <video
                                bind:this={videoPlayer}
                                src={videoUrl}
                                autoplay={false}
                                controls={false}
                                playsinline
                                class="h-full w-full"
                            >
                                <track kind="captions">
                                Your browser does not support the video element.
                            </video>
                        </div>
                    {/if}
    
                    <!-- Chat Panel -->
                    <div class="w-0 bg-[#666669] h-full overflow-y-auto flex flex-col panel" id="chatPanel">
                        <div class="flex justify-between items-center h-full w-full p-4 border-b bg-[#47484b]">
                            <Chat roomId={roomName} name={name} />
                        </div>
                        <!-- Add your chat content here -->
                    </div>
    
                    <!-- Participants Panel -->
                    <div class="w-0 bg-[#666669] h-full overflow-y-auto flex flex-col panel" id="participantsPanel">
                        <Participants participants={meetingParticipants} isHost={isHost} name={name} users={users} />
                    </div>
                </div>
    
                <!-- Right sidebar controls -->
                <div class="flex flex-col gap-3 h-full justify-end">
                    <div class="w-14 h-auto bg-red flex flex-col gap-4 justify-end">
                        <Button
                            variant="ghost"
                            size="icon"
                            class="w-full hover:bg-red-700"
                            on:click={() => togglePanel("chatPanel")}
                        >
                            <MessageSquareDashed scale={1.3} color="#fff" />
                        </Button>
                    </div>
    
                    <div class="w-14 h-auto bg-red flex flex-col gap-4 justify-end">
                        <Button
                            variant="ghost"
                            size="icon"
                            class="w-full hover:bg-red-700"
                            on:click={() => togglePanel("participantsPanel")}
                        >
                            <UsersRound scale={1.3} color="#fff" />
                        </Button>
                    </div>
                </div>
            </div>
    
            <RepresentativeIndicator 
                participants={meetingParticipants} 
            />
            <RightBar 
            isHost={isHost}
            name={name}
            participants={meetingParticipants.map(participant => participant.split("-").pop())}
            on:toggleChat={() => togglePanel("chatPanel")} on:toggleParticipants={() => togglePanel("participantsPanel")} />
            </div>
        </div>
    
        <!-- Bottom controls bar -->
        <BottomBar 
            roomIdentityName={roomIdentity?.[0]?.associated_video_name ?? ''} 
            {isMicMuted} 
            on:leaveRoom={leaveRoom} 
            on:toggleMicrophone={toggleMicrophone} 
            isCameraOff={isCameraOff} 
            on:toggleCamera={toggleCamera} 
        />
     
    {/if}
    
    <style>
    .conference-room {
        padding: 20px;
    }
    
    .controls {
        margin-top: 20px;
    }
    
    .button-group {
        margin-bottom: 15px;
    }
    
    .media-controls {
        display: flex;
        gap: 10px;
    }
    
    .video-container {
        width: 100%;
        height: 100%;
        background: black;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
    }
    
    .video-container video {
        width: 100%;
        height: 100%;
        object-fit: cover;
        position: absolute;
    }
    
    /* Keep your existing styles... */
    
    .panel {
        transition: width 0.3s ease-in-out;
    }
    .hover\:bg-red-700:hover {
        background-color: #b91c1c;
    }
    .hover\:bg-white:hover {
        background-color: #ffffff;
    }
    .hover\:text-black:hover {
        color: #000000
    }
    </style>
    