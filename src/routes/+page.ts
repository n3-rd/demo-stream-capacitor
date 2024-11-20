// import { redirect } from "@sveltejs/kit";
// import type { PageLoad } from './$types';
// import { pb } from '$lib/pocketbase';
// export const load: PageLoad = async ({ url }) => {
  
//     const user = pb.authStore.model || null;
//     const videoId = url.searchParams.get('videoId');

//     if (!videoId) {
//         throw redirect(302, '/dashboard');
//     }

//     const video = await pb.collection('room_videos_duplicate').getOne(videoId);

//     return {
//         user,
//         video,
//     }
// }
