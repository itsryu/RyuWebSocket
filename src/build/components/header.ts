import { ActivityType } from "discord-api-types/v10";
import { MemberPresence, StatusColors, UserProfileResponse } from "../../@types";
import { ImageUtils } from "../../utils/util";

export async function renderHeader(data: UserProfileResponse, member?: MemberPresence): Promise<string> {
    const username = data.user.global_name ?? data.user.username;
    const avatar = data.user.avatar
        ? await ImageUtils.cachedFetchImageToBase64(`${process.env.DISCORD_CDN}/avatars/${data.user.id}/${data.user.avatar}.png?size=4096`)
        : await ImageUtils.cachedFetchImageToBase64(`${process.env.DISCORD_CDN}/embed/avatars/0.png`);

    const avatarDecoration = data.user.avatar_decoration_data?.asset
        ? await ImageUtils.cachedFetchImageToBase64(`${process.env.DISCORD_CDN}/avatar-decoration-presets/${data.user.avatar_decoration_data.asset}.png?size=512`)
        : null;

    const customStatus = member?.activities?.find(a => a.type === ActivityType.Custom)?.state || null;
    const statusColor = member?.status ? StatusColors[member.status] : StatusColors.invisible;

    const clan = data.user.clan;
    const clanBadge = clan && clan.badge
        ? await ImageUtils.cachedFetchImageToBase64(`${process.env.DISCORD_CDN}/clan-badges/${clan.identity_guild_id}/${clan.badge}.png?size=512`)
        : null;

    const badges = await Promise.all(data.badges.map(async (badge) => await ImageUtils.cachedFetchImageToBase64(`${process.env.DISCORD_CDN}/badge-icons/${badge.icon}.png`)));

    return `
        <div style="width:400px;height:100px;inset:0;display:flex;flex-direction:row;padding-bottom:5px;border-bottom:solid 0.5px hsl(0, 0%, 100%, 10%)">
            <div style="display:flex;position:relative;flex-direction:row;height:80px;width:80px">
                <img src="${avatar}" alt="User Avatar" style="border-radius:50%;width:50px;height:50px;position:relative;top:50%;left:50%;transform:translate(-50%, -50%)" />
                ${avatarDecoration ? `<img src="${avatarDecoration}" alt="Avatar Decoration" style="display:block;width:64px;height:64px;position:absolute;top:50%;left:50%;transform:translate(-50%, -50%)" />` : ''}
                <span style="position:absolute;bottom:14px;right:14px;height:13px;width:13px;background-color:${statusColor};border-radius:50%;border:3px solid #1a1c1f"></span>
            </div>
            <div style="height:80px;width:260px;display:flex;flex-direction:column;justify-content:center">
                <div style="display:flex;flex-direction:row;height:25px">
                    <h1 style="font-size:1.15rem;margin:0 12px 0 0;white-space:nowrap">${escapeXml(username)}</h1>
                    ${clan && clan.badge ? `
                    <span style="background-color:#111214;border-radius:0.375rem;padding-left:0.5rem;padding-right:0.5rem;margin-left:-6px;margin-right:12px;display:flex;align-items:center;gap:0.25rem;font-size:16px;font-weight:500;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;height:100%">
                        ${clanBadge ? `<img src="${clanBadge}" alt="${clan.tag}" style="width:16px;height:16px;" />` : ''}
                        <p style="margin-bottom:1.1rem;white-space:nowrap">${escapeXml(clan.tag)}</p>
                    </span>` : ''}
                    ${badges.map((badge) => `
                        <img src="${badge}" style="width:auto;height:20px;position:relative;top:50%;transform:translate(0%, -50%);margin-right:2px" />
                    `).join('')}
                </div>
                ${customStatus ? `
                <p style="font-size:0.9rem;margin:0;color:#aaa;font-weight:400;overflow:hidden;white-space:nowrap;text-overflow:ellipsis">
                    ${escapeXml(customStatus)}
                </p>` : ''}
            </div>
        </div>
    `;
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