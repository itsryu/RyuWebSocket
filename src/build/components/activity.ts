import { ActivityType } from "discord-api-types/v10";
import { MemberPresence } from "../../types";

export function renderActivity(member: MemberPresence): string {
    const activities = member.activities?.filter(a => a.type !== ActivityType.Custom) || [];
    const activity = activities[0];
    if (!activity) return '';

    // Large image
    let largeImage = '';
    if (activity.assets?.large_image) {
        if (activity.name.toLowerCase() === 'spotify' && activity.assets.large_image.startsWith('spotify:')) {
            largeImage = `https://i.scdn.co/image/${activity.assets.large_image.split(':')[1]}`;
        } else if (activity.assets.large_image.startsWith('mp:external')) {
            largeImage = `https://media.discordapp.net/${activity.assets.large_image.replace('mp:', '')}`;
        } else {
            largeImage = `https://cdn.discordapp.com/app-assets/${activity.application_id}/${activity.assets.large_image}.png?size=4096`;
        }
    }

    // Small image
    let smallImage = '';
    if (activity.assets?.small_image) {
        if (activity.assets.small_image.startsWith('mp:external')) {
            smallImage = `https://media.discordapp.net/${activity.assets.small_image.replace('mp:', '')}`;
        } else {
            smallImage = `https://cdn.discordapp.com/app-assets/${activity.application_id}/${activity.assets.small_image}.png?size=4096`;
        }
    }

    const elapsedTime = activity.timestamps?.start ? getElapsedTime(activity.timestamps.start) : null;

    return `
    <div style="display:flex;flex-direction:row;height:120px;margin-left:15px;font-size:0.75rem;padding-top:18px">
        <div style="margin-right:15px;width:auto;height:auto">
            ${largeImage ? `<img src="${largeImage}" alt="${activity.assets?.large_text}" style="width:80px;height:80px;border:solid 0.5px #222;border-radius:10px" />` : ''}
            ${smallImage ? `<img src="${smallImage}" alt="${activity.assets?.small_text}" style="width:30px;height:30px;border-radius:50%;margin-left:-26px;margin-bottom:-8px" />` : ''}
        </div>
        <div style="color:#999;margin-top:-6px;line-height:1;width:279px">
            <p style="color:#fff;font-size:0.85rem;font-weight:bold;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;height:15px;margin:7px 0">
                ${escapeXml(activity.name)}</p>
            ${activity.details ? `<p style="color:#ccc;overflow:hidden;white-space:nowrap;font-size:0.85rem;text-overflow:ellipsis;height:15px;margin:7px 0">
                ${escapeXml(activity.details)}</p>` : ''}
            ${activity.state ? `<p style="color:#ccc;overflow:hidden;white-space:nowrap;font-size:0.85rem;text-overflow:ellipsis;height:15px;margin:7px 0">
                ${escapeXml(activity.state)}</p>` : ''}
            ${elapsedTime ? `<p style="color:#ccc;overflow:hidden;white-space:nowrap;font-size:0.85rem;text-overflow:ellipsis;height:15px;margin:7px 0">
                ${elapsedTime} elapsed</p>` : ''}
        </div>
    </div>`;
}

function escapeXml(unsafe: string): string {
    return unsafe.replace(/[<>&'"]/g, c => ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '\'': '&apos;',
        '"': '&quot;'
    } as Record<string, string>)[c]);
}

function getElapsedTime(startTimestamp: number): string {
    const elapsedMs = Date.now() - startTimestamp;
    const h = Math.floor(elapsedMs / 3600000);
    const m = Math.floor((elapsedMs % 3600000) / 60000);
    const s = Math.floor((elapsedMs % 60000) / 1000);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}