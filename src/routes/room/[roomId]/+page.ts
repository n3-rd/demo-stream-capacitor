import { pb } from '$lib/pocketbase';

// Disable SSR
export const ssr = false;

const sanitizeAssociatedVideo = (videoRef: string) => {
    let sanitizedVideo = videoRef.startsWith('/video/') ? videoRef.slice(7) : videoRef;
    if (sanitizedVideo.endsWith('.mp4')) {
        sanitizedVideo = sanitizedVideo.slice(0, -4);
    }
    console.log("Sanitized video", sanitizedVideo)
    return sanitizedVideo;
}

// Client-side load function
export const load = async ({ params, fetch }) => {
    try {
        // Extract roomId from params
        console.log("Params", params)
        const roomId = params.roomId.split('&')[0];
        console.log("Room ID", roomId)
        const rooms = await pb.collection('rooms').getFullList({ filter: `room_id = "${roomId}"` })
        console.log("Rooms", rooms)
        const representatives = await pb.collection('users').getFullList({ filter: 'representative = true' })
        console.log("Representatives", representatives)

        // Parallel data fetching
        const users = await pb.collection('users').getFullList()
        console.log("Users", users)


        console.log("Rooms", rooms)

        // Get video representatives info
        const videoRepresentatives = await pb.collection('room_videos_duplicate')
            .getFirstListItem(`video_ref = "${sanitizeAssociatedVideo(rooms[0].associated_video)}"`)
            .then(result => result.representatives)
            .catch(() => []);

        // Map representatives to their full info
        const videoRepresentativesInfo = videoRepresentatives
            .map(rep => representatives.find(repInfo => repInfo.id === rep))
            .filter(Boolean);
            console.log()

        return {
            user: pb.authStore.model,
            representatives,
            users,
            roomId: rooms,
            videoRepresentatives,
            videoRepresentativesInfo
        };
    } catch (error) {
        console.error('Error loading room data:', error);
    }
};
