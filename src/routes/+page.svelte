<script lang="ts">
	import { goto } from '$app/navigation';
       import { Button } from '$lib/components/ui/button';
       let meetingUrl = '';
    const gotoMeetingLink = (meetingUrl: string) => {
        try {
            const roomPath = new URL(meetingUrl).pathname;
            goto(roomPath);
        } catch (error) {
            alert('Please enter a valid URL');
        }
    }
</script>
<div class="h-screen min-w-full flex justify-center items-center">

    <div class="flex flex-col items-center justify-center gap-1">
        <h1 class="text-2xl font-bold py-4">Enter meeting url</h1>
        <input type="text" bind:value={meetingUrl} class="w-full p-2 rounded-md border-2 border-primary" />
        <Button class="w-full" onclick={() => gotoMeetingLink(meetingUrl)}>Join</Button>
    </div>
</div>
