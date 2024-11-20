import { goto, invalidateAll } from '$app/navigation';
import { PUBLIC_POCKETBASE_INSTANCE } from '$env/static/public';
import Pocketbase from 'pocketbase';
import { writable } from 'svelte/store';

export const pb = new Pocketbase(PUBLIC_POCKETBASE_INSTANCE);
export const pbUser = writable(pb.authStore.model);

pb.authStore.onChange(() => {
	pbUser.set(pb.authStore.model);
}, true);
